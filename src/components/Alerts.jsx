import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarCheck, Check, ChevronRight, Clock, EyeOff, MapPin, Vote, X } from 'lucide-react';
import { cancelSession, joinSession, keepSession } from '../data';
import { addDays, fmt, fmtDay, fmtDayShort, isPast, isoDate, ls, ss } from '../utils';
import { AvatarStack, Modal } from './ui';
import { decisionFor, isOpenPoll, placesLabel, sessionState } from '../places';
import { hiddenId } from '../testmode';
import { hasInfo, InfoLines } from './SessionInfo';
import { ConfirmButton } from './ui';

const readList = (k) => { try { return JSON.parse(ls.get(k) || '[]'); } catch { return []; } };

export function dayLabel(iso) {
  const today = isoDate(new Date());
  if (iso === today) return "Aujourd'hui";
  if (iso === isoDate(addDays(new Date(), 1))) return 'Demain';
  return fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'short' });
}

// Séances à rappeler : toutes celles des 3 prochains jours, sinon la prochaine seulement.
// Concerne les séances où je suis inscrit(e) + celles marquées « prévenir tout le monde ».
// + toujours : les séances où je suis en liste d'attente et où une place s'est libérée.
export function sessionReminders(sessions, meId) {
  const upcoming = sessions.filter((s) => !isPast(s.date, s.e));
  // les séances annulées ont leur propre alerte (voir cancelledFor)
  const relevant = upcoming.filter((s) => !s.cancelled && (sessionState(s, meId).status !== 'out' || s.notify !== false));
  // (les séances hors de mon public sont déjà filtrées en amont)
  const limit = isoDate(addDays(new Date(), 3));
  const soon = relevant.filter((s) => s.date <= limit);
  const base = soon.length ? soon : relevant.slice(0, 1);
  const freed = upcoming.filter((s) => { const st = sessionState(s, meId); return !s.cancelled && st.status === 'wait' && st.free > 0; });
  return [...freed, ...base.filter((s) => !freed.includes(s))];
}
const freedFor = (s, meId) => { const st = sessionState(s, meId); return !s.cancelled && st.status === 'wait' && st.free > 0; };
// ---------- Séances annulées : prévenir ceux qui devaient venir ----------
// = inscrits, liste d'attente, et ceux qui avaient voté Oui / Peut-être pour cette date dans le sondage
export function cancelledFor(sessions, polls, meId) {
  const seen = readList('ge_cancel_seen');
  return sessions.filter((s) => {
    if (!s.cancelled || isPast(s.date, s.e) || seen.includes(s.id)) return false;
    if (sessionState(s, meId).status !== 'out') return true;
    const poll = s.pollId && (polls || []).find((p) => p.id === s.pollId);
    const optId = poll?.finalOptionId;
    const v = optId && poll.votes?.[meId]?.[optId];
    return v === 'yes' || v === 'maybe';
  });
}
function ackCancelled(id) {
  const next = [...new Set([...readList('ge_cancel_seen'), id])];
  ls.set('ge_cancel_seen', JSON.stringify(next));
  window.dispatchEvent(new Event('ge-cancel-seen'));
}
function useCancelled(sessions, polls, meId) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    window.addEventListener('ge-cancel-seen', f);
    return () => window.removeEventListener('ge-cancel-seen', f);
  }, []);
  return useMemo(() => cancelledFor(sessions, polls, meId), [sessions, polls, meId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Sondages annulés : prévenir ceux qui avaient voté Oui / Peut-être (une seule fois, jusqu'à « Compris »)
export function cancelledPollsFor(polls, meId) {
  const seen = readList('ge_pollx_seen');
  return (polls || []).filter((p) => p.status === 'cancelled' && !seen.includes(p.id)
    && Object.values(p.votes?.[meId] || {}).some((v) => v === 'yes' || v === 'maybe'));
}
function ackPollCancel(id) {
  ls.set('ge_pollx_seen', JSON.stringify([...new Set([...readList('ge_pollx_seen'), id])]));
  window.dispatchEvent(new Event('ge-cancel-seen'));
}
export function PollCancelCard({ p, onOpen }) {
  return (
    <div className="al-card al-c-cancel">
      <div className="grow">
        <span className="al-cancel">Sondage annulé</span>
        <button className="al-sess-main" onClick={onOpen}>
          <b className="strike">{p.title}</b>
          <span className="muted tiny">{p.cancelledBy ? `annulé par ${p.cancelledBy} · ` : ''}tu avais répondu Oui / Peut-être</span>
        </button>
      </div>
      <button className="btn small" onClick={() => ackPollCancel(p.id)}><Check size={14} /> Compris</button>
    </div>
  );
}

export function CancelCard({ s, me, onOpen }) {
  const st = sessionState(s, me.id);
  const why = st.status === 'in' ? 'tu étais inscrit(e)' : st.status === 'wait' ? 'tu étais en liste d’attente' : 'tu avais répondu au sondage';
  return (
    <div className="al-card al-c-cancel">
      <div className="grow">
        <span className="al-cancel">Séance annulée</span>
        <button className="al-sess-main" onClick={() => onOpen(s)}>
          <b className="strike">{s.title}</b>
          <span className="muted tiny">{dayLabel(s.date)} · {fmt(s.s)}–{fmt(s.e)}{s.cancelledBy ? ` · annulée par ${s.cancelledBy}` : ''} · {why}</span>
        </button>
      </div>
      <button className="btn small" onClick={() => ackCancelled(s.id)}><Check size={14} /> Compris</button>
    </div>
  );
}

export const decisionsFor = (sessions, meId) => sessions.filter((s) => !isPast(s.date, s.e) && decisionFor(s, meId));

export function usePendingPolls(polls, meId) {
  const [hidden, setHidden] = useState(() => readList('ge_poll_hidden'));
  // Tous les sondages ouverts non masqués ; « pas encore voté » en premier
  const openPolls = useMemo(
    () => (polls || []).filter((p) => isOpenPoll(p) && !hidden.includes(p.id))
      .sort((a, b) => (a.votes?.[meId] ? 1 : 0) - (b.votes?.[meId] ? 1 : 0)),
    [polls, meId, hidden],
  );
  const pending = openPolls.filter((p) => !p.votes?.[meId]);
  useEffect(() => {
    const f = () => setHidden(readList('ge_poll_hidden'));
    window.addEventListener('ge-hidden', f);
    return () => window.removeEventListener('ge-hidden', f);
  }, []);
  const hide = (id) => {
    const next = [...new Set([...readList('ge_poll_hidden'), id])];
    ls.set('ge_poll_hidden', JSON.stringify(next));
    setHidden(next);
    window.dispatchEvent(new Event('ge-hidden'));
  };
  return [pending, hide, openPolls];
}

function SessionLine({ s, people, me, onOpen, compact }) {
  const att = (s.attendees || []).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const st = sessionState(s, me.id);
  const freed = !s.cancelled && st.status === 'wait' && st.free > 0;
  const [busy, setBusy] = useState(false);
  const join = async () => { setBusy(true); await joinSession(s, me, true); setBusy(false); };
  return (
    <div className={'al-sess' + (st.status === 'in' ? ' in' : '') + (freed ? ' freed' : '') + (s.cancelled ? ' cancelled' : '')}>
      <button className="al-sess-main" onClick={() => onOpen(s)}>
        {freed && <span className="al-freed">Une place s'est libérée !</span>}
        {s.cancelled && <span className="al-cancel">Séance annulée</span>}
        <span className="al-day">{dayLabel(s.date)}{compact && <span className="al-time"> · {fmt(s.s)}–{fmt(s.e)}</span>}</span>
        <b>{s.title}</b>
        {!compact && <span className="muted tiny"><Clock size={12} /> {fmt(s.s)}–{fmt(s.e)}{s.place ? <> · <MapPin size={12} /> {s.place}</> : ''}</span>}
        {!compact && <AvatarStack people={att} max={6} size={22} label={placesLabel(s)} />}
      </button>
      {s.cancelled ? null : <>
      {st.status === 'in' && <span className="pill ok"><Check size={13} /> J'y vais</span>}
      {freed && <button className={'btn small primary' + (compact ? ' al-join' : '')} disabled={busy} onClick={join}>Je prends la place</button>}
      {st.status === 'wait' && !freed && <span className="pill warn">Attente n°{st.rank}</span>}
      {st.status === 'out' && (
        <button className={'btn small ' + (st.full ? '' : 'primary') + (compact ? ' al-join' : '')} disabled={busy} onClick={join}>{st.full ? 'Liste d’attente' : 'J\'y vais'}</button>
      )}
      </>}
    </div>
  );
}

// ---------- Fenêtre affichée à l'arrivée sur le site ----------
// ---------- Infos pratiques ajoutées / modifiées (pour les inscrits) ----------
const infoKey = (s) => `${s.id}:${s.infoVersion || 0}`;
export function infoFor(sessions, meId) {
  const seen = readList('ge_info_seen');
  return sessions.filter((s) => !s.cancelled && !isPast(s.date, s.e) && hasInfo(s)
    && sessionState(s, meId).status === 'in' && !seen.includes(infoKey(s)));
}
function ackInfo(s) {
  const next = [...new Set([...readList('ge_info_seen'), infoKey(s)])];
  ls.set('ge_info_seen', JSON.stringify(next));
  window.dispatchEvent(new Event('ge-cancel-seen'));
}
function useInfos(sessions, meId) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    window.addEventListener('ge-cancel-seen', f);
    return () => window.removeEventListener('ge-cancel-seen', f);
  }, []);
  return useMemo(() => infoFor(sessions, meId), [sessions, meId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}
export function InfoCard({ s, onOpen }) {
  return (
    <div className="al-card al-c-info">
      <div className="grow">
        <span className="al-info-tag">Infos importantes</span>
        <button className="al-sess-main" onClick={() => onOpen(s)}>
          <b>{s.title} — infos importantes</b>
          <span className="muted tiny">{dayLabel(s.date)} · {fmt(s.s)}–{fmt(s.e)}</span>
        </button>
        <InfoLines info={s.info} compact />
      </div>
      <button className="btn small" onClick={() => ackInfo(s)}><Check size={14} /> Compris</button>
    </div>
  );
}

/*
  ORDRE DE PRIORITÉ des rappels (fenêtre d'accueil et bandeau) :
  1. Infos importantes d'une séance où je suis inscrit(e)
  2. Annulations : séance (j'étais inscrit, en attente, ou j'avais voté Oui / Peut-être) ou sondage (j'avais voté Oui / Peut-être)
  3. Place libérée (je suis en liste d'attente)
  4. À décider (je suis le créateur et le minimum n'est pas atteint)
  5. Séances à venir (3 prochains jours, sinon la prochaine)
  6. Sondages à voter
  7. Sondages en cours déjà votés
*/
function useAlerts(sessions, polls, me) {
  const infos = useInfos(sessions, me.id);
  const cancelled = useCancelled(sessions, polls, me.id);
  const cancelledPolls = useMemo(() => cancelledPollsFor(polls, me.id), [polls, me.id, cancelled]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => sessionReminders(sessions, me.id), [sessions, me.id]);
  const freed = all.filter((s) => freedFor(s, me.id));
  const reminders = all.filter((s) => !freedFor(s, me.id));
  const decisions = useMemo(() => decisionsFor(sessions, me.id), [sessions, me.id]);
  const [pendingPolls, hidePoll, openPolls] = usePendingPolls(polls, me.id);
  const votedPolls = openPolls.filter((p) => p.votes?.[me.id]);
  return { infos, cancelled, cancelledPolls, freed, decisions, reminders, pendingPolls, votedPolls, openPolls, hidePoll };
}

// Ligne compacte : titre + 1 ligne d'info + bouton
function PollRow({ p, total, onGo, onHide }) {
  const nVotes = Object.keys(p.votes || {}).filter((id) => !hiddenId(id)).length;
  return (
    <div className="al-row">
      <button className="al-row-main" onClick={onGo}>
        <b>{p.title}</b>
        <span className="muted tiny">{nVotes}/{total} réponses{p.deadline ? ` · avant le ${fmtDayShort(p.deadline)}` : ''}</span>
      </button>
      <button className="btn small primary" onClick={onGo}>Répondre</button>
      <button className="icon-btn" onClick={onHide} title="Ne plus me le rappeler" aria-label="Ne plus afficher"><EyeOff size={16} /></button>
    </div>
  );
}

// ---------- Fenêtre affichée à l'arrivée sur le site ----------
// skip : arrivée par un lien direct → on ne masque pas la cible avec la fenêtre (le bandeau reste)
export function AlertsPopup({ sessions, polls, people, me, onSession, onGoPolls, skip }) {
  const a = useAlerts(sessions, polls, me);
  const total = people.length;
  const remKey = 'ge_rem_seen_' + [...a.decisions.map((s) => 'd' + s.id + (s.attendees || []).length), ...a.freed.map((s) => s.id + ':libre'), ...a.reminders.map((s) => s.id)].join(',');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (skip) return;
    if (a.infos.length || a.cancelled.length || a.cancelledPolls.length) { setOpen(true); return; } // priorités 1 et 2 : toujours tant que pas « Compris »
    const showRem = (a.freed.length || a.decisions.length || a.reminders.length) && ss.get(remKey) !== '1';
    const showPolls = a.openPolls.length > 0 && ss.get('ge_polls_later') !== '1';
    if (showRem || showPolls) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;
  const close = () => { ss.set(remKey, '1'); ss.set('ge_polls_later', '1'); setOpen(false); };
  const openS = (x) => { close(); onSession(x); };
  const soon = a.reminders.length && a.reminders[0].date <= isoDate(addDays(new Date(), 3));
  const Section = ({ title, children, cls = '' }) => <section className={'al-block ' + cls}><h4>{title}</h4>{children}</section>;

  return (
    <Modal title={<><Bell size={18} /> Rappels</>} onClose={close}
      footer={<>
        {a.pendingPolls.length > 0 && <button className="btn ghost" onClick={() => { ss.set('ge_polls_later', '1'); ss.set(remKey, '1'); setOpen(false); }}>Plus tard</button>}
        <button className="btn primary grow" onClick={close}>OK</button>
      </>}>
      {a.infos.length > 0 && (
        <Section title="Infos importantes" cls="prio">
          {a.infos.map((s) => <InfoCard key={s.id} s={s} onOpen={openS} />)}
        </Section>
      )}
      {a.cancelled.length + a.cancelledPolls.length > 0 && (
        <Section title="Annulations">
          {a.cancelled.map((s) => <CancelCard key={s.id} s={s} me={me} onOpen={openS} />)}
          {a.cancelledPolls.map((p) => <PollCancelCard key={p.id} p={p} onOpen={() => { close(); onGoPolls(p.id); }} />)}
        </Section>
      )}
      {a.freed.length > 0 && (
        <Section title="Une place s'est libérée">
          {a.freed.map((s) => <SessionLine key={s.id} s={s} people={people} me={me} onOpen={openS} compact />)}
        </Section>
      )}
      {a.decisions.length > 0 && (
        <Section title="À décider">
          {a.decisions.map((s) => <DecisionCard key={s.id} s={s} me={me} onOpen={openS} />)}
        </Section>
      )}
      {a.reminders.length > 0 && (
        <Section title={soon ? (a.reminders.length > 1 ? 'Séances des 3 prochains jours' : 'Séance à venir') : 'Prochaine séance'}>
          {a.reminders.map((s) => <SessionLine key={s.id} s={s} people={people} me={me} onOpen={openS} compact />)}
        </Section>
      )}
      {a.pendingPolls.length > 0 && (
        <Section title={a.pendingPolls.length > 1 ? `${a.pendingPolls.length} sondages à voter` : 'Un sondage à voter'}>
          {a.pendingPolls.map((p) => <PollRow key={p.id} p={p} total={total} onGo={() => { close(); onGoPolls(p.id); }} onHide={() => a.hidePoll(p.id)} />)}
        </Section>
      )}
      {a.votedPolls.length > 0 && (
        <button className="al-summary" onClick={() => { close(); onGoPolls(a.votedPolls[0].id); }}>
          <Check size={15} /> {a.votedPolls.length} sondage{a.votedPolls.length > 1 ? 's' : ''} en cours où tu as déjà voté <ChevronRight size={15} />
        </button>
      )}
    </Modal>
  );
}

// ---------- Bandeaux permanents en haut du planning (même ordre de priorité) ----------
export function AlertsBar({ sessions, polls, people, me, onSession, onGoPolls }) {
  const a = useAlerts(sessions, polls, me);
  const [closedRem, setClosedRem] = useState(() => ss.get('ge_bar_rem') === '1');
  const sessLines = [...a.freed, ...(closedRem ? [] : a.reminders)];
  if (!a.infos.length && !a.cancelled.length && !a.cancelledPolls.length && !a.decisions.length && !sessLines.length && !a.openPolls.length) return null;
  return (
    <div className="al-bar">
      {a.infos.map((s) => <InfoCard key={s.id} s={s} onOpen={onSession} />)}
      {a.cancelled.map((s) => <CancelCard key={s.id} s={s} me={me} onOpen={onSession} />)}
      {a.cancelledPolls.map((p) => <PollCancelCard key={p.id} p={p} onOpen={() => onGoPolls(p.id)} />)}
      {a.freed.length > 0 && (
        <div className="al-card al-c-sess">
          <div className="grow al-list">{a.freed.map((s) => <SessionLine key={s.id} s={s} people={people} me={me} onOpen={onSession} compact />)}</div>
        </div>
      )}
      {a.decisions.map((s) => <DecisionCard key={s.id} s={s} me={me} onOpen={onSession} />)}
      {a.reminders.length > 0 && !closedRem && (
        <div className="al-card al-c-sess">
          <CalendarCheck size={20} className="al-ico" />
          <div className="grow al-list">
            {a.reminders.map((s) => <SessionLine key={s.id} s={s} people={people} me={me} onOpen={onSession} compact />)}
          </div>
          <button className="icon-btn" onClick={() => { ss.set('ge_bar_rem', '1'); setClosedRem(true); }} aria-label="Masquer"><X size={16} /></button>
        </div>
      )}
      {a.openPolls.length > 0 && (
        <button className={'al-card al-c-polls' + (a.pendingPolls.length ? '' : ' done')} onClick={() => onGoPolls((a.pendingPolls[0] || a.openPolls[0]).id)}>
          <Vote size={20} className="al-ico" />
          <span className="grow">
            <b>{a.openPolls.length > 1 ? `${a.openPolls.length} sondages en cours` : '1 sondage en cours'}</b>
            {a.pendingPolls.length > 0 ? <> · <span className="al-todo">{a.pendingPolls.length} à voter</span></> : <> · tu as répondu à tout</>}
          </span>
          <span className="al-go">{a.pendingPolls.length ? 'Répondre' : 'Voir'} <ChevronRight size={16} /></span>
        </button>
      )}
    </div>
  );
}

// ---------- Décision du créateur : on passe sous le minimum ----------
export function DecisionCard({ s, me, onOpen }) {
  const st = sessionState(s, me.id);
  const actor = me.id === 'admin' ? 'Admin' : `${me.prenom} ${me.nom || ''}`.trim();
  return (
    <div className="al-card al-c-decision">
      <div className="grow">
        <span className="al-decide">Minimum pas atteint</span>
        <button className="al-sess-main" onClick={() => onOpen(s)}>
          <b>{s.title}</b>
          <span className="muted tiny">{dayLabel(s.date)} · {fmt(s.s)}–{fmt(s.e)} · {st.att.length} inscrit{st.att.length > 1 ? 's' : ''} pour un minimum de {st.min}</span>
        </button>
        <div className="row-btns">
          <ConfirmButton className="btn small danger" confirmText="Confirmer l'annulation" onConfirm={() => cancelSession(s, actor)}>Annuler la séance</ConfirmButton>
          <button className="btn small primary" onClick={() => keepSession(s, actor)}>Maintenir</button>
        </div>
      </div>
    </div>
  );
}
