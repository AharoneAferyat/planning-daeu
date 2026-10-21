import { useMemo } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Users, Video } from 'lucide-react';
import { DAYS_SHORT } from '../constants';
import { addDays, availAt, fmt, initials, isoDate, shortName, slotsOf, timeRange, weekStartOf } from '../utils';

const PX = 0.9; // pixels par minute (54 px / heure)

export function WeekNav({ weekStart, setWeekStart }) {
  const end = addDays(weekStart, 6);
  const isCurrent = isoDate(weekStartOf(new Date())) === isoDate(weekStart);
  const f = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return (
    <div className="week-nav">
      <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semaine précédente"><ChevronLeft size={20} /></button>
      <span className="wn-label">Semaine du {f(weekStart)} au {f(end)}</span>
      <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semaine suivante"><ChevronRight size={20} /></button>
      {!isCurrent && <button className="btn small ghost" onClick={() => setWeekStart(weekStartOf(new Date()))}>Aujourd'hui</button>}
    </div>
  );
}

export default function WeekView({ people, sessions, weekStart, setWeekStart, highlight, onCell, onSession, meId }) {
  const weekSessions = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i)));
    return sessions.filter((s) => dates.includes(s.date));
  }, [sessions, weekStart]);

  const { start, end } = useMemo(() => {
    const r = timeRange([...people, { slots: weekSessions.map((s) => ({ d: 0, s: s.s, e: s.e })) }]);
    return r;
  }, [people, weekSessions]);

  const height = (end - start) * PX;
  const hours = [];
  for (let h = start; h <= end; h += 60) hours.push(h);
  const todayIso = isoDate(new Date());

  return (
    <div className="card week">
      <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
      <div className="week-scroll">
        <div className="week-grid">
          <div className="wg-corner" />
          {DAYS_SHORT.map((d, i) => {
            const date = addDays(weekStart, i);
            const n = people.filter((p) => p.slots?.some((s) => s.d === i)).length;
            return (
              <div key={i} className={'wg-day' + (isoDate(date) === todayIso ? ' today' : '')}>
                <span className="wd-name">{d} <b>{date.getDate()}</b></span>
                <span className="wd-count">{n} dispo{n > 1 ? 's' : ''}</span>
              </div>
            );
          })}

          <div className="wg-hours" style={{ height }}>
            {hours.map((h) => <span key={h} className="hour-label" style={{ top: (h - start) * PX }}>{fmt(h)}</span>)}
          </div>
          {DAYS_SHORT.map((_, d) => (
            <DayColumn key={d} d={d} date={isoDate(addDays(weekStart, d))} people={people} start={start} end={end} height={height}
              highlight={highlight} onCell={onCell} onSession={onSession} meId={meId}
              sessions={weekSessions.filter((s) => s.date === isoDate(addDays(weekStart, d)))} />
          ))}
        </div>
      </div>
      <div className="legend">
        <span><i className="lg-heat" /> Plus c'est foncé, plus il y a de monde dispo</span>
        <span><i className="lg-stripe" /> Rayé = visio uniquement</span>
        <span><i className="lg-session" /> Séance prévue</span>
        <span className="muted">Clique sur un horaire pour voir qui est dispo</span>
      </div>
    </div>
  );
}

function DayColumn({ d, date, people, sessions, start, end, height, highlight, onCell, onSession, meId }) {
  const dayPeople = people.filter((p) => p.slots?.some((s) => s.d === d));
  const max = Math.max(1, people.length);
  const segs = [];
  for (let t = start; t < end; t += 30) segs.push({ t, n: people.filter((p) => availAt(p, d, t + 15)).length });
  const lanes = Math.max(dayPeople.length, 1);
  const w = 100 / lanes;

  const click = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.floor((start + (e.clientY - r.top) / PX) / 30) * 30;
    onCell({ d, t, date });
  };

  return (
    <div className="day-col" style={{ height, '--hour': `${60 * PX}px` }} onClick={click}>
      {segs.map((s) => s.n > 0 && (
        <div key={s.t} className="heat" style={{ top: (s.t - start) * PX, height: 30 * PX, '--a': s.n / max }} />
      ))}
      {dayPeople.map((p, i) => slotsOf(p, d).map((s, k) => {
        const top = (Math.max(s.s, start) - start) * PX;
        const h = (Math.min(s.e, end) - Math.max(s.s, start)) * PX - 2;
        const dim = highlight && highlight !== p.id;
        return (
          <div key={p.id + k}
            className={'blk' + (p.format === 'visio' ? ' visio' : '') + (p.id === meId ? ' mine' : '') + (highlight === p.id ? ' hl' : '')}
            style={{ top, height: h, left: `calc(${i * w}% + 2px)`, width: `calc(${w}% - 3px)`, '--c': p.color, opacity: dim ? 0.15 : 1 }}
            title={`${p.prenom} ${p.nom || ''} · ${fmt(s.s)}–${fmt(s.e)}`}>
            <span className="blk-name">{lanes > 3 ? initials(`${p.prenom} ${p.nom || ''}`) : shortName(p)}</span>
            {lanes <= 3 && h > 34 && <span className="blk-time">{fmt(s.s)}–{fmt(s.e)}</span>}
            {p.format === 'visio' && lanes <= 4 && <Video size={10} className="blk-ico" />}
          </div>
        );
      }))}
      {sessions.map((s) => (
        <button key={s.id} className={'sess-blk' + ((s.attendees || []).includes(meId) ? ' in' : '')}
          style={{ top: (Math.max(s.s, start) - start) * PX, height: (Math.min(s.e, end) - Math.max(s.s, start)) * PX - 2 }}
          onClick={(e) => { e.stopPropagation(); onSession(s); }} title={`${s.title} · ${fmt(s.s)}–${fmt(s.e)}`}>
          <CalendarCheck size={12} />
          <span className="sb-title">{s.title}</span>
          <span className="sb-meta">{fmt(s.s)}–{fmt(s.e)} · <Users size={10} /> {(s.attendees || []).length}</span>
        </button>
      ))}
    </div>
  );
}
