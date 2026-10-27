import { useMemo, useRef, useState } from 'react';
import { Copy, Download, FileSpreadsheet, Lock, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { deleteSpot, importSpots, saveSpot, syncSpotsFromSheet } from '../data';
import { AMBIANCES, canSeeSpot, canUseSpots, CONDITION_IDEAS, conditionsOf, DAY_KEYS, DAY_NAMES, mapsLink, PRICES, sortByStatus, SPOT_TYPES, spotsFromCsv, spotsToCsv, spotStatus, useSpotsStore } from '../spots';
import { privateLabel } from '../privacy';
import { download, isoDate, normName, timeAgo, toHHMM, toMin } from '../utils';
import { InvitePicker } from './Circles';
import { ConfirmButton, Modal, Toast } from './ui';

const ST_CLS = { open: 'ok', partial: 'warn', unknown: '', closed: 'bad' };
// Spots du Google Sheet : modifiés dans le tableau (l'admin règle seulement qui voit un spot « Privé »)
const canEditSpot = (spot, me) => me && (me.id === 'admin' || (!spot.fromSheet && spot.createdBy === me.id));

// ---------- Une carte de spot ----------
export function SpotCard({ spot, st, me, onEdit, onPick, picked, compact }) {
  const conds = conditionsOf(spot);
  const link = mapsLink(spot);
  const tags = [spot.type, spot.wifi && 'Wifi', spot.plugs && 'Prises', spot.ambiance, spot.capacity && `${spot.capacity} places`, spot.price, spot.booking && 'Sur réservation'].filter(Boolean);
  return (
    <div className={'spot-card' + (picked ? ' picked' : '') + (st ? ` st-${st.key}` : '')}>
      <div className="spot-top">
        <div className="grow">
          <b className="spot-name">{spot.name}</b>
          {st && <span className={'pill ' + ST_CLS[st.key]}>{st.label}</span>}
        </div>
        {onPick && <button type="button" className={'btn small ' + (picked ? '' : 'primary')} onClick={() => onPick(spot)}>{picked ? 'Choisi ✓' : 'Choisir'}</button>}
        {!onPick && canEditSpot(spot, me) && <button type="button" className="icon-btn" onClick={() => onEdit(spot)} aria-label="Modifier"><Pencil size={16} /></button>}
      </div>
      {spot.address && <a className="spot-addr" href={link} target="_blank" rel="noreferrer"><MapPin size={13} /> {spot.address}</a>}
      {!compact && tags.length > 0 && <div className="spot-tags">{tags.map((t) => <span key={t} className="spot-tag">{t}</span>)}</div>}
      {conds.length > 0 && <div className="spot-tags">{conds.map((c) => <span key={c} className="spot-cond">{c}</span>)}</div>}
      {!compact && spot.notes && <p className="muted tiny spot-notes">{spot.notes}</p>}
      {(spot.private || spot.fromSheet) && <div className="spot-tags">{spot.private && <span className="pill priv"><Lock size={11} /> {privateLabel(spot)}</span>}{spot.fromSheet && <span className="spot-tag sheet">Google Sheet</span>}</div>}
    </div>
  );
}

// ---------- Suggestion de spots pour un ou plusieurs créneaux (formulaires) ----------
export function SpotSuggest({ me, slots, settings, value, onPick }) {
  const spots = useSpotsStore().filter((s) => canSeeSpot(s, me));
  const [all, setAll] = useState(false);
  const rows = useMemo(() => sortByStatus(spots.map((spot) => {
    const sts = slots.filter((x) => x.date && x.s != null && x.e != null).map((x) => spotStatus(spot, x.date, x.s, x.e, settings));
    if (!sts.length) return { spot, st: { key: 'unknown', label: 'Choisis une date' } };
    if (sts.length === 1) return { spot, st: sts[0] };
    const n = sts.filter((x) => x.key === 'open').length;
    return { spot, st: { key: n === sts.length ? 'open' : n ? 'partial' : sts.some((x) => x.key === 'partial') ? 'partial' : 'closed', label: `Ouvert ${n}/${sts.length} dates` } };
  })), [spots, slots, settings]);
  if (!spots.length) return <p className="muted tiny">Aucun spot enregistré pour l’instant (onglet Séances → Spots).</p>;
  const good = rows.filter((r) => r.st.key !== 'closed');
  const shown = all ? rows : good.slice(0, 5);
  return (
    <div className="spot-suggest">
      {shown.map(({ spot, st }) => <SpotCard key={spot.id} spot={spot} st={st} me={me} compact picked={value === spot.id} onPick={onPick} />)}
      {!good.length && !all && <p className="muted tiny">Aucun spot ouvert sur ce créneau.</p>}
      {rows.length > shown.length && <button type="button" className="link tiny" onClick={() => setAll(true)}>Voir tous les spots ({rows.length})</button>}
    </div>
  );
}

// ---------- Formulaire d'un spot ----------
function SpotForm({ initial, me, people, onClose }) {
  const [s, setS] = useState(() => ({ name: '', type: '', address: '', maps: '', hours: {}, closed: '', closedHolidays: false, wifi: false, plugs: false, ambiance: '', conditions: '', capacity: '', booking: false, price: '', notes: '', private: false, invite: { ids: [], circles: [] }, ...initial }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const conds = conditionsOf(s);
  const toggleCond = (c) => set({ conditions: (conds.includes(c) ? conds.filter((x) => x !== c) : [...conds, c]).join(', ') });
  if (initial?.fromSheet) {
    return (
      <Modal title={s.name} onClose={onClose}
        footer={<><button className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary grow" disabled={busy} onClick={async () => { setBusy(true); await saveSpot({ ...initial, invite: s.invite }, me); setBusy(false); onClose(); }}>Enregistrer</button></>}>
        <p className="muted">Ce spot vient du <b>Google Sheet</b> : ses infos (horaires, adresse, conditions…) se modifient dans le tableau.</p>
        {initial.private ? (
          <>
            <p>Il est marqué <b>Privé</b> : choisis qui peut le voir.</p>
            <InvitePicker value={{ private: true, ...(s.invite || {}) }} onChange={(v) => set({ invite: { ids: v.ids, circles: v.circles } })} people={people} me={me} />
          </>
        ) : <p className="muted tiny">Pour le réserver à certaines personnes, mets « Privé » dans la colonne Visibilité du tableau.</p>}
      </Modal>
    );
  }
  const save = async () => {
    if (!s.name.trim()) return setErr('Donne un nom au spot.');
    if (s.private && !(s.invite?.ids?.length || s.invite?.circles?.length)) return setErr('Spot privé : choisis au moins une personne ou un cercle.');
    setBusy(true); await saveSpot(s, me); setBusy(false); onClose();
  };
  return (
    <Modal wide title={initial?.id ? 'Modifier le spot' : 'Nouveau spot'} onClose={onClose}
      footer={<>
        {initial?.id && <ConfirmButton className="btn ghost danger" confirmText="Supprimer ce spot ?" onConfirm={async () => { await deleteSpot(initial, me.id === 'admin' ? 'Admin' : `${me.prenom} ${me.nom || ''}`.trim()); onClose(); }}><Trash2 size={15} /></ConfirmButton>}
        <button className="btn ghost" onClick={onClose}>Annuler</button>
        <button className="btn primary grow" disabled={busy} onClick={save}>Enregistrer</button>
      </>}>
      <label className="field"><span>Nom *</span><input value={s.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="Ex : BU Sainte-Barbe" /></label>
      <div className="grid2">
        <label className="field"><span>Type</span><select value={s.type} onChange={(e) => set({ type: e.target.value })}><option value="">—</option>{SPOT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="field"><span>Places (environ)</span><input type="number" min="0" value={s.capacity || ''} onChange={(e) => set({ capacity: e.target.value })} /></label>
      </div>
      <label className="field"><span>Adresse</span><input value={s.address} onChange={(e) => set({ address: e.target.value })} placeholder="Rue, ville" /></label>
      <div className="field"><span>Horaires <small className="muted">(9h-22h · 9h-12h / 14h-19h · fermé · vide = inconnu)</small></span>
        <div className="spot-hours">
          {DAY_KEYS.map((d, i) => (
            <label key={d} className="spot-hour"><span>{DAY_NAMES[d].slice(0, 3)}.</span>
              <input value={s.hours?.[d] || ''} onChange={(e) => set({ hours: { ...s.hours, [d]: e.target.value } })} placeholder={i < 5 ? '9h-19h' : 'fermé'} />
            </label>
          ))}
        </div>
        <button type="button" className="link tiny" onClick={() => set({ hours: Object.fromEntries(DAY_KEYS.map((d) => [d, d >= 1 && d <= 5 ? (s.hours?.[1] || '') : (s.hours?.[d] || '')])) })}><Copy size={12} /> Copier les horaires du lundi sur toute la semaine</button>
      </div>
      <label className="field"><span>Fermé les <small className="muted">(25/12, 01/01, 20/12-03/01…)</small></span><input value={s.closed} onChange={(e) => set({ closed: e.target.value })} /></label>
      <label className="switch"><input type="checkbox" checked={!!s.closedHolidays} onChange={(e) => set({ closedHolidays: e.target.checked })} /><span>Fermé pendant les vacances scolaires</span></label>
      <div className="row-checks">
        <label className="switch"><input type="checkbox" checked={!!s.wifi} onChange={(e) => set({ wifi: e.target.checked })} /><span>Wifi</span></label>
        <label className="switch"><input type="checkbox" checked={!!s.plugs} onChange={(e) => set({ plugs: e.target.checked })} /><span>Prises</span></label>
        <label className="switch"><input type="checkbox" checked={!!s.booking} onChange={(e) => set({ booking: e.target.checked })} /><span>Sur réservation</span></label>
      </div>
      <div className="field"><span>Ambiance</span>
        <div className="chips">{AMBIANCES.map((a) => <button type="button" key={a} className={'chip small' + (s.ambiance === a ? ' on' : '')} onClick={() => set({ ambiance: s.ambiance === a ? '' : a })}>{a}</button>)}</div>
      </div>
      <div className="field"><span>Conditions <small className="muted">(touche pour ajouter, ou écris les tiennes)</small></span>
        <div className="chips">{CONDITION_IDEAS.map((c) => <button type="button" key={c} className={'chip small' + (conds.includes(c) ? ' on' : '')} onClick={() => toggleCond(c)}>{c}</button>)}</div>
        <input value={s.conditions} onChange={(e) => set({ conditions: e.target.value })} placeholder="Séparées par des virgules" />
      </div>
      <div className="field"><span>Prix</span>
        <div className="chips">{PRICES.map((p) => <button type="button" key={p} className={'chip small' + (s.price === p ? ' on' : '')} onClick={() => set({ price: s.price === p ? '' : p })}>{p}</button>)}</div>
      </div>
      <label className="field"><span>Remarques</span><textarea rows={2} value={s.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={500} placeholder="Étage, accès, carte étudiant…" /></label>
      <InvitePicker value={{ private: s.private, ...(s.invite || {}) }} onChange={(v) => set({ private: v.private, invite: { ids: v.ids, circles: v.circles } })} people={people} me={me} />
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

// ---------- Fenêtre « Spots » : chercher un lieu ouvert, gérer la liste ----------
const nextHour = () => { const d = new Date(); return Math.min(22 * 60, (d.getHours() + 1) * 60); };
export default function SpotsPanel({ me, people, settings, onClose }) {
  const [syncing, setSyncing] = useState(false);
  const sync = async () => {
    setSyncing(true);
    try { const r = await syncSpotsFromSheet(settings.spotsSheet, all); setToast(r.added + r.updated + r.removed ? `Google Sheet : ${r.added} ajouté(s), ${r.updated} mis à jour, ${r.removed} retiré(s)` : 'Google Sheet : déjà à jour'); }
    catch (err) { setToast(err.message); }
    setSyncing(false);
  };
  const all = useSpotsStore();
  const spots = all.filter((s) => canSeeSpot(s, me));
  const [date, setDate] = useState(isoDate(new Date()));
  const [sh, setSh] = useState(toHHMM(nextHour()));
  const [eh, setEh] = useState(toHHMM(Math.min(1439, nextHour() + 120)));
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [toast, setToast] = useState('');
  const file = useRef(null);
  const s = toMin(sh), e = toMin(eh);
  const rows = useMemo(() => sortByStatus(spots
    .filter((x) => !q || normName(`${x.name}${x.address}${x.type}${x.conditions}`).includes(normName(q)))
    .map((spot) => ({ spot, st: date && s != null && e != null && e > s ? spotStatus(spot, date, s, e, settings) : null }))), [spots, q, date, s, e, settings]);
  const shown = onlyOpen ? rows.filter((r) => r.st && (r.st.key === 'open' || r.st.key === 'partial')) : rows;

  const onFile = async (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const list = spotsFromCsv(await f.text());
      if (!list.length) return setToast('Aucun spot trouvé dans le fichier.');
      const r = await importSpots(list, all, me);
      setToast(`${r.added} spot(s) ajouté(s), ${r.updated} mis à jour`);
    } catch (err) { setToast(err.message); }
  };

  if (edit) return <SpotForm initial={edit === 'new' ? null : edit} me={me} people={people} onClose={() => setEdit(null)} />;
  return (
    <Modal wide title={<><MapPin size={19} /> Spots</>} onClose={onClose}>
      <div className="spot-when">
        <span className="muted tiny">Ouvert quand&#160;?</span>
        <div className="spot-when-row">
          <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} aria-label="Date" />
          <input type="time" value={sh} onChange={(ev) => setSh(ev.target.value)} aria-label="Début" />
          <input type="time" value={eh} onChange={(ev) => setEh(ev.target.value)} aria-label="Fin" />
        </div>
        <label className="switch"><input type="checkbox" checked={onlyOpen} onChange={(ev) => setOnlyOpen(ev.target.checked)} /><span>Seulement les spots ouverts</span></label>
      </div>
      <div className="search"><Search size={15} /><input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Chercher (nom, adresse, condition…)" />{q && <button className="icon-btn" onClick={() => setQ('')} aria-label="Effacer"><X size={14} /></button>}</div>
      <div className="spot-list">
        {!spots.length && <p className="muted">Aucun spot pour l’instant. Ajoute le premier, ou importe le tableau.</p>}
        {spots.length > 0 && !shown.length && <p className="muted">Aucun spot ouvert sur ce créneau.</p>}
        {shown.map(({ spot, st }) => <SpotCard key={spot.id} spot={spot} st={st} me={me} onEdit={setEdit} />)}
      </div>
      {settings?.spotsSheet && (
        <div className="spot-sheet">
          <span className="grow muted tiny">Les spots viennent aussi du <b>Google Sheet</b>{settings.spotsSyncAt ? ` · synchronisé ${timeAgo(settings.spotsSyncAt)}` : ''}.</span>
          <a className="btn small ghost" href={settings.spotsSheet} target="_blank" rel="noreferrer"><FileSpreadsheet size={14} /> Ouvrir</a>
          <button className="btn small ghost" disabled={syncing} onClick={sync}><RefreshCw size={14} className={syncing ? 'spin' : ''} /> Synchroniser</button>
        </div>
      )}
      <div className="row-btns spot-actions">
        <button className="btn primary" onClick={() => setEdit('new')}><Plus size={16} /> Ajouter un spot</button>
        <button className="btn ghost" onClick={() => file.current?.click()}><Upload size={15} /> Importer (CSV)</button>
        <button className="btn ghost" onClick={() => download(`spots-${isoDate(new Date())}.csv`, spotsToCsv(spots), 'text/csv;charset=utf-8')}><Download size={15} /> Exporter</button>
        <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
      </div>
      <p className="muted tiny">Import : depuis Google Sheets, Fichier → Télécharger → CSV, avec les colonnes du modèle. Un spot qui porte le même nom est mis à jour.</p>
      <Toast text={toast} onDone={() => setToast('')} />
    </Modal>
  );
}

// Champ « Spot » des formulaires : bouton qui déplie les suggestions pour le(s) créneau(x)
export function SpotPickField({ me, slots, settings, value, onPick }) {
  const spots = useSpotsStore();
  const [open, setOpen] = useState(false);
  if (!canUseSpots(me, settings)) return null;
  const cur = spots.find((x) => x.id === value);
  return (
    <div className="field spot-pick">
      <span>Spot <small className="muted">(facultatif)</small></span>
      <div className="row-btns">
        <button type="button" className={'btn small ' + (open ? '' : 'ghost')} onClick={() => setOpen(!open)}><MapPin size={14} /> {cur ? cur.name : 'Choisir un spot ouvert'}</button>
        {cur && <button type="button" className="icon-btn" onClick={() => onPick(null)} aria-label="Retirer le spot"><X size={15} /></button>}
      </div>
      {open && <SpotSuggest me={me} slots={slots} settings={settings} value={value} onPick={(sp) => { onPick(sp); setOpen(false); }} />}
    </div>
  );
}
export const spotPlace = (sp) => (sp ? `${sp.name}${sp.address ? ` — ${sp.address}` : ''}` : '');
