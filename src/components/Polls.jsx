import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, Bell, CalendarCheck, CalendarPlus, CalendarX2, Check, ChevronDown, ChevronRight, Clock, Lock, MapPin, Pencil, Plus, RotateCcw, Trash2, Trophy, Users, Vote,
} from 'lucide-react';
import { arrayUnion } from 'firebase/firestore';
import { SESSION_FORMATS, VOTE } from '../constants';
import {
  cancelPoll, cancelSession, closePoll, createPoll, createSession, deletePoll, deleteSession, joinSession, keepSession, reopenPoll, updatePoll, updateSession, votePoll,
} from '../data';
import { fmt, fmtDay, fmtDayShort, isPast, isoDate, parseIso, timeAgo, toHHMM, toMin, uid } from '../utils';
import { Avatar, AvatarStack, ConfirmButton, Empty, Modal, PeopleGroups, PeopleModal } from './ui';
import { isOpenPoll, placesLabel, sessionState, splitPlaces, yesOrder } from '../places';
import { hiddenId } from '../testmode';
import SessionInfoBlock from './SessionInfo';
import { pollMessage, sessionMessage, shareWhatsApp } from '../share';
import WaButton, { SharedDone } from './WaButton';
import PollComments from './PollComments';
import { audienceLabel, conflictsFor, formationsOf, FORMATIONS, holidayOn, personCoursesAt, personInAudience, SUBJECTS, withoutCourses } from '../formations';

const actorName = (me) => (me ? `${me.prenom} ${me.nom || ''}`.trim() : 'Admin');

// Nombre de personnes dispo d'après le planning pour une date/heure
// ctx = { settings, item } : limite au public visé et retire les heures de cours si demandé
// Format de la séance vs préférence de la personne (hybride : chacun choisit, donc tout le monde)
export const formatOk = (p, format) => !format || format === 'hybride' || (format === 'presentiel' ? p.format !== 'visio' : p.format !== 'presentiel');

export function forecast(allPeople, date, s, e, ctx = {}) {
  const wd = parseIso(date).getDay();
  const { settings, item } = ctx;
  let people = item ? allPeople.filter((p) => personInAudience(item, p) && formatOk(p, item.format)) : allPeople;
  if (item?.respectSchedule !== false && settings) people = people.map((p) => withoutCourses(p, settings, date, wd));
  const full = people.filter((p) => (p.slots || []).some((x) => x.d === wd && x.s <= s && x.e >= e));
  const part = people.filter((p) => !full.includes(p) && (p.slots || []).some((x) => x.d === wd && x.s < e && x.e > s));
  return { full, part };
}

function scoreOf(poll, optId) {
  let yes = 0, maybe = 0, no = 0;
  for (const [id, v] of Object.entries(poll.votes || {})) {
    if (hiddenId(id)) continue;
    if (v?.[optId] === 'yes') yes++; else if (v?.[optId] === 'maybe') maybe++; else if (v?.[optId] === 'no') no++;
  }
  return { yes, maybe, no, score: yes * 2 + maybe };
}

// =================== Vue principale ===================
// Catégorie repliable (repliée par défaut)
function Fold({ title, count, children }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <>
      <button className="link sec-title muted-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDown size={16} className={open ? 'rot' : ''} /> {title} ({count})
      </button>
      {open && children}
    </>
  );
}

