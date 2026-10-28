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
  const get = (id) => (st[id] ||= { id, total: 0, noShow: 0, excused: 0, lateLeaves: 0, history: [] });
  for (const s of (sessions || []).filter(isOver)) {
    for (const id of s.attendees || []) {
      if (hiddenId(id)) continue;
      const p = get(id);
      p.total++;
      if (s.attendance?.[id] === 'absent') { p.noShow++; p.history.push({ s, v: 'noShow' }); }
      else if (s.attendance?.[id] === 'excused') { p.excused++; p.history.push({ s, v: 'excused' }); }
    }
    for (const l of leavesOf(s)) if (l.late) { const p = get(l.id); p.lateLeaves++; p.history.push({ s, v: 'lateLeave', at: l.at }); }
  }
  for (const p of Object.values(st)) {
    // Lâchages : absent sans prévenir = 1, désistement < 24 h = 1, absent excusé = ½ (excusé tout le temps finit par peser)
    p.flakes = p.noShow + p.lateLeaves;
    p.missed = p.noShow + p.lateLeaves + p.excused; // toutes les fois où la personne n'est pas venue
    const n = p.total + p.lateLeaves;
    p.rate = n ? Math.round(((n - p.flakes - p.excused * 0.5) / n) * 100) : null;
    p.history.sort((a, b) => b.s.date.localeCompare(a.s.date));
  }
  return st;
}

// « Attention » : a lâché plus de 90 % des séances, à partir de 5 séances
export const FLAKY_MIN = 5;
export const FLAKY_RATE = 0.9;
// « Attention » : n'est pas venu (absent, excusé ou désisté au dernier moment) à plus de 90 % des séances, à partir de 5
export const isFlaky = (r) => !!r && r.total + r.lateLeaves >= FLAKY_MIN && r.missed / (r.total + r.lateLeaves) > FLAKY_RATE;
export const flakySet = (sessions) => new Set(Object.values(reliabilityStats(sessions)).filter(isFlaky).map((r) => r.id));
