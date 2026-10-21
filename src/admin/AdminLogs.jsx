import { useMemo, useState } from 'react';
import { Download, History, Search, Trash2 } from 'lucide-react';
import { LOG_TYPES } from '../constants';
import { wipeCollection, log } from '../data';
import { download, fmtDate, normName, timeAgo } from '../utils';
import { ConfirmButton, Empty } from '../components/ui';

const GROUPS = {
  all: { label: 'Tout', test: () => true },
  people: { label: 'Participants', test: (t) => t.startsWith('participant_') },
  polls: { label: 'Sondages & séances', test: (t) => t.startsWith('poll_') || t.startsWith('session_') },
  codes: { label: 'Codes', test: (t) => t.startsWith('invite_') },
  admin: { label: 'Admin', test: (t) => t.startsWith('admin_') || t.startsWith('settings') || t.startsWith('data_') },
};

function Details({ d }) {
  if (!d || !Object.keys(d).length) return null;
  if (Array.isArray(d.changes)) {
    return <ul className="changes">{d.changes.map((c, i) => <li key={i}><b>{c.field}</b> : <s>{c.from}</s> → {c.to}</li>)}</ul>;
  }
  return (
    <ul className="changes">
      {Object.entries(d).map(([k, v]) => (
        <li key={k}><b>{k}</b> : {Array.isArray(v) ? v.join(' · ') : v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
      ))}
    </ul>
  );
}

export default function AdminLogs({ logs }) {
  const [group, setGroup] = useState('all');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = normName(q);
    return logs.filter((l) => GROUPS[group].test(l.type || '')
      && (!n || normName(`${l.actor}${l.target}${LOG_TYPES[l.type] || ''}${JSON.stringify(l.details || {})}`).includes(n)));
  }, [logs, group, q]);

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Date', 'Action', 'Qui', 'Cible', 'Détails', 'Appareil'].join(';')];
    for (const l of list) rows.push([fmtDate(l.at), LOG_TYPES[l.type] || l.type, l.actor, l.target, JSON.stringify(l.details || {}), l.ua].map(esc).join(';'));
    download(`historique-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + rows.join('\n'), 'text/csv;charset=utf-8');
  };

  return (
    <div>
      <div className="toolbar">
        <div className="chips">
          {Object.entries(GROUPS).map(([k, v]) => <button key={k} className={'chip' + (group === k ? ' on' : '')} onClick={() => setGroup(k)}>{v.label}</button>)}
        </div>
        <div className="search grow"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
        <button className="btn small" onClick={exportCsv}><Download size={15} /> CSV</button>
        <ConfirmButton className="btn small danger ghost" confirmText="Vider l’historique ?" onConfirm={async () => { await wipeCollection('logs'); await log('data_reset', 'Admin', 'historique'); }}>
          <Trash2 size={15} /> Vider
        </ConfirmButton>
      </div>
      <p className="muted tiny">{list.length} entrée(s) affichée(s) — les 600 plus récentes sont chargées.</p>
      {list.length === 0 ? <div className="card"><Empty icon={History} title="Rien à afficher" /></div> : (
        <div className="card log-list">
          {list.map((l) => (
            <div key={l.id} className={'log-row t-' + (l.type || '').split('_')[0]}>
              <div className="log-head">
                <span className="pill">{LOG_TYPES[l.type] || l.type}</span>
                <span className="grow"><b>{l.actor}</b>{l.target && l.target !== l.actor ? <> → {l.target}</> : ''}</span>
                <span className="muted tiny" title={fmtDate(l.at)}>{timeAgo(l.at)}</span>
              </div>
              <Details d={l.details} />
              <div className="muted tiny">{fmtDate(l.at)} · {l.ua}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
