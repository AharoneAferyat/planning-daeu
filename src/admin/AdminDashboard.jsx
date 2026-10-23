import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck, Clock, Ticket, Users, Vote } from 'lucide-react';
import { DAYS, DISTANCES, FORMATS, LOG_TYPES, MOMENTS } from '../constants';
import { inviteStatus } from '../data';
import { DecisionCard, decisionsFor } from '../components/Alerts';
import { isOpenPoll } from '../places';
import { ADMIN_ME } from '../config';
import { formationsOf, FORMATIONS, SUBJECTS } from '../formations';
import { bestSlots, duplicatePairs, momentsOf, fmt, fmtDur, isPast, timeAgo, toDate, totalMinutes } from '../utils';
import { Avatar, AvatarStack, PeopleModal } from '../components/ui';

function Bars({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="card">
      <h4 className="card-title">{title}</h4>
      <div className="bars">
        {rows.map((r) => (
          <div key={r.label} className="bar-row">
            <span className="bar-lbl">{r.label}</span>
            <span className="bar-track"><i style={{ width: `${(r.n / max) * 100}%`, background: r.color || 'var(--accent)' }} /></span>
            <b>{r.n}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard({ people, invites, polls, sessions, logs, go }) {
  const week = Date.now() - 7 * 86400000;
  const changes7 = logs.filter((l) => (toDate(l.at)?.getTime() || 0) > week && l.type.startsWith('participant_')).length;
  const activeCodes = invites.filter((i) => inviteStatus(i).key === 'ok').length;
  const upcoming = sessions.filter((s) => !isPast(s.date, s.e));
  const openPolls = polls.filter(isOpenPoll);
  const dups = useMemo(() => duplicatePairs(people), [people]);
  const top = useMemo(() => bestSlots(people, 2, 60).slice(0, 4), [people]);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const avgH = people.length ? people.reduce((a, p) => a + totalMinutes(p), 0) / people.length : 0;
  const perDay = DAYS.map((d, i) => ({ label: d, n: people.filter((p) => p.slots?.some((s) => s.d === i)).length }));
  const [openSlot, setOpenSlot] = useState(null);
  const inactive = people.filter((p) => (toDate(p.updatedAt)?.getTime() || 0) < Date.now() - 30 * 86400000);

  return (
    <div className="admin-dash">
      <div className="kpis">
        <button className="kpi" onClick={() => go('people')}><Users size={20} /><b>{people.length}</b><span>participants</span></button>
        <button className="kpi" onClick={() => go('codes')}><Ticket size={20} /><b>{activeCodes}</b><span>codes actifs</span></button>
        <button className="kpi" onClick={() => go('sessions')}><CalendarCheck size={20} /><b>{upcoming.length}</b><span>séances à venir</span></button>
        <button className="kpi" onClick={() => go('sessions')}><Vote size={20} /><b>{openPolls.length}</b><span>sondages ouverts</span></button>
        <button className="kpi" onClick={() => go('logs')}><Clock size={20} /><b>{changes7}</b><span>modifs (7 j)</span></button>
        <div className="kpi"><Clock size={20} /><b>{fmtDur(Math.round(avgH))}</b><span>dispo moy. / sem</span></div>
      </div>

      {decisionsFor(sessions, 'admin').map((s) => <DecisionCard key={s.id} s={s} me={ADMIN_ME} onOpen={() => go('sessions')} />)}

      {dups.length > 0 && (
        <div className="alert warn clickable" onClick={() => go('people')}>
          <AlertTriangle size={18} /><div><b>{dups.length} doublon(s) possible(s)</b> : {dups.slice(0, 3).map((d) => `${d.a.prenom} ${d.a.nom} / ${d.b.prenom} ${d.b.nom}`).join(' · ')} → à vérifier dans Participants.</div>
        </div>
      )}

      <div className="dash-grid">
        <div className="card">
          <h4 className="card-title">Meilleurs créneaux communs</h4>
          {top.length === 0 ? <p className="muted">Pas encore assez de monde.</p> : top.map((x, i) => {
            const ps = x.ids.map((id) => byId[id]).filter(Boolean);
            return (
              <button key={i} className="top-slot" onClick={() => setOpenSlot({ ...x, ps })}>
                <span className="ts-count">{ps.length}</span>
                <span className="ts-main">
                  <b>{DAYS[x.d]} {fmt(x.s)}–{fmt(x.e)}</b>
                  <AvatarStack people={ps} max={6} size={22} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="card">
          <h4 className="card-title">Activité récente</h4>
          {logs.slice(0, 8).map((l) => (
            <div key={l.id} className="mini-log">
              <span className="pill">{LOG_TYPES[l.type] || l.type}</span>
              <span className="grow">{l.actor}{l.target ? ` → ${l.target}` : ''}</span>
              <span className="muted tiny">{timeAgo(l.at)}</span>
            </div>
          ))}
          <button className="link" onClick={() => go('logs')}>Tout l'historique →</button>
        </div>
        <Bars title="Dispos par jour" rows={perDay} />
        <Bars title="Fréquence souhaitée" rows={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ label: `${n}×/sem`, n: people.filter((p) => p.freq === n).length }))} />
        <Bars title="Formation" rows={[...Object.entries(FORMATIONS).map(([k, v]) => ({ label: v.short, n: people.filter((p) => formationsOf(p).includes(k)).length, color: v.color })), { label: 'Non renseignée', n: people.filter((p) => !formationsOf(p).length).length, color: '#9CA3AF' }]} />
        <Bars title="Matières" rows={Object.entries(SUBJECTS).map(([k, v]) => ({ label: v.label, n: people.filter((p) => !p.subjects?.length || p.subjects.includes(k)).length, color: v.color }))} />
        <Bars title="Format" rows={Object.entries(FORMATS).map(([k, v]) => ({ label: v.short, n: people.filter((p) => p.format === k).length, color: v.color }))} />
        <Bars title="Déplacement" rows={Object.entries(DISTANCES).map(([k, v]) => ({ label: v.label, n: people.filter((p) => p.format !== 'visio' && p.distance === k).length, color: v.color }))} />
        <Bars title="Moment préféré" rows={Object.entries(MOMENTS).map(([k, v]) => ({ label: v.short, n: people.filter((p) => momentsOf(p).includes(k)).length }))} />
        <div className="card">
          <h4 className="card-title">Fiches pas mises à jour depuis 30 j</h4>
          {inactive.length === 0 ? <p className="muted">Tout le monde est à jour.</p>
            : inactive.map((p) => <div key={p.id} className="mini-log"><Avatar p={p} size={22} /><span className="grow">{p.prenom} {p.nom}</span><span className="muted tiny">{timeAgo(p.updatedAt)}</span></div>)}
        </div>
      </div>
      {openSlot && <PeopleModal title={`${DAYS[openSlot.d]} · ${fmt(openSlot.s)}–${fmt(openSlot.e)}`} onClose={() => setOpenSlot(null)}
        groups={[{ label: 'Dispo sur tout le créneau', color: '#16A34A', people: openSlot.ps }]} />}
    </div>
  );
}
