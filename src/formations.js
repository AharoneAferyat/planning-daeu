// Formations DAEU, matières, emplois du temps et vacances
import { isoDate, parseIso } from './utils';

export const FORMATIONS = {
  jour: { label: 'DAEU Jour', short: 'Jour', color: '#0EA5E9', hint: 'cours le mardi et le jeudi en journée' },
  soir: { label: 'DAEU Soir', short: 'Soir', color: '#7C3AED', hint: 'cours du lundi au vendredi, 17h30–20h30' },
  hybride: { label: 'DAEU Hybride', short: 'Hybride', color: '#16A34A', hint: 'à distance, pas d’horaires de cours' },
};
export const FORMATION_KEYS = Object.keys(FORMATIONS);

// Une personne peut suivre plusieurs formations (ex. Soir + Hybride). Compatible avec l'ancien champ unique.
export const formationsOf = (p) => (Array.isArray(p?.formations) && p.formations.length ? p.formations : p?.formation ? [p.formation] : []);
export const formationsLabel = (p, short = true) => formationsOf(p).map((f) => (short ? FORMATIONS[f]?.short : FORMATIONS[f]?.label) || f).join(' + ');

export const SUBJECTS = {
  maths: { label: 'Maths', color: '#E11D48' },
  physique: { label: 'Physique', color: '#0E7490' },
  chimie: { label: 'Chimie', color: '#D97706' },
  bio: { label: 'Biologie', color: '#16A34A' },
  francais: { label: 'Français', color: '#7C3AED' },
};
export const SUBJECT_KEYS = Object.keys(SUBJECTS);

const c = (d, s, e, subject, from, to) => ({ d, s, e, subject, ...(from ? { from, to } : {}) });
// Horaires par défaut (modifiables dans Admin → Réglages)
export const DEFAULT_SCHEDULES = {
  jour: [
    c(2, 540, 720, 'physique', '2026-10-06', '2026-12-15'),
    c(2, 810, 945, 'maths', '2026-10-06', '2026-12-15'),
    c(2, 960, 1140, 'bio', '2026-10-06', '2026-12-15'),
    c(4, 540, 720, 'chimie', '2026-10-08', '2026-12-17'),
    c(4, 810, 975, 'maths', '2026-10-08', '2026-12-17'),
    c(4, 1050, 1230, 'francais', '2026-10-08', '2026-12-17'),
  ],
  soir: [
    c(1, 1050, 1230, 'maths'),
    c(2, 1050, 1230, 'chimie'),
    c(3, 1050, 1230, 'maths'),
    c(4, 1050, 1230, 'francais'),
    c(5, 1050, 1230, 'bio'),
  ],
  hybride: [],
};

// Vacances communes : du 1er jour (inclus) au jour de reprise (exclu)
export const DEFAULT_HOLIDAYS = [
  { label: 'Noël', from: '2026-12-19', to: '2027-01-04' },
  { label: 'Février', from: '2027-02-06', to: '2027-02-22' },
  { label: 'Printemps', from: '2027-04-03', to: '2027-04-19' },
];

export const schedulesOf = (settings) => ({ ...DEFAULT_SCHEDULES, ...(settings?.schedules || {}) });
export const holidaysOf = (settings) => settings?.holidays || DEFAULT_HOLIDAYS;

export const holidayOn = (settings, iso) => holidaysOf(settings).find((h) => iso >= h.from && iso < h.to) || null;

// Le cours a-t-il lieu ce jour-là ? (sans date : semaine type, cours pas encore terminés)
export function courseActive(settings, course, iso) {
  if (!iso) return !course.to || course.to >= isoDate(new Date());
  if (course.from && iso < course.from) return false;
  if (course.to && iso > course.to) return false;
  return !holidayOn(settings, iso);
}

const subjectsOk = (course, subjects) => !subjects?.length || subjects.includes(course.subject);

// Cours d'une formation (et éventuellement de certaines matières) qui chevauchent [s, e]
export function coursesAt(settings, formation, subjects, iso, d, s, e) {
  const fs = Array.isArray(formation) ? formation : [formation];
  return fs.flatMap((f) => schedulesOf(settings)[f] || [])
    .filter((x) => x.d === d && x.s < e && x.e > s && subjectsOk(x, subjects) && courseActive(settings, x, iso));
}

