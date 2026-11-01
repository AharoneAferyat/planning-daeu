// Adresses mail pour l'admin : uniquement avec le code secret rangé dans Netlify (ADMIN_MAIL_CODE)
// 5 erreurs = blocage 15 minutes
import { timingSafeEqual } from 'node:crypto';
import { adminDb } from '../lib/send.mjs';

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export default async (req) => {
  if (req.method !== 'POST') return new Response('', { status: 405 });
  try {
    if (!process.env.ADMIN_MAIL_CODE) return Response.json({ error: 'ADMIN_MAIL_CODE manquant dans Netlify' }, { status: 500 });
    const { code } = await req.json();
    const db = adminDb();
    const lockRef = db.collection('private_admin').doc('mails');
    const lock = (await lockRef.get()).data() || {};
    if (lock.until && lock.until > Date.now()) return Response.json({ error: `Trop d’essais : réessaie dans ${Math.ceil((lock.until - Date.now()) / 60000)} min` }, { status: 429 });
    const log = (type) => db.collection('logs').add({ type, actor: 'Admin', target: '', details: {}, ua: 'serveur', at: new Date() });
    if (!same(code || '', process.env.ADMIN_MAIL_CODE)) {
      const fails = (lock.fails || 0) + 1;
      await lockRef.set(fails >= 5 ? { fails: 0, until: Date.now() + 15 * 60000 } : { fails, until: 0 });
      await log('admin_emails_fail');
      return Response.json({ error: 'Code incorrect' }, { status: 403 });
    }
    await lockRef.set({ fails: 0, until: 0 });
    const snap = await db.collection('private_emails').get();
    const emails = Object.fromEntries(snap.docs.map((d) => [d.id, d.data().email]));
    await log('admin_emails');
    return Response.json({ emails });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
};
