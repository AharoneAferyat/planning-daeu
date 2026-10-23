import { FORMATIONS } from '../formations';

// Choix d'une ou plusieurs formations DAEU
export default function FormationPick({ value, onChange }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="formation-pick">
      {Object.entries(FORMATIONS).map(([k, v]) => (
        <button type="button" key={k} className={'fpick' + (value.includes(k) ? ' on' : '')} style={{ '--c': v.color }} onClick={() => toggle(k)} aria-pressed={value.includes(k)}>
          <b>{v.short}</b><small>{v.hint}</small>
        </button>
      ))}
    </div>
  );
}
