import { useMemo, useState } from 'react';
import { CalendarCheck, CalendarX2, Users } from 'lucide-react';
import { DAYS, DAYS_SHORT } from '../constants';
import { addDays, availAt, fmt, isoDate, slotsOf, timeRange } from '../utils';
import { Avatar, Empty, Name, PersonBadges } from './ui';
import { WeekNav } from './WeekView';
import { holidayOn, withoutCourses } from '../formations';

export default function DayView({ people: rawPeople, sessions, weekStart, setWeekStart, highlight, setHighlight, meId, onSession, settings }) {
  const [d, setD] = useState(new Date().getDay());
  const date = isoDate(addDays(weekStart, d));
  // Dispos de ce jour-là, heures de cours retirées
  const people = useMemo(() => rawPeople.map((p) => withoutCourses(p, settings, date, d)), [rawPeople, settings, date, d]);
  const { start, end } = useMemo(() => timeRange(rawPeople), [rawPeople]);
  const span = end - start;
  const pct = (m) => `${((Math.min(Math.max(m, start), end) - start) / span) * 100}%`;
  const hol = holidayOn(settings, date);
  const rows = people
    .filter((p) => p.slots?.some((s) => s.d === d))
    .map((p) => ({ p, slots: slotsOf(p, d) }))
    .sort((a, b) => a.slots[0].s - b.slots[0].s);
  const daySessions = sessions.filter((s) => s.date === date);

  const ticks = [];
  for (let h = start; h <= end; h += 120) ticks.push(h);
  const segs = [];
  for (let t = start; t < end; t += 30) segs.push({ t, n: people.filter((p) => availAt(p, d, t + 15)).length });
  const max = Math.max(1, ...segs.map((s) => s.n));

  return (
    <div className="card dayview">
      <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
      <div className="day-tabs">
        {DAYS_SHORT.map((n, i) => {
          const c = rawPeople.map((p) => withoutCourses(p, settings, isoDate(addDays(weekStart, i)), i)).filter((p) => p.slots?.some((s) => s.d === i)).length;
          const dt = addDays(weekStart, i);
          const hasSess = sessions.some((s) => s.date === isoDate(dt));
          return (
            <button key={i} className={'dtab' + (i === d ? ' on' : '')} onClick={() => setD(i)}>
              <span>{n}</span><b>{dt.getDate()}</b>
              <small className={c ? 'cnt' : 'cnt zero'}>{c}</small>
              {hasSess && <i className="dot-sess" />}
            </button>
          );
        })}
      </div>

      <h3 className="dv-title">{DAYS[d]} {addDays(weekStart, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
        <span className="muted"> · {rows.length} personne{rows.length > 1 ? 's' : ''} dispo</span></h3>

      {hol && <p className="hol-note">Vacances de {hol.label} : pas de cours ce jour-là.</p>}
      {daySessions.map((s) => (
        <button key={s.id} className={'sess-line' + (s.cancelled ? ' cancelled' : '')} onClick={() => onSession(s)}>
          {s.cancelled ? <CalendarX2 size={18} /> : <CalendarCheck size={18} />}
          <span>{s.cancelled && <em className="x-tag">Annulée</em>}<b>{s.title}</b> · {fmt(s.s)}–{fmt(s.e)}</span>
          <span className="muted"><Users size={14} /> {(s.attendees || []).length}</span>
        </button>
      ))}

      {rows.length === 0 ? (
        <Empty icon={CalendarX2} title="Personne n'est dispo ce jour-là">Avec les filtres actuels en tout cas.</Empty>
      ) : (
        <div className="gantt">
          <div className="g-row g-axis">
            <div className="g-who" />
            <div className="g-track">
              {segs.map((s) => s.n > 0 && <i key={s.t} className="g-heat" style={{ left: pct(s.t), width: `${(30 / span) * 100}%`, '--a': s.n / max }} />)}
              {ticks.map((h) => <span key={h} className="g-tick" style={{ left: pct(h) }}>{fmt(h)}</span>)}
            </div>
          </div>
          {rows.map(({ p, slots }) => (
            <div key={p.id} className={'g-row' + (highlight && highlight !== p.id ? ' dim' : '')}
              onClick={() => setHighlight(highlight === p.id ? null : p.id)}>
              <div className="g-who">
                <Avatar p={p} size={30} />
                <div>
                  <Name p={p} meId={meId} />
                  <div className="g-times">{slots.map((s) => `${fmt(s.s)}–${fmt(s.e)}`).join(' · ')}</div>
                  <PersonBadges p={p} compact />
                </div>
              </div>
              <div className="g-track">
                {ticks.map((h) => <i key={h} className="g-line" style={{ left: pct(h) }} />)}
                {slots.map((s, k) => (
                  <span key={k} className={'g-bar' + (p.format === 'visio' ? ' visio' : '')} style={{ left: pct(s.s), width: `calc(${pct(s.e)} - ${pct(s.s)})`, '--c': p.color }}>
                    <em>{fmt(s.s)}–{fmt(s.e)}</em>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
