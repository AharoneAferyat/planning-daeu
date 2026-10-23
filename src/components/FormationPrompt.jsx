import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { log, updateParticipant } from '../data';
import { formationsOf, FORMATIONS, SUBJECTS } from '../formations';
import FormationPick from './FormationPick';
import { Chips, Modal } from './ui';

// Affiché une seule fois aux personnes inscrites avant l'ajout des formations
export const needsFormationPrompt = (me) => !!me && me.id !== 'admin' && !formationsOf(me).length && !me.askedFormation;

export default function FormationPrompt({ me, onDone }) {
  const [formations, setFormations] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const who = `${me.prenom} ${me.nom || ''}`.trim();

  const save = async () => {
    setBusy(true);
    await updateParticipant(me.id, { formations, formation: formations[0], subjects, askedFormation: true });
    await log('participant_update', who, who, { changes: [
      { field: 'Formation', from: '—', to: formations.map((f) => FORMATIONS[f].label).join(' + ') },
      { field: 'Matières', from: '—', to: subjects.length ? subjects.map((s) => SUBJECTS[s].label).join(', ') : 'toutes' },
    ] });
    onDone(formations.length === 1 ? formations[0] : null);
  };
  // « Plus tard » : on ne redemande plus (l'encadré reste en haut du planning)
  const later = async () => {
    setBusy(true);
    await updateParticipant(me.id, { askedFormation: true });
    onDone(null);
  };

  return (
    <Modal title={<><GraduationCap size={20} /> Nouveau : ta formation</>} onClose={later}
      footer={<>
        <button className="btn ghost" disabled={busy} onClick={later}>Plus tard</button>
        <button className="btn primary grow" disabled={busy || !formations.length} onClick={save}>Enregistrer</button>
      </>}>
      <p className="muted">Salut {me.prenom} ! Le site gère maintenant les formations et les matières : indique les tiennes pour voir les sondages et séances qui te concernent.</p>
      <div className="field"><span>Ta ou tes formations DAEU * <small className="muted">(plusieurs possibles)</small></span>
        <FormationPick value={formations} onChange={setFormations} />
      </div>
      <div className="field"><span>Tes matières <small className="muted">(rien de coché = toutes)</small></span>
        <Chips multi value={subjects} onChange={setSubjects}
          options={Object.entries(SUBJECTS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
      </div>
    </Modal>
  );
}
