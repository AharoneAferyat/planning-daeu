import { useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { log, updateParticipant } from '../data';
import { formationsOf, FORMATIONS, isHybridCombo, presCourseSubjects, SUBJECTS } from '../formations';
import FormationPick from './FormationPick';
import PresCoursesPick from './PresCoursesPick';
import { Chips, Modal } from './ui';

/*
  MISES À JOUR OBLIGATOIRES DU PROFIL
  Chaque nouvelle info importante = une « étape » ci-dessous.
  À sa prochaine connexion, la personne doit remplir toutes les étapes qui la concernent, en une seule fois
  (si elle en a raté plusieurs, tout est regroupé dans la même fenêtre).
  Pour en ajouter une : ajouter un objet { id, title, needs(p), render(draft, set, settings), valid(draft), patch(draft) }.
*/
const STEPS = [
  {
    id: 'formation',
    title: 'Ta formation et tes matières',
    needs: (p) => !formationsOf(p).length,
    render: (d, set) => (
      <>
        <div className="field"><span>Ta ou tes formations DAEU * <small className="muted">(plusieurs possibles)</small></span>
          <FormationPick value={d.formations || []} onChange={(v) => set({ formations: v })} />
        </div>
        <div className="field"><span>Tes matières <small className="muted">(rien de coché = toutes)</small></span>
          <Chips multi value={d.subjects || []} onChange={(v) => set({ subjects: v })}
            options={Object.entries(SUBJECTS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
        </div>
      </>
    ),
    valid: (d) => (d.formations || []).length > 0,
    patch: (d) => ({ formations: d.formations, formation: d.formations[0], subjects: d.subjects || [], askedFormation: true }),
  },
  {
    id: 'presCourses',
    title: 'Tes cours en présentiel',
    needs: (p, settings) => isHybridCombo(p) && !Array.isArray(p.presSubjects) && presCourseSubjects(p, settings).length > 0,
    applies: (p, settings) => isHybridCombo(p) && presCourseSubjects(p, settings).length > 0,
    render: (d, set, settings) => (
      <div className="field">
        <span>Tu es en Hybride et en {formationsOf(d).filter((f) => f !== 'hybride').map((f) => FORMATIONS[f].short).join(' + ')} : quels cours suis-tu <b>en présentiel</b> ?</span>
        <PresCoursesPick draft={d} settings={settings} value={d.presSubjects} onChange={(v) => set({ presSubjects: v })} />
      </div>
    ),
    valid: () => true,
    patch: (d, settings) => ({ presSubjects: Array.isArray(d.presSubjects) ? d.presSubjects : presCourseSubjects(d, settings) }),
  },
];

export const pendingSteps = (me, settings) => (!me || me.id === 'admin' ? [] : STEPS.filter((s) => s.needs(me, settings)));

export default function ProfileUpdate({ me, settings, onDone }) {
  const [draft, setDraft] = useState(() => ({ ...me, formations: formationsOf(me), subjects: me.subjects || [] }));
  const [busy, setBusy] = useState(false);
  const first = useMemo(() => pendingSteps(me, settings).map((s) => s.id), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Étapes affichées : celles qui manquaient à l'ouverture + celles que les réponses rendent nécessaires (ex. Hybride + Soir coché)
  // (une étape affichée le reste, même une fois remplie)
  const seenSteps = useRef(new Set(first));
  STEPS.forEach((s) => { if (s.needs(draft, settings)) seenSteps.current.add(s.id); });
  // …sauf si la réponse la rend sans objet (ex. on décoche Hybride)
  const shown = STEPS.filter((s) => seenSteps.current.has(s.id) && (first.includes(s.id) || s.applies?.(draft, settings) !== false));
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const ok = shown.every((s) => s.valid(draft));
  const who = `${me.prenom} ${me.nom || ''}`.trim();

  const save = async () => {
    setBusy(true);
    const patch = Object.assign({}, ...shown.map((s) => s.patch(draft, settings)));
    await updateParticipant(me.id, patch);
    await log('participant_update', who, who, { changes: [
      ...(patch.formations ? [{ field: 'Formation', from: '—', to: patch.formations.map((f) => FORMATIONS[f].label).join(' + ') }] : []),
      ...(patch.subjects ? [{ field: 'Matières', from: '—', to: patch.subjects.length ? patch.subjects.map((s) => SUBJECTS[s].label).join(', ') : 'toutes' }] : []),
      ...(patch.presSubjects ? [{ field: 'Cours en présentiel', from: '—', to: patch.presSubjects.length ? patch.presSubjects.map((s) => SUBJECTS[s].label).join(', ') : 'aucun (tout en hybride)' }] : []),
    ] });
    setBusy(false);
    onDone(patch);
  };

  return (
    <Modal title={<><Sparkles size={20} /> {shown.length > 1 ? `${shown.length} infos à compléter` : 'Une info à compléter'}</>}
      footer={<button className="btn primary grow" disabled={busy || !ok} onClick={save}>Enregistrer</button>}>
      <p className="muted">Salut {me.prenom} ! Le site a évolué : complète {shown.length > 1 ? 'ces infos' : 'cette info'} pour que tes dispos et les sondages qui te concernent soient justes. Ça prend 30 secondes.</p>
      {shown.map((s, i) => (
        <section key={s.id} className="pu-step">
          <h4>{shown.length > 1 && <span className="pu-n">{i + 1}</span>} {s.title}</h4>
          {s.render(draft, set, settings)}
        </section>
      ))}
    </Modal>
  );
}
