// Envoi réel : Firestore avec la clé de service (seul accès capable de lire les adresses mail) + Gmail
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { createdMails, freedMails, updateMails, freePlaces, needsReminder, parisIso, reminderMails } from './mails.mjs';

let _db = null;
export function adminDb() {
  if (_db) return _db;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error('FIREBASE_SERVICE_ACCOUNT manquant dans Netlify');
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!getApps().length) initializeApp({ credential: cert(sa) });
  _db = getFirestore();
  return _db;
}
export const site = () => (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');

let transport = null;
function mailer() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD manquants dans Netlify');
  transport ||= nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, '') } });
  return transport;
}
async function sendAll(mails) {
  let ok = 0;
  for (const m of mails) {
    try {
      await mailer().sendMail({ from: `"Groupes d'étude DAEU" <${process.env.GMAIL_USER}>`, to: m.to, replyTo: process.env.GMAIL_USER, subject: m.subject, text: m.text, html: m.html,
        list: { unsubscribe: { url: `mailto:${process.env.GMAIL_USER}?subject=stop`, comment: 'Ne plus recevoir' } } });
      ok++;
    } catch (e) { console.error('mail', m.to, e.message); }
  }
  return ok;
}
// Fiches + adresses (rangées à part dans « private_emails »)
async function peopleOf(ids) {
  const db = adminDb();
  const out = {};
  await Promise.all([...new Set(ids)].map(async (id) => {
    const [p, m] = await Promise.all([db.collection('participants').doc(id).get(), db.collection('private_emails').doc(id).get()]);
    if (p.exists && m.exists) out[id] = { id, ...p.data(), email: m.data().email };
  }));
  return out;
}
// Un seul envoi par événement, même si plusieurs appareils le déclenchent
async function claim(ref, test, mark) {
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const s = { id: snap.id, ...snap.data() };
    if (!test(s)) return null;
    tx.update(ref, mark(s));
    return s;
  });
}

export async function handleEvent(type, id) {
  if (!id || typeof id !== 'string') return { sent: 0, why: 'id' };
  const ref = adminDb().collection('sessions').doc(id);
  if (type === 'created') {
    const s = await claim(ref, (x) => !x.cancelled && x.mailReminders !== false && !x.mails?.created, () => ({ 'mails.created': Date.now() }));
    if (!s) return { sent: 0, why: 'déjà fait ou désactivé' };
    const people = await peopleOf([...(s.attendees || []), ...(s.waitlist || []), ...(s.maybes || [])]);
    return { sent: await sendAll(createdMails(s, people, site())) };
  }
  if (type === 'freed') {
    // Même état de places = déjà prévenu ; sinon, pas plus d'un mail toutes les 10 min
    const key = (x) => `${(x.attendees || []).length}:${(x.waitlist || []).join(',')}`;
    const s = await claim(ref, (x) => !x.cancelled && x.mailReminders !== false && (x.waitlist || []).length > 0 && freePlaces(x) > 0
      && !(x.mails?.freedKey === key(x)) && !(x.mails?.freedAt && Date.now() - x.mails.freedAt < 10 * 60000),
    (x) => ({ 'mails.freedAt': Date.now(), 'mails.freedKey': key(x) }));
    if (!s) return { sent: 0, why: 'rien à prévenir' };
    const people = await peopleOf(s.waitlist || []);
    return { sent: await sendAll(freedMails(s, people, site())) };
  }
  if (type === 'update') {
    // Une seule fois par version (modif + infos) : renvoyer deux fois le même mail est impossible
    const key = (x) => `${x.changeV || 0}:${x.infoVersion || 0}`;
    const s = await claim(ref, (x) => !x.cancelled && x.mailReminders !== false && x.mails?.updateKey !== key(x), (x) => ({ 'mails.updateKey': key(x), 'mails.updateAt': Date.now() }));
    if (!s) return { sent: 0, why: 'déjà envoyé' };
    const people = await peopleOf([...(s.attendees || []), ...(s.waitlist || [])]);
    return { sent: await sendAll(updateMails(s, people, site())) };
  }
  return { sent: 0, why: 'type' };
}

export async function runReminders() {
  const now = Date.now();
  const days = [parisIso(now), parisIso(now + 86400000)];
  const snap = await adminDb().collection('sessions').where('date', 'in', days).get();
  let sent = 0;
  for (const d of snap.docs) {
    if (!needsReminder({ id: d.id, ...d.data() }, now)) continue;
    const s = await claim(d.ref, (x) => needsReminder(x, now), () => ({ 'mails.reminder': Date.now() }));
    if (!s) continue;
    const people = await peopleOf(s.attendees || []);
    sent += await sendAll(reminderMails(s, people, site()));
  }
  return { sent };
}
