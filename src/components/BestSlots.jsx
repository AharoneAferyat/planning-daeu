import { useMemo, useState } from 'react';
import { CalendarPlus, Clock, Minus, Plus, Sparkles, Vote } from 'lucide-react';
import { DAYS } from '../constants';
import { bestSlots, compat, compatText, fmt, fmtDur } from '../utils';
import { AvatarStack, Empty, PeopleModal } from './ui';
import { withoutCourses } from '../formations';

export default function BestSlots({ people: rawPeople, onPoll, onPlan, meId, settings }) {
  // Semaine type : on retire les heures de cours de chacun
  const people = useMemo(() => rawPeople.map((p) => withoutCourses(p, settings)), [rawPeople, settings]);
  const [minPeople, setMinPeople] = useState(2);
  const [minDur, setMinDur] = useState(60);
  const [open, setOpen] = useState(null);
  const list = useMemo(() => bestSlots(people, minPeople, minDur).slice(0, 30), [people, minPeople, minDur]);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));

  return (
    <div className="card">
      <div className="bs-controls">
        <div className="stepper">
          <span>Au moins</span>
          <button className="icon-btn" onClick={() => setMinPeople(Math.max(2, minPeople - 1))} aria-label="Moins"><Minus size={16} /></button>
          <b>{minPeople}</b>
          <button className="icon-btn" onClick={() => setMinPeople(Math.min(Math.max(2, people.length), minPeople + 1))} aria-label="Plus"><Plus size={16} /></button>
          <span>pers.</span>
        </div>
        <label className="stepper">
          <Clock size={16} /> <span>Durée min.</span>
          <select value={minDur} onChange={(e) => setMinDur(Number(e.target.value))}>
            {[30, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{fmtDur(m)}</option>)}
          </select>
        </label>
      </div>

      {list.length === 0 ? (
        <Empty icon={Sparkles} title="Aucun créneau commun">Baisse le nombre de personnes ou la durée, ou retire des filtres.</Empty>
      ) : (
        <div className="bs-list">
          {list.map((x, i) => {
            const ps = x.ids.map((id) => byId[id]).filter(Boolean);
            const c = compat(ps);
            const item = { ...x, ps, c };
            return (
              <div key={i} className={'bs-item' + (i < 3 ? ' top' : '')} onClick={() => setOpen(item)} role="button" tabIndex={0}>
                <div className="bs-when">
                  <span className="bs-count">{ps.length}<small>pers.</small></span>
                  <div className="grow">
                    <b>{DAYS[x.d]}</b>
                    <div>{fmt(x.s)} – {fmt(x.e)} <span className="muted">({fmtDur(x.e - x.s)})</span></div>
                  </div>
                </div>
                <AvatarStack people={ps} max={7} size={28} onClick={() => setOpen(item)} label="Voir qui" />
                <div className="bs-compat">{compatText(c)}</div>
                <div className="bs-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn small" onClick={() => onPoll(x)}><Vote size={15} /> Sondage</button>
                  <button className="btn small primary" onClick={() => onPlan(x)}><CalendarPlus size={15} /> Planifier</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <PeopleModal title={`${DAYS[open.d]} · ${fmt(open.s)}–${fmt(open.e)}`} subtitle={compatText(open.c)} meId={meId}
          onClose={() => setOpen(null)}
          groups={[{ label: 'Dispo sur tout le créneau', color: '#16A34A', people: open.ps }]}
          footer={<>
            <button className="btn" onClick={() => { onPoll(open); setOpen(null); }}><Vote size={16} /> Sondage</button>
            <button className="btn primary grow" onClick={() => { onPlan(open); setOpen(null); }}><CalendarPlus size={16} /> Planifier</button>
          </>} />
      )}
    </div>
  );
}
