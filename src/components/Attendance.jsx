import { useState } from 'react';
import { AlarmClock, UserX } from 'lucide-react';
import WaButton from './WaButton';
import { reminderMessage, shareWhatsApp } from '../share';
import { saveNoShows } from '../data';
import { isOver, leavesOf } from '../attendance';
import { Avatar } from './ui';

const fmtBefore = (ms) => {
  const h = Math.round(ms / 3600000);
  return ms <= 0 ? 'après le début' : h < 1 ? 'moins d’1 h avant' : h < 48 ? `${h} h avant` : `${Math.round(h / 24)} j avant`;
};

// Pour le créateur (et l'admin) : qui s'est désinscrit, et après la séance qui était absent (excusé ou non)
const NEXT = { undefined: 'absent', absent: 'excused', excused: undefined };
export function CreatorAttendance({ s, people, me, canManage }) {
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const leaves = leavesOf(s);
  const over = isOver(s);
  const [edit, setEdit] = useState(false);
  const [sel, setSel] = useState(() => ({ ...(s.attendance || {}) }));
  const [busy, setBusy] = useState(false);
  if (!canManage || s.cancelled) return null;
  const who = (k) => Object.keys(s.attendance || {}).filter((id) => s.attendance[id] === k).map((id) => byId[id]?.prenom).filter(Boolean);
  const start = new Date(`${s.date}T00:00:00`).getTime() + s.s * 60000;
  if (!leaves.length && !over) return null;
  const nA = Object.values(sel).filter((v) => v === 'absent').length;
  const nE = Object.values(sel).filter((v) => v === 'excused').length;

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
            <p className="ca-done">
              {!who('absent').length && !who('excused').length ? 'Tout le monde est venu 👍' : <>
                {who('absent').length > 0 && <span>❌ Absent{who('absent').length > 1 ? 's' : ''} : <b>{who('absent').join(', ')}</b></span>}
                {who('excused').length > 0 && <span>🙋 Excusé{who('excused').length > 1 ? 's' : ''} : <b>{who('excused').join(', ')}</b></span>}
              </>}
              <button className="link tiny" onClick={() => setEdit(true)}>Modifier</button>
            </p>
          ) : (
            <>
              <p className="muted tiny">Touche un prénom : 1 fois = ❌ absent, 2 fois = 🙋 absent excusé (avait prévenu), 3 fois = présent. Facultatif.</p>
              <div className="ca-chips">
                {(s.attendees || []).map((id) => byId[id]).filter(Boolean).map((p) => (
                  <button key={p.id} className={'chip small' + (sel[p.id] === 'absent' ? ' on ca-no' : sel[p.id] === 'excused' ? ' on ca-exc' : '')}
                    onClick={() => setSel((x) => { const n = { ...x }; const v = NEXT[x[p.id]]; if (v) n[p.id] = v; else delete n[p.id]; return n; })}>
                    {sel[p.id] === 'absent' ? '❌ ' : sel[p.id] === 'excused' ? '🙋 ' : ''}{p.prenom}
                  </button>
                ))}
              </div>
              <button className="btn small" disabled={busy} onClick={async () => {
                setBusy(true);
                await saveNoShows(s, sel, me.id === 'admin' ? 'Admin' : `${me.prenom} ${me.nom || ''}`.trim(), (id) => byId[id]?.prenom || '?');
                setBusy(false); setEdit(false);
              }}>{nA + nE ? `Enregistrer (${[nA && `${nA} absent${nA > 1 ? 's' : ''}`, nE && `${nE} excusé${nE > 1 ? 's' : ''}`].filter(Boolean).join(', ')})` : 'Tout le monde est venu'}</button>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Rappel à partager sur WhatsApp (organisateur) ----------
export const reminderSent = (s) => { try { return JSON.parse(localStorage.getItem('ge_remind_sent') || '[]').includes(`${s.id}:${s.date}`); } catch { return false; } };
export const markReminderSent = (s) => { try { const k = 'ge_remind_sent'; localStorage.setItem(k, JSON.stringify([...new Set([...JSON.parse(localStorage.getItem(k) || '[]'), `${s.id}:${s.date}`])])); window.dispatchEvent(new Event('ge-cancel-seen')); } catch { /* */ } };
export function ReminderBox({ s, canManage, highlight }) {
  const [withInfo, setWithInfo] = useState(false);
  const [sent, setSent] = useState(() => reminderSent(s));
  if (!canManage || s.cancelled || isOver(s)) return null;
  const hasInfo = !!(s.info?.place || s.info?.visio || s.info?.note);
  return (
    <div className={'remind-box' + (highlight ? ' hot' : '')}>
      <b className="ca-title"><AlarmClock size={15} /> {highlight ? 'C’est bientôt : envoie le rappel' : 'Rappel à partager'}</b>
      <p className="muted tiny">Un message tout prêt pour le groupe WhatsApp : titre, heure, inscrits{s.announce ? ', ton annonce' : ''} et le lien pour s’inscrire ou se désister.</p>
      {hasInfo && (
        <label className="switch"><input type="checkbox" checked={withInfo} onChange={(e) => setWithInfo(e.target.checked)} />
          <span>Inclure le lieu / le lien visio <small className="muted">(sinon visibles seulement par les inscrits sur le site)</small></span></label>
      )}
      <WaButton wide onClick={() => { shareWhatsApp(reminderMessage(s, { withInfo })); markReminderSent(s); setSent(true); }} />
      {sent && <span className="muted tiny">✓ Rappel déjà envoyé (tu peux le renvoyer)</span>}
    </div>
  );
}
