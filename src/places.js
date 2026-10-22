// Gestion des places limitées et de la liste d'attente

// Ordre d'arrivée des « oui » pour une date d'un sondage
export function yesOrder(poll, optId) {
  const v = poll.votes || {};
  const isYes = (id) => v[id]?.[optId] === 'yes';
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
  const att = s.attendees || [];
  const wait = s.waitlist || [];
  const free = max ? Math.max(0, max - att.length) : Infinity;
  const full = max > 0 && att.length >= max;
  const status = att.includes(meId) ? 'in' : wait.includes(meId) ? 'wait' : 'out';
  return { max, att, wait, free, full, status, rank: wait.indexOf(meId) + 1 };
}

export const placesLabel = (s) => {
  const { max, att, wait } = sessionState(s);
  if (!max) return `${att.length} inscrit${att.length > 1 ? 's' : ''}`;
  return `${att.length}/${max} places${wait.length ? ` · ${wait.length} en attente` : ''}`;
};
