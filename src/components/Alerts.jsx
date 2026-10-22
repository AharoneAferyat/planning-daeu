import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarCheck, Check, ChevronRight, Clock, EyeOff, MapPin, Vote, X } from 'lucide-react';
import { cancelSession, joinSession, keepSession } from '../data';
import { addDays, fmt, fmtDay, fmtDayShort, isPast, isoDate, ls, ss } from '../utils';
import { AvatarStack, Modal } from './ui';
import { decisionFor, placesLabel, sessionState } from '../places';
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
  // séance annulée : seuls les inscrits / la liste d'attente sont prévenus
  const relevant = upcoming.filter((s) => (s.cancelled ? sessionState(s, meId).status !== 'out' : (sessionState(s, meId).status !== 'out' || s.notify !== false)));
  const limit = isoDate(addDays(new Date(), 3));
  const soon = relevant.filter((s) => s.date <= limit);
  const base = soon.length ? soon : relevant.slice(0, 1);
  const freed = upcoming.filter((s) => { const st = sessionState(s, meId); return !s.cancelled && st.status === 'wait' && st.free > 0; });
  return [...freed, ...base.filter((s) => !freed.includes(s))];
}
const freedFor = (s, meId) => { const st = sessionState(s, meId); return !s.cancelled && st.status === 'wait' && st.free > 0; };
export const decisionsFor = (sessions, meId) => sessions.filter((s) => !isPast(s.date, s.e) && decisionFor(s, meId));

