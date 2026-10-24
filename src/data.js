import { useEffect, useState } from 'react';
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs,
  increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_SETTINGS } from './config';
import { fmt, fmtDayShort, shortUA, toDate, normalizeSlots } from './utils';
import { splitPlaces, yesOrder } from './places';
import { inTestMode, TEST_ID } from './testmode';

// ---------- Historique ----------
export async function log(type, actor, target = '', details = {}) {
  try {
    const clean = JSON.parse(JSON.stringify(details ?? {}));
    await addDoc(collection(db, 'logs'), {
      type, actor: actor || '?', target: target || '', details: clean, ua: shortUA(), at: serverTimestamp(),
    });
  } catch (e) { console.warn('log', e); }
}

// ---------- Hooks temps réel ----------
// Renvoie [lignes, erreur]
function useColWithError(name, map, sort) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => onSnapshot(collection(db, name), (snap) => {
    let r = snap.docs.map((d) => map(d));
    if (sort) r = r.sort(sort);
    setRows(r);
    setError(null);
  }, (e) => {
    console.error(name, e);
    setError(e.code === 'permission-denied'
      ? 'Accès refusé par Firestore : les règles ne sont pas publiées (Firestore → Règles → coller firestore.rules → Publier).'
      : e.message);
    setRows([]);
  }), [name]);
  return [rows, error];
}
// Renvoie seulement les lignes
const useCol = (name, map, sort) => useColWithError(name, map, sort)[0];
const byCreatedDesc = (a, b) => (toDate(b.createdAt)?.getTime() || Date.now()) - (toDate(a.createdAt)?.getTime() || Date.now());

export function useSettings() {
  const [settings, setSettings] = useState(null);
  useEffect(() => onSnapshot(doc(db, 'config', 'settings'),
    (s) => setSettings({ ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) }),
    () => setSettings({ ...DEFAULT_SETTINGS })), []);
  return settings;
}
// Le profil test n'apparaît qu'en mode test
export function useParticipants() {
  const [rows, error] = useColWithError('participants', (d) => ({ id: d.id, ...d.data() }),
    (a, b) => (a.prenom || '').localeCompare(b.prenom || '', 'fr') || (a.nom || '').localeCompare(b.nom || '', 'fr'));
  return [rows && (inTestMode() ? rows : rows.filter((p) => !p.isTest)), error];
}

// ---------- Profil test ----------
export function useTestProfile() {
  const [p, setP] = useState(undefined);
  useEffect(() => onSnapshot(doc(db, 'participants', TEST_ID), (s) => setP(s.exists() ? { id: s.id, ...s.data() } : null), () => setP(null)), []);
  return p;
}
export async function saveTestProfile(data) {
  const ref = doc(db, 'participants', TEST_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
  else {
    await setDoc(ref, {
      prenom: 'Profil', nom: 'Test', nameKey: 'profil|test', isTest: true, pin: '0000', color: '#64748B', freq: 2,
      moments: ['egal'], format: 'both', distance: 'moyen', askedFormation: true, note: 'Profil de test admin (invisible)',
      slots: [1, 2, 3, 4, 5].map((d) => ({ d, s: 600, e: 1080 })), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updates: 0,
      ...data,
    });
  }
  await log('settings_update', 'Admin', 'Profil test', data);
}
export const useInvites = () => useCol('invites', (d) => ({ code: d.id, ...d.data() }), byCreatedDesc);
export const usePolls = () => useCol('polls', (d) => ({ id: d.id, ...d.data() }), byCreatedDesc);
export const useSessions = () => useCol('sessions', (d) => ({ id: d.id, ...d.data() }),
  (a, b) => (a.date + String(a.s).padStart(4, '0')).localeCompare(b.date + String(b.s).padStart(4, '0')));

export function useLogs(max = 500) {
  const [logs, setLogs] = useState(null);
  useEffect(() => onSnapshot(query(collection(db, 'logs'), orderBy('at', 'desc'), limit(max)),
    (snap) => setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))), [max]);
  return logs;
}

