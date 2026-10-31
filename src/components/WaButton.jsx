import { Check, Send } from 'lucide-react';
import { Modal } from './ui';

// Logo WhatsApp simplifié (bulle + combiné), en SVG inline
export function WaIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z" />
    </svg>
  );
}

// Bouton « Partager sur WhatsApp » : toujours écrit en clair
export default function WaButton({ onClick, wide }) {
  return (
    <button className={'btn wa-btn' + (wide ? ' wa-wide' : '')} onClick={onClick} title="Partager sur WhatsApp">
      <WaIcon size={18} /> {wide ? 'Partager sur WhatsApp' : 'Partager'}
    </button>
  );
}

// Après la création : proposer tout de suite le partage
export function SharedDone({ title, item, onShare, onClose }) {
  return (
    <Modal title={<><Check size={18} /> {title}</>} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Plus tard</button>
        <button className="btn wa-btn grow" onClick={() => { onShare(); onClose(); }}><WaIcon /> Partager sur WhatsApp</button>
      </>}>
      <p><b>{item}</b> est en ligne.</p>
      <p className="muted">Préviens le groupe : le message est déjà rédigé, avec un lien qui mène directement au bon endroit (même pour ceux qui doivent d’abord se connecter).</p>
    </Modal>
  );
}

// Après une modification : prévenir le groupe sur WhatsApp
export function ChangedDone({ list, onShare, onClose }) {
  return (
    <Modal title={<><Check size={18} /> Modification enregistrée</>} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Pas besoin</button>
        <button className="btn wa-btn grow" onClick={() => { onShare(); onClose(); }}><WaIcon /> Prévenir sur WhatsApp</button>
      </>}>
      <ul className="chg-list">{list.map((l, i) => <li key={i}>{l.replace(/\*/g, '')}</li>)}</ul>
      <p className="muted tiny">Les personnes concernées le verront aussi dans leurs rappels sur le site. Le message WhatsApp « 🔄 MODIF » est déjà rédigé.</p>
    </Modal>
  );
}
