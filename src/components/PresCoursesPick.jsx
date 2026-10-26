import { presCourseSubjects, SUBJECTS } from '../formations';
import { Chips } from './ui';

// Choix des cours suivis en présentiel (pour Hybride + Jour / Soir)
export default function PresCoursesPick({ draft, settings, value, onChange }) {
  const subs = presCourseSubjects(draft, settings);
  if (!subs.length) return <p className="muted tiny">Aucun cours en présentiel pour tes matières.</p>;
  const v = Array.isArray(value) ? value : subs;
  return (
    <>
      <Chips multi value={v} onChange={onChange}
        options={subs.map((k) => ({ value: k, label: SUBJECTS[k].label, color: SUBJECTS[k].color }))} />
      <small className="muted">Coché = tu vas au cours en présentiel (tes dispos sont bloquées pendant). Décoché = tu le suis en hybride, à distance : il ne bloque pas tes dispos.</small>
    </>
  );
}
