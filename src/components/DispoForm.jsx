import { useMemo, useState } from 'react';
import { AlertTriangle, Copy, Plus, Trash2, UserCheck } from 'lucide-react';
import { DAYS, DISTANCES, FORMATS, MOMENTS, PALETTE, PRESETS } from '../constants';
import { createParticipant, deleteParticipant, log, updateParticipant } from '../data';
import { capName, diffParticipant, momentsOf, findSimilar, fmt, nameKey, normalizeSlots, toHHMM, toMin } from '../utils';
import { Chips, ConfirmButton, FormatIcon, MOMENT_ICON, Modal } from './ui';
import { PinInput } from './AccessScreens';
import { FORMATIONS, SUBJECTS } from '../formations';

const emptyDays = () => Array.from({ length: 7 }, () => []);

export default function DispoForm({ existing, people, onClose, onSaved, onIsMe, admin = false, viaCode = '' }) {
  const isNew = !existing;
  const usedColors = people.map((p) => p.color);
  const [prenom, setPrenom] = useState(existing?.prenom || '');
  const [nom, setNom] = useState(existing?.nom || '');
  const [pin, setPin] = useState(existing?.pin || '');
  const [formation, setFormation] = useState(existing?.formation || '');
  const [subjects, setSubjects] = useState(existing?.subjects || []);
  const [color, setColor] = useState(existing?.color || PALETTE.find((c) => !usedColors.includes(c)) || PALETTE[people.length % PALETTE.length]);
  const [freq, setFreq] = useState(existing?.freq || 2);
  const [moments, setMoments] = useState(() => momentsOf(existing || {}));
  const [format, setFormat] = useState(existing?.format || 'both');
  const [distance, setDistance] = useState(existing?.distance || 'moyen');
  const [note, setNote] = useState(existing?.note || '');
  const [days, setDays] = useState(() => {
    const o = emptyDays();
    (existing?.slots || []).forEach((s) => o[s.d].push({ s: toHHMM(s.s), e: toHHMM(s.e) }));
    return o;
  });
  const [notDuplicate, setNotDuplicate] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const similar = useMemo(() => findSimilar(prenom, nom, people, existing?.id), [prenom, nom, people, existing]);
  const exact = similar.find((x) => x.kind === 'exact');
  const nameChanged = isNew || nameKey(prenom, nom) !== nameKey(existing.prenom, existing.nom || '');
  const needsConfirm = nameChanged && !exact && similar.length > 0 && !notDuplicate;

  const setDay = (d, fn) => setDays((all) => all.map((x, i) => (i === d ? fn(x) : x)));
  const addSlot = (d, s = '09:00', e = '12:00') => setDay(d, (x) => [...x, { s, e }]);
  const copyTo = (d, targets) => setDays((all) => all.map((x, i) => (targets.includes(i) && i !== d ? all[d].map((y) => ({ ...y })) : x)));

  const save = async () => {
    setErr('');
    const P = capName(prenom), N = capName(nom);
    if (!P || !N) return setErr('Prénom et nom sont obligatoires.');
    if (exact) return setErr(`${exact.p.prenom} ${exact.p.nom} existe déjà.`);
    if (needsConfirm) return setErr('Un nom ressemble au tien : confirme que tu es une autre personne.');
    if (!/^\d{4}$/.test(String(pin))) return setErr('Le code perso doit faire 4 chiffres.');
    if (!formation) return setErr('Indique ta formation DAEU (Jour, Soir ou Hybride).');
    const slots = [];
    for (let d = 0; d < 7; d++) {
      for (const x of days[d]) {
        const s = toMin(x.s); let e = toMin(x.e);
        if (s === null || e === null) return setErr(`${DAYS[d]} : horaire incomplet.`);
        if (e === 0 || e === 1439) e = 1440;
        if (e <= s) return setErr(`${DAYS[d]} : la fin (${x.e}) doit être après le début (${x.s}).`);
        slots.push({ d, s, e });
      }
    }
    if (!slots.length) return setErr('Ajoute au moins un créneau de dispo.');
    const data = {
      prenom: P, nom: N, nameKey: nameKey(P, N), pin: String(pin), formation, subjects, color, freq, moments, moment: null, format,
      distance: format === 'visio' ? null : distance, note: note.trim().slice(0, 200), slots: normalizeSlots(slots),
    };
    setBusy(true);
    try {
      const actor = admin ? 'Admin' : `${P} ${N}`;
      if (isNew) {
        const id = await createParticipant({ ...data, viaCode: viaCode || null, createdByAdmin: !!admin });
        await log('participant_create', actor, `${P} ${N}`, { créneaux: data.slots.length, code: viaCode || null });
        onSaved(id);
      } else {
        const changes = diffParticipant(existing, data);
        await updateParticipant(existing.id, data);
        if (changes.length) await log('participant_update', actor, `${P} ${N}`, { changes });
        onSaved(existing.id);
      }
    } catch (e) { setErr('Erreur : ' + e.message); }
    setBusy(false);
  };

  const remove = async () => {
    await deleteParticipant(existing, admin ? 'Admin' : `${existing.prenom} ${existing.nom || ''}`.trim());
    onSaved(null, true);
  };

  return (
    <Modal wide title={isNew ? 'Mes dispos' : admin ? `Modifier ${existing.prenom}` : 'Modifier mes dispos'} onClose={onClose}
      footer={
        <>
          {!isNew && <ConfirmButton confirmText="Supprimer la fiche ?" onConfirm={remove}><Trash2 size={16} /> Supprimer</ConfirmButton>}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      }>
      {/* ---------- Identité ---------- */}
      <section className="fsec">
        <h3>Qui es-tu ?</h3>
        <div className="grid2">
          <label className="field"><span>Prénom *</span>
            <input value={prenom} onChange={(e) => { setPrenom(e.target.value); setNotDuplicate(false); }} maxLength={30} autoComplete="given-name" />
          </label>
          <label className="field"><span>Nom *</span>
            <input value={nom} onChange={(e) => { setNom(e.target.value); setNotDuplicate(false); }} maxLength={40} autoComplete="family-name" />
          </label>
        </div>

        {exact && (
          <div className="alert danger">
            <AlertTriangle size={18} />
            <div>
              <b>{exact.p.prenom} {exact.p.nom}</b> est déjà inscrit(e).
              {isNew && onIsMe && <div className="row-btns"><button className="btn small primary" onClick={() => onIsMe(exact.p)}><UserCheck size={15} /> C'est moi, me connecter</button></div>}
            </div>
          </div>
        )}
        {!exact && similar.length > 0 && nameChanged && (
          <div className="alert warn">
            <AlertTriangle size={18} />
            <div>
              Ça ressemble à : {similar.map((x) => <b key={x.p.id} className="sim">{x.p.prenom} {x.p.nom}</b>)}
              {isNew && onIsMe && (
                <div className="row-btns">
                  {similar.map((x) => (
                    <button key={x.p.id} className="btn small" onClick={() => onIsMe(x.p)}><UserCheck size={15} /> Je suis {x.p.prenom} {x.p.nom}</button>
                  ))}
                </div>
              )}
              <label className="check"><input type="checkbox" checked={notDuplicate} onChange={(e) => setNotDuplicate(e.target.checked)} /> Non, je suis une autre personne</label>
            </div>
          </div>
        )}


        <div className="field"><span>Ta formation DAEU *</span>
          <div className="formation-pick">
            {Object.entries(FORMATIONS).map(([k, v]) => (
              <button type="button" key={k} className={'fpick' + (formation === k ? ' on' : '')} style={{ '--c': v.color }} onClick={() => setFormation(k)}>
                <b>{v.short}</b><small>{v.hint}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="field"><span>Tes matières <small className="muted">(rien de coché = toutes)</small></span>
          <Chips multi value={subjects} onChange={setSubjects}
            options={Object.entries(SUBJECTS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))} />
          <small className="muted">Sert aux sondages par matière et à savoir quand tu es en cours.</small>
        </div>

        <label className="field narrow"><span>Code perso (4 chiffres) *</span>
          <PinInput value={pin} onChange={setPin} />
          <small className="muted">Tu l'inventes. Il te servira à te reconnecter sur un autre appareil : note-le !</small>
        </label>

        <div className="field"><span>Ta couleur</span>
          <div className="swatches">
            {PALETTE.map((c) => (
              <button key={c} type="button" className={'swatch' + (c === color ? ' on' : '')} style={{ background: c }}
                onClick={() => setColor(c)} aria-label={c} title={usedColors.includes(c) && c !== existing?.color ? 'Déjà prise par quelqu’un' : ''}>
                {usedColors.includes(c) && c !== existing?.color && <i />}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Préférences ---------- */}
      <section className="fsec">
        <h3>Tes préférences</h3>
        <div className="field"><span>Combien de fois par semaine tu veux bosser en groupe ?</span>
          <div className="freq-pick">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button type="button" key={n} className={'fp' + (n === freq ? ' on' : '')} style={{ '--lvl': n / 7 }} onClick={() => setFreq(n)}>{n}</button>
            ))}
          </div>
        </div>
        <div className="field"><span>Quels moments tu préfères ? <small className="muted">(plusieurs choix possibles)</small></span>
          <Chips multi value={moments} onChange={(v) => {
            const added = v.find((m) => !moments.includes(m));
            if (added === 'egal') return setMoments(['egal']);
            const next = v.filter((m) => m !== 'egal');
            setMoments(next.length ? next : ['egal']);
          }}
            options={Object.entries(MOMENTS).map(([k, v]) => { const I = MOMENT_ICON[k]; return { value: k, label: v.label, icon: <I size={15} /> }; })} />
        </div>
        <div className="field"><span>Présentiel ou visio ?</span>
          <Chips value={format} onChange={setFormat}
            options={Object.entries(FORMATS).map(([k, v]) => ({ value: k, label: v.label, color: v.color, icon: <FormatIcon format={k} size={15} /> }))} />
        </div>
        {format !== 'visio' && (
          <div className="field"><span>Jusqu'où tu peux te déplacer ?</span>
            <Chips value={distance} onChange={setDistance}
              options={Object.entries(DISTANCES).map(([k, v]) => ({ value: k, label: v.label, hint: v.hint, color: v.color }))} />
          </div>
        )}
        <label className="field"><span>Une remarque ? (matières, contraintes…)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ex : surtout anatomie, pas dispo pendant les partiels" />
        </label>
      </section>

      {/* ---------- Dispos ---------- */}
      <section className="fsec">
        <h3>Tes dispos sur une semaine type</h3>
        <p className="muted tiny">Ajoute un ou plusieurs créneaux par jour. Boutons rapides pour gagner du temps, et « copier » pour reproduire un jour.</p>
        <div className="days-edit">
          {DAYS.map((name, d) => (
            <div key={d} className={'day-edit' + (days[d].length ? ' has' : '')}>
              <div className="de-head">
                <strong>{name}</strong>
                {days[d].length > 0 && (
                  <span className="de-copy">
                    <button type="button" className="link" onClick={() => copyTo(d, [1, 2, 3, 4, 5])}><Copy size={13} /> Lun→Ven</button>
                    <button type="button" className="link" onClick={() => copyTo(d, [0, 1, 2, 3, 4, 5, 6])}><Copy size={13} /> Tous</button>
                  </span>
                )}
              </div>
              {days[d].map((x, i) => (
                <div key={i} className="slot-row">
                  <input type="time" step={900} value={x.s} onChange={(e) => setDay(d, (arr) => arr.map((y, j) => (j === i ? { ...y, s: e.target.value } : y)))} />
                  <span>→</span>
                  <input type="time" step={900} value={x.e} onChange={(e) => setDay(d, (arr) => arr.map((y, j) => (j === i ? { ...y, e: e.target.value } : y)))} />
                  <button type="button" className="icon-btn" onClick={() => setDay(d, (arr) => arr.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 size={16} /></button>
                </div>
              ))}
              <div className="presets">
                {PRESETS.map((p) => (
                  <button type="button" key={p.label} className="chip small" onClick={() => addSlot(d, p.s, p.e)} title={`${fmt(toMin(p.s))}–${fmt(toMin(p.e))}`}>+ {p.label}</button>
                ))}
                <button type="button" className="chip small" onClick={() => addSlot(d)}><Plus size={13} /> Autre</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      {err && <p className="err sticky-err">{err}</p>}
    </Modal>
  );
}
