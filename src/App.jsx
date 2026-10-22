import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CalendarHeart, CalendarRange, KeyRound, LogOut, Pencil, Share2, ShieldCheck, Sparkles, Users, Vote,
} from 'lucide-react';
import { isConfigured } from './firebase';
import { checkInvite, log, usePolls, useParticipants, useSessions, useSettings } from './data';
import { addDays, isoDate, ls, matchFilters, nextDateForWeekday, parseIso, uid, weekStartOf } from './utils';
import useTheme from './useTheme';
import ThemeButton from './components/ThemeButton';
import { Gate, Identity, PinModal } from './components/AccessScreens';
import DispoForm from './components/DispoForm';
import WeekView from './components/WeekView';
import DayView from './components/DayView';
import BestSlots from './components/BestSlots';
import PeopleView from './components/PeopleView';
import CellSheet from './components/CellSheet';
import Filters, { EMPTY_FILTERS } from './components/Filters';
import PollsView, { PollForm, SessionForm, SessionSheet } from './components/Polls';
import { Avatar, Spinner, Toast } from './components/ui';
import { AlertsBar, AlertsPopup } from './components/Alerts';
const AdminApp = lazy(() => import('./admin/AdminApp'));

export default function App() {
  if (!isConfigured) return <SetupScreen />;
  if (window.location.pathname.startsWith('/admin')) return <Suspense fallback={<Spinner />}><AdminApp /></Suspense>;
  return <PublicApp />;
}

const TABS = [
  { key: 'semaine', label: 'Semaine', icon: CalendarDays },
  { key: 'jours', label: 'Par jour', icon: CalendarRange },
  { key: 'creneaux', label: 'Créneaux', icon: Sparkles },
  { key: 'seances', label: 'Séances', icon: Vote },
  { key: 'gens', label: 'Participants', icon: Users },
];