// ---------- Codes d'invitation ----------
export function inviteStatus(inv) {
  if (!inv) return { key: 'unknown', label: 'Inconnu' };
  if (!inv.active) return { key: 'off', label: 'Désactivé' };
  const exp = toDate(inv.expiresAt);
  if (exp && exp < new Date()) return { key: 'expired', label: 'Expiré' };
  if (inv.maxUses > 0 && (inv.uses || 0) >= inv.maxUses) return { key: 'full', label: 'Épuisé' };
  return { key: 'ok', label: 'Actif' };
}

export async function checkInvite(code, { alreadyUsed = false } = {}) {
  const c = (code || '').trim().toUpperCase();
  if (!c) return { ok: false, reason: 'Entre un code' };
  const snap = await getDoc(doc(db, 'invites', c));
  if (!snap.exists()) return { ok: false, reason: 'Ce code n’existe pas' };
  const inv = { code: c, ...snap.data() };
  const st = inviteStatus(inv);
  if (st.key === 'off') return { ok: false, reason: 'Ce code a été désactivé' };
  if (st.key === 'expired') return { ok: false, reason: 'Ce code a expiré' };
  if (st.key === 'full' && !alreadyUsed) return { ok: false, reason: 'Ce code a atteint son nombre max d’utilisations' };
  return { ok: true, inv };
}

export async function consumeInvite(code) {
  await updateDoc(doc(db, 'invites', code), { uses: increment(1), lastUsedAt: serverTimestamp() });
  await log('invite_use', 'Visiteur', code);
}

export async function saveInvite(code, data, isNew) {
  const printable = { ...data, expiresAt: data.expiresAt ? toDate(data.expiresAt).toISOString() : null };
  if (isNew) {
    const exists = await getDoc(doc(db, 'invites', code));
    if (exists.exists()) throw new Error('Ce code existe déjà');
    await setDoc(doc(db, 'invites', code), { ...data, uses: 0, createdAt: serverTimestamp() });
    await log('invite_create', 'Admin', code, printable);
  } else {
    await updateDoc(doc(db, 'invites', code), { ...data, updatedAt: serverTimestamp() });
    await log('invite_update', 'Admin', code, printable);
  }
}
export async function setInviteActive(code, active) {
  await updateDoc(doc(db, 'invites', code), { active, updatedAt: serverTimestamp() });
  await log('invite_update', 'Admin', code, { active });
}
export async function resetInviteUses(code) {
  await updateDoc(doc(db, 'invites', code), { uses: 0, updatedAt: serverTimestamp() });
  await log('invite_update', 'Admin', code, { uses: 0 });
}
export async function deleteInvite(code) {
  await deleteDoc(doc(db, 'invites', code));
  await log('invite_delete', 'Admin', code);
}

// ---------- Participants ----------
export async function createParticipant(data) {
  const ref = await addDoc(collection(db, 'participants'), {
    ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), updates: 0,
  });
  return ref.id;
}
export async function updateParticipant(id, data) {
  await updateDoc(doc(db, 'participants', id), { ...data, updatedAt: serverTimestamp(), updates: increment(1) });
}
export async function touchParticipant(id) {
  try { await updateDoc(doc(db, 'participants', id), { lastSeenAt: serverTimestamp() }); } catch { /* */ }
}

