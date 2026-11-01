// Mails automatiques (confirmation de séance, rappel la veille, place libérée)
// Contenu et choix des destinataires : fonctions pures, testables sans réseau.

export const SUBJECT_LABELS = { maths: 'Maths', physique: 'Physique', chimie: 'Chimie', bio: 'Biologie', francais: 'Français' };
const FORMATS = { presentiel: 'Présentiel', visio: 'Visio', hybride: 'Hybride (présentiel + visio)' };

// ---------- Heure de Paris ----------
// Décalage de Paris (en minutes) à un instant donné
function parisOffset(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}
// Début d'une séance (date "AAAA-MM-JJ" + minutes, heure de Paris) en millisecondes
export function startMs(date, min) {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, min || 0);
  return guess - parisOffset(guess) * 60000;
}
export function parisIso(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

const pad = (n) => String(n).padStart(2, '0');
export const fmt = (m) => { if (m >= 1440 || m === 0) return '00h'; const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h}h${pad(mm)}` : `${h}h`; };
export function day(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
}

// ---------- Places ----------
const isHybrid = (s) => (s.format || 'hybride') === 'hybride';
export const isVisio = (s, id) => s.format === 'visio' || (isHybrid(s) && s.modes?.[id] === 'visio');
export function freePlaces(s) {
  const max = Number(s.max) || 0;
  if (!max) return Infinity;
  const pres = (s.attendees || []).filter((id) => !isVisio(s, id)).length;
  return Math.max(0, max - pres);
}

// ---------- Destinataires ----------
const validMail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
export const withMail = (ids, people) => ids.map((id) => people[id]).filter((p) => p && validMail(p.email));

// ---------- Contenu ----------
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const linkify = (t) => (/^https?:\/\//.test(t) ? `<a href="${esc(t)}">${esc(t)}</a>` : esc(t));
const when = (s) => `${day(s.date)} · ${fmt(s.s)}-${fmt(s.e)}`;
const subj = (s) => (s.subject && SUBJECT_LABELS[s.subject] ? ` (${SUBJECT_LABELS[s.subject]})` : '');

function layout({ hello, title, lines, info, cta, site, link }) {
  const rows = lines.map((l) => `<p style="margin:6px 0">${l}</p>`).join('');
  const infoHtml = info?.length ? `<div style="background:#F1F5F9;border-radius:10px;padding:10px 14px;margin:12px 0">${info.map((l) => `<p style="margin:4px 0">${l}</p>`).join('')}</div>` : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0F172A;max-width:520px">
<p>${esc(hello)}</p>
<h2 style="font-size:18px;margin:10px 0">${title}</h2>
${rows}${infoHtml}
<p style="margin:18px 0"><a href="${esc(link)}" style="background:#4F46E5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:bold;display:inline-block">${esc(cta)}</a></p>
<p style="color:#64748B;font-size:12px">Mail automatique du site Groupes d'étude (${esc(site)}). Pour ne plus en recevoir : retire ton adresse mail sur le site (crayon ✏️ « Mes dispos »).</p>
</div>`;
  const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const text = [hello, '', strip(title), ...lines.map(strip), ...(info || []).map(strip), '', `${cta} : ${link}`, '', `Pour ne plus recevoir ces mails : retire ton adresse sur le site (crayon ✏️ « Mes dispos »).`].join('\n');
  return { html, text };
}

function infoLines(s) {
  const i = s.info || {};
  return [
    i.place && `📍 <b>Lieu :</b> ${linkify(i.place)}`,
    i.visio && `💻 <b>À distance :</b> ${linkify(i.visio)}`,
    i.note && `📝 ${esc(i.note)}`,
  ].filter(Boolean);
}
const modeLine = (s, id) => (isHybrid(s) ? `Tu viens <b>${isVisio(s, id) ? 'en visio 💻' : 'en présentiel 🏫'}</b>.` : `Format : ${FORMATS[s.format] || s.format}.`);

// Sondage -> séance : confirmés, liste d'attente, « Peut-être »
export function createdMails(s, people, site) {
  const link = `${site}/?seance=${s.id}`;
  const out = [];
  for (const p of withMail(s.attendees || [], people)) {
    out.push({ to: p.email, subject: `✅ Séance confirmée : ${s.title} — ${when(s)}`, ...layout({
      hello: `Salut ${p.prenom},`, title: `✅ ${esc(s.title)}${esc(subj(s))} : c’est confirmé !`, site, link, cta: 'Voir la séance',
      lines: [`📅 <b>${esc(when(s))}</b>`, modeLine(s, p.id), 'Tu avais voté « Oui » : tu es inscrit(e). Plus dispo ? Désinscris-toi sur le site pour laisser ta place.'],
      info: infoLines(s),
    }) });
  }
  (s.waitlist || []).forEach((id, i) => {
    const [p] = withMail([id], people);
    if (!p || (s.attendees || []).includes(id)) return;
    out.push({ to: p.email, subject: `⏳ Liste d’attente : ${s.title} — ${when(s)}`, ...layout({
      hello: `Salut ${p.prenom},`, title: `⏳ ${esc(s.title)} : tu es en liste d’attente (n°${i + 1})`, site, link, cta: 'Voir la séance',
      lines: [`📅 <b>${esc(when(s))}</b>`, 'La séance est complète pour l’instant. Si une place se libère, tu recevras un mail.'],
    }) });
  });
  for (const p of withMail((s.maybes || []).filter((id) => !(s.attendees || []).includes(id) && !(s.waitlist || []).includes(id)), people)) {
    out.push({ to: p.email, subject: `❓ Tu viens ? ${s.title} — ${when(s)}`, ...layout({
      hello: `Salut ${p.prenom},`, title: `❓ ${esc(s.title)} : la date est fixée`, site, link, cta: 'Je confirme ou non',
      lines: [`📅 <b>${esc(when(s))}</b>`, 'Tu avais répondu « Peut-être ». Dis-nous si tu viens (les infos pratiques s’affichent une fois inscrit).'],
    }) });
  }
  return out;
}

