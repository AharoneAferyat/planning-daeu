import { useState } from 'react';
import PollsView, { PollForm, SessionForm, SessionSheet } from '../components/Polls';
import { ADMIN_ME } from '../config';

export default function AdminSessions({ polls, sessions, people }) {
  const [open, setOpen] = useState(null);
  const [pollForm, setPollForm] = useState(null);
  const [sessionForm, setSessionForm] = useState(null);
  const live = open && sessions.find((s) => s.id === open.id);
  return (
    <>
      <p className="muted">En tant qu'admin tu peux créer, modifier, clôturer, rouvrir et supprimer tous les sondages et séances.</p>
      <PollsView polls={polls} sessions={sessions} people={people} me={ADMIN_ME} isAdmin
        onSession={setOpen} openPollForm={(p) => setPollForm({ initial: p })} openSessionForm={(s) => setSessionForm({ initial: s })} />
      {live && <SessionSheet s={live} people={people} me={ADMIN_ME} isAdmin onClose={() => setOpen(null)}
        onEdit={() => { setSessionForm({ initial: live }); setOpen(null); }} />}
      {pollForm && <PollForm initial={pollForm.initial} people={people} me={ADMIN_ME} onClose={() => setPollForm(null)} />}
      {sessionForm && <SessionForm initial={sessionForm.initial} people={people} me={ADMIN_ME} onClose={() => setSessionForm(null)} />}
    </>
  );
}
