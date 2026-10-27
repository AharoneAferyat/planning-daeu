// Fiabilité : désistements et « pas venus » (calculs purs)
import { isPast, parseIso } from './utils';
import { hiddenId } from './testmode';

export const startAt = (s) => parseIso(s.date).getTime() + (s.s || 0) * 60000;
export const isOver = (s) => !s.cancelled && isPast(s.date, s.e);
export const DAY = 86400000;

// Désistements d'une séance : qui s'est désinscrit, quand, et si c'était moins de 24 h avant
export function leavesOf(s) {
  const all = { ...(s.leaves || {}) };
  for (const [id, at] of Object.entries(s.lateLeaves || {})) all[id] = all[id] || at;
  return Object.entries(all)
    .filter(([id]) => !hiddenId(id) && !(s.attendees || []).includes(id))
    .map(([id, at]) => ({ id, at, late: startAt(s) - at < DAY }))
    .sort((a, b) => b.at - a.at);
}

// Par personne : séances où elle était inscrite (passées), « pas venu », désistements de dernière minute
export function reliabilityStats(sessions) {
  const st = {};
  const get = (id) => (st[id] ||= { id, total: 0, noShow: 0, lateLeaves: 0, history: [] });
  for (const s of (sessions || []).filter(isOver)) {
    for (const id of s.attendees || []) {
      if (hiddenId(id)) continue;
      const p = get(id);
      p.total++;
      if (s.attendance?.[id] === 'absent') { p.noShow++; p.history.push({ s, v: 'noShow' }); }
    }
    for (const l of leavesOf(s)) if (l.late) { const p = get(l.id); p.lateLeaves++; p.history.push({ s, v: 'lateLeave', at: l.at }); }
  }
  for (const p of Object.values(st)) {
    p.flakes = p.noShow + p.lateLeaves;
    const n = p.total + p.lateLeaves;
    p.rate = n ? Math.round(((n - p.flakes) / n) * 100) : null;
    p.history.sort((a, b) => b.s.date.localeCompare(a.s.date));
  }
  return st;
}
