import { useEffect, useState } from 'react';
import {
  addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs,
  increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from './fs';
import { db } from './firebase';
import { DEFAULT_SETTINGS } from './config';
import { fmt, fmtDayShort, newSalt, normalizeSlots, pinDigest, shortUA, toDate } from './utils';
import { splitPlaces, yesByMode, yesOrder } from './places';
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
// Mode choisi pour une date d'un sondage hybride
export async function setPollMode(poll, me, optId, mode) {
  await updateDoc(doc(db, 'polls', poll.id), { [`modes.${me.id}.${optId}`]: mode === 'visio' ? 'visio' : deleteField() });
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
  // Hybride : seuls les « Oui » en présentiel prennent les places ; les « Oui » en visio sont tous inscrits
  const format = extra.format || poll.format || 'hybride';
  const byMode = format === 'hybride' ? yesByMode(poll, option.id) : { pres: yesOrder(poll, option.id), visio: [] };
  const split = splitPlaces(byMode.pres, max);
  const attendees = [...split.inn, ...byMode.visio];
  const waitlist = split.wait;
  const modes = Object.fromEntries(byMode.visio.map((id) => [id, 'visio']));
  // Les « Peut-être » restent rattachés à la séance : ils doivent confirmer (et ne voient les infos qu'après)
  const maybes = Object.keys(poll.votes || {}).filter((id) => poll.votes[id]?.[option.id] === 'maybe');
  const sRef = await addDoc(collection(db, 'sessions'), {
    title: poll.title, date: option.date, s: option.s, e: option.e,
    format, modes, place: extra.place ?? poll.place ?? '', note: poll.description || '',
    notify: extra.notify !== false,
    ...(extra.infoData || {}),
    ...(extra.needsInfo ? { needsInfo: true, autoCreated: true } : extra.auto ? { autoCreated: true } : {}),
    attendees, waitlist, maybes, max, min, spotId: extra.spotId ?? poll.spotId ?? null, audience: poll.audience || [], private: !!poll.private, invite: poll.invite || null, subject: poll.subject || null, respectSchedule: poll.respectSchedule !== false, pollId: poll.id, createdBy: poll.createdBy, createdByName: poll.createdByName, createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'polls', poll.id), { status: 'closed', finalOptionId: option.id, sessionId: sRef.id, closedAt: serverTimestamp(), ...(extra.auto ? { autoClosed: true } : {}) });
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
// Inscription / désinscription / changement de mode.
// opts.mode : 'presentiel' | 'visio' (séances hybrides). opts.keepWait : rester dans la file du présentiel en suivant en visio.
// Renvoie 'in' | 'visio' | 'visio_wait' | 'wait' | 'freed' | 'out' | 'cancelled'
export async function joinSession(s, me, join, opts = {}) {
  const ref = doc(db, 'sessions', s.id);
  const status = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() || {};
    let att = d.attendees || [];
    let wait = d.waitlist || [];
    const modes = { ...(d.modes || {}) };
    const max = Number(d.max) || 0;
    const hybrid = (d.format || 'hybride') === 'hybride';
    if (d.cancelled && join) return 'cancelled';
    const counts = (id) => !hybrid || modes[id] !== 'visio';
    const presCount = () => att.filter((id) => id !== me.id && counts(id)).length;
    const wasCounted = att.includes(me.id) && counts(me.id);
    let st;
    let lateLeave = 0;
    let anyLeave = 0;
    if (join) {
      const mode = hybrid ? (opts.mode || 'presentiel') : 'presentiel';
      if (mode === 'visio') {
        if (!att.includes(me.id)) att = [...att, me.id];
        modes[me.id] = 'visio';
        if (!opts.keepWait) wait = wait.filter((x) => x !== me.id);
        st = wait.includes(me.id) ? 'visio_wait' : 'visio';
        if (wasCounted && max && wait.filter((x) => x !== me.id).length) st = st === 'visio' ? 'freed' : st;
      } else if (!max || presCount() < max) {
        if (!att.includes(me.id)) att = [...att, me.id];
        delete modes[me.id];
        wait = wait.filter((x) => x !== me.id);
        st = 'in';
      } else {
        if (!wait.includes(me.id)) wait = [...wait, me.id];
        st = att.includes(me.id) ? 'visio_wait' : 'wait';
      }
    } else {
      const wasIn = att.includes(me.id);
      att = att.filter((x) => x !== me.id);
      wait = wait.filter((x) => x !== me.id);
      delete modes[me.id];
      st = wasCounted && max && wait.length ? 'freed' : 'out';
      // Désistement de dernière minute (moins de 24 h avant le début) : gardé pour les stats d'assiduité
      const startAt = new Date(`${d.date}T00:00:00`).getTime() + (d.s || 0) * 60000;
      if (wasIn && startAt - Date.now() < 86400000) lateLeave = Date.now();
      if (wasIn) anyLeave = Date.now();
    }
    tx.update(ref, { attendees: att, waitlist: wait, modes, ...(lateLeave ? { [`lateLeaves.${me.id}`]: lateLeave } : {}), ...(anyLeave ? { [`leaves.${me.id}`]: anyLeave } : {}) });
    return st;
  });
  if (status === 'cancelled') return status;
  const who = `${me.prenom} ${me.nom || ''}`.trim();
  const date = `${fmtDayShort(s.date)} ${fmt(s.s)}`;
  if (status === 'in') await log('session_join', who, s.title, { date, mode: 'présentiel' });
  else if (status === 'visio' || (join && status === 'freed')) await log('session_join', who, s.title, { date, mode: 'visio' });
  else if (status === 'visio_wait') await log('session_wait', who, s.title, { date, mode: 'visio en attendant une place' });
  else if (status === 'wait') await log('session_wait', who, s.title, { date });
  else await log('session_leave', who, s.title, status === 'freed' ? { date, info: 'place libérée, liste d’attente prévenue' } : { date });
  return status;
}

