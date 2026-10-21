import { CalendarPlus, UserX } from 'lucide-react';
import { DAYS } from '../constants';
import { availAt, compat, compatText, fmt, slotsOf } from '../utils';
import { Avatar, Empty, Modal, Name, PersonBadges } from './ui';

export default function CellSheet({ cell, people, meId, onClose, onPlan }) {
  const { d, t } = cell;
  const avail = people.filter((p) => availAt(p, d, t));
  const c = avail.length > 1 ? compat(avail) : null;
  return (
    <Modal title={`${DAYS[d]} · ${fmt(t)}–${fmt(t + 30)}`} onClose={onClose}
      footer={avail.length > 1 && (
        <button className="btn primary" onClick={() => onPlan({ d, s: t, e: Math.min(1440, t + 120), ids: avail.map((p) => p.id), date: cell.date })}>
          <CalendarPlus size={16} /> Planifier une séance ici
        </button>
      )}>
      <p className="muted"><b>{avail.length}</b> personne{avail.length > 1 ? 's' : ''} dispo sur {people.length}</p>
      {c && <p className="compat-line">{compatText(c)}</p>}
      {avail.length === 0 ? <Empty icon={UserX} title="Personne à cette heure-là" /> : (
        <div className="plist">
          {avail.map((p) => {
            const s = slotsOf(p, d).find((x) => x.s <= t && x.e > t);
            return (
              <div key={p.id} className="prow">
                <Avatar p={p} size={34} />
                <div className="grow">
                  <Name p={p} meId={meId} full />
                  <div className="muted tiny">dispo {fmt(s.s)} – {fmt(s.e)}</div>
                  <PersonBadges p={p} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
