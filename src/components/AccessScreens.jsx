import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarHeart, KeyRound, Search, UserPlus } from 'lucide-react';
import { checkInvite, consumeInvite, forgotPin, log, setParticipantPin, touchParticipant } from '../data';
import { checkPin, ls, normName } from '../utils';
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
  const [forgot, setForgot] = useState(false);
  const [mustChange, setMustChange] = useState(false);
  const [np1, setNp1] = useState('');
  const [np2, setNp2] = useState('');
  const check = async (v) => {
    if (v.length < 4) return;
    if (await checkPin(p, v)) {
      // Code temporaire donné par l'admin : expiré, ou à remplacer tout de suite
      if (p.pinTemp && p.pinTempUntil && Date.now() > p.pinTempUntil) { setErr('Ce code temporaire a expiré : redemande un code à l’admin.'); setPin(''); return; }
      if (p.pinTemp) { setMustChange(true); return; }
      // Ancien code encore en clair : on le remplace par son empreinte
      if (!p.pinHash && p.pin != null) setParticipantPin(p.id, v).catch(() => {});
      ls.set('ge_pid', p.id);
      touchParticipant(p.id);
      log('participant_login', `${p.prenom} ${p.nom || ''}`.trim(), '', {});
      onOk();
    } else {
      setErr('Code incorrect.');
      setPin('');
      log('participant_login_fail', `${p.prenom} ${p.nom || ''}`.trim(), '', {});
    }
  };
  if (forgot) return <ForgotPin p={p} onBack={() => setForgot(false)} onClose={onClose} />;
  if (mustChange) {
    return (
      <Modal title="Choisis ton nouveau code">
        <p className="muted">Tu t’es connecté(e) avec un <b>code temporaire</b>. Choisis maintenant ton code perso à 4 chiffres (garde-le bien !).</p>
        <label className="field"><span>Nouveau code</span><PinInput value={np1} onChange={(v) => { setNp1(v); setErr(''); }} autoFocus /></label>
        <label className="field"><span>Confirme-le</span><PinInput value={np2} onChange={(v) => { setNp2(v); setErr(''); }} /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn primary wide-btn" disabled={np1.length < 4 || np2.length < 4} onClick={async () => {
          if (np1 !== np2) { setErr('Les deux codes ne correspondent pas.'); return; }
          await setParticipantPin(p.id, np1);
          await log('participant_update', `${p.prenom} ${p.nom || ''}`.trim(), `${p.prenom} ${p.nom || ''}`.trim(), { changes: [{ field: 'Code perso', from: 'temporaire', to: 'nouveau code choisi' }] });
          ls.set('ge_pid', p.id); touchParticipant(p.id);
          onOk();
        }}>Enregistrer et entrer</button>
      </Modal>
    );
  }
  return (
    <Modal title={`Salut ${p.prenom} !`} onClose={onClose}>
      <p className="muted">Entre ton code perso à 4 chiffres.</p>
      <PinInput value={pin} onChange={(v) => { setPin(v); setErr(''); check(v); }} autoFocus />
      {err && <p className="err">{err}</p>}
      <button className="link tiny forgot-link" onClick={() => setForgot(true)}>Code oublié ?</button>
    </Modal>
  );
}

// Code oublié : on laisse son numéro, l'admin renvoie le code
function ForgotPin({ p, onBack, onClose }) {
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const ok = phone.replace(/\D/g, '').length >= 8;
  if (done) {
    return (
      <Modal title="C’est envoyé 👍" onClose={onClose} footer={<button className="btn primary grow" onClick={onClose}>OK</button>}>
        <p>L’admin a reçu ta demande et va te recontacter au <b>{phone}</b> avec un code temporaire.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Code oublié" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onBack}>Retour</button><button className="btn primary grow" disabled={!ok || busy} onClick={async () => { setBusy(true); await forgotPin(p, phone, note); setBusy(false); setDone(true); }}>Envoyer à l’admin</button></>}>
      <p className="muted">Pas de souci : laisse ton numéro, l’admin te recontactera avec un <b>code temporaire</b>. À ta connexion, tu choisiras ton nouveau code.</p>
      <label className="field"><span>Nom</span><input value={`${p.prenom} ${p.nom || ''}`.trim()} disabled /></label>
      <label className="field"><span>Ton numéro de téléphone *</span><input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" autoFocus /></label>
      <label className="field"><span>Un mot (facultatif)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ex : plutôt par SMS" /></label>
      <p className="muted tiny">Ton numéro n’est visible que par l’admin, et il peut être supprimé une fois le code renvoyé.</p>
    </Modal>
  );
}

export function PinInput({ value, onChange, autoFocus }) {
  return (
    <input className="pin-input" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoFocus={autoFocus}
      value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
  );
}