export default function PollsView({ polls, sessions, people, me, isAdmin, onSession, openPollForm, openSessionForm, onPollTouched, settings }) {
  const today = isoDate(new Date());
  const upcoming = sessions.filter((s) => !isPast(s.date, s.e) && !s.cancelled);
  const cancelledSessions = sessions.filter((s) => !isPast(s.date, s.e) && s.cancelled);
  const past = sessions.filter((s) => isPast(s.date, s.e)).reverse();
  const open = polls.filter(isOpenPoll);
  const closed = polls.filter((p) => p.status === 'closed');
  const cancelledPolls = polls.filter((p) => p.status === 'cancelled');
  const card = (p, extra = {}) => <PollCard key={p.id} poll={p} people={people} me={me} isAdmin={isAdmin} settings={settings} onEdit={() => openPollForm(p)} {...extra} />;
  const row = (s) => <SessionRow key={s.id} s={s} people={people} me={me} onClick={() => onSession(s)} isToday={s.date === today} />;

  return (
    <div className="polls">
      <div className="pv-actions">
        <button className="btn primary" onClick={() => openPollForm(null)}><Vote size={17} /> Nouveau sondage</button>
        <button className="btn" onClick={() => openSessionForm(null)}><CalendarPlus size={17} /> Planifier une séance</button>
      </div>

      <h3 className="sec-title"><CalendarCheck size={18} /> Séances à venir</h3>
      {upcoming.length === 0 ? <p className="muted">Aucune séance prévue. Lance un sondage ou planifie directement.</p>
        : <div className="sess-list">{upcoming.map(row)}</div>}

      <h3 className="sec-title"><Vote size={18} /> Sondages en cours</h3>
      {open.length === 0 ? <Empty icon={Vote} title="Aucun sondage en cours">Propose quelques dates et laisse chacun voter.</Empty>
        : open.map((p) => card(p, { onTouched: onPollTouched }))}

      <div className="folds">
        <Fold title="Sondages terminés" count={closed.length}>
          {closed.map((p) => card(p, { onSession: () => { const s = sessions.find((x) => x.id === p.sessionId); if (s) onSession(s); } }))}
        </Fold>
        <Fold title="Sondages annulés" count={cancelledPolls.length}>
          {cancelledPolls.map((p) => card(p))}
        </Fold>
        <Fold title="Séances annulées" count={cancelledSessions.length}>
          <div className="sess-list">{cancelledSessions.map(row)}</div>
        </Fold>
        <Fold title="Séances terminées" count={past.length}>
          <div className="sess-list past">{past.map(row)}</div>
        </Fold>
      </div>
    </div>
  );
}

