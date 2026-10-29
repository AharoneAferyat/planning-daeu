import { DAYS_SHORT, DISTANCES, FORMATS, MOMENTS } from './constants';

// Moments préférés d'une personne (compatible avec l'ancien choix unique)
export function momentsOf(p) {
  if (Array.isArray(p?.moments) && p.moments.length) return p.moments;
  if (p?.moment === 'journee') return ['matin', 'aprem'];
  return p?.moment && MOMENTS[p.moment] ? [p.moment] : ['egal'];
}
export const momentsLabel = (p) => momentsOf(p).map((m) => MOMENTS[m]?.short || m).join(' + ');

export const pad = (n) => String(n).padStart(2, '0');

export const toMin = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const toHHMM = (m) => (m >= 1440 ? '23:59' : `${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
export const fmt = (m) => {
  if (m >= 1440 || m === 0) return '00h';
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h}h${pad(mm)}` : `${h}h`;
};
export const fmtDur = (m) => {
  const h = Math.floor(m / 60), mm = m % 60;
  if (!h) return `${mm} min`;
  return mm ? `${h}h${pad(mm)}` : `${h}h`;
};

export function normalizeSlots(slots) {
  const out = [];
  for (let d = 0; d < 7; d++) {
    const day = slots.filter((s) => s.d === d).sort((a, b) => a.s - b.s);
    let cur = null;
    for (const s of day) {
      if (cur && s.s <= cur.e) cur.e = Math.max(cur.e, s.e);
      else { if (cur) out.push(cur); cur = { d, s: s.s, e: s.e }; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

export const slotsOf = (p, d) => (p.slots || []).filter((s) => s.d === d).sort((a, b) => a.s - b.s);
export const availAt = (p, d, t) => (p.slots || []).some((s) => s.d === d && s.s <= t && s.e > t);
export const totalMinutes = (p) => (p.slots || []).reduce((a, s) => a + (s.e - s.s), 0);
export const daysCount = (p) => new Set((p.slots || []).map((s) => s.d)).size;

export function timeRange(people) {
  let mn = Infinity, mx = -Infinity;
  for (const p of people) for (const s of p.slots || []) { mn = Math.min(mn, s.s); mx = Math.max(mx, s.e); }
  if (mn === Infinity) return { start: 8 * 60, end: 20 * 60 };
  let start = Math.floor(mn / 60) * 60;
  let end = Math.ceil(mx / 60) * 60;
  if (end - start < 240) end = Math.min(1440, start + 240);
  return { start, end };
}

export const initials = (n = '') =>
  n.trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';

export function slotsSummary(slots = []) {
  return normalizeSlots(slots).map((s) => `${DAYS_SHORT[s.d]} ${fmt(s.s)}–${fmt(s.e)}`).join(', ') || 'aucun créneau';
}

export function matchFilters(p, f) {
  if (f.format.length) {
    const ok = f.format.some((x) => (x === 'visio' ? p.format !== 'presentiel' : p.format !== 'visio'));
    if (!ok) return false;
  }
  if (f.distance.length && !(p.format !== 'visio' && f.distance.includes(p.distance))) return false;
  if (f.moment.length && !f.moment.some((m) => momentsOf(p).includes(m) || momentsOf(p).includes('egal'))) return false;
  return true;
}

export function compat(ps) {
  const visio = ps.every((p) => p.format !== 'presentiel');
  const pres = ps.every((p) => p.format !== 'visio');
  let dist = null;
  if (pres) dist = Math.min(...ps.map((p) => DISTANCES[p.distance]?.level || 1));
  return { visio, pres, dist };
}

export function compatText(c) {
  const parts = [];
  if (c.pres) {
    const t = c.dist === 1 ? 'tout proche de tous' : c.dist === 2 ? 'à moins de 45 min de tous' : 'où vous voulez';
    parts.push(`Présentiel OK (${t})`);
  }
  if (c.visio) parts.push('Visio OK pour tous');
  if (!parts.length) parts.push('Formats mélangés : hybride (présentiel + visio)');
  return parts.join(' · ');
}

// Meilleurs créneaux communs
export function bestSlots(people, minPeople = 2, minDur = 60) {
  const STEP = 15;
  const res = [];
  for (let d = 0; d < 7; d++) {
    const steps = [];
    for (let t = 0; t < 1440; t += STEP) steps.push(new Set(people.filter((p) => availAt(p, d, t)).map((p) => p.id)));
    const cands = new Map();
    for (const s of steps) if (s.size >= minPeople) cands.set([...s].sort().join(','), [...s]);
    const seen = new Set();
    for (const [key, ids] of cands) {
      let start = null;
      for (let i = 0; i <= steps.length; i++) {
        const ok = i < steps.length && ids.every((id) => steps[i].has(id));
        if (ok && start === null) start = i;
        if (!ok && start !== null) {
          const s = start * STEP, e = i * STEP;
          const k = `${d}-${s}-${e}-${key}`;
          if (e - s >= minDur && !seen.has(k)) { seen.add(k); res.push({ d, s, e, ids }); }
          start = null;
        }
      }
    }
  }
  // retire les créneaux "dominés" (même jour, inclus dans un autre avec au moins les mêmes personnes)
  const kept = res.filter((x) => !res.some((y) => y !== x && y.d === x.d && y.s <= x.s && y.e >= x.e
    && x.ids.every((id) => y.ids.includes(id)) && (y.ids.length > x.ids.length || y.e - y.s > x.e - x.s)));
  return kept.sort((a, b) => b.ids.length - a.ids.length || (b.e - b.s) - (a.e - a.s) || a.d - b.d || a.s - b.s);
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 6) {
  let s = '';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (const n of arr) s += ALPHA[n % ALPHA.length];
  return s;
}
export const randomDigits = (len = 4) => Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join('');

export async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ge-salt:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const toDate = (ts) => (!ts ? null : ts.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts));

export function fmtDate(ts, withTime = true) {
  const d = toDate(ts);
  if (!d) return '—';
  return d.toLocaleString('fr-FR', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeAgo(ts) {
  const d = toDate(ts);
  if (!d) return '';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `dans ${Math.max(1, Math.round(f / 60))} min`;
    if (f < 86400) return `dans ${Math.round(f / 3600)} h`;
    return `dans ${Math.round(f / 86400)} j`;
  }
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
export const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch { /* */ } },
};

export function shortUA() {
  const u = navigator.userAgent || '';
  const os = /iPhone|iPad/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'Autre';
  const br = /Edg\//.test(u) ? 'Edge' : /Firefox/.test(u) ? 'Firefox' : /Chrome/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : '';
  const kind = /Mobi|iPhone|Android/.test(u) ? 'mobile' : /iPad|Tablet/.test(u) ? 'tablette' : 'ordi';
  return `${os} · ${br} · ${kind}`;
}

const FIELDS = {
  prenom: 'Prénom',
  nom: 'Nom',
  formations: 'Formations',
  subjects: 'Matières',
  presSubjects: 'Cours en présentiel',
  color: 'Couleur',
  freq: 'Fréquence',
  moments: 'Moments préférés',
  format: 'Format',
  distance: 'Déplacement',
  note: 'Note',
};
const show = (k, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'pin') return '••••';
  if (k === 'presSubjects') return Array.isArray(v) ? (v.length ? v.map((m) => ({ maths: 'Maths', physique: 'Physique', chimie: 'Chimie', bio: 'Biologie', francais: 'Français' })[m] || m).join(', ') : 'aucun') : '—';
  if (k === 'subjects') return (v || []).length ? v.map((m) => ({ maths: 'Maths', physique: 'Physique', chimie: 'Chimie', bio: 'Biologie', francais: 'Français' })[m] || m).join(', ') : 'toutes';
  if (k === 'formations') return (v || []).map((f) => ({ jour: 'Jour', soir: 'Soir', hybride: 'Hybride' })[f] || f).join(' + ') || '—';
  if (k === 'freq') return `${v}×/sem`;
  if (k === 'moments') return (v || []).map((m) => MOMENTS[m]?.short || m).join(' + ');
  if (k === 'format') return FORMATS[v]?.short || v;
  if (k === 'distance') return DISTANCES[v]?.label || v;
  return String(v);
};
export function diffParticipant(before = {}, after = {}) {
  const out = [];
  for (const k of Object.keys(FIELDS)) {
    const arr = (o) => (k === 'moments' ? momentsOf(o) : k === 'subjects' ? (o[k] || []) : k === 'formations' ? (o.formations?.length ? o.formations : o.formation ? [o.formation] : []) : o[k]);
    const b0 = arr(before);
    const a0 = arr(after);
    if (JSON.stringify(b0 ?? null) !== JSON.stringify(a0 ?? null)) out.push({ field: FIELDS[k], from: show(k, b0), to: show(k, a0) });
  }
  const a = slotsSummary(before.slots), b = slotsSummary(after.slots);
  if (a !== b) out.push({ field: 'Créneaux', from: a, to: b });
  return out;
}

// ---------- Noms & anti-doublons ----------
export const normName = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
export const capName = (s = '') => s.trim().replace(/\s+/g, ' ').toLowerCase()
  .replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
export const nameKey = (prenom, nom) => `${normName(prenom)}|${normName(nom)}`;
export const fullName = (p) => `${p.prenom || ''} ${p.nom || ''}`.trim();
export const shortName = (p) => (p.nom ? `${p.prenom} ${p.nom[0].toUpperCase()}.` : p.prenom || '?');

export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const close = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return lev(a, b) <= (Math.max(a.length, b.length) >= 6 ? 2 : 1);
};

// Renvoie 'exact' | 'similar' | null
export function nameMatch(p1, n1, p2, n2) {
  const a = normName(p1), b = normName(n1), c = normName(p2), d = normName(n2);
  if (a === c && b === d) return 'exact';
  if (a === d && b === c) return 'similar'; // prénom/nom inversés
  if (close(a, c) && close(b, d)) return 'similar';
  if (lev(a + b, c + d) <= 2) return 'similar';
  return null;
}

export function findSimilar(prenom, nom, people, excludeId) {
  if (normName(prenom).length < 2 || normName(nom).length < 1) return [];
  return people
    .filter((p) => p.id !== excludeId)
    .map((p) => ({ p, kind: nameMatch(prenom, nom, p.prenom, p.nom || '') }))
    .filter((x) => x.kind)
    .sort((x, y) => (x.kind === 'exact' ? -1 : 1) - (y.kind === 'exact' ? -1 : 1));
}

export function duplicatePairs(people) {
  const out = [];
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i], b = people[j];
    const k = nameMatch(a.prenom, a.nom || '', b.prenom, b.nom || '');
    if (k) out.push({ a, b, kind: k });
  }
  return out;
}

// ---------- Dates ----------
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const weekStartOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; };
export const fmtDay = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => parseIso(iso).toLocaleDateString('fr-FR', opts);
export const fmtDayShort = (iso) => parseIso(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
export const isPast = (iso, e = 1440) => { const d = parseIso(iso); d.setMinutes(e); return d < new Date(); };
export function nextDateForWeekday(wd, from = new Date()) {
  const x = new Date(from); x.setHours(0, 0, 0, 0);
  let diff = (wd - x.getDay() + 7) % 7; if (diff === 0) diff = 7;
  return isoDate(addDays(x, diff));
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function download(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Codes perso : jamais stockés en clair (empreinte SHA-256 + sel propre à chaque personne)
export const newSalt = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function pinDigest(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ge-pin:${salt}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function checkPin(p, v) {
  if (p.pinHash && p.pinSalt) return (await pinDigest(v, p.pinSalt)) === p.pinHash;
  return p.pin != null && String(p.pin) === String(v);
}
export const randomPin = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
