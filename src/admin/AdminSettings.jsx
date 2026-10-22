import { useState } from 'react';
import { AlertTriangle, Download, KeyRound, Save } from 'lucide-react';
import { DAYS_SHORT, DISTANCES, FORMATS } from '../constants';
import { fetchAll, log, saveSettings, wipeCollection } from '../data';
import { download, fmt, fmtDate, hashPin, momentsLabel, totalMinutes, fmtDur } from '../utils';
import { ConfirmButton, Toast } from '../components/ui';
import ScheduleEditor from './ScheduleEditor';

export default function AdminSettings({ settings, people }) {
  const [appTitle, setAppTitle] = useState(settings.appTitle);
  const [welcome, setWelcome] = useState(settings.welcome);
  const [requireCode, setRequireCode] = useState(settings.requireCode);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

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

  const exportJson = async () => {
    const all = {};
    for (const c of ['participants', 'invites', 'polls', 'sessions', 'logs']) all[c] = await fetchAll(c);
    download(`sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 2), 'application/json');
  };

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Prénom', 'Nom', 'Formation', 'Matières', 'Code perso', 'Fréquence', 'Moment', 'Format', 'Déplacement', 'Heures/sem', ...DAYS_SHORT, 'Note', 'Inscrit le', 'Modifié le', 'Via code'];
    const rows = [head.join(';')];
    for (const p of people) {
      const days = DAYS_SHORT.map((_, d) => (p.slots || []).filter((s) => s.d === d).map((s) => `${fmt(s.s)}-${fmt(s.e)}`).join(' '));
      rows.push([p.prenom, p.nom, p.formation || '', (p.subjects || []).join(', ') || 'toutes', p.pin, p.freq, momentsLabel(p), FORMATS[p.format]?.short,
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
