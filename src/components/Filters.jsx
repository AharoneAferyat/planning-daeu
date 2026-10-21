import { useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { DISTANCES, MOMENTS } from '../constants';
import { Avatar, Chips, FormatIcon, MOMENT_ICON } from './ui';

export const EMPTY_FILTERS = { format: [], distance: [], moment: [] };

export default function Filters({ filters, setFilters, people, highlight, setHighlight }) {
  const [open, setOpen] = useState(false);
  const n = filters.format.length + filters.distance.length + filters.moment.length;
  return (
    <div className="filters card">
      <div className="f-top">
        <button className={'btn small' + (n ? ' primary' : ' ghost')} onClick={() => setOpen(!open)}>
          <Filter size={15} /> Filtres{n ? ` (${n})` : ''} <ChevronDown size={15} className={open ? 'rot' : ''} />
        </button>
        {n > 0 && <button className="link" onClick={() => setFilters(EMPTY_FILTERS)}><X size={14} /> Effacer</button>}
        <div className="f-people">
          {people.map((p) => (
            <button key={p.id} className={'fp-av' + (highlight === p.id ? ' on' : '') + (highlight && highlight !== p.id ? ' off' : '')}
              onClick={() => setHighlight(highlight === p.id ? null : p.id)} title={`Mettre en avant ${p.prenom}`}>
              <Avatar p={p} size={28} />
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div className="f-body">
          <div><span className="lbl">Format accepté</span>
            <Chips multi value={filters.format} onChange={(v) => setFilters({ ...filters, format: v })}
              options={[
                { value: 'presentiel', label: 'Présentiel', icon: <FormatIcon format="presentiel" />, color: '#0E9F6E' },
                { value: 'visio', label: 'Visio', icon: <FormatIcon format="visio" />, color: '#7C3AED' },
              ]} />
          </div>
          <div><span className="lbl">Déplacement</span>
            <Chips multi value={filters.distance} onChange={(v) => setFilters({ ...filters, distance: v })}
              options={Object.entries(DISTANCES).map(([k, v]) => ({ value: k, label: v.label, hint: v.hint, color: v.color }))} />
          </div>
          <div><span className="lbl">Moment préféré</span>
            <Chips multi value={filters.moment} onChange={(v) => setFilters({ ...filters, moment: v })}
              options={Object.entries(MOMENTS).map(([k, v]) => { const I = MOMENT_ICON[k]; return { value: k, label: v.short, icon: <I size={14} /> }; })} />
          </div>
        </div>
      )}
    </div>
  );
}
