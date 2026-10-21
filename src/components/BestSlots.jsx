import { useMemo, useState } from 'react';
import { CalendarPlus, Clock, Minus, Plus, Sparkles, Vote } from 'lucide-react';
import { DAYS } from '../constants';
import { bestSlots, compat, compatText, fmt, fmtDur } from '../utils';
import { Avatar, Empty } from './ui';

export default function BestSlots({ people, onPoll, onPlan }) {
  const [minPeople, setMinPeople] = useState(2);
  const [minDur, setMinDur] = useState(60);
  const list = useMemo(() => bestSlots(people, minPeople, minDur).slice(0, 30), [people, minPeople, minDur]);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));

  return (
    <div className="card">
      <div className="bs-controls">
        <div className="stepper">
          <span>Au moins</span>
          <button className="icon-btn" onClick={() => setMinPeople(Math.max(2, minPeople - 1))}><Minus size={16} /></button>
          <b>{minPeople}</b>
          <button className="icon-btn" onClick={() => setMinPeople(Math.min(Math.max(2, people.length), minPeople + 1))}><Plus size={16} /></button>
          <span>personnes</span>
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
            return (
              <div key={i} className={'bs-item' + (i < 3 ? ' top' : '')}>
                <div className="bs-when">
                  <span className="bs-count">{ps.length}</span>
                  <div>
                    <b>{DAYS[x.d]}</b>
                    <div>{fmt(x.s)} – {fmt(x.e)} <span className="muted">({fmtDur(x.e - x.s)})</span></div>
                  </div>
                </div>
                <div className="bs-who">
                  {ps.map((p) => <span key={p.id} className="who-chip"><Avatar p={p} size={22} />{p.prenom}</span>)}
                </div>
                <div className="bs-compat">{compatText(c)}</div>
                <div className="bs-actions">
                  <button className="btn small" onClick={() => onPoll(x)}><Vote size={15} /> Proposer en sondage</button>
                  <button className="btn small primary" onClick={() => onPlan(x)}><CalendarPlus size={15} /> Planifier</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
