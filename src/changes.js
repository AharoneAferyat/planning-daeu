// Modifications d'un sondage / d'une séance : liste lisible, message WhatsApp, rappel aux personnes concernées
import { SESSION_FORMATS } from './constants';
import { fmt, fmtDay, ls, toMin } from './utils';

const day = (iso) => fmtDay(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const hm = (x) => `${fmt(x.s)}-${fmt(x.e)}`;
const fmtF = (f) => SESSION_FORMATS[f || 'hybride'] || f;
const txt = (v) => (v || '').trim() || '—';
const dl = (p) => (p.deadline ? `${day(p.deadline)}${p.deadlineTime ? ` à ${fmt(toMin(p.deadlineTime))}` : ''}` : 'aucune');

export function sessionDiff(a, b) {
  const out = [];
  if (a.date !== b.date) out.push(`📅 Date : ${day(a.date)} ${hm(a)} → *${day(b.date)} ${hm(b)}*`);
  else if (a.s !== b.s || a.e !== b.e) out.push(`🕐 Horaire : ${hm(a)} → *${hm(b)}*`);
  if (fmtF(a.format) !== fmtF(b.format)) out.push(`💻 Format : ${fmtF(a.format)} → *${fmtF(b.format)}*`);
  if (txt(a.place) !== txt(b.place)) out.push(`📍 Lieu : ${txt(a.place)} → *${txt(b.place)}*`);
  if ((a.title || '') !== (b.title || '')) out.push(`✏️ Titre : ${a.title} → *${b.title}*`);
  if ((Number(a.max) || 0) !== (Number(b.max) || 0)) out.push(`👥 Places : ${Number(a.max) || 'illimitées'} → *${Number(b.max) || 'illimitées'}*`);
  return out;
}

export function pollDiff(a, b) {
  const out = [];
  const old = Object.fromEntries((a.options || []).map((o) => [o.id, o]));
  const neu = Object.fromEntries((b.options || []).map((o) => [o.id, o]));
  for (const o of b.options || []) {
    const p = old[o.id];
    if (!p) out.push(`➕ Date ajoutée : *${day(o.date)} ${hm(o)}*`);
    else if (p.date !== o.date || p.s !== o.s || p.e !== o.e) out.push(`🕐 ${day(p.date)} ${hm(p)} → *${day(o.date)} ${hm(o)}*`);
  }
  for (const o of a.options || []) if (!neu[o.id]) out.push(`➖ Date retirée : ${day(o.date)} ${hm(o)}`);
  if (fmtF(a.format) !== fmtF(b.format)) out.push(`💻 Format : ${fmtF(a.format)} → *${fmtF(b.format)}*`);
  if (txt(a.place) !== txt(b.place)) out.push(`📍 Lieu : ${txt(a.place)} → *${txt(b.place)}*`);
  if (dl(a) !== dl(b)) out.push(`⏳ Date limite : ${dl(a)} → *${dl(b)}*`);
  if ((a.title || '') !== (b.title || '')) out.push(`✏️ Titre : ${a.title} → *${b.title}*`);
  if ((Number(a.max) || 0) !== (Number(b.max) || 0)) out.push(`👥 Places : ${Number(a.max) || 'illimitées'} → *${Number(b.max) || 'illimitées'}*`);
  return out;
}

// Pour l'affichage sur le site : sans les étoiles WhatsApp
export const plain = (line) => line.replace(/\*/g, '');

// Modification récente (7 jours) : précisée dans les rappels
export const recentChange = (x) => (x?.lastChange?.at && Date.now() - x.lastChange.at < 7 * 86400000 ? x.lastChange : null);

// Déjà vu par moi ?
const KEY = 'ge_change_seen';
const seenList = () => { try { return JSON.parse(ls.get(KEY) || '[]'); } catch { return []; } };
export const changeKey = (x) => `${x.id}:${x.changeV || 0}`;
export const changeSeen = (x) => seenList().includes(changeKey(x));
export function ackChange(x) {
  ls.set(KEY, JSON.stringify([...new Set([...seenList(), changeKey(x)])].slice(-300)));
  window.dispatchEvent(new Event('ge-cancel-seen'));
}