// Infos pratiques (lieu, distanciel, consignes) : visibles des inscrits uniquement
export async function saveSessionInfo(s, info, actor) {
  const clean = { place: (info.place || '').trim(), visio: (info.visio || '').trim(), note: (info.note || '').trim() };
  await updateDoc(doc(db, 'sessions', s.id), { info: clean, infoVersion: increment(1), infoAt: serverTimestamp(), needsInfo: deleteField() });
  await log('session_info', actor, s.title, { lieu: clean.place || '—', distanciel: clean.visio || '—', consignes: clean.note || '—' });
}

// Réponse d'un « Peut-être » : il vient (inscription ou liste d'attente) ou il ne vient pas
export async function answerMaybe(s, me, yes, mode) {
  let r = 'no';
  if (yes) r = await joinSession(s, me, true, { mode });
  if (r === 'cancelled') return r;
  await updateDoc(doc(db, 'sessions', s.id), { maybeAnswered: arrayUnion(me.id) });
  if (!yes) await log('session_maybe_no', `${me.prenom} ${me.nom || ''}`.trim(), s.title, { date: `${fmtDayShort(s.date)} ${fmt(s.s)}` });
  return r;
}

// Annuler / rétablir / maintenir malgré le minimum
export async function cancelSession(s, actor, cancel = true) {
  // Annulation par l'organisateur moins de 24 h avant, alors que d'autres étaient inscrits et que le minimum était atteint :
  // comptée dans sa fiabilité (comme un absent excusé)
  const start = new Date(`${s.date}T00:00:00`).getTime() + (s.s || 0) * 60000;
  const others = (s.attendees || []).filter((id) => id !== s.createdBy).length;
  const minOk = !s.min || (s.attendees || []).length >= Number(s.min);
  const late = cancel && actor === s.createdByName && start - Date.now() < 86400000 && others > 0 && minOk;
  await updateDoc(doc(db, 'sessions', s.id), cancel
    ? { cancelled: true, cancelledAt: serverTimestamp(), cancelledAtMs: Date.now(), cancelledBy: actor, lateCancelBy: late ? s.createdBy : null }
    : { cancelled: false, lateCancelBy: null });
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

// ---------- Messagerie ----------
// convs/{id} : résumé de chaque conversation (dernier message) ; messages : un document par message.
// Conversation de séance : « s_<id séance> » (membres = inscrits + créateur, calculés en direct)
// Conversation privée : « dm_<idA>_<idB> » (ids triés)
export const sessionConvId = (sid) => `s_${sid}`;
export const dmConvId = (a, b) => `dm_${[a, b].sort().join('_')}`;
const fullName = (me) => `${me.prenom} ${me.nom || ''}`.trim();

export function useConvs() {
  const [rows, setRows] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'convs'), (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), []);
  return rows;
}
export function useMessages(conv) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!conv) return undefined;
    setRows(null);
    return onSnapshot(query(collection(db, 'messages'), where('conv', '==', conv)),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.conv === conv).sort((a, b) => a.at - b.at)),
      () => setRows([]));
  }, [conv]);
  return rows;
}
export async function sendMessage(conv, me, text, meta = {}) {
  const t = text.trim().slice(0, 1000);
  if (!t) return;
  const at = Date.now();
  const reply = meta.replyTo ? { replyTo: { id: meta.replyTo.id, byName: meta.replyTo.byName, text: String(meta.replyTo.text || '').slice(0, 140) } } : {};
  await addDoc(collection(db, 'messages'), { conv, by: me.id, byName: fullName(me), text: t, at, ...(meta.kind ? { kind: meta.kind } : {}), ...reply });
  await setDoc(doc(db, 'convs', conv), {
    lastAt: at, lastText: t.slice(0, 120), lastBy: me.id, lastByName: fullName(me),
    ...(meta.type ? { type: meta.type } : {}), ...(meta.members ? { members: meta.members } : {}), ...(meta.sessionId ? { sessionId: meta.sessionId } : {}),
  }, { merge: true });
}
export async function deleteMessage(m) {
  await deleteDoc(doc(db, 'messages', m.id));
}
// Annonce du créateur de séance : message mis en avant dans le groupe + rappel à l'ouverture du site
export async function postAnnounce(s, me, text) {
  const t = text.trim().slice(0, 600);
  if (!t) return;
  await sendMessage(sessionConvId(s.id), me, t, { kind: 'announce', type: 'session', sessionId: s.id });
  await updateDoc(doc(db, 'sessions', s.id), { announce: { text: t, at: Date.now(), by: me.id, byName: fullName(me) } });
  await log('session_announce', fullName(me), s.title, { annonce: t });
}
// Suppression d'une conversation entière (ménage des vieilles séances)
export async function deleteConv(conv) {
  const snap = await getDocs(query(collection(db, 'messages'), where('conv', '==', conv)));
  for (const d of snap.docs) if (d.data().conv === conv) await deleteDoc(d.ref);
  try { await deleteDoc(doc(db, 'convs', conv)); } catch { /* */ }
}
// Réactions aux messages : reacts.<clé> = [ids]
export const REACTIONS = { like: '👍', love: '❤️', haha: '😂', wow: '😮', sad: '😢', ok: '✅' };
export async function toggleReact(m, me, key) {
  const on = !(m.reacts?.[key] || []).includes(me.id);
  await updateDoc(doc(db, 'messages', m.id), { [`reacts.${key}`]: on ? arrayUnion(me.id) : arrayRemove(me.id) });
}
// Lu / non lu côté serveur (synchronisé entre appareils) + « Vu par »
export async function markSeen(conv, me, at) {
  await setDoc(doc(db, 'convs', conv), { seen: { [me.id]: at }, unreadMark: { [me.id]: false } }, { merge: true });
}
export async function markUnread(conv, me) {
  await setDoc(doc(db, 'convs', conv), { unreadMark: { [me.id]: true } }, { merge: true });
}
export async function editMessage(m, text) {
  const t = text.trim().slice(0, 1000);
  if (!t) return;
  await updateDoc(doc(db, 'messages', m.id), { text: t, editedAt: Date.now() });
}
// Messages épinglés
export async function togglePin(m, me) {
  await updateDoc(doc(db, 'messages', m.id), m.pinned
    ? { pinned: deleteField(), pinnedBy: deleteField(), pinnedAt: deleteField() }
    : { pinned: true, pinnedBy: `${me.prenom} ${me.nom || ''}`.trim(), pinnedAt: Date.now() });
}

