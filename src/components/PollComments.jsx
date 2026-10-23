import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CornerDownRight, MessageSquare, Reply, Send, Trash2, X } from 'lucide-react';
import { addPollComment, deletePollComment } from '../data';
import { fmt, fmtDay, timeAgo } from '../utils';
import { Avatar } from './ui';

const QUICK = [
  'Je ne serai là qu’une partie du temps',
  'J’arriverai en retard',
  'Je devrai partir plus tôt',
  'Plutôt en visio pour moi',
];

const optLabel = (o) => `${fmtDay(o.date, { weekday: 'short', day: 'numeric', month: 'short' })} ${fmt(o.s)}`;

// Petit champ de saisie + bouton envoyer
function Composer({ placeholder, onSend, autoFocus, onCancel, children }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const send = async (t = text) => {
    if (!t.trim() || busy) return;
    setBusy(true);
    try { await onSend(t); setText(''); } finally { setBusy(false); }
  };
  return (
    <div className="pcom-form">
      {children?.(send, busy)}
      <div className="pcom-input">
        <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); if (e.key === 'Escape') onCancel?.(); }} />
        {onCancel && <button className="btn ghost" onClick={onCancel} aria-label="Annuler" title="Annuler"><X size={16} /></button>}
        <button className="btn primary" disabled={busy || !text.trim()} onClick={() => send()} aria-label="Envoyer"><Send size={16} /></button>
      </div>
    </div>
  );
}

// Commentaires d'un sondage, façon YouTube :
// un champ « nouveau commentaire » toujours en haut, les plus récents d'abord, « Répondre » sous chaque commentaire.
export default function PollComments({ poll, me, people, canModerate, optId: fixedOpt }) {
  const all = [...(poll.comments || [])].sort((a, b) => a.at - b.at);
  const list = fixedOpt ? all.filter((c) => c.optId === fixedOpt) : all;
  const ids = new Set(list.map((c) => c.id));
  // Fil = un commentaire + ses réponses. Une réponse dont le parent a été supprimé devient un commentaire normal.
  const roots = list.filter((c) => !c.replyTo || !ids.has(c.replyTo)).reverse(); // plus récents d'abord
  const repliesOf = (id) => list.filter((c) => c.replyTo === id);

  const [open, setOpen] = useState(!!fixedOpt);
  const [optId, setOptId] = useState(fixedOpt || '');
  const [replyTo, setReplyTo] = useState(null); // commentaire auquel on répond
  const [openReplies, setOpenReplies] = useState({});
  const canWrite = me && me.id !== 'admin' && poll.status !== 'cancelled';
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const actor = me?.id === 'admin' ? 'Admin' : `${me?.prenom} ${me?.nom || ''}`.trim();
  const LIMIT = 2;
  const shownRoots = open ? roots : roots.slice(0, LIMIT);
  const hiddenRoots = roots.length - shownRoots.length;

  const postNew = (t) => addPollComment(poll, me, t, optId || null); // il apparaît en tête de liste
  const postReply = (root, target, t) => addPollComment(poll, me, t, root.optId || null, { id: root.id, byName: target.byName })
    .then(() => { setReplyTo(null); setOpenReplies((o) => ({ ...o, [root.id]: true })); });

  const item = (c, root, isReply) => {
    const p = byId[c.by];
    const o = c.optId && poll.options.find((x) => x.id === c.optId);
    const mine = me && c.by === me.id;
    const orphan = c.replyTo && !ids.has(c.replyTo);
    return (
      <div key={c.id} className={'pcom-item' + (mine ? ' mine' : '') + (isReply ? ' reply' : '')}>
        {p ? <Avatar p={p} size={isReply ? 22 : 26} /> : <span className="pcom-av">?</span>}
        <div className="grow">
          <div className="pcom-meta"><b>{c.byName}</b>{o && !fixedOpt && !isReply && <span className="pcom-opt">{optLabel(o)}</span>}<span className="muted">{timeAgo(c.at)}</span></div>
          {(isReply || orphan) && c.replyToName && <span className="pcom-to"><CornerDownRight size={11} /> à {c.replyToName}{orphan ? ' (message supprimé)' : ''}</span>}
          <p>{c.text}</p>
          {canWrite && <button className="pcom-rep" onClick={() => setReplyTo({ root, target: c })}><Reply size={13} /> Répondre</button>}
        </div>
        {(mine || canModerate) && (
          <button className="icon-btn" onClick={() => deletePollComment(poll, c, actor)} aria-label="Supprimer" title="Supprimer"><Trash2 size={14} /></button>
        )}
      </div>
    );
  };

  if (!list.length && !canWrite) return null;
  return (
    <div className="pcom">
      {!fixedOpt && (
        <div className="pcom-head">
          <MessageSquare size={16} /> <b>Commentaires</b> {list.length > 0 && <span className="pcom-n">{list.length}</span>}
        </div>
      )}

      {/* Nouveau commentaire : toujours disponible, en haut */}
      {canWrite && (
        <Composer placeholder="Ajouter un commentaire…" onSend={postNew}>
          {(send, busy) => (
            <>
              <div className="pcom-quick">
                {QUICK.map((q) => <button key={q} className="chip small" disabled={busy} onClick={() => send(q)}>{q}</button>)}
              </div>
              {!fixedOpt && poll.options.length > 1 && (
                <select value={optId} onChange={(e) => setOptId(e.target.value)} aria-label="À propos de quelle date ?">
                  <option value="">Pour tout le sondage</option>
                  {poll.options.map((o) => <option key={o.id} value={o.id}>À propos du {optLabel(o)}</option>)}
                </select>
              )}
            </>
          )}
        </Composer>
      )}

      {shownRoots.length > 0 && (
        <div className="pcom-list">
          {shownRoots.map((r) => {
            const reps = repliesOf(r.id);
            const showReps = openReplies[r.id] || reps.length <= 1 || (replyTo && replyTo.root.id === r.id);
            return (
              <div key={r.id} className="pcom-thread">
                {item(r, r, false)}
                {reps.length > 1 && (
                  <button className="pcom-toggle" onClick={() => setOpenReplies((o) => ({ ...o, [r.id]: !showReps }))}>
                    <ChevronDown size={14} className={showReps ? 'rot' : ''} /> {showReps ? 'Masquer les réponses' : `Voir les ${reps.length} réponses`}
                  </button>
                )}
                {showReps && reps.map((c) => item(c, r, true))}
                {replyTo && replyTo.root.id === r.id && (
                  <div className="pcom-reply-box">
                    <Composer autoFocus key={replyTo.target.id} placeholder={`Répondre à ${replyTo.target.byName.split(' ')[0]}…`}
                      onSend={(t) => postReply(r, replyTo.target, t)} onCancel={() => setReplyTo(null)} />
                  </div>
                )}
              </div>
            );
          })}
          {hiddenRoots > 0 && (
            <button className="pcom-toggle more" onClick={() => setOpen(true)}>
              <ChevronDown size={14} /> Voir {hiddenRoots === 1 ? 'l’autre commentaire' : `les ${hiddenRoots} autres commentaires`}
            </button>
          )}
          {open && !fixedOpt && roots.length > LIMIT && (
            <button className="pcom-toggle more" onClick={() => setOpen(false)}><ChevronDown size={14} className="rot" /> Réduire</button>
          )}
        </div>
      )}
    </div>
  );
}
