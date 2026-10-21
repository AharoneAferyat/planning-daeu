import { Users } from 'lucide-react';
import { DAYS_SHORT } from '../constants';
import { daysCount, fmtDur, slotsOf, timeAgo, totalMinutes } from '../utils';
import { Avatar, Empty, Name, PersonBadges } from './ui';

export default function PeopleView({ people, meId, highlight, setHighlight }) {
  if (!people.length) return <div className="card"><Empty icon={Users} title="Personne pour l'instant">Partage le lien pour que les autres s'inscrivent.</Empty></div>;
  return (
    <div className="people-grid">
      {people.map((p) => (
        <div key={p.id} className={'card pcard' + (highlight === p.id ? ' hl' : '')} style={{ '--c': p.color }}
          onClick={() => setHighlight(highlight === p.id ? null : p.id)}>
          <div className="pc-head">
            <Avatar p={p} size={42} />
            <div>
              <Name p={p} meId={meId} full />
              <div className="muted tiny">{daysCount(p)} jour{daysCount(p) > 1 ? 's' : ''} · {fmtDur(totalMinutes(p))} dispo / sem · maj {timeAgo(p.updatedAt)}</div>
            </div>
          </div>
          <PersonBadges p={p} />
          <div className="mini-week">
            {DAYS_SHORT.map((n, d) => {
              const sl = slotsOf(p, d);
              return (
                <div key={d} className={'mw-day' + (sl.length ? ' on' : '')} title={sl.map((s) => `${Math.floor(s.s / 60)}h–${Math.floor(s.e / 60)}h`).join(', ')}>
                  <span>{n[0]}</span>
                  <i style={{ opacity: sl.length ? 0.35 + Math.min(1, sl.reduce((a, s) => a + s.e - s.s, 0) / 480) * 0.65 : 0 }} />
                </div>
              );
            })}
          </div>
          {p.note && <p className="pc-note">« {p.note} »</p>}
        </div>
      ))}
    </div>
  );
}
