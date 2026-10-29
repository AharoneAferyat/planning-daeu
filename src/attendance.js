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

// Présence notée par le créateur : 'present' | 'absent' | 'excused' | null (pas noté = on ne sait pas).
// Anciennes séances (avant v58) : le créateur validait « tout le monde est venu », donc non coché = présent.
export function markOf(s, id) {
  const v = s.attendance?.[id];
  if (v) return v;
  return s.attendanceAt && !s.attendanceV ? 'present' : null;
}

// Par personne : séances où elle était inscrite (passées), « pas venu », désistements de dernière minute
export function reliabilityStats(sessions) {
  const st = {};
  const get = (id) => (st[id] ||= { id, total: 0, present: 0, unmarked: 0, noShow: 0, excused: 0, lateLeaves: 0, lateCancels: 0, history: [] });
  // Organisateur qui annule sa séance moins de 24 h avant (avec d'autres inscrits)
  for (const s of (sessions || []).filter((x) => x.cancelled && x.lateCancelBy && !hiddenId(x.lateCancelBy))) {
    const p = get(s.lateCancelBy); p.lateCancels++; p.history.push({ s, v: 'lateCancel' });
  }
  for (const s of (sessions || []).filter(isOver)) {
    for (const id of s.attendees || []) {
      if (hiddenId(id)) continue;
      const v = markOf(s, id);
      const p = get(id);
      if (!v) { p.unmarked++; continue; } // pas noté (oubli possible) : on ne compte rien
      p.total++;
      if (v === 'present') p.present++;
      else if (v === 'absent') { p.noShow++; p.history.push({ s, v: 'noShow' }); }
      else if (v === 'excused') { p.excused++; p.history.push({ s, v: 'excused' }); }
    }
  }
  // Désistements < 24 h : comptés tout de suite (même si la séance n'a pas encore eu lieu)
  for (const s of (sessions || []).filter((x) => !x.cancelled)) {
    for (const l of leavesOf(s)) if (l.late) { const p = get(l.id); p.lateLeaves++; p.history.push({ s, v: 'lateLeave', at: l.at }); }
  }
  for (const p of Object.values(st)) {
    // Lâchages : absent sans prévenir = 1 ; ceux qui ont prévenu (excusé, désistement < 24 h, séance annulée < 24 h) = ½
    p.flakes = p.noShow;
    p.missed = p.noShow + p.lateLeaves + p.excused + p.lateCancels; // toutes les fois où la personne n'est pas venue / a lâché
    const n = p.total + p.lateLeaves + p.lateCancels;
    p.rate = n ? Math.round(((n - p.flakes - (p.excused + p.lateLeaves + p.lateCancels) * 0.5) / n) * 100) : null;
    p.history.sort((a, b) => b.s.date.localeCompare(a.s.date));
  }
  return st;
}

// « Attention » : a lâché plus de 90 % des séances, à partir de 5 séances
export const FLAKY_MIN = 5;
export const FLAKY_RATE = 0.9;
// « Attention » : n'est pas venu (absent, excusé ou désisté au dernier moment) à plus de 90 % des séances, à partir de 5
export const isFlaky = (r) => !!r && r.total + r.lateLeaves + r.lateCancels >= FLAKY_MIN && r.missed / (r.total + r.lateLeaves + r.lateCancels) > FLAKY_RATE;
export const flakySet = (sessions) => new Set(Object.values(reliabilityStats(sessions)).filter(isFlaky).map((r) => r.id));
