import { useState } from 'react';
import { Lock, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { deleteCircle, saveCircle } from '../data';
import { invitedIds, myCircles, useCirclesStore } from '../privacy';
import { normName } from '../utils';
import { Avatar, ConfirmButton, Modal } from './ui';

// Choix de personnes : recherche + puces des personnes choisies
export function PeoplePick({ people, value, onChange, exclude = [] }) {
  const [q, setQ] = useState('');
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const list = people.filter((p) => !exclude.includes(p.id) && !value.includes(p.id) && (!q || normName(`${p.prenom}${p.nom}`).includes(normName(q)))).slice(0, q ? 20 : 8);
  return (
    <div className="ppick">
      {value.length > 0 && (
        <div className="ppick-sel">
          {value.map((id) => byId[id] && (
            <button type="button" key={id} className="ppick-chip" onClick={() => onChange(value.filter((x) => x !== id))} aria-label={`Retirer ${byId[id].prenom}`}>
              <Avatar p={byId[id]} size={20} /> {byId[id].prenom} <X size={13} />
            </button>
          ))}
        </div>
      )}
      <div className="search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter quelqu’un…" /></div>
      <div className="ppick-list">
        {list.map((p) => (
          <button type="button" key={p.id} className="ppick-row" onClick={() => { onChange([...value, p.id]); setQ(''); }}>
            <Avatar p={p} size={24} /> <span className="grow">{p.prenom} {p.nom}</span> <Plus size={15} />
          </button>
        ))}
      </div>
    </div>
  );
}

// « Qui peut voir ? » dans les formulaires de sondage / séance
export function InvitePicker({ value, onChange, people, me }) {
  const all = useCirclesStore();
  const circles = myCircles(me?.id).filter((c) => all.includes(c));
  const v = { private: false, ids: [], circles: [], ...value };
  const set = (patch) => onChange({ ...v, ...patch });
  const n = invitedIds({ private: true, invite: { ids: v.ids, circles: v.circles } }).filter((id) => id !== me?.id).length;
  return (
    <div className="field invite-pick">
      <span>Qui peut voir et participer&#160;?</span>
      <div className="seg">
        <button type="button" className={!v.private ? 'on' : ''} onClick={() => set({ private: false })}><Users size={15} /> Tout le monde</button>
        <button type="button" className={v.private ? 'on' : ''} onClick={() => set({ private: true })}><Lock size={15} /> Sur invitation</button>
      </div>
      {v.private && (
        <div className="invite-box">
          {circles.length > 0 && (
            <>
              <small className="muted">Cercles</small>
              <div className="chips">
                {circles.map((c) => {
                  const on = v.circles.includes(c.id);
                  return <button type="button" key={c.id} className={'chip small' + (on ? ' on' : '')} onClick={() => set({ circles: on ? v.circles.filter((x) => x !== c.id) : [...v.circles, c.id] })}>{c.name} <small>{(c.members || []).length}</small></button>;
                })}
              </div>
            </>
          )}
          <small className="muted">Personnes</small>
          <PeoplePick people={people} value={v.ids} onChange={(ids) => set({ ids })} exclude={[me?.id]} />
          <p className={'muted tiny' + (n ? '' : ' warn-text')}>{n ? `${n} invité${n > 1 ? 's' : ''} : seuls eux (et toi) verront et pourront participer.` : 'Choisis au moins une personne ou un cercle.'}</p>
        </div>
      )}
    </div>
  );
}

// ---------- « Mes cercles » ----------
export default function CirclesPanel({ me, people, onClose }) {
  const all = useCirclesStore();
  const mine = myCircles(me.id).filter((c) => all.includes(c));
  const [edit, setEdit] = useState(null); // {id?, name, members}
  const [busy, setBusy] = useState(false);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));

  if (edit) {
    return (
      <Modal title={edit.id ? 'Modifier le cercle' : 'Nouveau cercle'} onClose={() => setEdit(null)}
        footer={<><button className="btn ghost" onClick={() => setEdit(null)}>Annuler</button>
          <button className="btn primary grow" disabled={busy || !edit.name.trim() || !edit.members.length} onClick={async () => { setBusy(true); await saveCircle(edit, me); setBusy(false); setEdit(null); }}>Enregistrer</button></>}>
        <label className="field"><span>Nom du cercle</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={40} placeholder="Ex : Groupe bio du mardi" autoFocus /></label>
        <div className="field"><span>Membres ({edit.members.length})</span>
          <PeoplePick people={people} value={edit.members} onChange={(members) => setEdit({ ...edit, members })} />
        </div>
        <p className="muted tiny">Tu fais partie du cercle d’office. Seuls toi et ses membres le voient.</p>
      </Modal>
    );
  }

  return (
    <Modal title={<><Users size={19} /> Mes cercles</>} onClose={onClose}>
      <p className="muted">Un cercle = une liste de personnes que tu réutilises pour des <b>sondages, séances ou spots sur invitation</b>.</p>
      <button className="btn primary wide-btn" onClick={() => setEdit({ name: '', members: [me.id] })}><Plus size={16} /> Nouveau cercle</button>
      <div className="circle-list">
        {mine.length === 0 && <p className="muted tiny">Aucun cercle pour l’instant.</p>}
        {mine.map((c) => (
          <div key={c.id} className="circle-item">
            <div className="grow">
              <b>{c.name}</b>
              <div className="circle-avs">{(c.members || []).map((id) => byId[id]).filter(Boolean).slice(0, 10).map((p) => <Avatar key={p.id} p={p} size={22} />)}<span className="muted tiny">{(c.members || []).length} membre{(c.members || []).length > 1 ? 's' : ''}{c.createdBy !== me.id ? ` · créé par ${c.createdByName?.split(' ')[0]}` : ''}</span></div>
            </div>
            {c.createdBy === me.id && <>
              <button className="icon-btn" onClick={() => setEdit({ id: c.id, name: c.name, members: c.members || [] })} aria-label="Modifier"><Pencil size={16} /></button>
              <ConfirmButton className="icon-btn danger" confirmText="Supprimer ?" onConfirm={() => deleteCircle(c, `${me.prenom} ${me.nom || ''}`.trim())}><Trash2 size={16} /></ConfirmButton>
            </>}
          </div>
        ))}
      </div>
    </Modal>
  );
}
