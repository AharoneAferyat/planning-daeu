// Date limite des sondages : heure précise + création automatique de la séance
import { hiddenId } from './testmode';
import { fmt, fmtDay, parseIso, toMin } from './utils';

export function scoreOf(poll, optId) {
  let yes = 0, maybe = 0, no = 0;
  for (const [id, v] of Object.entries(poll.votes || {})) {
    if (hiddenId(id)) continue;
    if (v?.[optId] === 'yes') yes++; else if (v?.[optId] === 'maybe') maybe++; else if (v?.[optId] === 'no') no++;
  }
  return { yes, maybe, no, score: yes * 2 + maybe };
}

// Moment exact de la date limite (sans heure : fin de journée)
export function deadlineAt(p) {
  if (!p?.deadline) return null;
  const d = parseIso(p.deadline);
  const m = p.deadlineTime ? toMin(p.deadlineTime) : 1439;
  d.setHours(0, m, 0, 0);
  return d.getTime();
}
export const deadlinePassed = (p) => { const t = deadlineAt(p); return !!t && t <= Date.now(); };
export const deadlineLabel = (p, day = (iso) => fmtDay(iso, { weekday: 'short', day: 'numeric', month: 'short' })) =>
  p?.deadline ? `${day(p.deadline)}${p.deadlineTime ? ` à ${fmt(toMin(p.deadlineTime))}` : ''}` : '';

const optStart = (o) => { const d = parseIso(o.date); d.setHours(0, o.s || 0, 0, 0); return d.getTime(); };

// Date retenue automatiquement : le plus de « Oui » (puis de « Peut-être »), à égalité la plus proche ; seulement des dates à venir
export function autoPick(poll, now = Date.now()) {
  const opts = (poll.options || []).filter((o) => optStart(o) > now)
    .map((o) => ({ o, sc: scoreOf(poll, o.id) }))
    .filter((x) => x.sc.yes > 0)
    .sort((a, b) => b.sc.score - a.sc.score || optStart(a.o) - optStart(b.o));
  return opts[0]?.o || null;
}
// Sondage à clôturer automatiquement maintenant ?
export const dueAutoClose = (p, now = Date.now()) => p.status === 'open' && p.autoClose && !p.autoSkipped && deadlineAt(p) && deadlineAt(p) <= now;