// Retire une personne des sondages / séances
async function detachFromActivities(id, replaceBy = null) {
  const polls = await getDocs(collection(db, 'polls'));
  for (const p of polls.docs) {
    const v = p.data().votes || {};
    if (!v[id]) continue;
    const upd = { [`votes.${id}`]: deleteField() };
    if (replaceBy && !v[replaceBy]) upd[`votes.${replaceBy}`] = v[id];
    for (const [optId, q] of Object.entries(p.data().queue || {})) {
      if (q.includes(id)) upd[`queue.${optId}`] = q.map((x) => (x === id ? replaceBy : x)).filter((x, i, a) => x && a.indexOf(x) === i);
    }
    await updateDoc(p.ref, upd);
  }
  const sessions = await getDocs(collection(db, 'sessions'));
  for (const s of sessions.docs) {
    const att = s.data().attendees || [];
    const wait = s.data().waitlist || [];
    if (!att.includes(id) && !wait.includes(id)) continue;
    const swap = (arr) => arr.map((x) => (x === id ? replaceBy : x)).filter((x, i, a) => x && a.indexOf(x) === i);
    const nextAtt = swap(att);
    await updateDoc(s.ref, { attendees: nextAtt, waitlist: swap(wait).filter((x) => !nextAtt.includes(x)) });
  }
}

export async function deleteParticipant(p, actor) {
  await detachFromActivities(p.id);
  await deleteDoc(doc(db, 'participants', p.id));
  await log('participant_delete', actor, `${p.prenom} ${p.nom || ''}`.trim(), { id: p.id });
}

// Fusionne "source" dans "target" (garde target, réunit les créneaux, transfère votes et séances)
export async function mergeParticipants(target, source) {
  const slots = normalizeSlots([...(target.slots || []), ...(source.slots || [])]);
  await detachFromActivities(source.id, target.id);
  await updateDoc(doc(db, 'participants', target.id), {
    slots, updatedAt: serverTimestamp(), updates: increment(1),
    note: [target.note, source.note].filter(Boolean).join(' / ').slice(0, 200),
  });
  await deleteDoc(doc(db, 'participants', source.id));
  await log('participant_merge', 'Admin', `${target.prenom} ${target.nom || ''}`.trim(),
    { fusionne: `${source.prenom} ${source.nom || ''}`.trim(), gardé: target.id, supprimé: source.id });
}

