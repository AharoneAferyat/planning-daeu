import { useState } from 'react';
import { ChevronDown, GraduationCap } from 'lucide-react';
import { courseActive, FORMATIONS, holidayOn, holidaysOf, schedulesOf, SUBJECTS } from '../formations';
import { DAYS_SHORT } from '../constants';
import { fmt, fmtDay, isoDate } from '../utils';

// Choix de la vue : formation + matière (mémorisés sur l'appareil)
export default function CatBar({ cat, setCat, sub, setSub, settings, me }) {
  const [showSched, setShowSched] = useState(false);
  const fOpts = [['all', 'Toutes'], ...Object.entries(FORMATIONS).map(([k, v]) => [k, v.short])];
  const sOpts = [['all', 'Toutes matières'], ...Object.entries(SUBJECTS).map(([k, v]) => [k, v.label])];
  const showFor = cat !== 'all' ? cat : me?.formation;
  const courses = showFor ? (schedulesOf(settings)[showFor] || []).filter((c) => (sub === 'all' || c.subject === sub) && courseActive(settings, c, null)) : [];
  const today = isoDate(new Date());
  const hol = holidayOn(settings, today);
  const nextHol = holidaysOf(settings).find((h) => h.from > today);

  return (
    <div className="catbar card">
      <div className="cat-row">
        <GraduationCap size={18} className="cat-ico" />
        <div className="seg" role="tablist" aria-label="Formation">
          {fOpts.map(([k, l]) => (
            <button key={k} role="tab" className={'seg-b' + (cat === k ? ' on' : '') + (me?.formation === k ? ' mine' : '')}
              style={FORMATIONS[k] ? { '--c': FORMATIONS[k].color } : undefined} onClick={() => setCat(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="sub-row" role="tablist" aria-label="Matière">
        {sOpts.map(([k, l]) => (
          <button key={k} className={'chip small' + (sub === k ? ' on' : '') + (me?.subjects?.includes(k) ? ' mine' : '')}
            style={SUBJECTS[k] ? { '--c': SUBJECTS[k].color } : undefined} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      {(showFor || hol) && (
        <button className="cat-info" onClick={() => setShowSched(!showSched)}>
          {hol ? <b>Vacances de {hol.label}</b> : <b>{FORMATIONS[showFor]?.label}{cat === 'all' ? ' (ta formation)' : ''}</b>}
          {!hol && <span> · {courses.length ? `${courses.length} cours / semaine` : 'pas de cours en présentiel'}</span>}
          <ChevronDown size={14} className={showSched ? 'rot' : ''} />
        </button>
      )}
      {showSched && (
        <div className="sched">
          {courses.length > 0 && (
            <div className="sched-list">
              {[...courses].sort((a, b) => a.d - b.d || a.s - b.s).map((c, i) => (
                <span key={i} className="sched-item" style={{ '--c': SUBJECTS[c.subject]?.color }}>
                  <b>{DAYS_SHORT[c.d]}</b> {SUBJECTS[c.subject]?.label || c.subject} <em>{fmt(c.s)}–{fmt(c.e)}</em>
                </span>
              ))}
            </div>
          )}
          <p className="muted tiny">Les heures de cours sont grisées dans le planning et retirées des dispos de ceux qui les suivent.
            {nextHol && <> Prochaines vacances : {nextHol.label}, du {fmtDay(nextHol.from, { day: 'numeric', month: 'short' })} au {fmtDay(nextHol.to, { day: 'numeric', month: 'short' })}.</>}</p>
        </div>
      )}
    </div>
  );
}