// Rappel la veille : inscrits
export function reminderMails(s, people, site) {
  const link = `${site}/?seance=${s.id}`;
  return withMail(s.attendees || [], people).map((p) => ({ to: p.email, subject: `⏰ Rappel : ${s.title} — ${when(s)}`, ...layout({
    hello: `Salut ${p.prenom},`, title: `⏰ Rappel : ${esc(s.title)}${esc(subj(s))}`, site, link, cta: 'Voir la séance',
    lines: [`📅 <b>${esc(when(s))}</b>`, modeLine(s, p.id),
      ...(s.lastChange?.at && Date.now() - s.lastChange.at < 7 * 86400000 ? ['🔄 <b>Modifiée récemment :</b> ' + s.lastChange.list.map((l) => esc(l.replace(/\*/g, ''))).join(' · ')] : []),
      ...(s.announce?.text ? [`📣 ${esc(s.announce.text)}`] : []),
      'Un empêchement ? Désinscris-toi sur le site pour libérer ta place.'],
    info: infoLines(s),
  }) }));
}

// Place libérée : toute la liste d'attente (premier arrivé, premier servi)
export function freedMails(s, people, site) {
  const link = `${site}/?seance=${s.id}`;
  const n = freePlaces(s);
  return withMail((s.waitlist || []).filter((id) => !(s.attendees || []).includes(id) || isVisio(s, id)), people).map((p) => ({ to: p.email, subject: `🎉 Place libérée : ${s.title} — ${when(s)}`, ...layout({
    hello: `Salut ${p.prenom},`, title: `🎉 ${n > 1 ? `${n} places se sont libérées` : 'Une place s’est libérée'} : ${esc(s.title)}`, site, link, cta: 'Je prends la place',
    lines: [`📅 <b>${esc(when(s))}</b>`, 'Tu étais en liste d’attente. <b>Premier arrivé, premier servi</b> : va vite sur le site pour la prendre.'],
  }) }));
}

// Mise à jour envoyée à la demande de l'organisateur (modif d'horaire, de lieu, infos ajoutées…)
export function updateMails(s, people, site) {
  const link = `${site}/?seance=${s.id}`;
  const recent = s.lastChange?.at && Date.now() - s.lastChange.at < 7 * 86400000 ? s.lastChange.list.map((l) => esc(l.replace(/\*/g, ''))) : [];
  const out = withMail(s.attendees || [], people).map((p) => ({ to: p.email, subject: `🔄 Mise à jour : ${s.title} — ${when(s)}`, ...layout({
    hello: `Salut ${p.prenom},`, title: `🔄 ${esc(s.title)}${esc(subj(s))} : mise à jour`, site, link, cta: 'Voir la séance',
    lines: [`📅 <b>${esc(when(s))}</b>`, modeLine(s, p.id), ...recent, 'Plus dispo ? Désinscris-toi sur le site pour laisser ta place.'],
    info: infoLines(s),
  }) }));
  const wait = (s.waitlist || []).filter((id) => !(s.attendees || []).includes(id));
  if (recent.length) {
    for (const p of withMail(wait, people)) {
      out.push({ to: p.email, subject: `🔄 Mise à jour : ${s.title} — ${when(s)}`, ...layout({
        hello: `Salut ${p.prenom},`, title: `🔄 ${esc(s.title)} : mise à jour`, site, link, cta: 'Voir la séance',
        lines: [`📅 <b>${esc(when(s))}</b>`, ...recent, 'Tu es toujours en liste d’attente.'],
      }) });
    }
  }
  return out;
}

// ---------- Choix des séances à rappeler (tâche de chaque heure) ----------
// Rappel entre 24 h et 1 h avant le début ; pas si la confirmation est partie il y a moins de 12 h
export function needsReminder(s, now = Date.now()) {
  if (s.cancelled || s.mailReminders === false || s.mails?.reminder) return false;
  const left = startMs(s.date, s.s) - now;
  if (left > 24 * 3600000 || left < 3600000) return false;
  if (s.mails?.created && now - s.mails.created < 12 * 3600000) return false;
  const created = s.createdAt?.toMillis?.() ?? (s.createdAt?.seconds ? s.createdAt.seconds * 1000 : 0);
  if (created && now - created < 3 * 3600000) return false;
  return (s.attendees || []).length > 0;
}
