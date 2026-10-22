import { useState } from 'react';
import { CalendarRange, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { DAYS } from '../constants';
import { saveSettings } from '../data';
import { DEFAULT_HOLIDAYS, DEFAULT_SCHEDULES, FORMATIONS, holidaysOf, schedulesOf, SUBJECTS } from '../formations';
import { toHHMM, toMin } from '../utils';
import { ConfirmButton } from '../components/ui';

const toRows = (list) => list.map((c) => ({ ...c, sh: toHHMM(c.s), eh: toHHMM(c.e), from: c.from || '', to: c.to || '' }));

// Emplois du temps par formation + vacances communes
export default function ScheduleEditor({ settings, onSaved }) {
  const [tab, setTab] = useState('jour');
  const [sched, setSched] = useState(() => Object.fromEntries(Object.entries(schedulesOf(settings)).map(([k, v]) => [k, toRows(v)])));
  const [hols, setHols] = useState(() => holidaysOf(settings).map((h) => ({ ...h })));
  const [err, setErr] = useState('');

  const rows = sched[tab] || [];
  const setRow = (i, k, v) => setSched({ ...sched, [tab]: rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const addRow = () => setSched({ ...sched, [tab]: [...rows, { d: 1, sh: '17:30', eh: '20:30', subject: 'maths', from: '', to: '' }] });

  const save = async () => {
    setErr('');
    const out = {};
    for (const [f, list] of Object.entries(sched)) {
      out[f] = [];
      for (const r of list) {
        const s = toMin(r.sh), e = toMin(r.eh);
        if (s === null || e === null || e <= s) return setErr(`${FORMATIONS[f].label} : horaire invalide le ${DAYS[r.d]}.`);
        out[f].push({ d: Number(r.d), s, e, subject: r.subject, ...(r.from ? { from: r.from } : {}), ...(r.to ? { to: r.to } : {}) });
      }
    }
    for (const h of hols) if (!h.from || !h.to || h.to <= h.from) return setErr(`Vacances « ${h.label} » : dates invalides.`);
    await saveSettings({ schedules: out, holidays: hols }, { emploiDuTemps: 'modifié', vacances: hols.map((h) => `${h.label} ${h.from}→${h.to}`) });
    onSaved?.('Emplois du temps enregistrés');
  };

  const reset = () => {
    setSched(Object.fromEntries(Object.entries(DEFAULT_SCHEDULES).map(([k, v]) => [k, toRows(v)])));
    setHols(DEFAULT_HOLIDAYS.map((h) => ({ ...h })));
  };

  return (
    <div className="card sched-editor">
      <h4 className="card-title"><CalendarRange size={17} /> Emplois du temps des cours</h4>
      <div className="seg">
        {Object.entries(FORMATIONS).map(([k, v]) => (
          <button key={k} className={'seg-b' + (tab === k ? ' on' : '')} style={{ '--c': v.color }} onClick={() => setTab(k)}>{v.short}</button>
        ))}
      </div>
      <div className="se-list">
        {rows.length === 0 && <p className="muted tiny">Aucun cours en présentiel pour cette formation.</p>}
        {rows.map((r, i) => (
          <div key={i} className="se-row">
            <select value={r.d} onChange={(e) => setRow(i, 'd', Number(e.target.value))}>
              {DAYS.map((n, d) => <option key={d} value={d}>{n}</option>)}
            </select>
            <select value={r.subject} onChange={(e) => setRow(i, 'subject', e.target.value)}>
              {Object.entries(SUBJECTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input type="time" step={900} value={r.sh} onChange={(e) => setRow(i, 'sh', e.target.value)} />
            <input type="time" step={900} value={r.eh} onChange={(e) => setRow(i, 'eh', e.target.value)} />
            <label className="se-date"><span>du</span><input type="date" value={r.from} onChange={(e) => setRow(i, 'from', e.target.value)} /></label>
            <label className="se-date"><span>au</span><input type="date" value={r.to} onChange={(e) => setRow(i, 'to', e.target.value)} /></label>
            <button className="icon-btn danger" onClick={() => setSched({ ...sched, [tab]: rows.filter((_, j) => j !== i) })} aria-label="Supprimer"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <button className="btn small" onClick={addRow}><Plus size={15} /> Ajouter un cours</button>
      <p className="muted tiny">Dates « du / au » facultatives (vides = toute l'année).</p>

      <h4 className="card-title se-hol-title">Vacances (communes à toutes les formations)</h4>
      <div className="se-list">
        {hols.map((h, i) => (
          <div key={i} className="se-row hol">
            <input value={h.label} onChange={(e) => setHols(hols.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Nom" />
            <label className="se-date"><span>du</span><input type="date" value={h.from} onChange={(e) => setHols(hols.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} /></label>
            <label className="se-date"><span>reprise le</span><input type="date" value={h.to} onChange={(e) => setHols(hols.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} /></label>
            <button className="icon-btn danger" onClick={() => setHols(hols.filter((_, j) => j !== i))} aria-label="Supprimer"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <button className="btn small" onClick={() => setHols([...hols, { label: 'Vacances', from: '', to: '' }])}><Plus size={15} /> Ajouter des vacances</button>
      <p className="muted tiny">Le départ a lieu après la classe : pas de cours du 1er jour jusqu'à la veille de la reprise.</p>

      {err && <p className="err">{err}</p>}
      <div className="row-btns">
        <button className="btn primary" onClick={save}><Save size={16} /> Enregistrer</button>
        <ConfirmButton className="btn ghost" confirmText="Remettre les horaires d'origine ?" onConfirm={reset}><RotateCcw size={15} /> Valeurs d'origine</ConfirmButton>
      </div>
    </div>
  );
}