function SessionRow({ s, people, me, onClick, isToday }) {
  const att = (s.attendees || []).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const inIt = me && (s.attendees || []).includes(me.id);
  return (
    <button className={'sess-row' + (inIt ? ' in' : '') + (isToday ? ' today' : '') + (s.cancelled ? ' cancelled' : '') + (s.subject && SUBJECTS[s.subject] ? ' has-sc' : '')} onClick={onClick}
      style={s.subject && SUBJECTS[s.subject] ? { '--sc': SUBJECTS[s.subject].color } : undefined}>
      <div className="sr-date">
        <b>{parseIso(s.date).getDate()}</b>
        <span>{parseIso(s.date).toLocaleDateString('fr-FR', { month: 'short' })}</span>
      </div>
      <div className="grow">
        <strong>{s.title}</strong>
        <div className="muted tiny">{fmtDay(s.date, { weekday: 'long' })} · {fmt(s.s)}–{fmt(s.e)} · {SESSION_FORMATS[s.format] || s.format}{s.place ? ` · ${s.place}` : ''}</div>
        <AudiencePill item={s} />
        <AvatarStack people={att} max={8} size={22} label={placesLabel(s)} />
        <div className="sr-pills">
          {s.cancelled && <span className="pill bad">Annulée</span>}
          {!s.cancelled && sessionState(s, me?.id).needsDecision && <span className="pill warn">Sous le minimum</span>}
          {inIt && !s.cancelled && <span className="pill ok"><Check size={13} /> J'y vais</span>}
          {!inIt && me && sessionState(s, me.id).status === 'wait' && <span className="pill warn">Attente n°{sessionState(s, me.id).rank}</span>}
          {!inIt && me && sessionState(s, me.id).status === 'out' && sessionState(s, me.id).full && <span className="pill bad">Complet</span>}
        </div>
      </div>
    </button>
  );
}

// =================== Carte de sondage ===================
function optionGroups(poll, o, allPeople, settings) {
  const people = allPeople.filter((p) => personInAudience(poll, p) || poll.votes?.[p.id]);
  const v = poll.votes || {};
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const by = (k) => people.filter((p) => v[p.id]?.[o.id] === k);
  const yes = yesOrder(poll, o.id).map((id) => byId[id]).filter(Boolean);
  const { inn, wait } = splitPlaces(yes, Number(poll.max) || 0);
  const answered = new Set([...yes, ...by('maybe'), ...by('no')].map((p) => p.id));
  const fc = forecast(allPeople, o.date, o.s, o.e, { settings, item: poll });
  const noAnswer = people.filter((p) => !answered.has(p.id));
  return {
    yes, yesIn: inn, yesWait: wait, maybe: by('maybe'), no: by('no'), fc,
    pendingDispo: noAnswer.filter((p) => fc.full.includes(p)),
    pendingOther: noAnswer.filter((p) => !fc.full.includes(p)),
  };
}

function PollCard({ poll, people, me, isAdmin, onEdit, onSession, onTouched, settings }) {
  const closed = poll.status === 'closed' || poll.status === 'cancelled';
  const isCancelled = poll.status === 'cancelled';
  const myVotes = (me && poll.votes?.[me.id]) || {};
  const [draft, setDraft] = useState(myVotes);
  const liveKey = JSON.stringify(myVotes);
  // Si le vote change ailleurs (autre appareil, création du sondage…), on resynchronise l'affichage
  useEffect(() => { setDraft(JSON.parse(liveKey)); }, [liveKey]);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [detail, setDetail] = useState(null); // option
  const [votersOpen, setVotersOpen] = useState(false);
  const canManage = isAdmin || (me && poll.createdBy === me.id);
  const canVote = !closed && me && me.id !== 'admin';
  const voters = Object.keys(poll.votes || {}).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const notVoted = people.filter((p) => !poll.votes?.[p.id] && personInAudience(poll, p));
  const scores = Object.fromEntries(poll.options.map((o) => [o.id, scoreOf(poll, o.id)]));
  const best = Math.max(0, ...Object.values(scores).map((s) => s.score));
  const deadlinePassed = poll.deadline && isPast(poll.deadline);
  const iVoted = me && poll.votes?.[me.id];
  const max = Number(poll.max) || 0;
  const min = Number(poll.min) || 0;

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

  const detailData = detail && optionGroups(poll, detail, people, settings);

  return (
    <div className={'card poll' + (closed ? ' closed' : '') + (isCancelled ? ' cancelled' : '') + (canVote && !iVoted ? ' todo' : '') + (poll.subject && SUBJECTS[poll.subject] ? ' has-sc' : '')}
      id={`poll-${poll.id}`} style={poll.subject && SUBJECTS[poll.subject] ? { '--sc': SUBJECTS[poll.subject].color } : undefined}>
      <div className="poll-head">
        <div className="grow">
          {canVote && !iVoted && <span className="pill warn todo-pill">À toi de voter</span>}
          <h4>{poll.title}</h4>
          <div className="muted tiny">
            par {poll.createdByName} · {timeAgo(poll.createdAt)}
            {poll.deadline && <> · réponse avant le {fmtDayShort(poll.deadline)}{deadlinePassed && ' (dépassé)'}</>}
          </div>
          {poll.description && <p className="poll-desc">{poll.description}</p>}
          <AudiencePill item={poll} />
          <div className="muted tiny">{SESSION_FORMATS[poll.format] || 'Hybride'}{poll.place ? ` · ${poll.place}` : ''}{max > 0 ? ` · ${max} places max` : ''}{min > 0 ? ` · ${min} minimum` : ''}</div>
        </div>
        {canManage && !closed && (
          <div className="poll-tools">
            <button className="icon-btn" onClick={onEdit} title="Modifier"><Pencil size={17} /></button>
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
          const g = optionGroups(poll, o, people, settings);
          const conf = poll.respectSchedule !== false ? conflictsFor(settings, poll.audience, o.date, o.s, o.e) : [];
          const hol = holidayOn(settings, o.date);
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
                {(conf.length > 0 || hol) && <ConflictPills conf={conf} hol={hol} />}
                <div className="opt-bar" title={`${sc.yes} oui · ${sc.maybe} peut-être · ${sc.no} non`}>
                  <i className="yes" style={{ width: `${(sc.yes / total) * 100}%` }} />
                  <i className="maybe" style={{ width: `${(sc.maybe / total) * 100}%` }} />
                  <i className="no" style={{ width: `${(sc.no / total) * 100}%` }} />
                </div>
                <div className="opt-stats">
                  <span className="vc yes">{sc.yes} oui</span>
                  <span className="vc maybe">{sc.maybe} peut-être</span>
                  <span className="vc no">{sc.no} non</span>
                  {min > 0 && <span className={'vc ' + (g.yes.length >= min ? 'minok' : 'minko')}>{g.yes.length >= min ? `min ${min} ✓` : `il manque ${min - g.yes.length} (min ${min})`}</span>}
                  {max > 0 && <span className={'vc places' + (g.yes.length >= max ? ' full' : '')}>{Math.min(g.yes.length, max)}/{max} places{g.yesWait.length ? ` · ${g.yesWait.length} en attente` : ''}</span>}
                  <span className="fc"><Clock size={12} /> {g.fc.full.length} dispo (planning)</span>
                  {(() => { const n = (poll.comments || []).filter((c) => c.optId === o.id).length; return n > 0 && <span className="vc com">💬 {n} commentaire{n > 1 ? 's' : ''}</span>; })()}
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
              {canVote && (draft[o.id] === 'yes' || draft[o.id] === 'maybe') && (() => {
                const mine = personCoursesAt(me, settings, o.date, parseIso(o.date).getDay(), o.s, o.e);
                if (!mine.length) return null;
                return (
                  <div className="course-warn" role="alert">
                    <AlertTriangle size={17} />
                    <div>
                      <b>Attention, ce sont tes heures de cours !</b>
                      <span>{mine.map((c) => `${SUBJECTS[c.subject]?.label || c.subject} ${fmt(c.s)}-${fmt(c.e)}`).join(' · ')}</span>
                      <span className="muted">Ton « {VOTE[draft[o.id]].label} » est quand même enregistré.</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      <PollComments poll={poll} me={me} people={people} canModerate={canManage} />
      {!isCancelled && <WaButton wide onClick={() => shareWhatsApp(pollMessage(poll))} />}
      {isCancelled && <p className="alert danger-alert"><b>Sondage annulé</b>{poll.cancelledBy ? ` par ${poll.cancelledBy}` : ''}. Ceux qui avaient voté Oui ou Peut-être ont été prévenus.</p>}
      {canManage && (
        <div className="manage-row">
          {!closed && <ConfirmButton className="btn small ghost danger" confirmText="Confirmer l'annulation" onConfirm={() => cancelPoll(poll, actorName(me))}><Ban size={15} /> Annuler le sondage</ConfirmButton>}
          {isCancelled && <button className="btn small ghost" onClick={() => cancelPoll(poll, actorName(me), false)}><RotateCcw size={15} /> Rétablir</button>}
          <ConfirmButton className="btn small ghost danger" confirmText="Supprimer définitivement ?" onConfirm={() => deletePoll(poll, actorName(me))}><Trash2 size={15} /> Supprimer (erreur)</ConfirmButton>
        </div>
      )}
      <div className="poll-foot">
        {canVote && (
          <span className={'vote-status' + (saved ? ' ok' : '')}>
            {busy ? 'Enregistrement…' : saved ? <><Check size={15} /> Vote enregistré</> : iVoted ? <><Check size={15} /> Ton vote est pris en compte — tu peux le changer à tout moment</> : 'Clique sur Oui, Peut-être ou Non : c’est enregistré directement'}
          </span>
        )}
        <span className="grow" />
        {!closed && canManage && <button className="btn" onClick={() => setClosing(true)}><Lock size={16} /> Clôturer</button>}
        {closed && !isCancelled && <button className="btn small" onClick={onSession}><CalendarCheck size={15} /> Voir la séance</button>}
        {closed && !isCancelled && canManage && <ConfirmButton className="btn small ghost" confirmText="Rouvrir (supprime la séance) ?" onConfirm={() => reopenPoll(poll, actorName(me))}><RotateCcw size={15} /> Rouvrir</ConfirmButton>}
      </div>

      {detail && (
        <PeopleModal meId={me?.id} onClose={() => setDetail(null)}
          after={<PollComments poll={poll} me={me} people={people} canModerate={canManage} optId={detail.id} />}
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
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    await closePoll(poll, poll.options.find((o) => o.id === optId), { format, place, notify }, actorName(me));
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
      <p className="places-fixed">
        <b>Places :</b> {poll.max ? `${poll.max} max (fixé par le sondage : au-delà, liste d'attente)` : 'illimitées (tout le monde pourra rejoindre)'}
        {poll.min ? <> · <b>minimum {poll.min}</b></> : ''}
      </p>
      {poll.min > 0 && optId && (() => { const n = yesOrder(poll, optId).length; return n < poll.min ? <p className="alert warn">Attention : seulement {n} « Oui » pour cette date, le minimum ({poll.min}) n'est pas atteint.</p> : null; })()}
      <NotifyCheck value={notify} onChange={setNotify} />
    </Modal>
  );
}

// =================== Formulaire de sondage ===================
export function PollForm({ initial, prefill, people, me, onClose, settings, defaultAudience = [], defaultSubject = '' }) {
  const isEdit = !!initial?.id;
  const [title, setTitle] = useState(initial?.title || 'Séance de révision');
  const [description, setDescription] = useState(initial?.description || '');
  const [format, setFormat] = useState(initial?.format || 'hybride');
  const [audience, setAudience] = useState(initial?.audience || (initial?.id ? [] : defaultAudience.length ? defaultAudience : formationsOf(me)));
  const [subject, setSubject] = useState(initial?.subject || (initial?.id ? '' : defaultSubject));
  const [respectSchedule, setRespectSchedule] = useState(initial?.respectSchedule !== false);
  const [imAvailable, setImAvailable] = useState(true);
  const [place, setPlace] = useState(initial?.place || '');
  const [deadline, setDeadline] = useState(initial?.deadline || '');
  const [max, setMax] = useState(initial?.max || '');
  const [min, setMin] = useState(initial?.min || '');
  const [options, setOptions] = useState(() => initial?.options?.map((o) => ({ ...o, sh: toHHMM(o.s), eh: toHHMM(o.e) }))
    || prefill || [{ id: uid(), date: isoDate(new Date(Date.now() + 86400000)), sh: '14:00', eh: '17:00' }]);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);
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
    if (Number(min) && Number(max) && Number(min) > Number(max)) return setErr('Le minimum ne peut pas dépasser le maximum.');
    opts.sort((a, b) => (a.date + a.s).localeCompare(b.date + b.s));
    const data = { title: title.trim(), description: description.trim(), format, place: place.trim(), deadline: deadline || null, max: Number(max) || null, min: Number(min) || null, audience, subject: subject || null, respectSchedule, options: opts };
    setBusy(true);
    try {
      if (isEdit) {
        // Les dates ajoutées par le créateur : il est compté « Oui » dessus aussi
        const added = opts.filter((o) => !initial.options.some((x) => x.id === o.id));
        const extra = {};
        if (me && me.id !== 'admin' && me.id === initial.createdBy && added.length) {
          for (const o of added) { extra[`votes.${me.id}.${o.id}`] = 'yes'; extra[`queue.${o.id}`] = arrayUnion(me.id); }
        }
        await updatePoll(initial.id, { ...data, ...extra }, actorName(me), data.title); onClose();
      }
      else { const id = await createPoll(data, me, imAvailable); setCreated({ ...data, id, status: 'open' }); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    created ? <SharedDone title="Sondage publié" item={created.title} onShare={() => shareWhatsApp(pollMessage(created))} onClose={onClose} /> :
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
      {!isEdit && me && me.id !== 'admin' && (
        <label className="switch">
          <input type="checkbox" checked={imAvailable} onChange={(e) => setImAvailable(e.target.checked)} />
          <span><b>Je suis dispo à toutes ces dates</b><br />
            <small className="muted">Tu es compté(e) « Oui » partout dès la publication. Décoche si tu crées le sondage pour d'autres ; tu peux changer ton vote à tout moment.</small></span>
        </label>
      )}
      <PlacesFields max={max} setMax={setMax} min={min} setMin={setMin} />
      <AudienceFields audience={audience} setAudience={setAudience} subject={subject} setSubject={setSubject}
        respectSchedule={respectSchedule} setRespectSchedule={setRespectSchedule} />

      <h3 className="fsub">Dates proposées</h3>
      <div className="opt-edit">
        {options.map((o, i) => {
          const s = toMin(o.sh), e = toMin(o.eh);
          const item = { audience, subject, respectSchedule, format };
          const fc = o.date && s !== null && e !== null ? forecast(people, o.date, s, e, { settings, item }) : null;
          const conf = fc && respectSchedule ? conflictsFor(settings, audience, o.date, s, e) : [];
          const hol = o.date && holidayOn(settings, o.date);
          return (
            <div key={o.id} className="oe-row">
              <input type="date" value={o.date} onChange={(ev) => setOpt(i, 'date', ev.target.value)} />
              <input type="time" step={900} value={o.sh} onChange={(ev) => setOpt(i, 'sh', ev.target.value)} />
              <span>→</span>
              <input type="time" step={900} value={o.eh} onChange={(ev) => setOpt(i, 'eh', ev.target.value)} />
              {fc && <span className="fc" title={fc.full.map((p) => p.prenom).join(', ')}><Users size={13} /> {fc.full.length}{fc.part.length ? ` (+${fc.part.length})` : ''}</span>}
              <button className="icon-btn" onClick={() => setOptions(options.filter((_, j) => j !== i))} disabled={options.length < 2}><Trash2 size={16} /></button>
              {(conf.length > 0 || hol) && <div className="oe-warn"><ConflictPills conf={conf} hol={hol} /></div>}
            </div>
          );
        })}
      </div>
      <button className="btn small" onClick={add}><Plus size={15} /> Ajouter une date</button>
      <p className="muted tiny">Le petit chiffre = personnes du public visé dispo sur tout le créneau d'après le planning (+ partiellement){respectSchedule ? ', heures de cours retirées' : ''}.</p>
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
    setMsg(r === 'in' ? 'C’est noté, ta place est réservée !' : r === 'wait' ? 'Séance complète : tu es en liste d’attente.' : r === 'freed' ? 'Ta place est libérée, la liste d’attente est prévenue.' : canManage ? 'Tu n’es plus inscrit(e). La séance a toujours lieu et tu peux toujours la gérer.' : 'Désinscription enregistrée.');
    setBusy(false);
  };
  const isPerson = me && me.id !== 'admin';
  const actor = actorName(me);
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
        {canManage && <button className="btn ghost" onClick={onEdit}><Pencil size={16} /> Modifier</button>}
        <button className="btn ghost" onClick={ics} title="Ajouter à mon agenda"><CalendarPlus size={16} /></button>
        <WaButton onClick={() => shareWhatsApp(sessionMessage(s))} />
        <span className="grow" />
        {!st.cancelled && isPerson && st.status === 'in' && <button className="btn" disabled={busy} onClick={() => act(false)}>Je ne suis plus dispo</button>}
        {!st.cancelled && isPerson && st.status === 'wait' && st.free > 0 && <button className="btn primary" disabled={busy} onClick={() => act(true)}><Check size={16} /> Je prends la place</button>}
        {!st.cancelled && isPerson && st.status === 'wait' && <button className="btn ghost" disabled={busy} onClick={() => act(false)}>Quitter l'attente</button>}
        {!st.cancelled && isPerson && st.status === 'out' && <button className="btn primary" disabled={busy} onClick={() => act(true)}>{st.full ? 'Liste d’attente' : <><Check size={16} /> J'y vais</>}</button>}
      </>}>
      <div className="sess-info">
        <p><CalendarCheck size={16} /> <b>{fmtDay(s.date)}</b> · {fmt(s.s)} – {fmt(s.e)}</p>
        <p><Users size={16} /> {SESSION_FORMATS[s.format] || s.format}</p>
        {s.place && <p><MapPin size={16} /> {/^https?:\/\//.test(s.place) ? <a href={s.place} target="_blank" rel="noreferrer">{s.place}</a> : s.place}</p>}
        {s.note && <p className="muted">{s.note}</p>}
        <AudiencePill item={s} />
        <p className="muted tiny">Créée par {s.createdByName}{s.pollId ? ' via un sondage' : ''}</p>
      </div>
      {!st.cancelled && <SessionInfoBlock s={s} canManage={canManage} isAttendee={!!me && st.status === 'in'} actor={actor} />}
      {st.cancelled && <p className="alert danger-alert"><b>Séance annulée</b>{s.cancelledBy ? ` par ${s.cancelledBy}` : ''}. Elle reste affichée (barrée) dans le planning pour prévenir les inscrits.</p>}
      {canManage && (
        <div className="manage-row">
          {!st.cancelled && !st.needsDecision && (
            <ConfirmButton className="btn small ghost danger" confirmText="Confirmer l'annulation" onConfirm={() => cancelSession(s, actor)}>
              <CalendarX2 size={15} /> Annuler la séance
            </ConfirmButton>
          )}
          {st.cancelled && <button className="btn small ghost" onClick={() => cancelSession(s, actor, false)}><RotateCcw size={15} /> Rétablir</button>}
          <ConfirmButton className="btn small ghost danger" confirmText="Supprimer définitivement ?" onConfirm={async () => { await deleteSession(s, actor); onClose(); }}>
            <Trash2 size={15} /> Supprimer (erreur)
          </ConfirmButton>
        </div>
      )}
      {canManage && <p className="muted tiny manage-help"><b>Annuler</b> : la séance reste visible, barrée, et les inscrits sont prévenus. <b>Supprimer</b> : elle disparaît complètement (à utiliser si elle a été créée par erreur{s.pollId ? ' — le sondage d’origine est rouvert' : ''}).</p>}
      {canManage && st.needsDecision && (
        <div className="decision">
          <p><b>Minimum pas atteint :</b> {att.length} inscrit{att.length > 1 ? 's' : ''} pour un minimum de {st.min}. Tu maintiens la séance ?</p>
          <div className="row-btns">
            <ConfirmButton className="btn danger" confirmText="Confirmer l'annulation" onConfirm={() => cancelSession(s, actor)}>Annuler la séance</ConfirmButton>
            <button className="btn primary" onClick={() => keepSession(s, actor)}>Maintenir</button>
          </div>
        </div>
      )}
      {st.min > 0 && !st.max && (
        <p className={'places-fixed' + (st.missing ? ' ko' : '')}>{st.missing ? `Il manque ${st.missing} personne${st.missing > 1 ? 's' : ''} (minimum ${st.min})` : `Minimum de ${st.min} atteint ✓`}</p>
      )}
      {st.max > 0 && (
        <div className={'places-box' + (st.full ? ' full' : '')}>
          <b>{att.length}/{st.max} places</b>
          <span className="bar-track"><i style={{ width: `${Math.min(100, (att.length / st.max) * 100)}%` }} /></span>
          <span className="muted tiny">{st.full ? 'Complet' : `${st.free} place${st.free > 1 ? 's' : ''} libre${st.free > 1 ? 's' : ''}`}{waiting.length ? ` · ${waiting.length} en attente` : ''}{st.min ? (st.missing ? ` · il en manque ${st.missing} (min ${st.min})` : ` · min ${st.min} ✓`) : ''}</span>
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

export function SessionForm({ initial, prefill, people, me, onClose, settings, defaultAudience = [], defaultSubject = '' }) {
  const isEdit = !!initial?.id;
  const base = initial || prefill || {};
  const [title, setTitle] = useState(base.title || 'Séance de révision');
  const [date, setDate] = useState(base.date || isoDate(new Date(Date.now() + 86400000)));
  const [sh, setSh] = useState(toHHMM(base.s ?? 840));
  const [eh, setEh] = useState(toHHMM(base.e ?? 1020));
  const [format, setFormat] = useState(base.format || 'hybride');
  const [audience, setAudience] = useState(base.audience || (isEdit ? [] : defaultAudience.length ? defaultAudience : formationsOf(me)));
  const [subject, setSubject] = useState(base.subject || (isEdit ? '' : defaultSubject));
  const [respectSchedule, setRespectSchedule] = useState(base.respectSchedule !== false);
  const [place, setPlace] = useState(base.place || '');
  const [note, setNote] = useState(base.note || '');
  const [attendees, setAttendees] = useState(base.attendees || (me && me.id !== 'admin' ? [me.id] : []));
  const [notify, setNotify] = useState(base.notify !== false);
  const [max, setMax] = useState(base.max || '');
  const [min, setMin] = useState(base.min || '');
  const maxLocked = !!(isEdit && initial.pollId && initial.max && me?.id !== 'admin');
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const s = toMin(sh), e0 = toMin(eh);
  const item = { audience, subject, respectSchedule, format };
  const fc = useMemo(() => (date && s !== null && e0 !== null ? forecast(people, date, s, e0, { settings, item }) : null), [people, date, s, e0, settings, audience, subject, respectSchedule, format]); // eslint-disable-line react-hooks/exhaustive-deps
  const conf = fc && respectSchedule ? conflictsFor(settings, audience, date, s, e0) : [];
  const hol = date && holidayOn(settings, date);

  const save = async () => {
    setErr('');
    let e = e0;
    if (e === 0 || e === 1439) e = 1440;
    if (!title.trim() || !date || s === null || e === null) return setErr('Titre, date et horaires obligatoires.');
    if (e <= s) return setErr('La fin doit être après le début.');
    const m = Number(max) || null;
    if (Number(min) && m && Number(min) > m) return setErr('Le minimum ne peut pas dépasser le maximum.');
    let att = [...attendees];
    let wait = (base.waitlist || []).filter((x) => !att.includes(x));
    if (m && att.length > m) { wait = [...att.slice(m), ...wait]; att = att.slice(0, m); }
    const data = { title: title.trim(), date, s, e, format, place: place.trim(), note: note.trim(), attendees: att, waitlist: wait, max: m, min: Number(min) || null, notify, audience, subject: subject || null, respectSchedule };
    setBusy(true);
    try {
      if (isEdit) await updateSession(initial.id, data, actorName(me), data.title);
      else { const id = await createSession(data, me); setCreated({ ...data, id }); }
    } catch (er) { setErr(er.message); }
    setBusy(false);
  };

  return (
    created ? <SharedDone title="Séance ajoutée au planning" item={created.title} onShare={() => shareWhatsApp(sessionMessage(created))} onClose={onClose} /> :
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
      {(conf.length > 0 || hol) && <p className="oe-warn"><ConflictPills conf={conf} hol={hol} /></p>}
      <PlacesFields max={max} setMax={setMax} min={min} setMin={setMin} maxLocked={maxLocked} />
      <AudienceFields audience={audience} setAudience={setAudience} subject={subject} setSubject={setSubject}
        respectSchedule={respectSchedule} setRespectSchedule={setRespectSchedule} />
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

function PlacesFields({ max, setMax, min, setMin, maxLocked }) {
  return (
    <div className="places-fields">
      <div className="grid2">
        <label className="field"><span>Places max (vide = illimité)</span>
          <input type="number" min={1} inputMode="numeric" value={max} disabled={maxLocked} onChange={(e) => setMax(e.target.value)} placeholder="Illimité" />
        </label>
        <label className="field"><span>Minimum (vide = aucun)</span>
          <input type="number" min={1} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Aucun" />
        </label>
      </div>
      <small className="muted">
        {maxLocked ? 'Le nombre de places est fixé par le sondage. ' : ''}
        Max : premier arrivé, premier servi, puis liste d'attente. Min : si quelqu'un se désiste et qu'on passe en dessous, le créateur de la séance est prévenu pour décider d'annuler ou de maintenir.
      </small>
    </div>
  );
}

export function AudiencePill({ item }) {
  if (!item?.audience?.length && !item?.subject) return null;
  return (
    <div className="aud-row">
      {item.subject && <span className="pill aud" style={{ '--c': SUBJECTS[item.subject]?.color }}>{SUBJECTS[item.subject]?.label}</span>}
      {(item.audience || []).map((f) => <span key={f} className="pill aud" style={{ '--c': FORMATIONS[f]?.color }}>{FORMATIONS[f]?.label}</span>)}
    </div>
  );
}

export function ConflictPills({ conf, hol }) {
  return (
    <span className="conf-row">
      {hol && <span className="pill ok">Vacances de {hol.label}</span>}
      {conf.map((x, i) => (
        <span key={i} className="conflict" title="Des cours ont lieu à ce moment">
          Cours {FORMATIONS[x.f]?.short} : {SUBJECTS[x.c.subject]?.label || x.c.subject} {fmt(x.c.s)}–{fmt(x.c.e)}
        </span>
      ))}
    </span>
  );
}

function AudienceFields({ audience, setAudience, subject, setSubject, respectSchedule, setRespectSchedule }) {
  return (
    <div className="aud-fields">
      <div className="field"><span>Pour quelle formation ? <small className="muted">(rien de coché = toutes)</small></span>
        <div className="chips">
          {Object.entries(FORMATIONS).map(([k, v]) => {
            const on = audience.includes(k);
            return (
              <button type="button" key={k} className={'chip' + (on ? ' on' : '')} style={{ '--c': v.color }}
                onClick={() => setAudience(on ? audience.filter((x) => x !== k) : [...audience, k])}>{v.label}</button>
            );
          })}
        </div>
      </div>
      <div className="field"><span>Matière à réviser <small className="muted">(facultatif)</small></span>
        <div className="chips">
          <button type="button" className={'chip' + (!subject ? ' on' : '')} onClick={() => setSubject('')}>Aucune en particulier</button>
          {Object.entries(SUBJECTS).map(([k, v]) => (
            <button type="button" key={k} className={'chip' + (subject === k ? ' on' : '')} style={{ '--c': v.color }} onClick={() => setSubject(k)}>{v.label}</button>
          ))}
        </div>
        {subject && <small className="muted">Seuls ceux qui ont cette matière (ou qui n'ont pas précisé leurs matières) le verront.</small>}
      </div>
      <label className="switch">
        <input type="checkbox" checked={respectSchedule} onChange={(e) => setRespectSchedule(e.target.checked)} />
        <span><b>Tenir compte de l'emploi du temps</b><br />
          <small className="muted">Signale les dates qui tombent pendant un cours ou les vacances, et ne compte pas comme dispo ceux qui sont en cours.</small></span>
      </label>
    </div>
  );
}
