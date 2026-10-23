import { useRef, useState } from 'react';
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
const short = (t, n = 50) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

// Commentaires d'un sondage : liés ou non à une date, avec réponses (1 niveau)
export default function PollComments({ poll, me, people, canModerate, optId: fixedOpt }) {
  const all = [...(poll.comments || [])].sort((a, b) => a.at - b.at);
  const list = fixedOpt ? all.filter((c) => c.optId === fixedOpt) : all;
  const ids = new Set(list.map((c) => c.id));
  // Fils : un commentaire « racine » + ses réponses. Une réponse dont le parent a été supprimé devient une racine.
  const roots = list.filter((c) => !c.replyTo || !ids.has(c.replyTo));
  const repliesOf = (id) => list.filter((c) => c.replyTo === id);

  const [open, setOpen] = useState(!!fixedOpt);
  const [text, setText] = useState('');
  const [optId, setOptId] = useState(fixedOpt || '');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const canWrite = me && me.id !== 'admin' && poll.status !== 'cancelled';
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const actor = me?.id === 'admin' ? 'Admin' : `${me?.prenom} ${me?.nom || ''}`.trim();
  const shownRoots = open ? roots : roots.slice(-2);
  const hiddenCount = list.length - shownRoots.reduce((n, r) => n + 1 + repliesOf(r.id).length, 0);

  const send = async (t = text) => {
    if (!t.trim()) return;
    setBusy(true);
    try {
      // Une réponse à une réponse s'accroche au même fil (on garde le nom de la personne à qui on répond)
      const target = replyTo && (replyTo.replyTo && ids.has(replyTo.replyTo) ? { id: replyTo.replyTo, byName: replyTo.byName } : replyTo);
      await addPollComment(poll, me, t, replyTo ? replyTo.optId : (optId || null), target);
      setText(''); setReplyTo(null); setOpen(true);
    } finally { setBusy(false); }
  };

  const startReply = (c) => { setReplyTo(c); setOpen(true); setTimeout(() => input.current?.focus(), 50); };

  const item = (c, isReply) => {
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
          {canWrite && <button className="pcom-rep" onClick={() => startReply(c)}><Reply size={13} /> Répondre</button>}
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
        <button className="pcom-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <MessageSquare size={16} /> <b>Commentaires</b> {list.length > 0 && <span className="pcom-n">{list.length}</span>}
          {roots.length > 2 && <ChevronDown size={15} className={'pcom-chev' + (open ? ' rot' : '')} />}
        </button>
      )}
      {shownRoots.length > 0 && (
        <div className="pcom-list">
          {!open && hiddenCount > 0 && <button className="link tiny" onClick={() => setOpen(true)}>Voir les {hiddenCount} plus anciens</button>}
          {shownRoots.map((r) => (
            <div key={r.id} className="pcom-thread">
              {item(r, false)}
              {repliesOf(r.id).map((c) => item(c, true))}
            </div>
          ))}
        </div>
      )}
      {canWrite && (open || !list.length || fixedOpt) && (
        <div className="pcom-form">
          {replyTo ? (
            <div className="pcom-replying">
              <Reply size={14} />
              <span className="grow">Réponse à <b>{replyTo.byName}</b> : « {short(replyTo.text)} »</span>
              <button className="icon-btn" onClick={() => setReplyTo(null)} aria-label="Annuler la réponse"><X size={15} /></button>
            </div>
          ) : (
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
          <div className="pcom-input">
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={300}
              placeholder={replyTo ? `Répondre à ${replyTo.byName.split(' ')[0]}…` : 'Écris un commentaire…'}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
            <button className="btn primary" disabled={busy || !text.trim()} onClick={() => send()} aria-label="Envoyer"><Send size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
