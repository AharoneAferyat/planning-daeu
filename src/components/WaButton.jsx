import { Check, MessageCircle, Send } from 'lucide-react';
import { Modal } from './ui';

// Bouton « Partager sur WhatsApp »
export default function WaButton({ onClick, btn }) {
  if (btn) return <button className="btn ghost wa" onClick={onClick} title="Partager sur WhatsApp"><MessageCircle size={16} /></button>;
  return <button className="icon-btn wa" onClick={onClick} title="Partager sur WhatsApp" aria-label="Partager sur WhatsApp"><MessageCircle size={18} /></button>;
}

// Après la création : proposer tout de suite le partage
export function SharedDone({ title, item, onShare, onClose }) {
  return (
    <Modal title={<><Check size={18} /> {title}</>} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Plus tard</button>
        <button className="btn wa-btn grow" onClick={() => { onShare(); onClose(); }}><Send size={16} /> Partager sur WhatsApp</button>
      </>}>
      <p><b>{item}</b> est en ligne.</p>
      <p className="muted">Préviens le groupe : le message est déjà rédigé, avec un lien qui mène directement au bon endroit (même pour ceux qui doivent d’abord se connecter).</p>
    </Modal>
  );
}
