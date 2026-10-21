import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarHeart, KeyRound, Search, UserPlus } from 'lucide-react';
import { checkInvite, consumeInvite, log, touchParticipant } from '../data';
import { ls, normName } from '../utils';
import { Avatar, Modal } from './ui';

export function Brand({ title }) {
  return (
    <div className="brand-big">
      <span className="logo-lg"><CalendarHeart size={30} /></span>
      <h1>{title}</h1>
    </div>
  );
}

// ---------- Écran 1 : code d'invitation ----------
export function Gate({ settings, onAccess }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);

  const submit = async (c) => {
    const value = (c ?? code).trim().toUpperCase();
    setBusy(true); setErr('');
    try {
      const r = await checkInvite(value);
      if (!r.ok) {
        setErr(r.reason);
        log('invite_refused', 'Visiteur', value, { raison: r.reason });
      } else {
        await consumeInvite(value);
        ls.set('ge_code', value);
        onAccess(value);
      }
    } catch (e) { setErr('Connexion impossible : ' + e.message); }
    setBusy(false);
  };

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('code');
    if (p && !tried.current) { tried.current = true; setCode(p.toUpperCase()); submit(p); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="center-screen gate">
      <div className="gate-card">
        <Brand title={settings.appTitle} />
        <p className="muted">{settings.welcome}</p>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="lbl">Code d'invitation</label>
          <div className="code-input">
            <KeyRound size={18} />
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="EX : K7P2QX"
              autoCapitalize="characters" autoComplete="off" spellCheck="false" maxLength={20} />
          </div>
          {err && <p className="err">{err}</p>}
          <button className="btn primary block" disabled={busy || !code.trim()}>
            {busy ? 'Vérification…' : <>Entrer <ArrowRight size={18} /></>}
          </button>
        </form>
        <p className="tiny muted">Pas de code ? Demande le lien ou le QR code à l'organisateur.</p>
      </div>
      <a className="admin-link" href="/admin">Admin</a>
    </div>
  );
}

// ---------- Écran 2 : qui es-tu ? ----------
export function Identity({ settings, people, onLogin, onNew }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const list = useMemo(() => {
    const n = normName(q);
    return people.filter((p) => !n || normName(`${p.prenom}${p.nom}`).includes(n) || normName(`${p.nom}${p.prenom}`).includes(n));
  }, [q, people]);

  return (
    <div className="center-screen gate">
      <div className="gate-card wide">
        <Brand title={settings.appTitle} />
        <h2 className="h2c">Qui es-tu ?</h2>
        <button className="btn primary block" onClick={onNew}><UserPlus size={18} /> Je suis nouveau / nouvelle</button>
        {people.length > 0 && (
          <>
            <div className="sep"><span>ou je suis déjà inscrit(e)</span></div>
            <div className="search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cherche ton nom…" />
            </div>
            <div className="who-list">
              {list.map((p) => (
                <button key={p.id} className="who" onClick={() => setPick(p)}>
                  <Avatar p={p} size={34} />
                  <span>{p.prenom} <b>{p.nom}</b></span>
                </button>
              ))}
              {!list.length && <p className="muted tiny">Personne ne correspond. Si tu n'es pas inscrit(e), clique sur « Je suis nouveau ».</p>}
            </div>
          </>
        )}
      </div>
      <a className="admin-link" href="/admin">Admin</a>
      {pick && <PinModal p={pick} onClose={() => setPick(null)} onOk={() => onLogin(pick.id)} />}
    </div>
  );
}

export function PinModal({ p, onClose, onOk }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const check = (v) => {
    if (v.length < 4) return;
    if (v === String(p.pin)) {
      ls.set('ge_pid', p.id);
      touchParticipant(p.id);
      log('participant_login', `${p.prenom} ${p.nom || ''}`.trim(), '', {});
      onOk();
    } else {
      setErr('Code incorrect. En cas d’oubli, demande à l’admin.');
      setPin('');
      log('participant_login_fail', `${p.prenom} ${p.nom || ''}`.trim(), '', {});
    }
  };
  return (
    <Modal title={`Salut ${p.prenom} !`} onClose={onClose}>
      <p className="muted">Entre ton code perso à 4 chiffres.</p>
      <PinInput value={pin} onChange={(v) => { setPin(v); setErr(''); check(v); }} autoFocus />
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

export function PinInput({ value, onChange, autoFocus }) {
  return (
    <input className="pin-input" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoFocus={autoFocus}
      value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
  );
}
