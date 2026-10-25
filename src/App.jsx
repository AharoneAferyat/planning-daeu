import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, CalendarHeart, CalendarRange, KeyRound, LogOut, Pencil, Share2, ShieldCheck, Sparkles, Users, Vote,
} from 'lucide-react';
import { isConfigured } from './firebase';
import { checkInvite, log, useConvs, usePolls, useParticipants, useSessions, useSettings } from './data';
import ChatPanel, { ChatButton, ChatFab, useChatList } from './components/Chat';
import { autoCleanup } from './cleanup';
import { addDays, isoDate, ls, ss, matchFilters, nextDateForWeekday, parseIso, uid, weekStartOf } from './utils';
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
import CatBar from './components/CatBar';
import FormationPrompt, { needsFormationPrompt } from './components/FormationPrompt';
import { isTestId, stopViewAs, viewAsId } from './testmode';
import { isOpenPoll } from './places';
import { canSee, formationsOf, FORMATIONS, inAudience, subjectOk } from './formations';
import { log as logAction, updateParticipant } from './data';
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
  // Ménage automatique des vieilles séances / vieux sondages (1 fois par jour et par appareil)
  useEffect(() => { if (settings && polls && sessions) autoCleanup(polls, sessions, settings); }, [settings, polls, sessions]);
  const [theme, cycleTheme] = useTheme();

  const [code, setCode] = useState(() => ls.get('ge_code'));
  const [codeChecked, setCodeChecked] = useState(false);
  const [gateMsg, setGateMsg] = useState('');
  const viewAs = viewAsId(); // mode test admin
  const [pid, setPid] = useState(() => viewAs || ls.get('ge_pid'));
  const [creating, setCreating] = useState(false);
  const [pinFor, setPinFor] = useState(null);

  const [view, setView] = useState(() => ls.get('ge_view') || 'semaine');
  const [cat, setCat] = useState(() => ls.get('ge_cat') || 'all');
  const [sub, setSub] = useState(() => ls.get('ge_sub') || 'all');
  const [promptDone, setPromptDone] = useState(false);
  // Lien direct (?sondage=ID ou ?seance=ID) : gardé pendant toute la connexion, puis ouvert une fois connecté
  const [goto, setGoto] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const g = q.get('sondage') ? { type: 'poll', id: q.get('sondage') } : q.get('seance') ? { type: 'session', id: q.get('seance') } : null;
    if (g) ss.set('ge_goto', JSON.stringify(g));
    try { return g || JSON.parse(ss.get('ge_goto') || 'null'); } catch { return null; }
  });
  const [deepLinked] = useState(() => !!ss.get('ge_goto'));
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
  useEffect(() => { ls.set('ge_cat', cat); }, [cat]);
  useEffect(() => { ls.set('ge_sub', sub); }, [sub]);
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
  useEffect(() => {
    if (people && pid && !me) { if (viewAs) stopViewAs(true); else { ls.del('ge_pid'); setPid(null); } }
  }, [people, pid, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vue par formation / matière (les heures de cours sont retirées des dispos dans chaque vue)
  const catPeople = useMemo(() => (people || [])
    .filter((p) => (cat === 'all' || formationsOf(p).includes(cat)) && (sub === 'all' || subjectOk({ subject: sub }, p.subjects))), [people, cat, sub]);
  const filtered = useMemo(() => catPeople.filter((p) => matchFilters(p, filters)), [catPeople, filters]);
  const seePolls = useMemo(() => (polls || []).filter((p) => canSee(p, me)), [polls, me]);
  const seeSessions = useMemo(() => (sessions || []).filter((s) => canSee(s, me)), [sessions, me]);
  const inView = (x) => (cat === 'all' || inAudience(x, cat)) && (sub === 'all' || !x.subject || x.subject === sub);
  const viewPolls = useMemo(() => seePolls.filter(inView), [seePolls, cat, sub]); // eslint-disable-line react-hooks/exhaustive-deps
  const viewSessions = useMemo(() => seeSessions.filter(inView), [seeSessions, cat, sub]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ouvre la cible du lien direct dès que la personne est connectée
  useEffect(() => {
    if (!me || !goto || !polls || !sessions || needsFormationPrompt(me)) return;
    ss.del('ge_goto'); setGoto(null);
    window.history.replaceState(null, '', window.location.pathname);
    if (goto.type === 'poll') {
      const p = polls.find((x) => x.id === goto.id);
      setView('seances');
      if (!p) { setToast('Ce sondage n’existe plus.'); return; }
      if (!canSee(p, me)) { setToast('Ce sondage ne concerne pas ta formation / tes matières.'); return; }
      if (p.status === 'cancelled') setToast('Ce sondage a été annulé.');
      else if (p.status === 'closed') setToast('Ce sondage est terminé.');
      setTimeout(() => {
        const el = document.getElementById(`poll-${p.id}`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); }
      }, 250);
    } else {
      const s = sessions.find((x) => x.id === goto.id);
      if (!s) { setToast('Cette séance n’existe plus.'); return; }
      setView('seances'); setSessionOpen(s);
    }
  }, [me, goto, polls, sessions, promptDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Messagerie
  const convs = useConvs();
  const chatList = useChatList(convs, sessions, people, me);
  const [chat, setChat] = useState(null); // null = fermé, '' = liste, sinon id de conversation
  useEffect(() => { const f = (e) => { setSessionOpen(null); setChat(e.detail?.conv || ''); }; window.addEventListener('ge-chat', f); return () => window.removeEventListener('ge-chat', f); }, []);
  const pendingVotes = useMemo(() => (me ? seePolls.filter((p) => isOpenPoll(p) && !p.votes?.[me.id]).length : 0), [seePolls, me]);

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
    if (viewAs) return stopViewAs(true);
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
      {viewAs && (
        <div className="test-banner">
          <span><b>Mode test</b> · tu vois le site comme <b>{me.prenom} {me.nom}</b>{isTestId(me.id) ? ' (profil invisible des autres)' : ' — attention, tes actions sont réelles en son nom'}</span>
          <span className="tb-btns">
            <button className="btn small" onClick={() => stopViewAs(true)}>Retour admin</button>
          </span>
        </div>
      )}
      <header className="topbar">
        <div className="brand"><span className="logo"><CalendarHeart size={20} /></span><span className="brand-name">{settings.appTitle}</span></div>
        <div className="top-actions">
          <button className="btn small primary hide-xs" onClick={() => setEditing(true)}><Pencil size={15} /> Mes dispos</button>
          <button className="icon-btn show-xs edit-top" onClick={() => setEditing(true)} aria-label="Modifier mes dispos" title="Mes dispos"><Pencil size={20} /></button>
          <span className="hide-xs"><ChatButton list={chatList} onClick={() => setChat('')} /></span>
          <button className="icon-btn hide-xs" onClick={share} title="Partager le lien"><Share2 size={20} /></button>
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
                <button onClick={() => { share(); setMenu(false); }}><Share2 size={16} /> Partager le lien du site</button>
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
        {!formationsOf(me).length && (
          <div className="al-card missing-form">
            <div className="grow">
              <b>Indique ta formation DAEU</b>
              <p className="muted tiny">Pour recevoir les sondages et séances de ta formation.</p>
              <div className="row-btns">
                {Object.entries(FORMATIONS).map(([k, v]) => (
                  <button key={k} className="btn small" style={{ color: v.color }} onClick={async () => {
                    await updateParticipant(me.id, { formations: [k], formation: k });
                    logAction('participant_update', `${me.prenom} ${me.nom}`, `${me.prenom} ${me.nom}`, { changes: [{ field: 'Formation', from: '—', to: v.label }] });
                    setCat(k); setToast(`Formation enregistrée : ${v.label}`);
                  }}>{v.short}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        <CatBar cat={cat} setCat={setCat} sub={sub} setSub={setSub} settings={settings} me={me} />

        <div className="stats-strip">
          <span><b>{catPeople.length}</b> inscrit{catPeople.length > 1 ? 's' : ''}</span>
          {filtered.length !== catPeople.length && <span><b>{filtered.length}</b> avec les filtres</span>}
          <span><b>{viewSessions.filter((s) => s.date >= isoDate(new Date()) && !s.cancelled).length}</b> séance(s) à venir</span>
          <span><b>{viewPolls.filter(isOpenPoll).length}</b> sondage(s) en cours</span>
        </div>

        <AlertsBar unread={chatList.filter((x) => x.unread).length} sessions={seeSessions} polls={seePolls} people={people} me={me} onSession={setSessionOpen} onGoPolls={goPolls} />

        {view !== 'seances' && (
          <Filters filters={filters} setFilters={setFilters} people={filtered} highlight={highlight} setHighlight={setHighlight} />
        )}

        {view === 'semaine' && <WeekView people={filtered} sessions={viewSessions} settings={settings}
          courseOf={cat !== 'all' ? { formation: cat, subjects: sub === 'all' ? null : [sub], label: 'cours' } : formationsOf(me).length ? { formation: formationsOf(me), subjects: me.subjects, label: 'tes cours' } : null} weekStart={weekStart} setWeekStart={setWeekStart}
          highlight={highlight} onCell={setCell} onSession={setSessionOpen} meId={me.id} />}
        {view === 'jours' && <DayView people={filtered} sessions={viewSessions} settings={settings} weekStart={weekStart} setWeekStart={setWeekStart}
          highlight={highlight} setHighlight={setHighlight} meId={me.id} onSession={setSessionOpen} />}
        {view === 'creneaux' && <BestSlots people={filtered} settings={settings} onPoll={pollFromSlot} onPlan={planFromSlot} meId={me.id} />}
        {view === 'seances' && <PollsView polls={viewPolls} sessions={viewSessions} people={people} me={me} isAdmin={false} settings={settings}
          onSession={setSessionOpen} openPollForm={(p) => setPollForm({ initial: p })} openSessionForm={(s) => setSessionForm({ initial: s })} />}
        {view === 'gens' && <PeopleView people={filtered} meId={me.id} highlight={highlight} setHighlight={setHighlight} />}
      </main>


      {editing && <DispoForm existing={me} people={people} onClose={() => setEditing(false)}
        onSaved={(id, deleted) => { setEditing(false); if (deleted) { ls.del('ge_pid'); setPid(null); } else setToast('Dispos mises à jour ✓'); }} />}
      {cell && <CellSheet cell={cell} people={filtered} settings={settings} meId={me.id} onClose={() => setCell(null)}
        onPlan={(x) => { setCell(null); planFromSlot(x); }} />}
      {chat === null && <ChatFab list={chatList} onClick={() => setChat('')} />}
      {chat !== null && me && <ChatPanel initialConv={chat} list={chatList} people={people} me={me} onClose={() => setChat(null)} onSession={(s) => { setChat(null); setView('seances'); setSessionOpen(s); }} />}
      {sessionOpen && (() => {
        const live = sessions.find((s) => s.id === sessionOpen.id);
        if (!live) return null;
        return <SessionSheet s={live} people={people} me={me} polls={polls || []} isAdmin={false} onClose={() => setSessionOpen(null)}
          onEdit={() => { setSessionForm({ initial: live }); setSessionOpen(null); }} />;
      })()}
      {pollForm && <PollForm initial={pollForm.initial} prefill={pollForm.prefill} people={people} me={me} settings={settings} defaultAudience={cat !== 'all' ? [cat] : []} defaultSubject={sub !== 'all' ? sub : ''}
        onClose={() => { setPollForm(null); setView('seances'); }} />}
      {sessionForm && <SessionForm initial={sessionForm.initial} prefill={sessionForm.prefill} people={people} me={me} settings={settings} defaultAudience={cat !== 'all' ? [cat] : []} defaultSubject={sub !== 'all' ? sub : ''}
        onClose={() => setSessionForm(null)} />}
      {needsFormationPrompt(me) && !promptDone ? (
        <FormationPrompt me={me} onDone={(f) => { setPromptDone(true); if (f) { setCat(f); setToast(`C'est noté : ${FORMATIONS[f].label}`); } }} />
      ) : <AlertsPopup skip={deepLinked} unread={chatList.filter((x) => x.unread).length} sessions={seeSessions} polls={seePolls} people={people} me={me} onSession={setSessionOpen} onGoPolls={goPolls} />}
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
