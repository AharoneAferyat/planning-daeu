// Partage WhatsApp + liens directs vers un sondage / une séance
import { FORMATIONS, SUBJECTS } from './formations';
import { SESSION_FORMATS } from './constants';
import { placesLabel } from './places';
import { fmt, fmtDay, ls } from './utils';

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
  if (p.deadline) lines.push(`⏳ Réponds avant le ${day(p.deadline)}`);
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

// Lien officiel direct (le raccourci wa.me abîme les émojis pendant sa redirection, surtout sur PC)
export function shareWhatsApp(text) {
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