function PublicApp() {
  const settings = useSettings();
  const [people, peopleErr] = useParticipants();
  const polls = usePolls();
  const sessions = useSessions();
  const [theme, cycleTheme] = useTheme();

  const [code, setCode] = useState(() => ls.get('ge_code'));
  const [codeChecked, setCodeChecked] = useState(false);
  const [gateMsg, setGateMsg] = useState('');
  const [pid, setPid] = useState(() => ls.get('ge_pid'));
  const [creating, setCreating] = useState(false);
  const [pinFor, setPinFor] = useState(null);

  const [view, setView] = useState(() => ls.get('ge_view') || 'semaine');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [highlight, setHighlight] = useState(null);
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [editing, setEditing] = useState(false);
  const [cell, setCell] = useState(null);
  const [sessionOpen, setSessionOpen] = useState(null);
  const [pollForm, setPollForm] = useState(null); // {initial, prefill}
  const [sessionForm, setSessionForm] = useState(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const clearToast = useCallback(() => setToast(''), []);

  useEffect(() => { ls.set('ge_view', view); }, [view]);
  useEffect(() => { if (settings?.appTitle) document.title = settings.appTitle; }, [settings?.appTitle]);

  // Re-vérifie le code mémorisé (s'il a été désactivé / a expiré, on redemande)
  useEffect(() => {
    if (!settings) return;
    if (!settings.requireCode || !code) { setCodeChecked(true); return; }
    checkInvite(code, { alreadyUsed: true }).then((r) => {
      if (!r.ok) { ls.del('ge_code'); setCode(null); setGateMsg(r.reason); }
      setCodeChecked(true);
    }).catch(() => setCodeChecked(true));
  }, [settings?.requireCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nettoie ?code= de l'URL une fois entré
  useEffect(() => {
    if ((code || pid) && window.location.search.includes('code=')) window.history.replaceState(null, '', window.location.pathname);
  }, [code, pid]);

  const me = useMemo(() => people?.find((p) => p.id === pid) || null, [people, pid]);
  useEffect(() => { if (people && pid && !me) { ls.del('ge_pid'); setPid(null); } }, [people, pid, me]);

  const filtered = useMemo(() => (people || []).filter((p) => matchFilters(p, filters)), [people, filters]);
  const pendingVotes = useMemo(() => (me && polls ? polls.filter((p) => p.status !== 'closed' && !p.votes?.[me.id]).length : 0), [polls, me]);

  if (peopleErr) return <div className="center-screen"><p className="err">Erreur de connexion à la base : {peopleErr}</p></div>;
  if (!settings || !people || !polls || !sessions || !codeChecked) return <Spinner />;

  const login = (id) => { setPid(id); setPinFor(null); setCreating(false); };

  // Pas connecté et pas de code d'invitation valable → écran du code
  if (!me && settings.requireCode && !code) {
    return (
      <>
        {gateMsg && <div className="banner warn">{gateMsg} — entre un nouveau code.</div>}
        <Gate settings={settings} onAccess={(c) => { setCode(c); setGateMsg(''); }} />
      </>
    );
  }

  // Qui es-tu ? (liste des noms + PIN) ou inscription
  if (!me) {
    return (
      <>
        <Identity settings={settings} people={people} onLogin={login} onNew={() => setCreating(true)} />
        {creating && (
          <DispoForm people={people} viaCode={code} onClose={() => setCreating(false)}
            onIsMe={(p) => { setCreating(false); setPinFor(p); }}
            onSaved={(id) => { ls.set('ge_pid', id); setPid(id); setCreating(false); setToast('Bienvenue ! Tes dispos sont enregistrées.'); }} />
        )}
        {pinFor && <PinModal p={pinFor} onClose={() => setPinFor(null)} onOk={() => login(pinFor.id)} />}
        <Toast text={toast} onDone={clearToast} />
      </>
    );
  }

  const share = async () => {
    const url = window.location.origin + (code ? `/?code=${code}` : '');
    const text = 'Indique tes dispos pour qu’on organise des groupes de travail !';
    if (navigator.share) { try { await navigator.share({ title: settings.appTitle, text, url }); return; } catch { /* annulé */ } }
    try { await navigator.clipboard.writeText(url); setToast('Lien copié !'); } catch { setToast(url); }
  };

  const logout = () => {
    log('participant_logout', `${me.prenom} ${me.nom}`, '');
    ls.del('ge_pid'); setPid(null); setMenu(false);
  };

  const pollFromSlot = (x) => {
    const first = nextDateForWeekday(x.d);
    setPollForm({
      prefill: [0, 7].map((k) => ({ id: uid(), date: isoDate(addDays(parseIso(first), k)), sh: toH(x.s), eh: toH(x.e) })),
    });
  };
  const goPolls = (pollId) => {
    setView('seances');
    setTimeout(() => {
      const el = pollId && document.getElementById(`poll-${pollId}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
    }, 120);
  };
  const planFromSlot = (x) => setSessionForm({ prefill: { date: x.date || nextDateForWeekday(x.d), s: x.s, e: x.e, attendees: x.ids } });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo"><CalendarHeart size={20} /></span><span className="brand-name">{settings.appTitle}</span></div>
        <div className="top-actions">
          <button className="btn small primary hide-xs" onClick={() => setEditing(true)}><Pencil size={15} /> Mes dispos</button>
          <button className="icon-btn show-xs edit-top" onClick={() => setEditing(true)} aria-label="Modifier mes dispos" title="Mes dispos"><Pencil size={20} /></button>
          <button className="icon-btn" onClick={share} title="Partager le lien"><Share2 size={20} /></button>
          <ThemeButton mode={theme} cycle={cycleTheme} />
          <div className="me-menu">
            <button className="me-btn" onClick={() => setMenu(!menu)} aria-label="Mon compte"><Avatar p={me} size={34} ring /></button>
            {menu && (
              <div className="dropdown" onMouseLeave={() => setMenu(false)}>
                <div className="dd-head"><b>{me.prenom} {me.nom}</b>
                  <span className="dd-code"><KeyRound size={14} /> Mon code perso : <b className="mono">{me.pin}</b></span>
                </div>
                <button onClick={() => { setEditing(true); setMenu(false); }}><Pencil size={16} /> Modifier mes dispos</button>
                <button onClick={() => { setPollForm({}); setMenu(false); }}><Vote size={16} /> Créer un sondage</button>
                <a className="dd-link" href="/admin"><ShieldCheck size={16} /> Espace admin</a>
                <button className="dd-danger" onClick={logout}><LogOut size={16} /> Se déconnecter</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={'tab' + (view === t.key ? ' on' : '')} onClick={() => setView(t.key)}>
            <t.icon size={18} /><span>{t.label}</span>
            {t.key === 'seances' && pendingVotes > 0 && <i className="tab-badge">{pendingVotes}</i>}
          </button>
        ))}
      </nav>

      <main className="content">
        <div className="stats-strip">
          <span><b>{people.length}</b> inscrit{people.length > 1 ? 's' : ''}</span>
          {filtered.length !== people.length && <span><b>{filtered.length}</b> avec les filtres</span>}
          <span><b>{sessions.filter((s) => s.date >= isoDate(new Date())).length}</b> séance(s) à venir</span>
          <span><b>{polls.filter((p) => p.status !== 'closed').length}</b> sondage(s) en cours</span>
        </div>

        <AlertsBar sessions={sessions} polls={polls} people={people} me={me} onSession={setSessionOpen} onGoPolls={goPolls} />

        {view !== 'seances' && (
          <Filters filters={filters} setFilters={setFilters} people={filtered} highlight={highlight} setHighlight={setHighlight} />
        )}

        {view === 'semaine' && <WeekView people={filtered} sessions={sessions} weekStart={weekStart} setWeekStart={setWeekStart}
          highlight={highlight} onCell={setCell} onSession={setSessionOpen} meId={me.id} />}
        {view === 'jours' && <DayView people={filtered} sessions={sessions} weekStart={weekStart} setWeekStart={setWeekStart}
          highlight={highlight} setHighlight={setHighlight} meId={me.id} onSession={setSessionOpen} />}
        {view === 'creneaux' && <BestSlots people={filtered} onPoll={pollFromSlot} onPlan={planFromSlot} meId={me.id} />}
        {view === 'seances' && <PollsView polls={polls} sessions={sessions} people={people} me={me} isAdmin={false}
          onSession={setSessionOpen} openPollForm={(p) => setPollForm({ initial: p })} openSessionForm={(s) => setSessionForm({ initial: s })} />}
        {view === 'gens' && <PeopleView people={filtered} meId={me.id} highlight={highlight} setHighlight={setHighlight} />}
      </main>


      {editing && <DispoForm existing={me} people={people} onClose={() => setEditing(false)}
        onSaved={(id, deleted) => { setEditing(false); if (deleted) { ls.del('ge_pid'); setPid(null); } else setToast('Dispos mises à jour ✓'); }} />}
      {cell && <CellSheet cell={cell} people={filtered} meId={me.id} onClose={() => setCell(null)}
        onPlan={(x) => { setCell(null); planFromSlot(x); }} />}
      {sessionOpen && (() => {
        const live = sessions.find((s) => s.id === sessionOpen.id);
        if (!live) return null;
        return <SessionSheet s={live} people={people} me={me} isAdmin={false} onClose={() => setSessionOpen(null)}
          onEdit={() => { setSessionForm({ initial: live }); setSessionOpen(null); }} />;
      })()}
      {pollForm && <PollForm initial={pollForm.initial} prefill={pollForm.prefill} people={people} me={me}
        onClose={() => { setPollForm(null); setView('seances'); }} />}
      {sessionForm && <SessionForm initial={sessionForm.initial} prefill={sessionForm.prefill} people={people} me={me}
        onClose={() => setSessionForm(null)} />}
      <AlertsPopup sessions={sessions} polls={polls} people={people} me={me} onSession={setSessionOpen} onGoPolls={goPolls} />
      <Toast text={toast} onDone={clearToast} />
    </div>
  );
}

const toH = (m) => (m >= 1440 ? '23:59' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

function SetupScreen() {
  return (
    <div className="center-screen">
      <div className="gate-card wide">
        <h1>Configuration requise</h1>
        <p>Il manque la configuration Firebase. Ouvre <code>src/firebase.js</code> et remplace les valeurs <code>A_REMPLIR</code>
          par celles de ton projet (Console Firebase → Paramètres du projet → Vos applications).</p>
        <p className="muted">Toutes les étapes sont détaillées dans le README.</p>
      </div>
    </div>
  );
}