export function usePendingPolls(polls, meId) {
  const [hidden, setHidden] = useState(() => readList('ge_poll_hidden'));
  // Tous les sondages ouverts non masqués ; « pas encore voté » en premier
  const openPolls = useMemo(
    () => (polls || []).filter((p) => p.status !== 'closed' && !hidden.includes(p.id))
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
export function AlertsPopup({ sessions, polls, people, me, onSession, onGoPolls }) {
  const reminders = useMemo(() => sessionReminders(sessions, me.id), [sessions, me.id]);
  const decisions = useMemo(() => decisionsFor(sessions, me.id), [sessions, me.id]);
  const [pendingPolls, hidePoll, openPolls] = usePendingPolls(polls, me.id);
  const total = people.length;
  const remKey = 'ge_rem_seen_' + [...decisions.map((s) => 'd' + s.id + (s.attendees || []).length), ...reminders.map((s) => s.id + (freedFor(s, me.id) ? ':libre' : '') + (s.cancelled ? ':x' : ''))].join(',');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const showRem = (reminders.length > 0 || decisions.length > 0) && ss.get(remKey) !== '1';
    const showPolls = openPolls.length > 0 && ss.get('ge_polls_later') !== '1';
    if (showRem || showPolls) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;
  const close = () => { ss.set(remKey, '1'); ss.set('ge_polls_later', '1'); setOpen(false); };
  const soon = reminders.length && reminders[0].date <= isoDate(addDays(new Date(), 3));

  return (
    <Modal title={<><Bell size={18} /> Rappels</>} onClose={close}
      footer={<button className="btn primary block" onClick={close}>OK</button>}>
      {decisions.length > 0 && (
        <section className="al-block">
          <h4>À décider</h4>
          {decisions.map((s) => <DecisionCard key={s.id} s={s} me={me} onOpen={(x) => { close(); onSession(x); }} />)}
        </section>
      )}
      {reminders.length > 0 && (
        <section className="al-block">
          <h4>{reminders.some((s) => freedFor(s, me.id)) ? 'Place libérée et séances à venir' : soon ? (reminders.length > 1 ? 'Séances des 3 prochains jours' : 'Séance à venir') : 'Prochaine séance'}</h4>
          {reminders.map((s) => <SessionLine key={s.id} s={s} people={people} me={me} onOpen={(x) => { close(); onSession(x); }} />)}
        </section>
      )}
      {openPolls.length > 0 && (
        <section className="al-block">
          <h4>{openPolls.length > 1 ? `${openPolls.length} sondages en cours` : 'Un sondage en cours'}
            {pendingPolls.length > 0 && <span className="pill warn al-h-pill">{pendingPolls.length} à voter</span>}</h4>
          {openPolls.map((p) => {
            const voted = !!p.votes?.[me.id];
            const nVotes = Object.keys(p.votes || {}).length;
            const mine = p.createdBy === me.id;
            return (
            <div key={p.id} className={'al-poll' + (voted ? ' voted' : ' todo')}>
              <div className="grow">
                <div className="al-poll-tags">
                  {voted ? <span className="pill ok"><Check size={12} /> Tu as voté</span> : <span className="pill warn">À toi de voter</span>}
                  {mine && <span className="pill">Ton sondage</span>}
                </div>
                <b>{p.title}</b>
                <div className="muted tiny">{nVotes}/{total} ont répondu · {p.options.length} date{p.options.length > 1 ? 's' : ''}
                  {p.deadline ? ` · avant le ${fmtDayShort(p.deadline)}` : ''}{mine ? '' : ` · par ${p.createdByName}`}</div>
              </div>
              <div className="al-poll-btns">
                <button className={'btn small' + (voted ? '' : ' primary')} onClick={() => { close(); onGoPolls(p.id); }}><Vote size={14} /> {voted ? 'Voir' : 'Répondre'}</button>
                <button className="btn small ghost" onClick={() => hidePoll(p.id)} title="Ne plus me le rappeler"><EyeOff size={14} /> Ne plus afficher</button>
              </div>
            </div>
            );
          })}
          <button className="link" onClick={() => { ss.set('ge_polls_later', '1'); ss.set(remKey, '1'); setOpen(false); }}>Répondre plus tard</button>
        </section>
      )}
    </Modal>
  );
}

// ---------- Bandeaux permanents en haut du planning ----------
export function AlertsBar({ sessions, polls, people, me, onSession, onGoPolls }) {
  const reminders = useMemo(() => sessionReminders(sessions, me.id), [sessions, me.id]);
  const [pendingPolls, , openPolls] = usePendingPolls(polls, me.id);
  const decisions = useMemo(() => decisionsFor(sessions, me.id), [sessions, me.id]);
  const [closedRem, setClosedRem] = useState(() => ss.get('ge_bar_rem') === '1');
  if ((!reminders.length || closedRem) && !openPolls.length && !decisions.length) return null;
  return (
    <div className="al-bar">
      {decisions.map((s) => <DecisionCard key={s.id} s={s} me={me} onOpen={onSession} />)}
      {reminders.length > 0 && !closedRem && (
        <div className="al-card al-c-sess">
          <CalendarCheck size={20} className="al-ico" />
          <div className="grow al-list">
            {reminders.map((s) => <SessionLine key={s.id} s={s} people={people} me={me} onOpen={onSession} compact />)}
          </div>
          <button className="icon-btn" onClick={() => { ss.set('ge_bar_rem', '1'); setClosedRem(true); }} aria-label="Masquer"><X size={16} /></button>
        </div>
      )}
      {openPolls.length > 0 && (
        <button className={'al-card al-c-polls' + (pendingPolls.length ? '' : ' done')} onClick={() => onGoPolls((pendingPolls[0] || openPolls[0]).id)}>
          <Vote size={20} className="al-ico" />
          <span className="grow">
            <b>{openPolls.length > 1 ? `${openPolls.length} sondages en cours` : '1 sondage en cours'}</b>
            {pendingPolls.length > 0 ? <> · <span className="al-todo">{pendingPolls.length} à voter</span></> : <> · tu as répondu à tout</>}
          </span>
          <span className="al-go">{pendingPolls.length ? 'Répondre' : 'Voir'} <ChevronRight size={16} /></span>
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
