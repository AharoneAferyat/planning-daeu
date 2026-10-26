import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, History, Pencil, Search, Trash2, UserPlus } from 'lucide-react';
import { LOG_TYPES } from '../constants';
import { deleteParticipant, mergeParticipants } from '../data';
import { daysCount, duplicatePairs, fmtDate, fmtDur, normName, timeAgo, totalMinutes } from '../utils';
import DispoForm from '../components/DispoForm';
import { Avatar, ConfirmButton, Modal, PersonBadges } from '../components/ui';

export default function AdminParticipants({ people, logs, polls, sessions, settings }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('nom');
  const [edit, setEdit] = useState(null); // participant | 'new'
  const [merge, setMerge] = useState(null);
  const [histo, setHisto] = useState(null);
  const dups = useMemo(() => duplicatePairs(people), [people]);

  const list = useMemo(() => {
    const n = normName(q);
    const r = people.filter((p) => !n || normName(`${p.prenom}${p.nom}${p.viaCode || ''}`).includes(n));
    const t = (x) => x?.toMillis?.() || 0;
    if (sort === 'maj') r.sort((a, b) => t(b.updatedAt) - t(a.updatedAt));
    if (sort === 'inscr') r.sort((a, b) => t(b.createdAt) - t(a.createdAt));
    if (sort === 'heures') r.sort((a, b) => totalMinutes(b) - totalMinutes(a));
    return r;
  }, [people, q, sort]);

  const stats = (p) => ({
    votes: polls.filter((x) => x.votes?.[p.id]).length,
    seances: sessions.filter((s) => (s.attendees || []).includes(p.id)).length,
    modifs: logs.filter((l) => l.type === 'participant_update' && l.target === `${p.prenom} ${p.nom || ''}`.trim()).length,
  });

  return (
    <div>
      {dups.length > 0 && (
        <div className="card dup-card">
          <h4 className="card-title"><AlertTriangle size={17} /> Doublons possibles</h4>
          {dups.map(({ a, b, kind }) => (
            <div key={a.id + b.id} className="dup-row">
              <span className="who-chip"><Avatar p={a} size={22} />{a.prenom} {a.nom}</span>
              <span className={'pill ' + (kind === 'exact' ? 'bad' : 'warn')}>{kind === 'exact' ? 'identiques' : 'ressemblants'}</span>
              <span className="who-chip"><Avatar p={b} size={22} />{b.prenom} {b.nom}</span>
              <button className="btn small" onClick={() => setMerge({ a, b })}><ArrowRightLeft size={15} /> Fusionner</button>
            </div>
          ))}
          <p className="muted tiny">Si ce sont bien deux personnes différentes, ignore simplement l'alerte.</p>
        </div>
      )}

      <div className="toolbar">
        <div className="search grow"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, code…)" /></div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="nom">Tri : nom</option>
          <option value="maj">Tri : dernière modif</option>
          <option value="inscr">Tri : inscription</option>
          <option value="heures">Tri : heures dispo</option>
        </select>
        <button className="btn primary" onClick={() => setEdit('new')}><UserPlus size={16} /> Ajouter</button>
      </div>

      <div className="admin-list">
        {list.map((p) => {
          const st = stats(p);
          return (
            <div key={p.id} className="card arow">
              <div className="arow-main">
                <Avatar p={p} size={40} />
                <div className="grow">
                  <b>{p.prenom} {p.nom}</b>
                  <PersonBadges p={p} compact />
                  {p.note && <div className="muted tiny">« {p.note} »</div>}
                </div>
                <div className="arow-actions">
                  <button className="icon-btn" title="Historique" onClick={() => setHisto(p)}><History size={18} /></button>
                  <button className="icon-btn" title="Modifier" onClick={() => setEdit(p)}><Pencil size={18} /></button>
                  <ConfirmButton className="icon-btn danger" confirmText="Sûr ?" onConfirm={() => deleteParticipant(p, 'Admin')}><Trash2 size={18} /></ConfirmButton>
                </div>
              </div>
              <div className="meta-grid">
                <span><em>Code perso (PIN)</em><b className="mono">{p.pin || '—'}</b></span>
                <span><em>Dispo</em>{daysCount(p)} j · {fmtDur(totalMinutes(p))}/sem</span>
                <span><em>Inscrit</em>{fmtDate(p.createdAt, false)}{p.createdByAdmin ? ' (admin)' : ''}</span>
                <span><em>Dernière modif</em>{timeAgo(p.updatedAt)} · {p.updates || 0} modif(s)</span>
                <span><em>Dernière visite</em>{timeAgo(p.lastSeenAt) || '—'}</span>
                <span><em>Via le code</em><b className="mono">{p.viaCode || '—'}</b></span>
                <span><em>Sondages votés</em>{st.votes}</span>
                <span><em>Séances</em>{st.seances}</span>
              </div>
            </div>
          );
        })}
        {!list.length && <p className="muted">Aucun participant.</p>}
      </div>

      {edit && <DispoForm admin settings={settings} existing={edit === 'new' ? null : edit} people={people} onClose={() => setEdit(null)} onSaved={() => setEdit(null)} />}
      {merge && <MergeModal {...merge} onClose={() => setMerge(null)} />}
      {histo && <HistoModal p={histo} logs={logs} onClose={() => setHisto(null)} />}
    </div>
  );
}

function MergeModal({ a, b, onClose }) {
  const [keep, setKeep] = useState(a.id);
  const [busy, setBusy] = useState(false);
  const target = keep === a.id ? a : b, source = keep === a.id ? b : a;
  return (
    <Modal title="Fusionner deux fiches" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await mergeParticipants(target, source); onClose(); }}>Fusionner</button></>}>
      <p className="muted">Quelle fiche garder ? L'autre sera supprimée. Les créneaux sont réunis, les votes et inscriptions aux séances sont transférés.</p>
      <div className="radio-list">
        {[a, b].map((p) => (
          <label key={p.id} className={'radio' + (keep === p.id ? ' on' : '')}>
            <input type="radio" checked={keep === p.id} onChange={() => setKeep(p.id)} />
            <Avatar p={p} size={28} />
            <span className="grow"><b>{p.prenom} {p.nom}</b><br /><span className="muted tiny">maj {timeAgo(p.updatedAt)} · code {p.pin}</span></span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function HistoModal({ p, logs, onClose }) {
  const full = `${p.prenom} ${p.nom || ''}`.trim();
  const mine = logs.filter((l) => l.actor === full || l.target === full);
  return (
    <Modal wide title={`Historique · ${full}`} onClose={onClose}>
      {mine.length === 0 ? <p className="muted">Rien dans l'historique récent.</p> : mine.map((l) => (
        <div key={l.id} className="log-row">
          <div className="log-head">
            <span className="pill">{LOG_TYPES[l.type] || l.type}</span>
            <span className="grow">{l.actor}{l.target && l.target !== l.actor ? ` → ${l.target}` : ''}</span>
            <span className="muted tiny">{fmtDate(l.at)}</span>
          </div>
          {Array.isArray(l.details?.changes) && (
            <ul className="changes">{l.details.changes.map((c, i) => <li key={i}><b>{c.field}</b> : <s>{c.from}</s> → {c.to}</li>)}</ul>
          )}
        </div>
      ))}
    </Modal>
  );
}
