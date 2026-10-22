import { useMemo, useState } from 'react';
import {
  Bell, CalendarCheck, CalendarPlus, Check, ChevronDown, ChevronRight, Clock, Lock, MapPin, Pencil, Plus, RotateCcw, Trash2, Trophy, Users, Vote,
} from 'lucide-react';
import { SESSION_FORMATS, VOTE } from '../constants';
import {
  closePoll, createPoll, createSession, deletePoll, deleteSession, joinSession, reopenPoll, updatePoll, updateSession, votePoll,
} from '../data';
import { fmt, fmtDay, fmtDayShort, isPast, isoDate, parseIso, timeAgo, toHHMM, toMin, uid } from '../utils';
import { Avatar, AvatarStack, ConfirmButton, Empty, Modal, PeopleGroups, PeopleModal } from './ui';
import { placesLabel, sessionState, splitPlaces, yesOrder } from '../places';

const actorName = (me) => (me ? `${me.prenom} ${me.nom || ''}`.trim() : 'Admin');

// Nombre de personnes dispo d'après le planning pour une date/heure
export function forecast(people, date, s, e) {
  const wd = parseIso(date).getDay();
  const full = people.filter((p) => (p.slots || []).some((x) => x.d === wd && x.s <= s && x.e >= e));
  const part = people.filter((p) => !full.includes(p) && (p.slots || []).some((x) => x.d === wd && x.s < e && x.e > s));
  return { full, part };
}

function scoreOf(poll, optId) {
  let yes = 0, maybe = 0, no = 0;
  for (const v of Object.values(poll.votes || {})) {
    if (v?.[optId] === 'yes') yes++; else if (v?.[optId] === 'maybe') maybe++; else if (v?.[optId] === 'no') no++;
  }
  return { yes, maybe, no, score: yes * 2 + maybe };
}

// =================== Vue principale ===================
export default function PollsView({ polls, sessions, people, me, isAdmin, onSession, openPollForm, openSessionForm, onPollTouched }) {
  const [showPast, setShowPast] = useState(false);
  const today = isoDate(new Date());
  const upcoming = sessions.filter((s) => !isPast(s.date, s.e));
  const past = sessions.filter((s) => isPast(s.date, s.e)).reverse();
  const open = polls.filter((p) => p.status !== 'closed');
  const closed = polls.filter((p) => p.status === 'closed');

  return (
    <div className="polls">
      <div className="pv-actions">
        <button className="btn primary" onClick={() => openPollForm(null)}><Vote size={17} /> Nouveau sondage</button>
        <button className="btn" onClick={() => openSessionForm(null)}><CalendarPlus size={17} /> Planifier une séance</button>
      </div>

      <h3 className="sec-title"><CalendarCheck size={18} /> Séances à venir</h3>
      {upcoming.length === 0 ? <p className="muted">Aucune séance prévue. Lance un sondage ou planifie directement.</p> : (
        <div className="sess-list">
          {upcoming.map((s) => <SessionRow key={s.id} s={s} people={people} me={me} onClick={() => onSession(s)} isToday={s.date === today} />)}
        </div>
      )}

      <h3 className="sec-title"><Vote size={18} /> Sondages en cours</h3>
      {open.length === 0 ? <Empty icon={Vote} title="Aucun sondage en cours">Propose quelques dates et laisse chacun voter.</Empty>
        : open.map((p) => <PollCard key={p.id} poll={p} people={people} me={me} isAdmin={isAdmin} onEdit={() => openPollForm(p)} onTouched={onPollTouched} />)}

      {closed.length > 0 && (
        <>
          <h3 className="sec-title"><Lock size={18} /> Sondages terminés</h3>
          {closed.map((p) => <PollCard key={p.id} poll={p} people={people} me={me} isAdmin={isAdmin} onEdit={() => openPollForm(p)}
            onSession={() => { const s = sessions.find((x) => x.id === p.sessionId); if (s) onSession(s); }} />)}
        </>
      )}

      {past.length > 0 && (
        <>
          <button className="link sec-title" onClick={() => setShowPast(!showPast)}>
            <ChevronDown size={16} className={showPast ? 'rot' : ''} /> Séances passées ({past.length})
          </button>
          {showPast && <div className="sess-list past">{past.map((s) => <SessionRow key={s.id} s={s} people={people} me={me} onClick={() => onSession(s)} />)}</div>}
        </>
      )}
    </div>
  );
}

