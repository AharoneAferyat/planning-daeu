import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, LifeBuoy, Send } from 'lucide-react';
import { createTicket, replyTicket, seeTicket, TICKET_TYPES, ticketNewForUser } from '../data';
import { timeAgo } from '../utils';
import { Modal } from './ui';

export const TICKET_STATUS = {
  open: { label: 'En attente', cls: 'warn' },
  answered: { label: 'Répondu', cls: 'ok' },
  closed: { label: 'Résolu', cls: '' },
};

// Petites infos techniques jointes (aident à comprendre un bug)
const techContext = () => {
  const w = window.innerWidth;
  const ua = navigator.userAgent;
  const dev = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'autre';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '?';
  return `${dev} · ${nav} · écran ${w}px · onglet « ${localStorage.getItem('ge_view') || '?'} » · ${new Date().toLocaleString('fr-FR')}`;
};

// Fil d'une demande (côté participant ou admin)
export function TicketThread({ t, side, onReply }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const msgs = [{ from: 'user', text: t.text, at: t.at }, ...(t.replies || [])];
  const send = async () => { if (!text.trim()) return; setBusy(true); await onReply(text); setText(''); setBusy(false); };
  return (
    <div className="tk-thread">
      {msgs.map((m, i) => (
        <div key={i} className={'tk-msg ' + (m.from === side ? 'mine' : '') + (m.from === 'admin' ? ' admin' : '')}>
          <span className="tk-who">{m.from === 'admin' ? '🛟 Admin' : side === 'admin' ? t.byName : 'Toi'} · {timeAgo(m.at)}</span>
          <p>{m.text}</p>
        </div>
      ))}
      {t.status === 'closed' && <p className="muted tiny tk-closed"><CheckCircle2 size={14} /> Demande résolue{side === 'user' ? ' — tu peux encore répondre pour la rouvrir.' : '.'}</p>}
      <div className="pcom-input">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={side === 'admin' ? 'Ta réponse…' : 'Ajouter un message…'} maxLength={2000}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
        <button className="btn primary" disabled={busy || !text.trim()} onClick={send} aria-label="Envoyer"><Send size={16} /></button>
      </div>
    </div>
  );
}

// ---------- Fenêtre « Contacter l'admin » (participant) ----------
export default function SupportPanel({ me, tickets, onClose }) {
  const mine = tickets || [];
  const [view, setView] = useState(mine.some(ticketNewForUser) ? 'list' : 'new');
  const [openId, setOpenId] = useState(null);
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const [withCtx, setWithCtx] = useState(true);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = mine.find((t) => t.id === openId);
  useEffect(() => { if (open && ticketNewForUser(open)) seeTicket(open, 'user').catch(() => {}); }, [open?.lastAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setBusy(true);
    await createTicket(me, type, text, withCtx ? techContext() : '');
    setBusy(false); setSent(true); setText(''); setType('');
  };

  return (
    <Modal title={<><LifeBuoy size={19} /> Contacter l’admin</>} onClose={onClose}>
      <div className="seg tk-tabs">
        <button className={view === 'new' ? 'on' : ''} onClick={() => { setView('new'); setOpenId(null); setSent(false); }}>Nouvelle demande</button>
        <button className={view === 'list' ? 'on' : ''} onClick={() => { setView('list'); setOpenId(null); }}>
          Mes demandes{mine.length ? ` (${mine.length})` : ''}{mine.some(ticketNewForUser) && <i className="tk-dot" />}
        </button>
      </div>

      {view === 'new' && (sent ? (
        <div className="tk-sent">
          <CheckCircle2 size={40} />
          <b>Envoyé !</b>
          <p className="muted">L’admin te répondra ici. Tu verras la réponse dans « Mes demandes » et en rappel à l’ouverture du site.</p>
          <button className="btn" onClick={() => { setView('list'); setSent(false); }}>Voir mes demandes</button>
        </div>
      ) : (
        <>
          <p className="muted tiny">C’est pour…</p>
          <div className="tk-types">
            {Object.entries(TICKET_TYPES).filter(([, v]) => !v.hidden).map(([k, v]) => (
              <button key={k} className={'tk-type' + (type === k ? ' on' : '')} onClick={() => setType(k)}>
                <span className="tk-emoji">{v.icon}</span><b>{v.label}</b><small>{v.hint}</small>
              </button>
            ))}
          </div>
          {type && (
            <>
              <label className="field"><span>Ton message</span>
                <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus
                  placeholder={type === 'bug' ? 'Ce que tu faisais, ce qui s’est passé, ce que tu attendais…' : type === 'idea' ? 'Ton idée, même en vrac !' : 'Explique en quelques mots'} />
              </label>
              {type === 'bug' && (
                <label className="switch"><input type="checkbox" checked={withCtx} onChange={(e) => setWithCtx(e.target.checked)} />
                  <span>Joindre des infos techniques <small className="muted">(appareil, navigateur, taille d’écran : aide à corriger)</small></span></label>
              )}
              <button className="btn primary wide-btn" disabled={busy || text.trim().length < 3} onClick={send}><Send size={16} /> Envoyer à l’admin</button>
            </>
          )}
        </>
      ))}

      {view === 'list' && !open && (
        mine.length === 0 ? <p className="muted">Aucune demande pour l’instant.</p> : (
          <div className="tk-list">
            {mine.map((t) => (
              <button key={t.id} className={'tk-item' + (ticketNewForUser(t) ? ' new' : '')} onClick={() => setOpenId(t.id)}>
                <span className="tk-emoji">{TICKET_TYPES[t.type]?.icon || '💬'}</span>
                <span className="grow">
                  <b>{TICKET_TYPES[t.type]?.label || 'Demande'}</b>
                  <span className="muted tiny tk-prev">{t.text}</span>
                </span>
                <span className={'pill ' + TICKET_STATUS[t.status]?.cls}>{ticketNewForUser(t) ? 'Nouvelle réponse' : TICKET_STATUS[t.status]?.label}</span>
              </button>
            ))}
          </div>
        )
      )}
      {view === 'list' && open && (
        <>
          <button className="link tiny" onClick={() => setOpenId(null)}><ArrowLeft size={13} /> Mes demandes</button>
          <h4 className="tk-title">{TICKET_TYPES[open.type]?.icon} {TICKET_TYPES[open.type]?.label} <span className={'pill ' + TICKET_STATUS[open.status]?.cls}>{TICKET_STATUS[open.status]?.label}</span></h4>
          <TicketThread t={open} side="user" onReply={(txt) => replyTicket(open, 'user', txt)} />
        </>
      )}
    </Modal>
  );
}
