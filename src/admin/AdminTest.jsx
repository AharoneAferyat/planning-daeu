import { useMemo, useState } from 'react';
import { AlertTriangle, Eye, FlaskConical, Search, Trash2 } from 'lucide-react';
import { deleteParticipant, saveTestProfile, useTestProfile } from '../data';
import { audienceLabel, canSee, FORMATIONS, SUBJECTS } from '../formations';
import { startViewAs, TEST_ID } from '../testmode';
import { normName } from '../utils';
import { Avatar, Chips, ConfirmButton, Toast } from '../components/ui';

// Onglet « Mode test » : profil test invisible + voir le site comme un participant
export default function AdminTest({ people, polls, sessions }) {
  const test = useTestProfile();
  const [formation, setFormation] = useState(null);
  const [subjects, setSubjects] = useState(null);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const f = formation ?? test?.formation ?? 'soir';
  const subs = subjects ?? test?.subjects ?? [];

  const preview = { id: TEST_ID, formation: f, subjects: subs };
  const seen = polls.filter((p) => p.status !== 'closed' && canSee(p, preview));
  const hidden = polls.filter((p) => p.status !== 'closed' && !canSee(p, preview));
  const list = useMemo(() => {
    const n = normName(q);
    return people.filter((p) => !n || normName(`${p.prenom}${p.nom}`).includes(n)).slice(0, 30);
  }, [people, q]);

  const open = async () => {
    await saveTestProfile({ formation: f, subjects: subs });
    startViewAs(TEST_ID);
  };

  return (
    <div className="settings">
      <div className="card test-card">
        <h4 className="card-title"><FlaskConical size={18} /> Profil test (invisible pour les autres)</h4>
        <p className="muted tiny">Un faux participant « Profil Test » pour essayer le site comme n'importe qui : voter, s'inscrire aux séances, modifier ses dispos… Ses votes et inscriptions n'apparaissent pour personne d'autre.</p>

        <div className="field"><span>Formation du profil test</span>
          <div className="formation-pick">
            {Object.entries(FORMATIONS).map(([k, v]) => (
              <button type="button" key={k} className={'fpick' + (f === k ? ' on' : '')} style={{ '--c': v.color }} onClick={() => setFormation(k)}>
                <b>{v.short}</b><small>{v.hint}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="field"><span>Matières <small className="muted">(rien = toutes)</small></span>
          <Chips multi value={subs} onChange={setSubjects}
            options={Object.entries(SUBJECTS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
        </div>

        <p className="test-preview">
          Avec ce profil : <b>{seen.length}</b> sondage{seen.length > 1 ? 's' : ''} en cours visible{seen.length > 1 ? 's' : ''}
          {hidden.length > 0 && <>, <b>{hidden.length}</b> masqué{hidden.length > 1 ? 's' : ''} ({hidden.map((p) => `${p.title} — ${audienceLabel(p)}`).join(' · ')})</>}.
        </p>

        <div className="row-btns">
          <button className="btn primary" onClick={open}><Eye size={16} /> {test ? 'Ouvrir le site en profil test' : 'Créer et ouvrir le profil test'}</button>
          {test && (
            <ConfirmButton className="btn ghost danger" confirmText="Supprimer le profil test et ses votes ?"
              onConfirm={async () => { await deleteParticipant(test, 'Admin'); setFormation(null); setSubjects(null); setToast('Profil test supprimé (votes et inscriptions effacés)'); }}>
              <Trash2 size={15} /> Effacer le profil test
            </ConfirmButton>
          )}
        </div>
        {test && <p className="muted tiny">Profil test existant · {sessions.filter((s) => (s.attendees || []).includes(TEST_ID) || (s.waitlist || []).includes(TEST_ID)).length} séance(s) · {polls.filter((p) => p.votes?.[TEST_ID]).length} vote(s). Pense à l'effacer quand tu as fini.</p>}
      </div>

      <div className="card">
        <h4 className="card-title"><Eye size={18} /> Voir le site comme un participant</h4>
        <p className="alert warn tiny"><AlertTriangle size={16} /> <span>Ici tu es <b>vraiment</b> connecté en tant que cette personne : ses votes, inscriptions et modifications seront réels. Idéal pour vérifier ce qu'elle voit.</span></p>
        <div className="search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un participant…" /></div>
        <div className="who-list test-list">
          {list.map((p) => (
            <button key={p.id} className="who" onClick={() => startViewAs(p.id)}>
              <Avatar p={p} size={30} />
              <span className="grow">{p.prenom} <b>{p.nom}</b></span>
              <span className="muted tiny">{FORMATIONS[p.formation]?.short || 'sans formation'}</span>
            </button>
          ))}
        </div>
      </div>
      <Toast text={toast} onDone={() => setToast('')} />
    </div>
  );
}
