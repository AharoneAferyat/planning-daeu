import { Fragment, useMemo } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { DAYS_SHORT } from '../constants';
import { addDays, fmt, isoDate, timeRange, weekStartOf } from '../utils';

export function WeekNav({ weekStart, setWeekStart }) {
  const end = addDays(weekStart, 6);
  const isCurrent = isoDate(weekStartOf(new Date())) === isoDate(weekStart);
  const f = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return (
    <div className="week-nav">
      <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semaine précédente"><ChevronLeft size={20} /></button>
      <span className="wn-label">{f(weekStart)} – {f(end)}</span>
      <button className="icon-btn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semaine suivante"><ChevronRight size={20} /></button>
      {!isCurrent && <button className="btn small ghost" onClick={() => setWeekStart(weekStartOf(new Date()))}>Aujourd'hui</button>}
    </div>
  );
}

// Dispo sur toute la plage [s, e]
export const fullAt = (p, d, s, e) => (p.slots || []).some((x) => x.d === d && x.s <= s && x.e >= e);

export default function WeekView({ people, sessions, weekStart, setWeekStart, highlight, onCell, onSession, meId }) {
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i))), [weekStart]);
  const weekSessions = useMemo(() => sessions.filter((s) => dates.includes(s.date)), [sessions, dates]);

  const { start, end } = useMemo(
    () => timeRange([...people, { slots: weekSessions.map((s) => ({ d: 0, s: s.s, e: s.e })) }]),
    [people, weekSessions],
  );
  const hours = [];
  for (let h = start; h < end; h += 60) hours.push(h);

  const grid = useMemo(
    () => hours.map((h) => DAYS_SHORT.map((_, d) => people.filter((p) => fullAt(p, d, h, h + 60)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, start, end],
  );
  const max = Math.max(1, ...grid.flat().map((x) => x.length));
  const hlPerson = highlight ? people.find((p) => p.id === highlight) : null;
  const todayIso = isoDate(new Date());

  return (
    <div className="card week">
      <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
      {hlPerson && (
        <div className="hm-hl-note" style={{ '--hc': hlPerson.color }}>
          <i /> Cases entourées = dispos de <b>{hlPerson.prenom}</b>
        </div>
      )}
      <div className="hm">
        <div className="hm-corner" />
        {DAYS_SHORT.map((n, d) => {
          const nDay = people.filter((p) => p.slots?.some((s) => s.d === d)).length;
          const ds = weekSessions.filter((s) => s.date === dates[d]);
          return (
            <div key={d} className={'hm-day' + (dates[d] === todayIso ? ' today' : '')}>
              <span className="hm-dname">{n}</span>
              <b className="hm-dnum">{addDays(weekStart, d).getDate()}</b>
              <span className="hm-dcount"><Users size={10} />{nDay}</span>
              {ds.map((s) => (
                <button key={s.id} className={'hm-sess' + ((s.attendees || []).includes(meId) ? ' in' : '') + (s.cancelled ? ' cancelled' : '')}
                  onClick={() => onSession(s)} title={`${s.title} · ${fmt(s.s)}–${fmt(s.e)}`}>
                  <CalendarCheck size={11} /><span>{fmt(s.s)}</span>
                </button>
              ))}
            </div>
          );
        })}

        {hours.map((h, r) => (
          <Fragment key={h}>
            <div className="hm-hour">{fmt(h)}</div>
            {grid[r].map((ps, d) => {
              const n = ps.length;
              const a = n / max;
              const sess = weekSessions.some((s) => !s.cancelled && s.date === dates[d] && s.s < h + 60 && s.e > h);
              const mine = meId && ps.some((p) => p.id === meId);
              const hl = hlPerson && ps.includes(hlPerson);
              return (
                <button key={d}
                  className={'hm-cell' + (n ? '' : ' zero') + (a > 0.55 ? ' dark' : '') + (sess ? ' sess' : '') + (hl ? ' hl' : '') + (dates[d] === todayIso ? ' today' : '')}
                  style={{ '--a': a, '--hc': hlPerson?.color }}
                  onClick={() => onCell({ d, s: h, e: h + 60, date: dates[d] })}
                  aria-label={`${DAYS_SHORT[d]} ${fmt(h)} : ${n} dispo`}>
                  {n > 0 && <span className="hm-n">{n}</span>}
                  {mine && <i className="hm-me" />}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="legend">
        <span className="lg-scale">
          <i style={{ '--a': 0.15 }}>1</i><i style={{ '--a': 0.5 }} /><i style={{ '--a': 1 }} className="dark">{max}</i>
          <em>personnes dispo toute l'heure</em>
        </span>
        <span><i className="lg-me" /> toi</span>
        <span><i className="lg-sess" /> séance prévue</span>
        <span className="muted">Touche une case pour voir qui</span>
      </div>
    </div>
  );
}
