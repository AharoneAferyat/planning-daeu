import { useState } from 'react';
import { AlertTriangle, Brush, Download, KeyRound, Save } from 'lucide-react';
import { cleanupMonths, cleanupOn, oldItems, runCleanup } from '../cleanup';
import { DAYS_SHORT, DISTANCES, FORMATS } from '../constants';
import { exportBackup, log, saveSettings, wipeCollection } from '../data';
import { download, fmt, fmtDate, hashPin, momentsLabel, totalMinutes, fmtDur } from '../utils';
import { ConfirmButton, Toast } from '../components/ui';
import ScheduleEditor from './ScheduleEditor';
import { PeoplePick } from '../components/Circles';
import { formationsLabel } from '../formations';

export default function AdminSettings({ settings, people, polls, sessions }) {
  const [appTitle, setAppTitle] = useState(settings.appTitle);
  const [welcome, setWelcome] = useState(settings.welcome);
  const [requireCode, setRequireCode] = useState(settings.requireCode);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');
  const months = cleanupMonths(settings);
  const old = oldItems(polls, sessions, months);
  const setCleanup = (data, details) => saveSettings(data, details).then(() => setToast('Réglage enregistré'));

  const saveGeneral = async () => {
    const changes = {};
    if (appTitle !== settings.appTitle) changes.titre = appTitle;
    if (welcome !== settings.welcome) changes.accueil = welcome;
    if (requireCode !== settings.requireCode) changes.codeObligatoire = requireCode ? 'oui' : 'non';
    await saveSettings({ appTitle: appTitle.trim() || "Groupes d'étude", welcome: welcome.trim(), requireCode }, changes);
    setToast('Réglages enregistrés');
  };

  const savePin = async () => {
    setErr('');
    if (pin1.length < 4) return setErr('Le PIN doit faire au moins 4 caractères.');
    if (pin1 !== pin2) return setErr('Les deux PIN ne correspondent pas.');
    await saveSettings({ adminPinHash: await hashPin(pin1) }, { pin: 'modifié' });
    setPin1(''); setPin2(''); setToast('PIN admin modifié');
  };

  const exportJson = async () => { await exportBackup(); setToast('Sauvegarde téléchargée'); };

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Prénom', 'Nom', 'Formation', 'Matières', 'Fréquence', 'Moment', 'Format', 'Déplacement', 'Heures/sem', ...DAYS_SHORT, 'Note', 'Inscrit le', 'Modifié le', 'Via code'];
    const rows = [head.join(';')];
    for (const p of people) {
      const days = DAYS_SHORT.map((_, d) => (p.slots || []).filter((s) => s.d === d).map((s) => `${fmt(s.s)}-${fmt(s.e)}`).join(' '));
      rows.push([p.prenom, p.nom, formationsLabel(p, false), (p.subjects || []).join(', ') || 'toutes', p.freq, momentsLabel(p), FORMATS[p.format]?.short,
        p.format === 'visio' ? '' : DISTANCES[p.distance]?.label, fmtDur(totalMinutes(p)), ...days, p.note,
        fmtDate(p.createdAt), fmtDate(p.updatedAt), p.viaCode].map(esc).join(';'));
    }
    download(`participants-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + rows.join('\n'), 'text/csv;charset=utf-8');
  };

  const wipe = async (what) => {
    const names = what === 'all' ? ['participants', 'polls', 'sessions'] : [what];
    for (const n of names) await wipeCollection(n);
    await log('data_reset', 'Admin', names.join(', '));
    setToast('Données supprimées');
  };

  return (
    <div className="settings">
      <ScheduleEditor settings={settings} onSaved={setToast} />
      <div className="card">
        <h4 className="card-title">Général</h4>
        <label className="field"><span>Nom du site</span><input value={appTitle} onChange={(e) => setAppTitle(e.target.value)} maxLength={40} /></label>
        <label className="field"><span>Message d'accueil</span><textarea rows={2} value={welcome} onChange={(e) => setWelcome(e.target.value)} maxLength={300} /></label>
        <label className="switch">
          <input type="checkbox" checked={requireCode} onChange={(e) => setRequireCode(e.target.checked)} />
          <span><b>Code d'invitation obligatoire</b><br /><small className="muted">Désactivé : n'importe qui ayant l'adresse du site peut entrer (nom + prénom restent obligatoires).</small></span>
        </label>
        <button className="btn primary" onClick={saveGeneral}><Save size={16} /> Enregistrer</button>
      </div>

      <div className="card">
        <h4 className="card-title">📍 Accès avancé : spots, cercles, invitations</h4>
        <p className="muted tiny">Ces personnes ont en plus : le bouton « Spots » et le choix d’un spot dans un sondage ou une séance (infos importantes pré-remplies), « Mes cercles », et l’option « Qui peut voir : sur invitation ». Pour les autres, les sondages et séances se créent exactement comme avant.</p>
        <PeoplePick people={people} value={settings.spotPickers || []} onChange={(v) => saveSettings({ spotPickers: v }, { spots: `${v.length} personne(s)` }).then(() => setToast('Réglage enregistré'))} />
        <label className="field"><span>Lien du Google Sheet des spots</span>
          <input defaultValue={settings.spotsSheet || ''} onBlur={(e) => { if (e.target.value !== (settings.spotsSheet || '')) saveSettings({ spotsSheet: e.target.value.trim() }, { googleSheet: 'modifié' }).then(() => setToast('Lien enregistré')); }} placeholder="https://docs.google.com/spreadsheets/d/…" />
          <small className="muted">Partagé « Tous les utilisateurs disposant du lien » (lecture suffit). Le site se synchronise tout seul toutes les 15 min environ.</small>
        </label>
      </div>
      <div className="card">
        <h4 className="card-title"><Brush size={17} /> Ménage automatique</h4>
        <label className="switch">
          <input type="checkbox" checked={cleanupOn(settings)} onChange={(e) => setCleanup({ autoCleanup: e.target.checked }, { menageAuto: e.target.checked ? 'activé' : 'désactivé' })} />
          <span><b>Supprimer automatiquement ce qui est vieux</b><br />
            <small className="muted">Les séances (faites ou annulées) et les sondages dont toutes les dates sont passées depuis plus de :</small></span>
        </label>
        <div className="chips">
          {[1, 2, 3, 6, 12].map((m) => (
            <button key={m} className={'chip' + (m === months ? ' on' : '')} disabled={!cleanupOn(settings)}
              onClick={() => setCleanup({ cleanupMonths: m }, { menageApres: `${m} mois` })}>{m} mois</button>
          ))}
        </div>
        <p className="muted tiny">Le ménage se fait tout seul quand quelqu'un ouvre le site (une fois par jour). Les commentaires des sondages partent avec eux. L'historique garde la liste de ce qui a été supprimé. Pense à faire une sauvegarde de temps en temps (plus bas).</p>
        <p className="test-preview">
          {old.sessions.length + old.polls.length === 0 ? 'Rien à supprimer pour le moment.'
            : <>À supprimer maintenant : <b>{old.sessions.length}</b> séance(s) et <b>{old.polls.length}</b> sondage(s) de plus de {months} mois.</>}
        </p>
        {old.sessions.length + old.polls.length > 0 && (
          <ConfirmButton className="btn ghost" confirmText={`Supprimer ${old.sessions.length} séance(s) et ${old.polls.length} sondage(s) ?`}
            onConfirm={async () => { const r = await runCleanup(polls, sessions, months, 'Admin'); setToast(`${r.sessions.length} séance(s) et ${r.polls.length} sondage(s) supprimés`); }}>
            <Brush size={15} /> Faire le ménage maintenant
          </ConfirmButton>
        )}
      </div>

      <div className="card">
        <h4 className="card-title"><KeyRound size={17} /> PIN admin</h4>
        <div className="grid2">
          <label className="field"><span>Nouveau PIN</span><input type="password" value={pin1} onChange={(e) => setPin1(e.target.value)} /></label>
          <label className="field"><span>Confirmer</span><input type="password" value={pin2} onChange={(e) => setPin2(e.target.value)} /></label>
        </div>
        {err && <p className="err">{err}</p>}
        <button className="btn" onClick={savePin}>Changer le PIN</button>
      </div>

      <div className="card">
        <h4 className="card-title"><Download size={17} /> Exports</h4>
        <div className="row-btns">
          <button className="btn" onClick={exportCsv}>Participants (Excel / CSV)</button>
          <button className="btn" onClick={exportJson}>Sauvegarde complète (JSON)</button>
        </div>
      </div>

      <div className="card danger-zone">
        <h4 className="card-title"><AlertTriangle size={17} /> Zone sensible</h4>
        <p className="muted tiny">Irréversible. Pense à faire une sauvegarde JSON avant.</p>
        <div className="row-btns">
          <ConfirmButton confirmText="Supprimer tous les participants ?" onConfirm={() => wipe('participants')}>Supprimer les participants</ConfirmButton>
          <ConfirmButton confirmText="Supprimer sondages ?" onConfirm={() => wipe('polls')}>Supprimer les sondages</ConfirmButton>
          <ConfirmButton confirmText="Supprimer séances ?" onConfirm={() => wipe('sessions')}>Supprimer les séances</ConfirmButton>
          <ConfirmButton confirmText="Tout remettre à zéro ?" onConfirm={() => wipe('all')}>Tout remettre à zéro</ConfirmButton>
        </div>
      </div>
      <Toast text={toast} onDone={() => setToast('')} />
    </div>
  );
}