// ---------- Support : contacter l'admin ----------
// tickets/{id} : { by, byName, type, text, status: 'open' | 'answered' | 'closed', at, lastAt, replies: [{ from: 'admin' | 'user', text, at }], context }
export const TICKET_TYPES = {
  bug: { label: 'Un bug', icon: '🐞', hint: 'Quelque chose ne marche pas ou s’affiche mal' },
  question: { label: 'Une question', icon: '❓', hint: 'Tu ne sais pas comment faire quelque chose' },
  idea: { label: 'Une idée', icon: '💡', hint: 'Une amélioration pour le site' },
  people: { label: 'Un souci avec quelqu’un', icon: '🤝', hint: 'Reste confidentiel : seul l’admin le lit' },
  account: { label: 'Mon compte', icon: '🔑', hint: 'Doublon, changer de nom…' },
  pin: { label: 'Code oublié', icon: '🔢', hint: '', hidden: true },
};
// byId : seulement les demandes de cette personne (côté participant) ; sans : toutes (côté admin)
export function useTickets(byId) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (byId === null) return undefined;
    const ref = byId ? query(collection(db, 'tickets'), where('by', '==', byId)) : collection(db, 'tickets');
    return onSnapshot(ref, (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => !byId || t.by === byId).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))), () => setRows([]));
  }, [byId]);
  return rows;
}
// Demande avec du nouveau pour l'un ou l'autre côté
export const ticketNewForUser = (t) => t.status !== 'closed' && (t.replies || []).some((r) => r.from === 'admin' && r.at > (t.userSeen || 0));
export const ticketNewForAdmin = (t) => t.status !== 'closed' && (t.at > (t.adminSeen || 0) || (t.replies || []).some((r) => r.from === 'user' && r.at > (t.adminSeen || 0)));
export async function createTicket(me, type, text, context) {
  const at = Date.now();
  await addDoc(collection(db, 'tickets'), { by: me.id, byName: fullName(me), type, text: text.trim().slice(0, 2000), status: 'open', at, lastAt: at, replies: [], context: context || '', userSeen: at });
  await log('ticket_create', fullName(me), TICKET_TYPES[type]?.label || type, { message: text.trim().slice(0, 200) });
}
export async function replyTicket(t, from, text, actor) {
  const at = Date.now();
  await updateDoc(doc(db, 'tickets', t.id), {
    replies: arrayUnion({ from, text: text.trim().slice(0, 2000), at }), lastAt: at,
    status: from === 'admin' ? 'answered' : 'open', ...(from === 'admin' ? { adminSeen: at } : { userSeen: at }),
  });
  if (from === 'admin') await log('ticket_reply', 'Admin', t.byName, { réponse: text.trim().slice(0, 200) });
}
export async function setTicketStatus(t, status) {
  // Résolu : le numéro de téléphone laissé (code oublié) est effacé
  await updateDoc(doc(db, 'tickets', t.id), { status, lastAt: Date.now(), ...(status === 'closed' && t.phone ? { phone: deleteField() } : {}) });
  await log('ticket_status', 'Admin', t.byName, { statut: status });
}
export const seeTicket = (t, side) => updateDoc(doc(db, 'tickets', t.id), side === 'admin' ? { adminSeen: Date.now() } : { userSeen: Date.now() });

