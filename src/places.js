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

// ---------- Visio / présentiel (séances et sondages hybrides) ----------
// En hybride, chacun choisit son mode ; seules les places en présentiel sont limitées.
export const isHybrid = (x) => (x?.format || 'hybride') === 'hybride';
export const modeOf = (s, id) => (isHybrid(s) && s.modes?.[id] === 'visio' ? 'visio' : 'presentiel');
export const pollModeOf = (poll, id, optId) => (isHybrid(poll) && poll.modes?.[id]?.[optId] === 'visio' ? 'visio' : 'presentiel');
// « Oui » d'une date, séparés : présentiel (ordre d'arrivée, compte pour les places) / visio
export function yesByMode(poll, optId) {
  const all = yesOrder(poll, optId);
  return { pres: all.filter((id) => pollModeOf(poll, id, optId) !== 'visio'), visio: all.filter((id) => pollModeOf(poll, id, optId) === 'visio') };
}

// État d'une séance pour une personne
export function sessionState(s, meId) {
  const max = Number(s.max) || 0;
  const att = (s.attendees || []).filter((id) => !hiddenId(id));
  const wait = (s.waitlist || []).filter((id) => !hiddenId(id));
  const hybrid = isHybrid(s);
  const pres = hybrid ? att.filter((id) => modeOf(s, id) !== 'visio') : att;
  const visio = hybrid ? att.filter((id) => modeOf(s, id) === 'visio') : [];
  const free = max ? Math.max(0, max - pres.length) : Infinity;
  const full = max > 0 && pres.length >= max;
  const waiting = wait.includes(meId);
  const status = att.includes(meId) ? 'in' : waiting ? 'wait' : 'out';
  const mode = status === 'in' ? modeOf(s, meId) : null;
  const min = Number(s.min) || 0;
  const missing = min ? Math.max(0, min - att.length) : 0;
  const cancelled = !!s.cancelled;
  // Le créateur doit décider si on passe sous le minimum (sauf s'il a déjà choisi de maintenir à ce niveau)
  const needsDecision = !cancelled && missing > 0 && !(s.minAck != null && att.length >= s.minAck);
  return { max, att, wait, pres, visio, hybrid, free, full, status, mode, waiting, rank: wait.indexOf(meId) + 1, min, missing, cancelled, needsDecision };
}

export const placesLabel = (s) => {
  const { max, att, wait, min, missing, pres, visio, hybrid } = sessionState(s);
  let base;
  if (hybrid && visio.length) base = max ? `${pres.length}/${max} en présentiel · ${visio.length} en visio` : `${att.length} inscrits (${pres.length} présentiel · ${visio.length} visio)`;
  else base = max ? `${pres.length}/${max} places` : `${att.length} inscrit${att.length > 1 ? 's' : ''}`;
  return base + (wait.length ? ` · ${wait.length} en attente` : '') + (min ? (missing ? ` · il en manque ${missing} (min ${min})` : ` · min ${min} ✓`) : '');
};

// La séance attend une décision de ce créateur
export const decisionFor = (s, meId) => (s.createdBy === meId || meId === 'admin') && sessionState(s, meId).needsDecision;

// Sondage ouvert = ni clôturé ni annulé
export const isOpenPoll = (p) => p.status !== 'closed' && p.status !== 'cancelled';

// « Peut-être » du sondage d'origine qui n'ont pas encore confirmé ou refusé.
// Les séances créées avant cette fonction n'ont pas la liste : on la retrouve dans le sondage (rattrapage).
export function maybesOf(s, polls) {
  let base = s.maybes;
  if (!base && s.pollId) {
    const p = (polls || []).find((x) => x.id === s.pollId);
    const opt = p && (p.finalOptionId || (p.options || []).find((o) => o.date === s.date && o.s === s.s)?.id);
    base = opt ? Object.keys(p.votes || {}).filter((id) => p.votes[id]?.[opt] === 'maybe') : [];
  }
  const done = new Set([...(s.attendees || []), ...(s.waitlist || []), ...(s.maybeAnswered || [])]);
  return (base || []).filter((id) => !done.has(id) && !hiddenId(id));
}
export const isMaybe = (s, polls, meId) => !!meId && !s.cancelled && maybesOf(s, polls).includes(meId);