// ---------- Sondages ----------
// imAvailable : le créateur est compté « Oui » sur toutes les dates (il peut changer ensuite)
export async function createPoll(data, me, imAvailable = true) {
  const auto = imAvailable && me.id !== 'admin';
  const votes = auto ? { [me.id]: Object.fromEntries(data.options.map((o) => [o.id, 'yes'])) } : {};
  const queue = auto ? Object.fromEntries(data.options.map((o) => [o.id, [me.id]])) : {};
  const ref = await addDoc(collection(db, 'polls'), {
    ...data, votes, queue, status: 'open', createdBy: me.id, createdByName: `${me.prenom} ${me.nom || ''}`.trim(),
    createdAt: serverTimestamp(),
  });
  await log('poll_create', `${me.prenom} ${me.nom || ''}`.trim(), data.title, { options: data.options.length });
  return ref.id;
}
export async function updatePoll(id, data, actor, title) {
  await updateDoc(doc(db, 'polls', id), { ...data, updatedAt: serverTimestamp() });
  await log('poll_update', actor, title, {});
}
export async function votePoll(poll, me, choices) {
  // Les « oui » sont rangés par ordre d'arrivée (premier arrivé, premier servi)
  const upd = { [`votes.${me.id}`]: choices };
  for (const o of poll.options) {
    const was = poll.votes?.[me.id]?.[o.id] === 'yes';
    const now = choices[o.id] === 'yes';
    if (now && !was) upd[`queue.${o.id}`] = arrayUnion(me.id);
    if (!now && was) upd[`queue.${o.id}`] = arrayRemove(me.id);
  }
  await updateDoc(doc(db, 'polls', poll.id), upd);
  const resume = poll.options.map((o) => `${fmtDayShort(o.date)} ${fmt(o.s)} : ${choices[o.id] === 'yes' ? 'oui' : choices[o.id] === 'maybe' ? 'peut-être' : choices[o.id] === 'no' ? 'non' : '—'}`);
  await log('poll_vote', `${me.prenom} ${me.nom || ''}`.trim(), poll.title, { votes: resume });
}
export async function closePoll(poll, option, extra, actor) {
  const max = Number(poll.max) || null; // fixé par le sondage
  const min = Number(poll.min) || null;
  const { inn: attendees, wait: waitlist } = splitPlaces(yesOrder(poll, option.id), max);
  const sRef = await addDoc(collection(db, 'sessions'), {
    title: poll.title, date: option.date, s: option.s, e: option.e,
    format: extra.format || poll.format || 'hybride', place: extra.place ?? poll.place ?? '', note: poll.description || '',
    notify: extra.notify !== false,
    ...(extra.infoData || {}),
    attendees, waitlist, max, min, audience: poll.audience || [], subject: poll.subject || null, respectSchedule: poll.respectSchedule !== false, pollId: poll.id, createdBy: poll.createdBy, createdByName: poll.createdByName, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'polls', poll.id), { status: 'closed', finalOptionId: option.id, sessionId: sRef.id, closedAt: serverTimestamp() });
  await log('poll_close', actor, poll.title, { date: `${fmtDayShort(option.date)} ${fmt(option.s)}–${fmt(option.e)}`, inscrits: attendees.length, attente: waitlist.length, places: max || 'illimité' });
  return sRef.id;
}
// ---------- Commentaires des sondages ----------
export async function addPollComment(poll, me, text, optId = null, replyTo = null) {
  const c = {
    id: Math.random().toString(36).slice(2, 10), by: me.id, byName: `${me.prenom} ${me.nom || ''}`.trim(),
    text: text.trim().slice(0, 300), optId: optId || null, at: Date.now(),
    ...(replyTo ? { replyTo: replyTo.id, replyToName: replyTo.byName } : {}),
  };
  await updateDoc(doc(db, 'polls', poll.id), { comments: arrayUnion(c) });
  await log('poll_comment', c.byName, poll.title, { commentaire: c.text, ...(replyTo ? { 'en réponse à': replyTo.byName } : {}) });
}
export async function deletePollComment(poll, c, actor) {
  await updateDoc(doc(db, 'polls', poll.id), { comments: arrayRemove(c) });
  await log('poll_comment_delete', actor, poll.title, { commentaire: c.text, auteur: c.byName });
}

// Annuler / rétablir un sondage (il reste visible, barré ; les votants Oui / Peut-être sont prévenus)
export async function cancelPoll(poll, actor, cancel = true) {
  await updateDoc(doc(db, 'polls', poll.id), cancel
    ? { status: 'cancelled', cancelledBy: actor, cancelledAt: serverTimestamp() }
    : { status: 'open', cancelledBy: deleteField(), cancelledAt: deleteField() });
  await log(cancel ? 'poll_cancel' : 'poll_restore', actor, poll.title, { votants: Object.keys(poll.votes || {}).length });
}
export async function reopenPoll(poll, actor) {
  if (poll.sessionId) { try { await deleteDoc(doc(db, 'sessions', poll.sessionId)); } catch { /* */ } }
  await updateDoc(doc(db, 'polls', poll.id), { status: 'open', finalOptionId: deleteField(), sessionId: deleteField() });
  await log('poll_reopen', actor, poll.title);
}
export async function deletePoll(poll, actor) {
  await deleteDoc(doc(db, 'polls', poll.id));
  await log('poll_delete', actor, poll.title);
}

