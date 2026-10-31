// Partage WhatsApp + liens directs vers un sondage / une séance
import { FORMATIONS, SUBJECTS } from './formations';
import { SESSION_FORMATS } from './constants';
import { placesLabel } from './places';
import { fmt, fmtDay, ls, toMin as toMinS } from './utils';

// Lien direct. Le code d'invitation est ajouté pour ceux qui ne sont pas encore connectés.
export function deepLink(type, id) {
  const q = new URLSearchParams();
  q.set(type === 'poll' ? 'sondage' : 'seance', id);
  const code = ls.get('ge_code');
  if (code) q.set('code', code);
  return `${window.location.origin}/?${q.toString()}`;
}

const audience = (x) => [
  x.subject && SUBJECTS[x.subject]?.label,
  x.audience?.length ? x.audience.map((f) => FORMATIONS[f]?.label).join(' + ') : null,
].filter(Boolean).join(' · ');

const day = (iso) => fmtDay(iso, { weekday: 'short', day: 'numeric', month: 'short' });

// Émojis choisis pour s'afficher partout : un seul caractère, sans « variante » (pas de 🗓, ☀, ✔…).
// On remplace seulement les espaces spéciales (insécables) par des espaces normales.
const clean = (t) => String(t || '').replace(/[  ]/g, ' ').replace(/ ?✓/g, ' ✅');

export function pollMessage(p) {
  if (p.status === 'cancelled') return clean(`❌ *Sondage annulé* : ${p.title}\n${deepLink('poll', p.id)}`);
  const aud = audience(p);
  const lines = [
    `📊 *Nouveau sondage : ${p.title}*${aud ? ` (${aud})` : ''}`,
    ...p.options.map((o) => `📅 ${day(o.date)} · ${fmt(o.s)}-${fmt(o.e)}`),
  ];
  const extra = [p.format && (SESSION_FORMATS[p.format] || p.format), p.max && `${p.max} places max`].filter(Boolean).join(' · ');
  if (extra) lines.push(`📍 ${extra}`);
  if (p.deadline) lines.push(`⏳ Réponds avant le ${day(p.deadline)}${p.deadlineTime ? ` à ${fmt(toMinS(p.deadlineTime))}` : ''}${p.autoClose ? ' (la séance sera créée automatiquement)' : ''}`);
  lines.push('', `👉 Réponds ici : ${deepLink('poll', p.id)}`);
  return clean(lines.join('\n'));
}

export function sessionMessage(s) {
  if (s.cancelled) return clean(`❌ *Séance annulée* : ${s.title} · ${day(s.date)} ${fmt(s.s)}-${fmt(s.e)}\n${deepLink('session', s.id)}`);
  const aud = audience(s);
  return clean([
    `📚 *Séance : ${s.title}*${aud ? ` (${aud})` : ''}`,
    `📅 ${day(s.date)} · ${fmt(s.s)}-${fmt(s.e)} · ${SESSION_FORMATS[s.format] || s.format}`,
    `👥 ${placesLabel(s)}`,
    '',
    `👉 Infos et inscription : ${deepLink('session', s.id)}`,
  ].join('\n'));
}

// Modification d'un sondage / d'une séance
export function changeMessage(kind, x, list) {
  const when = kind === 'session' ? ` (${day(x.date)} · ${fmt(x.s)}-${fmt(x.e)})` : '';
  return clean([
    `🔄 *MODIF ${kind === 'session' ? 'séance' : 'sondage'} : ${x.title}*${when}`,
    ...list,
    '',
    kind === 'session' ? `👉 Vérifie que ça te va toujours : ${deepLink('session', x.id)}` : `👉 Vérifie ton vote : ${deepLink('poll', x.id)}`,
  ].join('\n'));
}

// Lien officiel direct (le raccourci wa.me abîme les émojis pendant sa redirection, surtout sur PC)
export function shareWhatsApp(text) {
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export function announceMessage(s, text) {
  return clean([
    `📣 *Annonce : ${s.title}* (${day(s.date)} · ${fmt(s.s)}-${fmt(s.e)})`,
    text,
    '',
    `👉 ${deepLink('session', s.id)}`,
  ].join('\n'));
}

// Rappel du jour (à envoyer sur WhatsApp par l'organisateur)
const whenWord = (iso) => {
  const t = new Date(); const tm = new Date(Date.now() + 86400000);
  const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return iso === f(t) ? 'aujourd’hui' : iso === f(tm) ? 'demain' : `le ${day(iso)}`;
};
export function reminderMessage(s, { withInfo = false } = {}) {
  const w = whenWord(s.date);
  const lines = [
    `⏰ *Rappel : c’est ${w} !*`,
    `📚 *${s.title}* · ${fmt(s.s)}-${fmt(s.e)} · ${SESSION_FORMATS[s.format] || s.format}`,
  ];
  if (withInfo && s.info?.place) lines.push(`📍 ${s.info.place}`);
  if (withInfo && s.info?.visio) lines.push(`💻 ${s.info.visio}`);
  if (withInfo && s.info?.note) lines.push(`📝 ${s.info.note.replace(/\n+/g, ' · ')}`);
  lines.push(`👥 ${placesLabel(s)}`);
  if (s.announce?.text) lines.push(`📣 ${s.announce.text}`);
  if (s.lastChange?.at && Date.now() - s.lastChange.at < 7 * 86400000) lines.push('', '🔄 *Attention, modifié récemment :*', ...s.lastChange.list);
  lines.push('', `👉 Plus dispo ? Pas encore inscrit ? C’est ici : ${deepLink('session', s.id)}`);
  return clean(lines.join('\n'));
}
