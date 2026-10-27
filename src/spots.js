// Spots (lieux de révision) : horaires, fermetures, disponibilité sur un créneau, import / export CSV
import { holidayOn } from './formations';
import { isInvited } from './privacy';
import { fmt, normName, parseIso } from './utils';

export const DAY_KEYS = [1, 2, 3, 4, 5, 6, 0]; // ordre d'affichage : lundi → dimanche (0 = dimanche)
export const DAY_NAMES = { 0: 'Dimanche', 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi' };
export const SPOT_TYPES = ['Bibliothèque', 'Café', 'Salle', 'Chez quelqu’un', 'Parc', 'Autre'];
export const AMBIANCES = ['Silencieux', 'Calme', 'Animé'];
export const PRICES = ['Gratuit', 'Consommation', 'Payant'];
export const CONDITION_IDEAS = ['Silence obligatoire', 'Chuchotements tolérés', 'Pas d’appel / visio', 'Pas de nourriture', 'Consommation obligatoire', 'Carte étudiant', 'Inscription / badge', 'Réservation à l’avance', 'Durée limitée'];

// « 9h-22h », « 9h30-18h », « 9h-12h / 14h-19h », « 9:00-18:00 », « fermé », vide = inconnu
export function parseHours(txt) {
  const t = String(txt || '').trim().toLowerCase();
  if (!t) return null;
  if (/ferm|closed|^-$|^non$/.test(t)) return [];
  if (/24\s*h|24\/24/.test(t)) return [{ s: 0, e: 1440 }];
  const out = [];
  const re = /(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\s*(?:-|–|—|à|a)\s*(\d{1,2})\s*(?:h|:)?\s*(\d{2})?/g;
  let m;
  while ((m = re.exec(t))) {
    const s = Number(m[1]) * 60 + Number(m[2] || 0);
    let e = Number(m[3]) * 60 + Number(m[4] || 0);
    if (e === 0) e = 1440;
    if (e > s) out.push({ s, e });
  }
  return out.length ? out : null;
}
export const hoursLabel = (iv) => (iv === null ? 'horaires inconnus' : !iv.length ? 'fermé' : iv.map((x) => `${fmt(x.s)}–${fmt(x.e)}`).join(' / '));

// « 25/12, 01/01, 15/08/2027, 20/12-03/01 »
export function parseClosed(txt) {
  return String(txt || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const parts = x.split(/\s*(?:-|–|au)\s*/).map((y) => y.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)).filter(Boolean);
    if (!parts.length) return null;
    const mk = (p) => ({ d: Number(p[1]), m: Number(p[2]), y: p[3] ? Number(p[3].length === 2 ? `20${p[3]}` : p[3]) : null });
    return { from: mk(parts[0]), to: mk(parts[parts.length - 1]) };
  }).filter(Boolean);
}
const md = (x) => x.m * 100 + x.d;
function closedOn(spot, iso) {
  const dt = parseIso(iso);
  const cur = { d: dt.getDate(), m: dt.getMonth() + 1, y: dt.getFullYear() };
  return parseClosed(spot.closed).some(({ from, to }) => {
    if (from.y && to.y) { const k = (x) => x.y * 10000 + md(x); return k(cur) >= k(from) && k(cur) <= k(to); }
    const a = md(from), b = md(to), c = md(cur);
    return a <= b ? c >= a && c <= b : c >= a || c <= b; // plage qui passe le 31/12
  });
}

// Disponibilité d'un spot sur un créneau : open | partial | closed | unknown
export function spotStatus(spot, iso, s, e, settings) {
  if (closedOn(spot, iso)) return { key: 'closed', label: 'Fermé ce jour-là' };
  if (spot.closedHolidays && holidayOn(settings, iso)) return { key: 'closed', label: 'Fermé (vacances)' };
  const iv = parseHours(spot.hours?.[parseIso(iso).getDay()]);
  if (iv === null) return { key: 'unknown', label: 'Horaires inconnus' };
  if (!iv.length) return { key: 'closed', label: 'Fermé ce jour-là' };
  if (iv.some((x) => x.s <= s && x.e >= e)) return { key: 'open', label: `Ouvert · ${hoursLabel(iv)}` };
  const ov = iv.find((x) => x.s < e && x.e > s);
  if (ov) return { key: 'partial', label: ov.e < e ? `Ferme à ${fmt(ov.e)}` : `Ouvre à ${fmt(ov.s)}` };
  return { key: 'closed', label: `Fermé à cette heure · ${hoursLabel(iv)}` };
}
const RANK = { open: 0, partial: 1, unknown: 2, closed: 3 };
export const sortByStatus = (rows) => [...rows].sort((a, b) => RANK[a.st.key] - RANK[b.st.key] || a.spot.name.localeCompare(b.spot.name, 'fr'));