// ---------- Présences ----------
// session.attendance = { id: 'present' | 'late' | 'excused' | 'absent' } (rempli par l'organisateur / l'admin)
// session.checkins   = { id: timestamp }  (« Je suis là » pendant la séance)
// session.lateLeaves = { id: timestamp }  (désinscription moins de 24 h avant)
// Absences notées par le créateur (ou l'admin) après la séance — session.attendance = { id: 'absent' | 'excused' }
export async function saveNoShows(s, map, actor, nameOf) {
  await updateDoc(doc(db, 'sessions', s.id), { attendance: map, attendanceAt: Date.now(), attendanceBy: actor, attendanceV: 2 });
  const list = (k) => Object.keys(map).filter((id) => map[id] === k).map(nameOf).join(', ') || 'personne';
  await log('session_attendance', actor, s.title, { présents: list('present'), absents: list('absent'), excusés: list('excused') });
}
// Code oublié : la personne (pas encore connectée) laisse son numéro pour que l'admin lui renvoie son code
export async function forgotPin(p, phone, note) {
  const at = Date.now();
  const name = `${p.prenom} ${p.nom || ''}`.trim();
  await addDoc(collection(db, 'tickets'), { by: p.id, byName: name, type: 'pin', phone: phone.trim().slice(0, 30), text: note?.trim() ? note.trim().slice(0, 500) : 'J’ai oublié mon code perso.', status: 'open', at, lastAt: at, replies: [] });
  await log('ticket_create', name, 'Code oublié', { téléphone: 'laissé' });
}
export async function deleteTicket(t) {
  await deleteDoc(doc(db, 'tickets', t.id));
  await log('ticket_status', 'Admin', t.byName, { statut: 'supprimée' });
}

