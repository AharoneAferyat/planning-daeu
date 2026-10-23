// Ménage automatique : suppression des séances et sondages terminés depuis longtemps.
// Pas de serveur : le ménage est lancé par les visiteurs, au plus une fois par jour et par appareil.
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { log } from './data';
import { isoDate, ls } from './utils';

export const CLEANUP_DEFAULT_MONTHS = 3;
export const cleanupMonths = (settings) => Number(settings?.cleanupMonths) || CLEANUP_DEFAULT_MONTHS;
export const cleanupOn = (settings) => settings?.autoCleanup !== false;

export function cutoffIso(months) {
  const d = new Date(); d.setMonth(d.getMonth() - months);
  return isoDate(d);
}

// Séance : sa date est avant la limite (faite ou annulée).
// Sondage : toutes ses dates sont avant la limite (terminé, annulé, ou resté ouvert sans suite).
export function oldItems(polls, sessions, months) {
  const cut = cutoffIso(months);
  const lastDate = (p) => (p.options || []).reduce((m, o) => (o.date > m ? o.date : m), '');
  return {
    sessions: (sessions || []).filter((s) => s.date && s.date < cut),
    polls: (polls || []).filter((p) => { const d = lastDate(p); return d && d < cut; }),
  };
}

export async function runCleanup(polls, sessions, months, actor) {
  const old = oldItems(polls, sessions, months);
  if (!old.sessions.length && !old.polls.length) return old;
  for (const s of old.sessions) await deleteDoc(doc(db, 'sessions', s.id));
  for (const p of old.polls) await deleteDoc(doc(db, 'polls', p.id));
  await log('cleanup', actor, `${old.sessions.length} séance(s), ${old.polls.length} sondage(s)`, {
    'plus vieux que': `${months} mois`,
    séances: old.sessions.map((s) => `${s.title} (${s.date})`).join(' · ') || '—',
    sondages: old.polls.map((p) => p.title).join(' · ') || '—',
  });
  return old;
}

// Appelé au chargement du site : une fois par jour et par appareil
export async function autoCleanup(polls, sessions, settings) {
  if (!cleanupOn(settings) || !polls || !sessions) return;
  const today = isoDate(new Date());
  if (ls.get('ge_clean') === today) return;
  ls.set('ge_clean', today);
  try { await runCleanup(polls, sessions, cleanupMonths(settings), 'Ménage automatique'); } catch { /* sera retenté demain */ }
}
