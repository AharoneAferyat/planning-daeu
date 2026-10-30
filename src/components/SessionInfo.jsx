import { useState } from 'react';
import { Info, Lock, MapPin, MonitorSmartphone, Pencil, Save } from 'lucide-react';
import { saveSessionInfo } from '../data';

export const hasInfo = (s) => !!(s?.info && (s.info.place || s.info.visio || s.info.note));
const needsPlace = (format) => format !== 'visio';      // présentiel ou hybride
const needsVisio = (format) => format !== 'presentiel'; // visio ou hybride

const Link = ({ v }) => (/^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : v);

// Affichage des infos (lieu / distanciel / consignes)
export function InfoLines({ info, compact }) {
  if (!info) return null;
  return (
    <div className={'info-lines' + (compact ? ' compact' : '')}>
      {info.place && <p><MapPin size={15} /> <span><b>Lieu :</b> <Link v={info.place} /></span></p>}
      {info.visio && <p><MonitorSmartphone size={15} /> <span><b>À distance :</b> <Link v={info.visio} /></span></p>}
      {info.note && <p><Info size={15} /> <span>{info.note}</span></p>}
    </div>
  );
}

// Bloc dans la fiche de séance : visible des inscrits, modifiable par le créateur / l'admin
export default function SessionInfoBlock({ s, canManage, isAttendee, actor }) {
  const [edit, setEdit] = useState(false);
  const [place, setPlace] = useState(s.info?.place || '');
  const [visio, setVisio] = useState(s.info?.visio || '');
  const [note, setNote] = useState(s.info?.note || '');
  const [busy, setBusy] = useState(false);
  const canSeeInfo = isAttendee || canManage;
  const fmt = s.format || 'hybride';

  if (edit) {
    return (
      <div className="info-box editing">
        <h4><Info size={16} /> Infos pratiques <small>(visibles uniquement par les inscrits)</small></h4>
        {needsPlace(fmt) && (
          <label className="field"><span>Lieu {fmt === 'hybride' ? '(partie présentielle)' : ''}</span>
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ex : BU Sainte-Barbe, salle 2, 2e étage" maxLength={200} />
          </label>
        )}
        {needsVisio(fmt) && (
          <label className="field"><span>Moyen à distance {fmt === 'hybride' ? '(partie visio)' : ''}</span>
            <input value={visio} onChange={(e) => setVisio(e.target.value)} placeholder="Ex : lien Meet / Discord / Zoom" maxLength={300} />
          </label>
        )}
        <label className="field"><span>Consignes (facultatif)</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : apporter les annales 2024, code d'entrée 1234…" maxLength={400} />
        </label>
        <div className="row-btns">
          <button className="btn ghost" onClick={() => setEdit(false)}>Annuler</button>
          <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await saveSessionInfo(s, { place, visio, note }, actor); setBusy(false); setEdit(false); }}>
            <Save size={15} /> Enregistrer et prévenir les inscrits
          </button>
        </div>
      </div>
    );
  }

  if (!canSeeInfo) {
    return hasInfo(s) ? <p className="info-locked"><Lock size={14} /> Des infos pratiques (lieu, lien…) sont réservées aux inscrits.</p> : null;
  }
  return (
    <div className={'info-box' + (hasInfo(s) ? ' filled' : '')}>
      <h4><Info size={16} /> Infos pratiques {canManage && <small>(visibles uniquement par les inscrits)</small>}</h4>
      {hasInfo(s) ? <InfoLines info={s.info} /> : <p className="muted tiny">{canManage ? `Ajoute ${fmt === 'visio' ? 'le lien' : fmt === 'presentiel' ? 'le lieu' : 'le lieu et le lien'} : les inscrits seront prévenus en priorité dans leurs rappels.` : 'Pas encore d’infos pratiques.'}</p>}
      {canManage && <button className="btn small" onClick={() => setEdit(true)}><Pencil size={14} /> {hasInfo(s) ? 'Modifier les infos' : 'Ajouter les infos'}</button>}
    </div>
  );
}

// Champs « infos importantes » réutilisables (clôture de sondage, création de séance)
export function InfoFields({ format = 'hybride', value, onChange, required }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="info-box editing info-fields">
      <h4><Info size={16} /> Infos importantes <small>(visibles uniquement par les inscrits{required ? ' · lieu et lien obligatoires, consignes facultatives' : ', facultatif : modifiables plus tard'})</small></h4>
      {needsPlace(format) && (
        <label className="field"><span>Lieu {format === 'hybride' ? '(partie présentielle)' : ''}</span>
          <input value={value.place || ''} onChange={set('place')} placeholder="Ex : BU Sainte-Barbe, salle 2, 2e étage" maxLength={200} />
        </label>
      )}
      {needsVisio(format) && (
        <label className="field"><span>Moyen à distance {format === 'hybride' ? '(partie visio)' : ''}</span>
          <input value={value.visio || ''} onChange={set('visio')} placeholder="Ex : lien Meet / Discord / Zoom" maxLength={300} />
        </label>
      )}
      <label className="field"><span>Consignes</span>
        <textarea rows={2} value={value.note || ''} onChange={set('note')} placeholder="Ex : apporter les annales 2024, code d'entrée…" maxLength={400} />
      </label>
    </div>
  );
}

// Données à enregistrer avec la séance (rien si tout est vide)
export function infoData(format, v) {
  const info = {
    place: needsPlace(format) ? (v.place || '').trim() : '',
    visio: needsVisio(format) ? (v.visio || '').trim() : '',
    note: (v.note || '').trim(),
  };
  return info.place || info.visio || info.note ? { info, infoVersion: 1, infoAt: new Date() } : {};
}

// Celui qui saisit les infos n'a pas besoin d'être alerté de ses propres infos
export function markInfoSeen(id) {
  try {
    const k = 'ge_info_seen';
    const list = JSON.parse(localStorage.getItem(k) || '[]');
    localStorage.setItem(k, JSON.stringify([...new Set([...list, `${id}:1`])]));
  } catch { /* */ }
}