// Code perso : on enregistre l'empreinte et on efface l'ancien code en clair
export async function pinData(pin, forCreate = false) {
  const salt = newSalt();
  const hash = await pinDigest(String(pin), salt);
  return forCreate ? { pinHash: hash, pinSalt: salt } : { pinHash: hash, pinSalt: salt, pin: deleteField() };
}
export async function setParticipantPin(id, pin) {
  await updateDoc(doc(db, 'participants', id), { ...(await pinData(pin)), pinTemp: deleteField(), pinTempUntil: deleteField() });
}
// Code temporaire (donné par l'admin) : valable 7 jours, à remplacer dès la connexion
export const TEMP_PIN_DAYS = 7;
export async function setTempPin(id, pin) {
  await updateDoc(doc(db, 'participants', id), { ...(await pinData(pin)), pinTemp: true, pinTempUntil: Date.now() + TEMP_PIN_DAYS * 86400000 });
}

// ---------- Sauvegarde complète (JSON) ----------
export const BACKUP_COLLECTIONS = ['participants', 'invites', 'polls', 'sessions', 'logs', 'convs', 'messages', 'tickets', 'circles', 'spots'];
export async function exportBackup() {
  const all = {};
  for (const c of BACKUP_COLLECTIONS) all[c] = await fetchAll(c);
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sauvegarde-groupes-etude-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  await setDoc(doc(db, 'config', 'settings'), { lastExportAt: Date.now() }, { merge: true });
}