// Visibilité : public, ou réservé à certaines personnes / cercles (comme les séances sur invitation)
export const canSeeSpot = (spot, me) => !spot.private || !me || me.id === 'admin' || isInvited(spot, me.id);
export const mapsLink = (spot) => spot.maps || (spot.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.address}`)}` : null);
export const conditionsOf = (spot) => String(spot.conditions || '').split(',').map((x) => x.trim()).filter(Boolean);

// ---------- CSV (Google Sheets : Fichier → Télécharger → CSV) ----------
const COLS = [
  ['Nom', 'name'], ['Type', 'type'], ['Adresse', 'address'], ['Lien Maps', 'maps'],
  ['Lundi', 'h1'], ['Mardi', 'h2'], ['Mercredi', 'h3'], ['Jeudi', 'h4'], ['Vendredi', 'h5'], ['Samedi', 'h6'], ['Dimanche', 'h0'],
  ['Fermé les', 'closed'], ['Fermé pendant les vacances', 'closedHolidays'], ['Wifi', 'wifi'], ['Prises', 'plugs'],
  ['Ambiance', 'ambiance'], ['Conditions', 'conditions'], ['Places', 'capacity'], ['Réservation', 'booking'], ['Prix', 'price'],
  ['Visibilité', 'visibility'], ['Remarques', 'notes'],
];
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const t = text.replace(/^﻿/, '');
  const sep = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
const yes = (v) => /^(oui|yes|x|1|vrai|true)$/i.test(String(v || '').trim());
export function spotsFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => normName(h));
  const idx = Object.fromEntries(COLS.map(([label, key]) => [key, head.indexOf(normName(label))]));
  if (idx.name < 0) throw new Error('Colonne « Nom » introuvable : utilise le modèle du tableau des spots.');
  const get = (r, k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
  return rows.slice(1).map((r) => ({
    name: get(r, 'name'), type: get(r, 'type'), address: get(r, 'address'), maps: get(r, 'maps'),
    hours: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, get(r, `h${d}`)])),
    closed: get(r, 'closed'), closedHolidays: yes(get(r, 'closedHolidays')), wifi: yes(get(r, 'wifi')), plugs: yes(get(r, 'plugs')),
    ambiance: get(r, 'ambiance'), conditions: get(r, 'conditions'), capacity: Number(get(r, 'capacity')) || null,
    booking: yes(get(r, 'booking')), price: get(r, 'price'), private: /priv/i.test(get(r, 'visibility')), notes: get(r, 'notes'),
  })).filter((s) => s.name && !/^exemple/i.test(s.name));
}
export function spotsToCsv(spots) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const val = (s, key) => {
    if (/^h\d$/.test(key)) return s.hours?.[key[1]] || '';
    if (['closedHolidays', 'wifi', 'plugs', 'booking'].includes(key)) return s[key] ? 'Oui' : 'Non';
    if (key === 'visibility') return s.private ? 'Privé' : 'Public';
    return s[key] ?? '';
  };
  return '﻿' + [COLS.map(([l]) => esc(l)).join(','), ...spots.map((s) => COLS.map(([, k]) => esc(val(s, k))).join(','))].join('\n');
}

// Petit magasin partagé (chargé une fois par l'appli)
import { useEffect as useEffectS, useState as useStateS } from 'react';
let spotsList = null;
const spotSubs = new Set();
export const setSpotsStore = (l) => { spotsList = l; spotSubs.forEach((f) => f(l)); };
export function useSpotsStore() {
  const [v, setV] = useStateS(spotsList);
  useEffectS(() => { spotSubs.add(setV); setV(spotsList); return () => spotSubs.delete(setV); }, []);
  return v || [];
}

// ---------- Google Sheet ----------
export const sheetId = (url) => (String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || null;
// Export CSV lisible depuis le navigateur (feuille « Spots »), pour un Sheet partagé « tous les utilisateurs disposant du lien »
export const sheetCsvUrl = (url) => { const id = sheetId(url); return id ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&sheet=Spots` : null; };
export const sheetKey = (name) => `gs_${normName(name).slice(0, 60) || 'spot'}`;

// Accès avancé (spots, cercles, sondages / séances sur invitation) : l'admin + les personnes autorisées dans Réglages
export const canUseSpots = (me, settings) => !!me && (me.id === 'admin' || (settings?.spotPickers || []).includes(me.id));
// Infos importantes pré-remplies à partir d'un spot
export function spotInfo(sp) {
  if (!sp) return {};
  const conds = conditionsOf(sp);
  const extra = [sp.type === 'Café' && sp.price === 'Consommation' && !conds.some((c) => /consomm/i.test(c)) ? 'Consommation à prévoir' : null,
    sp.booking ? 'Sur réservation' : null].filter(Boolean);
  const note = [conds.length ? `Conditions : ${[...conds, ...extra].join(', ')}` : extra.length ? extra.join(', ') : null, sp.notes || null].filter(Boolean).join('\n');
  return { place: `${sp.name}${sp.address ? ` — ${sp.address}` : ''}`, note };
}
