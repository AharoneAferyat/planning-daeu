import { useState } from 'react';
import { ChevronDown, MessageSquare, Send, Trash2 } from 'lucide-react';
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

// Commentaires d'un sondage : liés ou non à une date
export default function PollComments({ poll, me, people, canModerate, optId: fixedOpt }) {
  const all = [...(poll.comments || [])].sort((a, b) => a.at - b.at);
  const list = fixedOpt ? all.filter((c) => c.optId === fixedOpt) : all;
  const [open, setOpen] = useState(!!fixedOpt);
  const [text, setText] = useState('');
  const [optId, setOptId] = useState(fixedOpt || '');
  const [busy, setBusy] = useState(false);
  const canWrite = me && me.id !== 'admin' && poll.status !== 'cancelled';
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const actor = me?.id === 'admin' ? 'Admin' : `${me?.prenom} ${me?.nom || ''}`.trim();
  const shown = open ? list : list.slice(-2);

  const send = async (t = text) => {
    if (!t.trim()) return;
    setBusy(true);
    await addPollComment(poll, me, t, optId || null);
    setText(''); setBusy(false); setOpen(true);
  };

  if (!list.length && !canWrite) return null;
  return (
    <div className="pcom">
      {!fixedOpt && (
        <button className="pcom-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <MessageSquare size={16} /> <b>Commentaires</b> {list.length > 0 && <span className="pcom-n">{list.length}</span>}
          {list.length > 2 && <ChevronDown size={15} className={'pcom-chev' + (open ? ' rot' : '')} />}
        </button>
      )}
      {shown.length > 0 && (
        <div className="pcom-list">
          {!open && list.length > 2 && <button className="link tiny" onClick={() => setOpen(true)}>Voir les {list.length - 2} plus anciens</button>}
          {shown.map((c) => {
            const p = byId[c.by];
            const o = c.optId && poll.options.find((x) => x.id === c.optId);
            const mine = me && c.by === me.id;
            return (
              <div key={c.id} className={'pcom-item' + (mine ? ' mine' : '')}>
                {p ? <Avatar p={p} size={26} /> : <span className="pcom-av">?</span>}
                <div className="grow">
                  <div className="pcom-meta"><b>{c.byName}</b>{o && !fixedOpt && <span className="pcom-opt">{optLabel(o)}</span>}<span className="muted">{timeAgo(c.at)}</span></div>
                  <p>{c.text}</p>
                </div>
                {(mine || canModerate) && (
                  <button className="icon-btn" onClick={() => deletePollComment(poll, c, actor)} aria-label="Supprimer" title="Supprimer"><Trash2 size={14} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {canWrite && (open || !list.length || fixedOpt) && (
        <div className="pcom-form">
          <div className="pcom-quick">
            {QUICK.map((q) => <button key={q} className="chip small" disabled={busy} onClick={() => send(q)}>{q}</button>)}
          </div>
          {!fixedOpt && poll.options.length > 1 && (
            <select value={optId} onChange={(e) => setOptId(e.target.value)} aria-label="À propos de quelle date ?">
              <option value="">Pour tout le sondage</option>
              {poll.options.map((o) => <option key={o.id} value={o.id}>À propos du {optLabel(o)}</option>)}
            </select>
          )}
          <div className="pcom-input">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Écris un commentaire…"
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
            <button className="btn primary" disabled={busy || !text.trim()} onClick={() => send()} aria-label="Envoyer"><Send size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