// ---------- Cercles ----------
export const useCircles = () => useCol('circles', (d) => ({ id: d.id, ...d.data() }), (a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
export async function saveCircle(c, me) {
  const data = { name: c.name.trim().slice(0, 40), members: [...new Set(c.members || [])], updatedAt: serverTimestamp() };
  if (c.id) await updateDoc(doc(db, 'circles', c.id), data);
  else await addDoc(collection(db, 'circles'), { ...data, createdBy: me.id, createdByName: fullName(me), createdAt: serverTimestamp() });
  await log(c.id ? 'circle_update' : 'circle_create', fullName(me), data.name, { membres: data.members.length });
}
export async function deleteCircle(c, actor) {
  await deleteDoc(doc(db, 'circles', c.id));
  await log('circle_delete', actor, c.name, {});
}

// ---------- Spots ----------
export const useSpots = () => useCol('spots', (d) => ({ id: d.id, ...d.data() }), (a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
const spotClean = (s) => ({
  name: String(s.name || '').trim().slice(0, 80), type: s.type || '', address: (s.address || '').trim(), maps: (s.maps || '').trim(),
  hours: s.hours || {}, closed: s.closed || '', closedHolidays: !!s.closedHolidays, wifi: !!s.wifi, plugs: !!s.plugs,
  ambiance: s.ambiance || '', conditions: s.conditions || '', capacity: Number(s.capacity) || null, booking: !!s.booking,
  price: s.price || '', notes: (s.notes || '').trim().slice(0, 500), private: !!s.private, invite: s.private ? (s.invite || { ids: [], circles: [] }) : null,
});
export async function saveSpot(s, me) {
  const data = { ...spotClean(s), updatedAt: serverTimestamp() };
  if (s.id) await updateDoc(doc(db, 'spots', s.id), data);
  else await addDoc(collection(db, 'spots'), { ...data, createdBy: me.id, createdByName: me.id === 'admin' ? 'Admin' : fullName(me), createdAt: serverTimestamp() });
  await log(s.id ? 'spot_update' : 'spot_create', me.id === 'admin' ? 'Admin' : fullName(me), data.name, {});
}
export async function deleteSpot(s, actor) {
  await deleteDoc(doc(db, 'spots', s.id));
  await log('spot_delete', actor, s.name, {});
}
// Import : un spot de même nom est mis à jour, les autres sont ajoutés
export async function importSpots(rows, existing, me) {
  let added = 0, updated = 0;
  const byName = Object.fromEntries((existing || []).map((s) => [s.name.trim().toLowerCase(), s]));
  for (const r of rows) {
    const cur = byName[r.name.trim().toLowerCase()];
    const data = { ...spotClean({ ...r, invite: cur?.invite }), updatedAt: serverTimestamp() };
    if (cur) { await updateDoc(doc(db, 'spots', cur.id), data); updated++; }
    else { await addDoc(collection(db, 'spots'), { ...data, createdBy: me.id, createdByName: me.id === 'admin' ? 'Admin' : fullName(me), createdAt: serverTimestamp() }); added++; }
  }
  await log('spot_import', me.id === 'admin' ? 'Admin' : fullName(me), `${added} ajouté(s), ${updated} mis à jour`, {});
  return { added, updated };
}

// Synchronisation avec le Google Sheet des spots : ajoute / met à jour / retire les spots venant du tableau.
// Les spots ajoutés sur le site ne sont jamais touchés. N'écrit que ce qui a changé.
export async function syncSpotsFromSheet(url, existing) {
  const { sheetCsvUrl, spotsFromCsv, sheetKey } = await import('./spots');
  const csvUrl = sheetCsvUrl(url);
  if (!csvUrl) throw new Error('Lien Google Sheet invalide.');
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error('Google Sheet inaccessible : vérifie qu’il est partagé « Tous les utilisateurs disposant du lien ».');
  const rows = spotsFromCsv(await res.text());
  const fromSheet = (existing || []).filter((s) => s.fromSheet);
  const byId = Object.fromEntries(fromSheet.map((s) => [s.id, s]));
  let added = 0, updated = 0, removed = 0;
  const seen = new Set();
  for (const r of rows) {
    const id = sheetKey(r.name);
    if (seen.has(id)) continue;
    seen.add(id);
    const cur = byId[id];
    const data = { ...spotClean({ ...r, private: r.private, invite: cur?.invite }), fromSheet: true };
    const same = cur && JSON.stringify(spotClean(cur)) === JSON.stringify(spotClean(data));
    if (same) continue;
    await setDoc(doc(db, 'spots', id), { ...data, createdBy: 'sheet', createdByName: 'Google Sheet', updatedAt: serverTimestamp() }, { merge: true });
    if (cur) updated++; else added++;
  }
  for (const s of fromSheet) if (!seen.has(s.id)) { await deleteDoc(doc(db, 'spots', s.id)); removed++; }
  await setDoc(doc(db, 'config', 'settings'), { spotsSyncAt: Date.now() }, { merge: true });
  if (added || updated || removed) await log('spot_import', 'Google Sheet', `${added} ajouté(s), ${updated} mis à jour, ${removed} retiré(s)`, {});
  return { added, updated, removed, total: rows.length };
}

// Historique complet d'une personne (sans la limite des 600 dernières entrées de l'onglet Historique)
export async function fetchPersonLogs(name) {
  const out = {};
  for (const field of ['actor', 'target']) {
    const snap = await getDocs(query(collection(db, 'logs'), where(field, '==', name)));
    for (const d of snap.docs) { const l = { id: d.id, ...d.data() }; if (l[field] === name) out[d.id] = l; }
  }
  return Object.values(out).sort((a, b) => (toDate(b.at)?.getTime() || 0) - (toDate(a.at)?.getTime() || 0));
}

// Rattrapage : désistements faits avant que le site les enregistre, retrouvés dans l'historique (n'ajoute que ce qui manque)
export async function backfillLeaves(sessions, people) {
  const snap = await getDocs(query(collection(db, 'logs'), where('type', '==', 'session_leave')));
  const byName = {};
  for (const p of people) byName[`${p.prenom} ${p.nom || ''}`.trim()] = p.id;
  const day = (s) => new Date(`${s.date}T00:00:00`).getTime();
  const start = (s) => day(s) + (s.s || 0) * 60000;
  const end = (s) => day(s) + (s.e || s.s || 0) * 60000;
  const upd = {};
  for (const d of snap.docs) {
    const l = d.data();
    if (l.type !== 'session_leave') continue;
    const id = byName[l.actor];
    const at = toDate(l.at)?.getTime();
    if (!id || !at) continue;
    const same = sessions.filter((x) => x.title === l.target && !x.cancelled && end(x) > at);
    const exact = same.filter((x) => l.details?.date && `${fmtDayShort(x.date)} ${fmt(x.s)}` === l.details.date);
    const s = (exact.length ? exact : same).sort((a, b) => start(a) - start(b))[0];
    if (!s || (s.attendees || []).includes(id) || s.leaves?.[id] || s.lateLeaves?.[id]) continue;
    const u = (upd[s.id] ||= {});
    if ((u[`leaves.${id}`] || 0) >= at) continue;
    u[`leaves.${id}`] = at;
    if (start(s) - at < 86400000) u[`lateLeaves.${id}`] = at; else delete u[`lateLeaves.${id}`];
  }
  let late = 0;
  for (const [sid, u] of Object.entries(upd)) {
    late += Object.keys(u).filter((k) => k.startsWith('lateLeaves.')).length;
    await updateDoc(doc(db, 'sessions', sid), u);
  }
  await setDoc(doc(db, 'config', 'settings'), { leavesBackfillAt: Date.now() }, { merge: true });
  return late;
}

// Clôture automatique à la date limite : un seul appareil s'en charge (verrou de 2 min)
export async function claimAutoClose(poll) {
  const ref = doc(db, 'polls', poll.id);
  return runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.status !== 'open' || !d.autoClose || d.autoSkipped) return false;
    if (d.autoClaim && Date.now() - d.autoClaim < 120000) return false;
    tx.update(ref, { autoClaim: Date.now() });
    return true;
  });
}
export async function skipAutoClose(poll) {
  await updateDoc(doc(db, 'polls', poll.id), { autoSkipped: Date.now() });
  await log('poll_close', 'Automatique', poll.title, { info: 'date limite passée, aucune date avec des « Oui » : pas de séance créée' });
}
