import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarCheck, Check, ChevronRight, Clock, EyeOff, MapPin, Vote, X } from 'lucide-react';
import { joinSession } from '../data';
import { addDays, fmt, fmtDay, fmtDayShort, isPast, isoDate, ls, ss } from '../utils';
import { AvatarStack, Modal } from './ui';

const readList = (k) => { try { return JSON.parse(ls.get(k) || '[]'); } catch { return []; } };

export function dayLabel(iso) {
  const today = isoDate(new Date());
  if (iso === today) return "Aujourd'hui";
  if (iso === isoDate(addDays(new Date(), 1))) return 'Demain';
  return fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'short' });
}

// Séances à rappeler : toutes celles des 3 prochains jours, sinon la prochaine seulement.
// Concerne les séances où je suis inscrit(e) + celles marquées « prévenir tout le monde ».
export function sessionReminders(sessions, meId) {
  const relevant = sessions.filter((s) => !isPast(s.date, s.e) && ((s.attendees || []).includes(meId) || s.notify !== false));
  const limit = isoDate(addDays(new Date(), 3));
  const soon = relevant.filter((s) => s.date <= limit);
  return soon.length ? soon : relevant.slice(0, 1);
}

export function usePendingPolls(polls, meId) {
  const [hidden, setHidden] = useState(() => readList('ge_poll_hidden'));
  const pending = useMemo(
    () => (polls || []).filter((p) => p.status !== 'closed' && !p.votes?.[meId] && !hidden.includes(p.id)),
    [polls, meId, hidden],
  );
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
  return [pending, hide];
}

function SessionLine({ s, people, me, onOpen, compact }) {
  const att = (s.attendees || []).map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const inIt = (s.attendees || []).includes(me.id);
  const [busy, setBusy] = useState(false);
  return (
    <div className={'al-sess' + (inIt ? ' in' : '')}>
      <button className="al-sess-main" onClick={() => onOpen(s)}>
        <span className="al-day">{dayLabel(s.date)}{compact && <span className="al-time"> · {fmt(s.s)}–{fmt(s.e)}</span>}</span>
        <b>{s.title}</b>
        {!compact && <span className="muted tiny"><Clock size={12} /> {fmt(s.s)}–{fmt(s.e)}{s.place ? <> · <MapPin size={12} /> {s.place}</> : ''}</span>}
        {!compact && <AvatarStack people={att} max={6} size={22} label={`${att.length} inscrit${att.length > 1 ? 's' : ''}`} />}
      </button>
      {inIt ? <span className="pill ok"><Check size={13} /> J'y vais</span> : (
        <button className={'btn small primary' + (compact ? ' al-join' : '')} disabled={busy} onClick={async () => { setBusy(true); await joinSession(s, me, true); setBusy(false); }}>J'y vais</button>
      )}
    </div>
  );
}

// ---------- Fenêtre affichée à l'arrivée sur le site ----------
export function AlertsPopup({ sessions, polls, people, me, onSession, onGoPolls }) {
  const reminders = useMemo(() => sessionReminders(sessions, me.id), [sessions, me.id]);
  const [pendingPolls, hidePoll] = usePendingPolls(polls, me.id);
  const remKey = 'ge_rem_seen_' + reminders.map((s) => s.id).join(',');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const showRem = reminders.length > 0 && ss.get(remKey) !== '1';
    const showPolls = pendingPolls.length > 0 && ss.get('ge_polls_later') !== '1';
    if (showRem || showPolls) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;
  const close = () => { ss.set(remKey, '1'); ss.set('ge_polls_later', '1'); setOpen(false); };
  const soon = reminders.length && reminders[0].date <= isoDate(addDays(new Date(), 3));

  return (
    <Modal title={<><Bell size={18} /> Rappels</>} onClose={close}
      footer={<button className="btn primary block" onClick={close}>OK</button>}>
      {reminders.length > 0 && (
        <section className="al-block">
          <h4>{soon ? (reminders.length > 1 ? 'Séances des 3 prochains jours' : 'Séance à venir') : 'Prochaine séance'}</h4>
          {reminders.map((s) => <SessionLine key={s.id} s={s} people={people} me={me} onOpen={(x) => { close(); onSession(x); }} />)}
        </section>
      )}
      {pendingPolls.length > 0 && (
        <section className="al-block">
          <h4>{pendingPolls.length > 1 ? `${pendingPolls.length} sondages attendent ta réponse` : 'Un sondage attend ta réponse'}</h4>
          {pendingPolls.map((p) => (
            <div key={p.id} className="al-poll">
              <div className="grow">
                <b>{p.title}</b>
                <div className="muted tiny">{p.options.length} date{p.options.length > 1 ? 's' : ''} proposée{p.options.length > 1 ? 's' : ''}
                  {p.deadline ? ` · avant le ${fmtDayShort(p.deadline)}` : ''} · par {p.createdByName}</div>
              </div>
              <div className="al-poll-btns">
                <button className="btn small primary" onClick={() => { close(); onGoPolls(p.id); }}><Vote size={14} /> Répondre</button>
                <button className="btn small ghost" onClick={() => hidePoll(p.id)} title="Ne plus me le rappeler"><EyeOff size={14} /> Ne plus afficher</button>
              </div>
            </div>
          ))}
          <button className="link" onClick={() => { ss.set('ge_polls_later', '1'); ss.set(remKey, '1'); setOpen(false); }}>Répondre plus tard</button>
        </section>
      )}
    </Modal>
  );
}

// ---------- Bandeaux permanents en haut du planning ----------
export function AlertsBar({ sessions, polls, people, me, onSession, onGoPolls }) {
  const reminders = useMemo(() => sessionReminders(sessions, me.id), [sessions, me.id]);
  const [pendingPolls] = usePendingPolls(polls, me.id);
  const [closedRem, setClosedRem] = useState(() => ss.get('ge_bar_rem') === '1');
  if ((!reminders.length || closedRem) && !pendingPolls.length) return null;
  return (
    <div className="al-bar">
      {reminders.length > 0 && !closedRem && (
        <div className="al-card al-c-sess">
          <CalendarCheck size={20} className="al-ico" />
          <div className="grow al-list">
            {reminders.map((s) => <SessionLine key={s.id} s={s} people={people} me={me} onOpen={onSession} compact />)}
          </div>
          <button className="icon-btn" onClick={() => { ss.set('ge_bar_rem', '1'); setClosedRem(true); }} aria-label="Masquer"><X size={16} /></button>
        </div>
      )}
      {pendingPolls.length > 0 && (
        <button className="al-card al-c-polls" onClick={() => onGoPolls(pendingPolls[0].id)}>
          <Vote size={20} className="al-ico" />
          <span className="grow"><b>{pendingPolls.length > 1 ? `${pendingPolls.length} sondages` : '1 sondage'}</b> en attente de ta réponse</span>
          <span className="al-go">Répondre <ChevronRight size={16} /></span>
        </button>
      )}
    </div>
  );
}