function SessionRow({ s, people, me, onClick, isToday }) {
  const att = (s.attendees || []).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const inIt = me && (s.attendees || []).includes(me.id);
  return (
    <button className={'sess-row' + (inIt ? ' in' : '') + (isToday ? ' today' : '')} onClick={onClick}>
      <div className="sr-date">
        <b>{parseIso(s.date).getDate()}</b>
        <span>{parseIso(s.date).toLocaleDateString('fr-FR', { month: 'short' })}</span>
      </div>
      <div className="grow">
        <strong>{s.title}</strong>
        <div className="muted tiny">{fmtDay(s.date, { weekday: 'long' })} · {fmt(s.s)}–{fmt(s.e)} · {SESSION_FORMATS[s.format] || s.format}{s.place ? ` · ${s.place}` : ''}</div>
        <AvatarStack people={att} max={8} size={22} label={placesLabel(s)} />
      </div>
      {inIt && <span className="pill ok"><Check size={13} /> J'y vais</span>}
      {!inIt && me && sessionState(s, me.id).status === 'wait' && <span className="pill warn">Attente n°{sessionState(s, me.id).rank}</span>}
      {!inIt && me && sessionState(s, me.id).status === 'out' && sessionState(s, me.id).full && <span className="pill bad">Complet</span>}
    </button>
  );
}

// =================== Carte de sondage ===================
function optionGroups(poll, o, people) {
  const v = poll.votes || {};
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const by = (k) => people.filter((p) => v[p.id]?.[o.id] === k);
  const yes = yesOrder(poll, o.id).map((id) => byId[id]).filter(Boolean);
  const { inn, wait } = splitPlaces(yes, Number(poll.max) || 0);
  const answered = new Set([...yes, ...by('maybe'), ...by('no')].map((p) => p.id));
  const fc = forecast(people, o.date, o.s, o.e);
  const noAnswer = people.filter((p) => !answered.has(p.id));
  return {
    yes, yesIn: inn, yesWait: wait, maybe: by('maybe'), no: by('no'), fc,
    pendingDispo: noAnswer.filter((p) => fc.full.includes(p)),
    pendingOther: noAnswer.filter((p) => !fc.full.includes(p)),
  };
}

function PollCard({ poll, people, me, isAdmin, onEdit, onSession, onTouched }) {
  const closed = poll.status === 'closed';
  const myVotes = (me && poll.votes?.[me.id]) || {};
  const [draft, setDraft] = useState(myVotes);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [detail, setDetail] = useState(null); // option
  const [votersOpen, setVotersOpen] = useState(false);
  const canManage = isAdmin || (me && poll.createdBy === me.id);
  const canVote = !closed && me && me.id !== 'admin';
  const voters = Object.keys(poll.votes || {}).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const notVoted = people.filter((p) => !poll.votes?.[p.id]);
  const scores = Object.fromEntries(poll.options.map((o) => [o.id, scoreOf(poll, o.id)]));
  const best = Math.max(0, ...Object.values(scores).map((s) => s.score));
  const deadlinePassed = poll.deadline && isPast(poll.deadline);
  const iVoted = me && poll.votes?.[me.id];
  const max = Number(poll.max) || 0;

  // Vote enregistré automatiquement à chaque clic
  const vote = async (optId, k) => {
    const next = { ...draft, [optId]: draft[optId] === k ? undefined : k };
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v));
    setDraft(clean);
    setBusy(true);
    try {
      await votePoll({ ...poll, votes: { ...(poll.votes || {}), [me.id]: draft } }, me, clean);
      onTouched?.(poll.id);
      setSaved(true); setTimeout(() => setSaved(false), 1800);
    } finally { setBusy(false); }
  };

  const detailData = detail && optionGroups(poll, detail, people);

  return (
    <div className={'card poll' + (closed ? ' closed' : '') + (canVote && !iVoted ? ' todo' : '')} id={`poll-${poll.id}`}>
      <div className="poll-head">
        <div className="grow">
          {canVote && !iVoted && <span className="pill warn todo-pill">À toi de voter</span>}
          <h4>{poll.title}</h4>
          <div className="muted tiny">
            par {poll.createdByName} · {timeAgo(poll.createdAt)}
            {poll.deadline && <> · réponse avant le {fmtDayShort(poll.deadline)}{deadlinePassed && ' (dépassé)'}</>}
          </div>
          {poll.description && <p className="poll-desc">{poll.description}</p>}
          <div className="muted tiny">{SESSION_FORMATS[poll.format] || 'Hybride'}{poll.place ? ` · ${poll.place}` : ''}{max > 0 ? ` · ${max} places max` : ''}</div>
        </div>
        {canManage && (
          <div className="poll-tools">
            {!closed && <button className="icon-btn" onClick={onEdit} title="Modifier"><Pencil size={17} /></button>}
            <ConfirmButton className="icon-btn danger" confirmText="Sûr ?" onConfirm={() => deletePoll(poll, actorName(me))}><Trash2 size={17} /></ConfirmButton>
          </div>
        )}
      </div>

      <button className="voters-line" onClick={() => setVotersOpen(true)}>
        <AvatarStack people={voters} max={8} size={24} />
        <span><b>{voters.length}</b> {voters.length > 1 ? 'ont voté' : 'a voté'}{notVoted.length > 0 && <> · <b>{notVoted.length}</b> pas encore</>}</span>
        <ChevronRight size={16} />
      </button>

      <div className="opts">
        {poll.options.map((o) => {
          const sc = scores[o.id];
          const g = optionGroups(poll, o, people);
          const isFinal = closed && poll.finalOptionId === o.id;
          const isBest = !closed && sc.score > 0 && sc.score === best;
          const total = Math.max(1, sc.yes + sc.maybe + sc.no);
          return (
            <div key={o.id} className={'opt' + (isFinal ? ' final' : '') + (isBest ? ' best' : '') + (closed && !isFinal ? ' faded' : '')}>
              <button className="opt-main" onClick={() => setDetail(o)}>
                <div className="opt-when">
                  {(isFinal || isBest) && <Trophy size={16} className="trophy" />}
                  <b>{fmtDay(o.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                  <span className="opt-time">{fmt(o.s)}–{fmt(o.e)}</span>
                  <ChevronRight size={16} className="opt-chev" />
                </div>
                <div className="opt-bar" title={`${sc.yes} oui · ${sc.maybe} peut-être · ${sc.no} non`}>
                  <i className="yes" style={{ width: `${(sc.yes / total) * 100}%` }} />
                  <i className="maybe" style={{ width: `${(sc.maybe / total) * 100}%` }} />
                  <i className="no" style={{ width: `${(sc.no / total) * 100}%` }} />
                </div>
                <div className="opt-stats">
                  <span className="vc yes">{sc.yes} oui</span>
                  <span className="vc maybe">{sc.maybe} peut-être</span>
                  <span className="vc no">{sc.no} non</span>
                  {max > 0 && <span className={'vc places' + (g.yes.length >= max ? ' full' : '')}>{Math.min(g.yes.length, max)}/{max} places{g.yesWait.length ? ` · ${g.yesWait.length} en attente` : ''}</span>}
                  <span className="fc"><Clock size={12} /> {g.fc.full.length} dispo (planning)</span>
                </div>
                {g.yes.length + g.maybe.length > 0 && <AvatarStack people={[...g.yes, ...g.maybe]} max={8} size={24} />}
                {me && g.yesIn.some((p) => p.id === me.id) && max > 0 && <span className="pill ok my-place"><Check size={12} /> Ta place est réservée</span>}
                {me && g.yesWait.some((p) => p.id === me.id) && <span className="pill warn my-place">Tu es en liste d'attente (n°{g.yesWait.findIndex((p) => p.id === me.id) + 1})</span>}
                {canVote && max > 0 && g.yes.length >= max && draft[o.id] !== 'yes' && myVotes[o.id] !== 'yes' && <span className="muted tiny">Complet : un « Oui » te met en liste d'attente.</span>}
              </button>
              {canVote && (
                <div className="vote-btns">
                  {Object.entries(VOTE).map(([k, v]) => (
                    <button key={k} className={'vb ' + k + (draft[o.id] === k ? ' on' : '')} disabled={busy}
                      onClick={() => vote(o.id, k)}>{v.label}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="poll-foot">
        {canVote && (
          <span className={'vote-status' + (saved ? ' ok' : '')}>
            {busy ? 'Enregistrement…' : saved ? <><Check size={15} /> Vote enregistré</> : iVoted ? <><Check size={15} /> Ton vote est pris en compte — tu peux le changer à tout moment</> : 'Clique sur Oui, Peut-être ou Non : c’est enregistré directement'}
          </span>
        )}
        <span className="grow" />
        {!closed && canManage && <button className="btn" onClick={() => setClosing(true)}><Lock size={16} /> Clôturer</button>}
        {closed && <button className="btn small" onClick={onSession}><CalendarCheck size={15} /> Voir la séance</button>}
        {closed && canManage && <ConfirmButton className="btn small ghost" confirmText="Rouvrir (supprime la séance) ?" onConfirm={() => reopenPoll(poll, actorName(me))}><RotateCcw size={15} /> Rouvrir</ConfirmButton>}
      </div>

      {detail && (
        <PeopleModal meId={me?.id} onClose={() => setDetail(null)}
          title={`${fmtDay(detail.date, { weekday: 'long', day: 'numeric', month: 'short' })} · ${fmt(detail.s)}–${fmt(detail.e)}`}
          subtitle={poll.title}
          groups={[
            ...(max > 0 ? [
              { label: `Oui — places réservées (${detailData.yesIn.length}/${max})`, color: VOTE.yes.color, people: detailData.yesIn, showEmpty: true, extra: (p) => `n°${detailData.yesIn.indexOf(p) + 1}` },
              { label: 'Oui — liste d’attente', color: '#0EA5E9', people: detailData.yesWait, hint: 'Premier arrivé, premier servi : si quelqu’un se retire, le suivant prend sa place.', extra: (p) => `attente n°${detailData.yesWait.indexOf(p) + 1}` },
            ] : [{ label: 'Oui', color: VOTE.yes.color, people: detailData.yes, showEmpty: true }]),
            { label: 'Peut-être', color: VOTE.maybe.color, people: detailData.maybe },
            { label: 'Non', color: VOTE.no.color, people: detailData.no },
            { label: 'Pas répondu — mais dispo d’après le planning', color: '#4F46E5', people: detailData.pendingDispo },
            { label: 'Pas répondu', color: '#9CA3AF', people: detailData.pendingOther },
          ]} />
      )}
      {votersOpen && (
        <PeopleModal meId={me?.id} onClose={() => setVotersOpen(false)} title="Participation au sondage" subtitle={poll.title}
          groups={[
            { label: 'Ont voté', color: '#16A34A', people: voters, showEmpty: true },
            { label: 'Pas encore voté', color: '#9CA3AF', people: notVoted },
          ]} />
      )}
      {closing && <ClosePollModal poll={poll} scores={scores} me={me} onClose={() => setClosing(false)} />}
    </div>
  );
}

function ClosePollModal({ poll, scores, me, onClose }) {
  const sorted = [...poll.options].sort((a, b) => scores[b.id].score - scores[a.id].score);
  const [optId, setOptId] = useState(sorted[0]?.id);
  const [format, setFormat] = useState(poll.format || 'hybride');
  const [place, setPlace] = useState(poll.place || '');
  const [notify, setNotify] = useState(true);
  const [max, setMax] = useState(poll.max || '');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    await closePoll(poll, poll.options.find((o) => o.id === optId), { format, place, notify, max: Number(max) || null }, actorName(me));
    setBusy(false); onClose();
  };
  return (
    <Modal title="Clôturer le sondage" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy || !optId} onClick={go}><CalendarCheck size={16} /> Ajouter au planning</button></>}>
      <p className="muted">Choisis la date retenue. Elle devient une séance dans le planning : les « Oui » sont inscrits dans leur ordre d'arrivée (au-delà des places max, ils passent en liste d'attente). Les « Peut-être » reçoivent le rappel et peuvent s'inscrire.</p>
      <div className="radio-list">
        {sorted.map((o) => {
          const sc = scores[o.id];
          return (
            <label key={o.id} className={'radio' + (optId === o.id ? ' on' : '')}>
              <input type="radio" checked={optId === o.id} onChange={() => setOptId(o.id)} />
              <span className="grow"><b>{fmtDay(o.date)}</b> · {fmt(o.s)}–{fmt(o.e)}</span>
              <span className="vc yes">{sc.yes} oui</span><span className="vc maybe">{sc.maybe} ?</span>
            </label>
          );
        })}
      </div>
      <div className="grid2">
        <label className="field"><span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {Object.entries(SESSION_FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Lieu / lien visio</span><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="BU, chez Lucas, lien Meet…" /></label>
      </div>
      <MaxField value={max} onChange={setMax} />
      <NotifyCheck value={notify} onChange={setNotify} />
    </Modal>
  );
}

// =================== Formulaire de sondage ===================
export function PollForm({ initial, prefill, people, me, onClose }) {
  const isEdit = !!initial?.id;
  const [title, setTitle] = useState(initial?.title || 'Séance de révision');
  const [description, setDescription] = useState(initial?.description || '');
  const [format, setFormat] = useState(initial?.format || 'hybride');
  const [place, setPlace] = useState(initial?.place || '');
  const [deadline, setDeadline] = useState(initial?.deadline || '');
  const [max, setMax] = useState(initial?.max || '');
  const [options, setOptions] = useState(() => initial?.options?.map((o) => ({ ...o, sh: toHHMM(o.s), eh: toHHMM(o.e) }))
    || prefill || [{ id: uid(), date: isoDate(new Date(Date.now() + 86400000)), sh: '14:00', eh: '17:00' }]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const setOpt = (i, k, v) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const add = () => {
    const last = options[options.length - 1];
    const next = last ? isoDate(new Date(parseIso(last.date).getTime() + 86400000)) : isoDate(new Date());
    setOptions([...options, { id: uid(), date: next, sh: last?.sh || '14:00', eh: last?.eh || '17:00' }]);
  };

  const save = async () => {
    setErr('');
    if (!title.trim()) return setErr('Donne un titre.');
    const opts = [];
    for (const o of options) {
      const s = toMin(o.sh); let e = toMin(o.eh);
      if (!o.date || s === null || e === null) return setErr('Une date ou un horaire est incomplet.');
      if (e === 0 || e === 1439) e = 1440;
      if (e <= s) return setErr(`Le ${fmtDayShort(o.date)} : la fin doit être après le début.`);
      opts.push({ id: o.id, date: o.date, s, e });
    }
    if (opts.length < 1) return setErr('Ajoute au moins une date.');
    opts.sort((a, b) => (a.date + a.s).localeCompare(b.date + b.s));
    const data = { title: title.trim(), description: description.trim(), format, place: place.trim(), deadline: deadline || null, max: Number(max) || null, options: opts };
    setBusy(true);
    try {
      if (isEdit) await updatePoll(initial.id, data, actorName(me), data.title);
      else await createPoll(data, me);
      onClose();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Modal wide title={isEdit ? 'Modifier le sondage' : 'Nouveau sondage'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>{isEdit ? 'Enregistrer' : 'Publier le sondage'}</button></>}>
      <label className="field"><span>Titre</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} /></label>
      <label className="field"><span>Description (optionnel)</span><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Ex : révisions partiel bio cell" /></label>
      <div className="grid3">
        <label className="field"><span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {Object.entries(SESSION_FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Lieu (optionnel)</span><input value={place} onChange={(e) => setPlace(e.target.value)} /></label>
        <label className="field"><span>Répondre avant le</span><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      </div>
      <MaxField value={max} onChange={setMax} />

      <h3 className="fsub">Dates proposées</h3>
      <div className="opt-edit">
        {options.map((o, i) => {
          const s = toMin(o.sh), e = toMin(o.eh);
          const fc = o.date && s !== null && e !== null ? forecast(people, o.date, s, e) : null;
          return (
            <div key={o.id} className="oe-row">
              <input type="date" value={o.date} onChange={(ev) => setOpt(i, 'date', ev.target.value)} />
              <input type="time" step={900} value={o.sh} onChange={(ev) => setOpt(i, 'sh', ev.target.value)} />
              <span>→</span>
              <input type="time" step={900} value={o.eh} onChange={(ev) => setOpt(i, 'eh', ev.target.value)} />
              {fc && <span className="fc" title={fc.full.map((p) => p.prenom).join(', ')}><Users size={13} /> {fc.full.length}{fc.part.length ? ` (+${fc.part.length})` : ''}</span>}
              <button className="icon-btn" onClick={() => setOptions(options.filter((_, j) => j !== i))} disabled={options.length < 2}><Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>
      <button className="btn small" onClick={add}><Plus size={15} /> Ajouter une date</button>
      <p className="muted tiny">Le petit chiffre = nombre de personnes dispo sur tout le créneau d'après le planning (+ partiellement).</p>
      {initial?.votes && Object.keys(initial.votes).length > 0 && <p className="alert warn tiny">Des votes existent déjà : si tu supprimes une date, ses votes disparaissent.</p>}
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

// =================== Séances ===================
export function SessionSheet({ s, people, me, isAdmin, onEdit, onClose }) {
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const st = sessionState(s, me?.id);
  const att = st.att.map((id) => byId[id]).filter(Boolean);
  const waiting = st.wait.map((id) => byId[id]).filter(Boolean);
  const canManage = isAdmin || (me && s.createdBy === me.id);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const act = async (join) => {
    setBusy(true);
    const r = await joinSession(s, me, join);
    setMsg(r === 'in' ? 'C’est noté, ta place est réservée !' : r === 'wait' ? 'Séance complète : tu es en liste d’attente.' : r === 'freed' ? 'Ta place est libérée, la liste d’attente est prévenue.' : 'Désinscription enregistrée.');
    setBusy(false);
  };
  const isPerson = me && me.id !== 'admin';
  const ics = () => {
    const d = s.date.replace(/-/g, '');
    const t = (m) => `${String(Math.floor(Math.min(m, 1439) / 60)).padStart(2, '0')}${String(Math.min(m, 1439) % 60).padStart(2, '0')}00`;
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//groupes-etude//FR', 'BEGIN:VEVENT', `UID:${s.id}@groupes-etude`,
      `DTSTART:${d}T${t(s.s)}`, `DTEND:${d}T${t(s.e)}`, `SUMMARY:${s.title}`, `LOCATION:${s.place || ''}`,
      `DESCRIPTION:${(s.note || '').replace(/\n/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
    a.download = `${s.title}.ics`; a.click();
  };
  return (
    <Modal title={s.title} onClose={onClose}
      footer={<>
        {canManage && <ConfirmButton confirmText="Supprimer la séance ?" onConfirm={async () => { await deleteSession(s, actorName(me)); onClose(); }}><Trash2 size={16} /></ConfirmButton>}
        {canManage && <button className="btn ghost" onClick={onEdit}><Pencil size={16} /> Modifier</button>}
        <button className="btn ghost" onClick={ics} title="Ajouter à mon agenda"><CalendarPlus size={16} /></button>
        <span className="grow" />
        {isPerson && st.status === 'in' && <button className="btn" disabled={busy} onClick={() => act(false)}>Je ne suis plus dispo</button>}
        {isPerson && st.status === 'wait' && st.free > 0 && <button className="btn primary" disabled={busy} onClick={() => act(true)}><Check size={16} /> Je prends la place</button>}
        {isPerson && st.status === 'wait' && <button className="btn ghost" disabled={busy} onClick={() => act(false)}>Quitter l'attente</button>}
        {isPerson && st.status === 'out' && <button className="btn primary" disabled={busy} onClick={() => act(true)}>{st.full ? 'Liste d’attente' : <><Check size={16} /> J'y vais</>}</button>}
      </>}>
      <div className="sess-info">
        <p><CalendarCheck size={16} /> <b>{fmtDay(s.date)}</b> · {fmt(s.s)} – {fmt(s.e)}</p>
        <p><Users size={16} /> {SESSION_FORMATS[s.format] || s.format}</p>
        {s.place && <p><MapPin size={16} /> {/^https?:\/\//.test(s.place) ? <a href={s.place} target="_blank" rel="noreferrer">{s.place}</a> : s.place}</p>}
        {s.note && <p className="muted">{s.note}</p>}
        <p className="muted tiny">Créée par {s.createdByName}{s.pollId ? ' via un sondage' : ''}</p>
      </div>
      {st.max > 0 && (
        <div className={'places-box' + (st.full ? ' full' : '')}>
          <b>{att.length}/{st.max} places</b>
          <span className="bar-track"><i style={{ width: `${Math.min(100, (att.length / st.max) * 100)}%` }} /></span>
          <span className="muted tiny">{st.full ? 'Complet' : `${st.free} place${st.free > 1 ? 's' : ''} libre${st.free > 1 ? 's' : ''}`}{waiting.length ? ` · ${waiting.length} en attente` : ''}</span>
        </div>
      )}
      {isPerson && st.status === 'wait' && (
        <p className={'alert ' + (st.free > 0 ? 'ok-alert' : 'warn')}>
          {st.free > 0 ? <><b>Une place s'est libérée !</b> Le premier qui la prend est inscrit.</> : <>Tu es <b>n°{st.rank}</b> sur la liste d'attente. Tu seras prévenu(e) si une place se libère.</>}
        </p>
      )}
      {msg && <p className="alert ok-alert">{msg}</p>}
      <PeopleGroups meId={me?.id} groups={[
        { label: st.max ? 'Places réservées' : 'Participants', color: '#16A34A', people: att, showEmpty: true },
        { label: 'Liste d’attente', color: '#0EA5E9', people: waiting, extra: (p) => `n°${waiting.indexOf(p) + 1}` },
      ]} />
    </Modal>
  );
}

export function SessionForm({ initial, prefill, people, me, onClose }) {
  const isEdit = !!initial?.id;
  const base = initial || prefill || {};
  const [title, setTitle] = useState(base.title || 'Séance de révision');
  const [date, setDate] = useState(base.date || isoDate(new Date(Date.now() + 86400000)));
  const [sh, setSh] = useState(toHHMM(base.s ?? 840));
  const [eh, setEh] = useState(toHHMM(base.e ?? 1020));
  const [format, setFormat] = useState(base.format || 'hybride');
  const [place, setPlace] = useState(base.place || '');
  const [note, setNote] = useState(base.note || '');
  const [attendees, setAttendees] = useState(base.attendees || (me && me.id !== 'admin' ? [me.id] : []));
  const [notify, setNotify] = useState(base.notify !== false);
  const [max, setMax] = useState(base.max || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const s = toMin(sh), e0 = toMin(eh);
  const fc = useMemo(() => (date && s !== null && e0 !== null ? forecast(people, date, s, e0) : null), [people, date, s, e0]);

  const save = async () => {
    setErr('');
    let e = e0;
    if (e === 0 || e === 1439) e = 1440;
    if (!title.trim() || !date || s === null || e === null) return setErr('Titre, date et horaires obligatoires.');
    if (e <= s) return setErr('La fin doit être après le début.');
    const m = Number(max) || null;
    let att = [...attendees];
    let wait = (base.waitlist || []).filter((x) => !att.includes(x));
    if (m && att.length > m) { wait = [...att.slice(m), ...wait]; att = att.slice(0, m); }
    const data = { title: title.trim(), date, s, e, format, place: place.trim(), note: note.trim(), attendees: att, waitlist: wait, max: m, notify };
    setBusy(true);
    try {
      if (isEdit) await updateSession(initial.id, data, actorName(me), data.title);
      else await createSession(data, me);
      onClose();
    } catch (er) { setErr(er.message); }
    setBusy(false);
  };

  return (
    <Modal wide title={isEdit ? 'Modifier la séance' : 'Planifier une séance'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>{isEdit ? 'Enregistrer' : 'Ajouter au planning'}</button></>}>
      <label className="field"><span>Titre</span><input value={title} onChange={(ev) => setTitle(ev.target.value)} maxLength={60} /></label>
      <div className="grid3">
        <label className="field"><span>Date</span><input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} /></label>
        <label className="field"><span>Début</span><input type="time" step={900} value={sh} onChange={(ev) => setSh(ev.target.value)} /></label>
        <label className="field"><span>Fin</span><input type="time" step={900} value={eh} onChange={(ev) => setEh(ev.target.value)} /></label>
      </div>
      <div className="grid2">
        <label className="field"><span>Format</span>
          <select value={format} onChange={(ev) => setFormat(ev.target.value)}>
            {Object.entries(SESSION_FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Lieu / lien visio</span><input value={place} onChange={(ev) => setPlace(ev.target.value)} /></label>
      </div>
      <label className="field"><span>Note</span><input value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={200} /></label>
      <MaxField value={max} onChange={setMax} />
      <NotifyCheck value={notify} onChange={setNotify} />
      <h3 className="fsub">Participants ({attendees.length}{Number(max) ? `/${max}` : ''})</h3>
      {Number(max) > 0 && attendees.length > Number(max) && <p className="muted tiny">Au-delà de {max}, les derniers ajoutés passeront en liste d'attente.</p>}
      {fc && <p className="muted tiny">D'après le planning : {fc.full.length} dispo{fc.full.length > 1 ? 's' : ''} sur tout le créneau{fc.part.length ? `, ${fc.part.length} en partie` : ''}. Ils sont surlignés.</p>}
      <div className="who-wrap">
        {people.map((p) => {
          const on = attendees.includes(p.id);
          const dispo = fc?.full.includes(p) ? 'full' : fc?.part.includes(p) ? 'part' : '';
          return (
            <button key={p.id} className={'who-chip sel' + (on ? ' on' : '') + (dispo ? ` ${dispo}` : '')}
              onClick={() => setAttendees(on ? attendees.filter((x) => x !== p.id) : [...attendees, p.id])}>
              <Avatar p={p} size={22} />{p.prenom} {p.nom?.[0]}.
            </button>
          );
        })}
      </div>
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

function NotifyCheck({ value, onChange }) {
  return (
    <label className="switch notify-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span><b><Bell size={14} /> Prévenir tout le monde</b><br />
        <small className="muted">Un rappel s'affichera à tous les inscrits à l'ouverture du site (dans les 3 jours avant la séance). Décoché : seuls les participants sont prévenus.</small></span>
    </label>
  );
}

function MaxField({ value, onChange }) {
  return (
    <label className="field narrow">
      <span>Nombre de places max (vide = illimité)</span>
      <input type="number" min={1} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Illimité" />
      <small className="muted">Premier arrivé, premier servi. Au-delà : liste d'attente. Si quelqu'un se retire, la liste d'attente est prévenue et le premier qui accepte prend la place.</small>
    </label>
  );
}
