import { useState } from 'react';
import { UserX } from 'lucide-react';
import { saveNoShows } from '../data';
import { isOver, leavesOf } from '../attendance';
import { Avatar } from './ui';

const fmtBefore = (ms) => {
  const h = Math.round(ms / 3600000);
  return ms <= 0 ? 'après le début' : h < 1 ? 'moins d’1 h avant' : h < 48 ? `${h} h avant` : `${Math.round(h / 24)} j avant`;
};

// Pour le créateur (et l'admin) : qui s'est désinscrit, et après la séance « qui n'est pas venu ? »
export function CreatorAttendance({ s, people, me, canManage }) {
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const leaves = leavesOf(s);
  const over = isOver(s);
  const [edit, setEdit] = useState(false);
  const [sel, setSel] = useState(() => Object.keys(s.attendance || {}).filter((id) => s.attendance[id] === 'absent'));
  const [busy, setBusy] = useState(false);
  if (!canManage || s.cancelled) return null;
  const noShows = Object.keys(s.attendance || {}).filter((id) => s.attendance[id] === 'absent').map((id) => byId[id]).filter(Boolean);
  const start = new Date(`${s.date}T00:00:00`).getTime() + s.s * 60000;
  if (!leaves.length && !over) return null;

  return (
    <div className="ca-box">
      {leaves.length > 0 && (
        <>
          <b className="ca-title">Désistements ({leaves.length})</b>
          {leaves.map((l) => byId[l.id] && (
            <div key={l.id} className={'ca-row' + (l.late ? ' late' : '')}>
              <Avatar p={byId[l.id]} size={22} /> <span className="grow">{byId[l.id].prenom} {byId[l.id].nom}</span>
              <span className="tiny ca-when" title={new Date(l.at).toLocaleString('fr-FR')}>{l.late ? '⚠️ ' : ''}{fmtBefore(start - l.at)}</span>
            </div>
          ))}
        </>
      )}
      {over && (
        <>
          <b className="ca-title"><UserX size={15} /> Qui n’est pas venu ?</b>
          {!edit && s.attendanceAt ? (
            <p className="ca-done">{noShows.length ? <>Pas venu{noShows.length > 1 ? 's' : ''} : <b>{noShows.map((p) => p.prenom).join(', ')}</b></> : 'Tout le monde est venu 👍'} <button className="link tiny" onClick={() => setEdit(true)}>Modifier</button></p>
          ) : (
            <>
              <p className="muted tiny">Touche les inscrits qui ne sont pas venus (facultatif).</p>
              <div className="ca-chips">
                {(s.attendees || []).map((id) => byId[id]).filter(Boolean).map((p) => (
                  <button key={p.id} className={'chip small' + (sel.includes(p.id) ? ' on ca-no' : '')} onClick={() => setSel((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}>
                    {sel.includes(p.id) ? '❌ ' : ''}{p.prenom}
                  </button>
                ))}
              </div>
              <button className="btn small" disabled={busy} onClick={async () => {
                setBusy(true);
                await saveNoShows(s, sel, me.id === 'admin' ? 'Admin' : `${me.prenom} ${me.nom || ''}`.trim(), sel.map((id) => byId[id]?.prenom).filter(Boolean));
                setBusy(false); setEdit(false);
              }}>{sel.length ? `Enregistrer (${sel.length} pas venu${sel.length > 1 ? 's' : ''})` : 'Tout le monde est venu'}</button>
            </>
          )}
        </>
      )}
    </div>
  );
}
