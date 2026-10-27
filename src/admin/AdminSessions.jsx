import { useState } from 'react';
import PollsView, { PollForm, SessionForm, SessionSheet } from '../components/Polls';
import { flakySet } from '../attendance';
import { ADMIN_ME } from '../config';
import SpotsPanel from '../components/Spots';

export default function AdminSessions({ polls, sessions, people, settings }) {
  const [open, setOpen] = useState(null);
  const [pollForm, setPollForm] = useState(null);
  const [sessionForm, setSessionForm] = useState(null);
  const [spotsOpen, setSpotsOpen] = useState(false);
  const live = open && sessions.find((s) => s.id === open.id);
  return (
    <>
      <p className="muted">En tant qu'admin tu peux créer, modifier, clôturer, rouvrir et supprimer tous les sondages et séances.</p>
      <PollsView onSpots={() => setSpotsOpen(true)} flaky={flakySet(sessions)} polls={polls} sessions={sessions} people={people} me={ADMIN_ME} isAdmin settings={settings}
        onSession={setOpen} openPollForm={(p) => setPollForm({ initial: p })} openSessionForm={(s) => setSessionForm({ initial: s })} />
      {live && <SessionSheet s={live} people={people} me={ADMIN_ME} polls={polls} flaky={flakySet(sessions)} isAdmin onClose={() => setOpen(null)}
        onEdit={() => { setSessionForm({ initial: live }); setOpen(null); }} />}
      {spotsOpen && <SpotsPanel me={ADMIN_ME} people={people} settings={settings} onClose={() => setSpotsOpen(false)} />}
      {pollForm && <PollForm initial={pollForm.initial} people={people} me={ADMIN_ME} settings={settings} onClose={() => setPollForm(null)} />}
      {sessionForm && <SessionForm initial={sessionForm.initial} people={people} me={ADMIN_ME} settings={settings} onClose={() => setSessionForm(null)} />}
    </>
  );
}
