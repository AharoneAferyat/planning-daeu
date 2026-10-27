import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, LifeBuoy, RotateCcw } from 'lucide-react';
import { deleteTicket, log, replyTicket, seeTicket, setTempPin, setTicketStatus, TEMP_PIN_DAYS, TICKET_TYPES, ticketNewForAdmin } from '../data';
import { randomPin } from '../utils';
import { TicketThread, TICKET_STATUS } from '../components/Support';
import { startViewAs } from '../testmode';
import { timeAgo } from '../utils';
import { Avatar, ConfirmButton, Empty } from '../components/ui';

const FILTERS = { todo: 'À traiter', answered: 'Répondu', closed: 'Résolu', all: 'Tout' };

// Boîte de réception des demandes « Contacter l'admin »
export default function AdminSupport({ tickets, people }) {
  const [filter, setFilter] = useState('todo');
  const [openId, setOpenId] = useState(null);
  const [newCode, setNewCode] = useState('');
  const byId = Object.fromEntries((people || []).map((p) => [p.id, p]));
  const list = useMemo(() => (tickets || []).filter((t) => filter === 'all' || (filter === 'todo' ? t.status === 'open' : t.status === filter)), [tickets, filter]);
  const open = (tickets || []).find((t) => t.id === openId);
  useEffect(() => { if (open && ticketNewForAdmin(open)) seeTicket(open, 'admin').catch(() => {}); }, [open?.lastAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (k) => (tickets || []).filter((t) => (k === 'todo' ? t.status === 'open' : k === 'all' ? true : t.status === k)).length;

  if (open) {
    const p = byId[open.by];
    return (
      <div className="card tk-admin">
        <button className="link tiny" onClick={() => setOpenId(null)}><ArrowLeft size={13} /> Toutes les demandes</button>
        <div className="tk-head">
          {p && <Avatar p={p} size={36} />}
          <div className="grow">
            <b>{open.byName}</b>
            <div className="muted tiny">{TICKET_TYPES[open.type]?.icon} {TICKET_TYPES[open.type]?.label} · {timeAgo(open.at)}</div>
          </div>
          <span className={'pill ' + TICKET_STATUS[open.status]?.cls}>{TICKET_STATUS[open.status]?.label}</span>
        </div>
        {open.context && <p className="muted tiny tk-ctx">🔧 {open.context}</p>}
        {open.type === 'pin' ? (
          <div className="tk-pin">
            <p>📞 <b>{open.phone || 'numéro effacé'}</b> {open.text && <span className="muted">— {open.text}</span>}</p>
            {!p ? <p className="muted">Participant introuvable (supprimé ?).</p> : !newCode ? (
              <>
                <p className="muted tiny">Les codes sont chiffrés : personne ne peut les relire. Génère un code temporaire et donne-le-lui : à sa connexion, il devra choisir son nouveau code.</p>
                <button className="btn primary" onClick={async () => { const c = randomPin(); await setTempPin(p.id, c); await log('participant_update', 'Admin', open.byName, { changes: [{ field: 'Code perso', from: '••••', to: 'code temporaire (code oublié)' }] }); setNewCode(c); }}>🔢 Générer un code temporaire</button>
              </>
            ) : (
              <p>Code temporaire : <b className="mono tk-code">{newCode}</b><br /><small className="muted">Valable {TEMP_PIN_DAYS} jours, à usage unique : il devra choisir son code en se connectant.</small></p>
            )}
            <p className="muted tiny">« Marquer résolu » efface automatiquement le numéro de téléphone.</p>
          </div>
        ) : <TicketThread t={open} side="admin" onReply={(txt) => replyTicket(open, 'admin', txt, 'Admin')} />}
        <div className="row-btns">
          {open.status !== 'closed'
            ? <button className="btn" onClick={() => setTicketStatus(open, 'closed')}><CheckCircle2 size={15} /> Marquer résolu</button>
            : <button className="btn ghost" onClick={() => setTicketStatus(open, 'open')}><RotateCcw size={15} /> Rouvrir</button>}
          {p && open.type !== 'pin' && <button className="btn ghost" onClick={() => startViewAs(p.id, true)} title="Voir le site comme cette personne, sans rien enregistrer"><Eye size={15} /> Voir son écran</button>}
          <ConfirmButton className="btn ghost danger" confirmText="Supprimer la demande ?" onConfirm={async () => { await deleteTicket(open); setOpenId(null); }}>Supprimer</ConfirmButton>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h4 className="card-title"><LifeBuoy size={18} /> Demandes des participants</h4>
      <div className="chips tk-filters">
        {Object.entries(FILTERS).map(([k, v]) => (
          <button key={k} className={'chip small' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{v} <small>{count(k)}</small></button>
        ))}
      </div>
      {!list.length ? <Empty icon={LifeBuoy} title={filter === 'todo' ? 'Rien à traiter 🎉' : 'Aucune demande'}>Les participants te contactent depuis leur menu ou la messagerie.</Empty> : (
        <div className="tk-list">
          {list.map((t) => (
            <button key={t.id} className={'tk-item' + (ticketNewForAdmin(t) ? ' new' : '')} onClick={() => { setOpenId(t.id); setNewCode(''); }}>
              <span className="tk-emoji">{TICKET_TYPES[t.type]?.icon || '💬'}</span>
              <span className="grow">
                <b>{t.byName}</b> <span className="muted tiny">· {timeAgo(t.lastAt)}</span>
                <span className="muted tiny tk-prev">{(t.replies || []).length ? (t.replies.at(-1).from === 'admin' ? 'Toi : ' : '') + t.replies.at(-1).text : t.text}</span>
              </span>
              <span className={'pill ' + TICKET_STATUS[t.status]?.cls}>{ticketNewForAdmin(t) ? 'Nouveau' : TICKET_STATUS[t.status]?.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
