// Gestion des places limitées et de la liste d'attente
import { hiddenId } from './testmode';

// Ordre d'arrivée des « oui » pour une date d'un sondage
export function yesOrder(poll, optId) {
  const v = poll.votes || {};
  const isYes = (id) => v[id]?.[optId] === 'yes' && !hiddenId(id);
  const queue = (poll.queue?.[optId] || []).filter(isYes);
  const rest = Object.keys(v).filter((id) => isYes(id) && !queue.includes(id));
  return [...queue, ...rest];
}

// Sépare les places confirmées et la liste d'attente
export function splitPlaces(ids, max) {
  if (!max) return { inn: ids, wait: [] };
  return { inn: ids.slice(0, max), wait: ids.slice(max) };
}

// État d'une séance pour une personne
export function sessionState(s, meId) {
  const max = Number(s.max) || 0;
  const att = (s.attendees || []).filter((id) => !hiddenId(id));
  const wait = (s.waitlist || []).filter((id) => !hiddenId(id));
  const free = max ? Math.max(0, max - att.length) : Infinity;
  const full = max > 0 && att.length >= max;
  const status = att.includes(meId) ? 'in' : wait.includes(meId) ? 'wait' : 'out';
  const min = Number(s.min) || 0;
  const missing = min ? Math.max(0, min - att.length) : 0;
  const cancelled = !!s.cancelled;
  // Le créateur doit décider si on passe sous le minimum (sauf s'il a déjà choisi de maintenir à ce niveau)
  const needsDecision = !cancelled && missing > 0 && !(s.minAck != null && att.length >= s.minAck);
  return { max, att, wait, free, full, status, rank: wait.indexOf(meId) + 1, min, missing, cancelled, needsDecision };
}

export const placesLabel = (s) => {
  const { max, att, wait, min, missing } = sessionState(s);
  const base = max ? `${att.length}/${max} places` : `${att.length} inscrit${att.length > 1 ? 's' : ''}`;
  return base + (wait.length ? ` · ${wait.length} en attente` : '') + (min ? (missing ? ` · il en manque ${missing} (min ${min})` : ` · min ${min} ✓`) : '');
};

// La séance attend une décision de ce créateur
export const decisionFor = (s, meId) => (s.createdBy === meId || meId === 'admin') && sessionState(s, meId).needsDecision;