// ---------- Séances ----------
export async function createSession(data, me) {
  const ref = await addDoc(collection(db, 'sessions'), {
    ...data, attendees: data.attendees || [me.id], createdBy: me.id,
    createdByName: `${me.prenom} ${me.nom || ''}`.trim(), createdAt: serverTimestamp(),
  });
  await log('session_create', `${me.prenom} ${me.nom || ''}`.trim(), data.title, { date: `${fmtDayShort(data.date)} ${fmt(data.s)}–${fmt(data.e)}` });
  return ref.id;
}
export async function updateSession(id, data, actor, title) {
  await updateDoc(doc(db, 'sessions', id), { ...data, updatedAt: serverTimestamp() });
  await log('session_update', actor, title, data.date ? { date: `${fmtDayShort(data.date)} ${fmt(data.s)}–${fmt(data.e)}` } : {});
}
// Inscription / désinscription avec places limitées.
// Renvoie 'in' (place obtenue), 'wait' (liste d'attente), 'freed' (place libérée) ou 'out'.
export async function joinSession(s, me, join) {
  const ref = doc(db, 'sessions', s.id);
  const status = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() || {};
    let att = d.attendees || [];
    let wait = d.waitlist || [];
    const max = Number(d.max) || 0;
    if (d.cancelled && join) return 'cancelled';
    let st;
    if (join) {
      if (att.includes(me.id)) return 'in';
      if (!max || att.length < max) { att = [...att, me.id]; wait = wait.filter((x) => x !== me.id); st = 'in'; }
      else { if (!wait.includes(me.id)) wait = [...wait, me.id]; st = 'wait'; }
    } else {
      const wasIn = att.includes(me.id);
      att = att.filter((x) => x !== me.id);
      wait = wait.filter((x) => x !== me.id);
      st = wasIn && max && wait.length ? 'freed' : 'out';
    }
    tx.update(ref, { attendees: att, waitlist: wait });
    return st;
  });
  if (status === 'cancelled') return status;
  const who = `${me.prenom} ${me.nom || ''}`.trim();
  const date = `${fmtDayShort(s.date)} ${fmt(s.s)}`;
  if (status === 'in') await log('session_join', who, s.title, { date });
  else if (status === 'wait') await log('session_wait', who, s.title, { date });
  else await log('session_leave', who, s.title, status === 'freed' ? { date, info: 'place libérée, liste d’attente prévenue' } : { date });
  return status;
}
// Infos pratiques réservées aux inscrits (lieu, lien visio, consignes)
export async function saveSessionInfo(s, info, actor) {
  const clean = { place: (info.place || '').trim(), visio: (info.visio || '').trim(), note: (info.note || '').trim() };
  await updateDoc(doc(db, 'sessions', s.id), { info: clean, infoVersion: increment(1), infoAt: serverTimestamp() });
  await log('session_info', actor, s.title, { lieu: clean.place || '—', distanciel: clean.visio || '—', consignes: clean.note || '—' });
}

// Annuler / rétablir / maintenir malgré le minimum
export async function cancelSession(s, actor, cancel = true) {
  await updateDoc(doc(db, 'sessions', s.id), cancel ? { cancelled: true, cancelledAt: serverTimestamp(), cancelledBy: actor } : { cancelled: false });
  await log(cancel ? 'session_cancel' : 'session_restore', actor, s.title, { date: `${fmtDayShort(s.date)} ${fmt(s.s)}`, inscrits: (s.attendees || []).length });
}
export async function keepSession(s, actor) {
  const n = (s.attendees || []).length;
  await updateDoc(doc(db, 'sessions', s.id), { minAck: n });
  await log('session_keep', actor, s.title, { inscrits: n, minimum: s.min });
}
export async function deleteSession(s, actor) {
  await deleteDoc(doc(db, 'sessions', s.id));
  if (s.pollId) { try { await updateDoc(doc(db, 'polls', s.pollId), { status: 'open', finalOptionId: deleteField(), sessionId: deleteField() }); } catch { /* */ } }
  await log('session_delete', actor, s.title, { date: `${fmtDayShort(s.date)} ${fmt(s.s)}` });
}

// ---------- Réglages / maintenance ----------
export async function saveSettings(data, details) {
  await setDoc(doc(db, 'config', 'settings'), data, { merge: true });
  await log('settings_update', 'Admin', '', details || {});
}

export async function wipeCollection(name) {
  const snap = await getDocs(collection(db, name));
  let batch = writeBatch(db), n = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    if (++n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  await batch.commit();
  return snap.size;
}

export async function fetchAll(name) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
