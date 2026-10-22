import { CalendarPlus, UserX } from 'lucide-react';
import { DAYS } from '../constants';
import { compat, compatText, fmt, fmtDay, slotsOf } from '../utils';
import { Empty, Modal, PeopleGroups } from './ui';
import { fullAt } from './WeekView';
import { conflictsFor, FORMATIONS, holidayOn, SUBJECTS, withoutCourses } from '../formations';

// Fenêtre « qui est dispo » pour une case du planning (jour + plage horaire)
export default function CellSheet({ cell, people: rawPeople, meId, onClose, onPlan, settings }) {
  const { d, s, e, date } = cell;
  const people = rawPeople.map((p) => withoutCourses(p, settings, date, d));
  const courses = date ? conflictsFor(settings, null, date, s, e) : [];
  const hol = date && holidayOn(settings, date);
  const full = people.filter((p) => fullAt(p, d, s, e));
  const partial = people.filter((p) => !full.includes(p) && slotsOf(p, d).some((x) => x.s < e && x.e > s));
  const c = full.length > 1 ? compat(full) : null;
  const times = (p) => slotsOf(p, d).filter((x) => x.s < e + 120 && x.e > s - 120).map((x) => `${fmt(x.s)}–${fmt(x.e)}`).join(' · ');

  // Plage commune la plus large autour de la case pour les dispos complets
  let ps = s, pe = e;
  if (full.length) {
    const cover = full.map((p) => slotsOf(p, d).find((x) => x.s <= s && x.e >= e));
    ps = Math.max(...cover.map((x) => x.s));
    pe = Math.min(...cover.map((x) => x.e));
  }

  return (
    <Modal title={`${date ? fmtDay(date, { weekday: 'long', day: 'numeric', month: 'short' }) : DAYS[d]} · ${fmt(s)}–${fmt(e)}`} onClose={onClose}
      footer={full.length > 1 && (
        <button className="btn primary block" onClick={() => onPlan({ d, s: ps, e: pe, ids: full.map((p) => p.id), date })}>
          <CalendarPlus size={16} /> Planifier une séance ({fmt(ps)}–{fmt(pe)})
        </button>
      )}>
      {hol && <p className="hol-note">Vacances de {hol.label}</p>}
      {courses.length > 0 && (
        <p className="course-note">Cours à ce moment : {courses.map((x, i) => <span key={i} className="sched-item" style={{ '--c': SUBJECTS[x.c.subject]?.color }}><b>{FORMATIONS[x.f].short}</b> {SUBJECTS[x.c.subject]?.label} <em>{fmt(x.c.s)}–{fmt(x.c.e)}</em></span>)}</p>
      )}
      {c && <p className="compat-line">{compatText(c)}</p>}
      {full.length + partial.length === 0 ? <Empty icon={UserX} title="Personne à cette heure-là" /> : (
        <PeopleGroups meId={meId} groups={[
          { label: 'Dispo toute l’heure', color: '#16A34A', people: full, extra: times, showEmpty: true },
          { label: 'Dispo une partie', color: '#D97706', people: partial, extra: times },
        ]} />
      )}
    </Modal>
  );
}