// Toutes les formations (parmi `formations`, ou toutes) qui ont cours à ce moment
export function conflictsFor(settings, formations, iso, s, e) {
  const d = parseIso(iso).getDay();
  const list = formations?.length ? formations : FORMATION_KEYS;
  return list.flatMap((f) => coursesAt(settings, f, null, iso, d, s, e).map((x) => ({ f, c: x })));
}

// Une personne n'est en cours que pendant SES matières (toutes si elle n'en a pas choisi)
// Hybride + Jour / Soir : la personne choisit les matières qu'elle suit en présentiel (presSubjects).
// Les autres sont suivies en hybride (à distance, sans horaire fixe) : elles ne bloquent pas ses dispos.
export const isHybridCombo = (p) => { const fs = formationsOf(p); return fs.includes('hybride') && (fs.includes('jour') || fs.includes('soir')); };
export const courseBlocks = (p, course) => !isHybridCombo(p) || !Array.isArray(p.presSubjects) || p.presSubjects.includes(course.subject);
// Matières qui ont des cours en présentiel dans les formations Jour / Soir de la personne (limitées à ses matières)
export function presCourseSubjects(p, settings) {
  const fs = formationsOf(p).filter((f) => f !== 'hybride');
  const set = new Set(fs.flatMap((f) => (schedulesOf(settings)[f] || []).map((c) => c.subject)));
  return SUBJECT_KEYS.filter((k) => set.has(k) && (!p.subjects?.length || p.subjects.includes(k)));
}

export const personCoursesAt = (p, settings, iso, d, s, e) => coursesAt(settings, formationsOf(p), p.subjects, iso, d, s, e).filter((c) => courseBlocks(p, c));

// Dispos réelles : on retire les heures de cours de la personne.
// Avec une date (iso + jour d) : seulement ce jour-là, en tenant compte des vacances et des dates de cours.
export function withoutCourses(p, settings, iso = null, d = null) {
  const courses = formationsOf(p).flatMap((f) => schedulesOf(settings)[f] || [])
    .filter((x) => subjectsOk(x, p.subjects) && courseBlocks(p, x) && (d === null || x.d === d) && courseActive(settings, x, iso));
  if (!courses.length) return p;
  const out = [];
  for (const sl of p.slots || []) {
    if (d !== null && sl.d !== d) { out.push(sl); continue; }
    let parts = [{ ...sl }];
    for (const co of courses.filter((x) => x.d === sl.d)) {
      parts = parts.flatMap((x) => {
        if (co.e <= x.s || co.s >= x.e) return [x];
        const r = [];
        if (co.s > x.s) r.push({ d: x.d, s: x.s, e: co.s });
        if (co.e < x.e) r.push({ d: x.d, s: co.e, e: x.e });
        return r;
      });
    }
    out.push(...parts.filter((x) => x.e - x.s >= 15));
  }
  return { ...p, slots: out };
}

// ---------- Public d'un sondage / d'une séance ----------
// audience = formations visées (vide = toutes) ; subject = matière visée (facultatif)
export const inAudience = (item, formations) => !item?.audience?.length || [].concat(formations || []).some((f) => item.audience.includes(f));
export const subjectOk = (item, subjects) => !item?.subject || !subjects?.length || subjects.includes(item.subject);
export const personInAudience = (item, p) => inAudience(item, formationsOf(p)) && subjectOk(item, p.subjects);

// Ce que la personne voit : son public, ce qu'elle a créé, tout pour l'admin
export const canSee = (item, me) => !me || me.id === 'admin' || item.createdBy === me.id
  || ((!formationsOf(me).length || inAudience(item, formationsOf(me))) && subjectOk(item, me.subjects));

export const audienceLabel = (item) => {
  const f = !item?.audience?.length ? 'Toutes formations' : item.audience.map((x) => FORMATIONS[x]?.short || x).join(' + ');
  return item?.subject ? `${SUBJECTS[item.subject]?.label || item.subject} · ${f}` : f;
};
