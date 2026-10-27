import { useEffect, useState } from 'react';
import { setCirclesStore } from '../privacy';
import { setSpotsStore } from '../spots';
import {
  ArrowLeft, CalendarCheck, FlaskConical, History, KeyRound, LayoutDashboard, LifeBuoy, LogOut, Settings, ShieldCheck, Ticket, UserCheck, Users,
} from 'lucide-react';
import { DEFAULT_ADMIN_PIN } from '../config';
import { exportBackup, log, ticketNewForAdmin, useCircles, useSpots, useInvites, useLogs, useParticipants, usePolls, useSessions, useSettings, useTickets } from '../data';
import AdminSupport from './AdminSupport';
import AdminAttendance from './AdminAttendance';
import { hashPin, ss } from '../utils';
import useTheme from '../useTheme';
import ThemeButton from '../components/ThemeButton';
import { Spinner } from '../components/ui';
import AdminDashboard from './AdminDashboard';
import AdminParticipants from './AdminParticipants';
import AdminInvites from './AdminInvites';
import AdminSessions from './AdminSessions';
import AdminLogs from './AdminLogs';
import AdminSettings from './AdminSettings';
import AdminTest from './AdminTest';

const TABS = [
  { key: 'dash', label: 'Tableau de bord', icon: LayoutDashboard },
  { key: 'people', label: 'Participants', icon: Users },
  { key: 'codes', label: 'Codes d’accès', icon: Ticket },
  { key: 'sessions', label: 'Séances & sondages', icon: CalendarCheck },
  { key: 'support', label: 'Support', icon: LifeBuoy },
  { key: 'attendance', label: 'Fiabilité', icon: UserCheck },
  { key: 'logs', label: 'Historique', icon: History },
  { key: 'test', label: 'Mode test', icon: FlaskConical },
  { key: 'settings', label: 'Réglages', icon: Settings },
];

export default function AdminApp() {
  const settings = useSettings();
  const [ok, setOk] = useState(() => ss.get('ge_admin') === '1');
  const [theme, cycleTheme] = useTheme();
  if (!settings) return <Spinner />;
  if (!ok) return <AdminLogin settings={settings} onOk={() => { ss.set('ge_admin', '1'); setOk(true); }} />;
  return <AdminShell settings={settings} theme={theme} cycleTheme={cycleTheme} onLogout={() => { ss.del('ge_admin'); setOk(false); }} />;
}

function AdminLogin({ settings, onOk }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const h = await hashPin(pin);
    const expected = settings.adminPinHash || (await hashPin(DEFAULT_ADMIN_PIN));
    if (h === expected) { await log('admin_login', 'Admin'); onOk(); }
    else { setErr('PIN incorrect'); setPin(''); log('admin_login_fail', 'Inconnu'); }
  };
  return (
    <div className="center-screen gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="brand-big"><span className="logo-lg"><ShieldCheck size={30} /></span><h1>Espace admin</h1></div>
        <label className="lbl">PIN admin</label>
        <div className="code-input"><KeyRound size={18} />
          <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus placeholder="••••" />
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn primary block" disabled={!pin}>Entrer</button>
        {!settings.adminPinHash && <p className="tiny muted">PIN par défaut : celui défini dans <code>src/config.js</code>. Change-le dans Réglages.</p>}
        <a className="link center" href="/"><ArrowLeft size={14} /> Retour au site</a>
      </form>
    </div>
  );
}

function AdminShell({ settings, theme, cycleTheme, onLogout }) {
  const [tab, setTab] = useState(() => ss.get('ge_admin_tab') || 'dash');
  const [exporting, setExporting] = useState(false);
  const [people] = useParticipants();
  const invites = useInvites();
  const polls = usePolls();
  const sessions = useSessions();
  const logs = useLogs(600);
  const tickets = useTickets();
  const circles = useCircles();
  const spots = useSpots();
  useEffect(() => { setCirclesStore(circles); }, [circles]);
  useEffect(() => { setSpotsStore(spots); }, [spots]);
  const go = (k) => { setTab(k); ss.set('ge_admin_tab', k); window.scrollTo(0, 0); };
  if (!people || !invites || !polls || !sessions || !logs) return <Spinner />;
  const data = { settings, people, invites, polls, sessions, logs, go, tickets };
  const supportNew = (tickets || []).filter(ticketNewForAdmin).length;

  return (
    <div className="app admin">
      <header className="topbar">
        <div className="brand"><span className="logo admin-logo"><ShieldCheck size={20} /></span><span className="brand-name">Admin · {settings.appTitle}</span></div>
        <div className="top-actions">
          <a className="btn small ghost" href="/"><ArrowLeft size={15} /> Le site</a>
          <ThemeButton mode={theme} cycle={cycleTheme} />
          <button className="icon-btn" onClick={onLogout} title="Déconnexion"><LogOut size={20} /></button>
        </div>
      </header>
      {!settings.adminPinHash && (
        <div className="banner warn">Tu utilises encore le PIN admin par défaut. <button className="link" onClick={() => go('settings')}>Le changer</button></div>
      )}
      {(!settings.lastExportAt || Date.now() - settings.lastExportAt > 7 * 86400000) && (
        <div className="banner backup">
          💾 <b>Sauvegarde de la semaine</b> · {settings.lastExportAt ? `dernière il y a ${Math.floor((Date.now() - settings.lastExportAt) / 86400000)} jours` : 'jamais faite'}
          <button className="btn small primary" disabled={exporting} onClick={async () => { setExporting(true); try { await exportBackup(); } finally { setExporting(false); } }}>{exporting ? 'Export…' : 'Exporter maintenant'}</button>
        </div>
      )}
      <nav className="tabs admin-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={'tab' + (tab === t.key ? ' on' : '')} onClick={() => go(t.key)}>
            <t.icon size={18} /><span>{t.label}</span>{t.key === 'support' && supportNew > 0 && <span className="tab-badge">{supportNew}</span>}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'dash' && <AdminDashboard {...data} />}
        {tab === 'people' && <AdminParticipants {...data} />}
        {tab === 'codes' && <AdminInvites {...data} />}
        {tab === 'sessions' && <AdminSessions {...data} />}
        {tab === 'support' && <AdminSupport {...data} />}
        {tab === 'attendance' && <AdminAttendance {...data} />}
        {tab === 'logs' && <AdminLogs {...data} />}
        {tab === 'test' && <AdminTest {...data} />}
        {tab === 'settings' && <AdminSettings {...data} />}
      </main>
    </div>
  );
}
