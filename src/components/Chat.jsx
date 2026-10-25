import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Megaphone, MessageCircle, Plus, Search, Send, Trash2, Users, X } from 'lucide-react';
import { dmConvId, deleteMessage, postAnnounce, sendMessage, sessionConvId, useMessages } from '../data';
import { addDays, fmt, fmtDay, isoDate, isPast, ls, normName, timeAgo } from '../utils';
import { announceMessage, shareWhatsApp } from '../share';
import { hiddenId } from '../testmode';
import { Avatar } from './ui';
import WaButton from './WaButton';

// ---------- Lu / non lu (par appareil) ----------
const readMap = () => { try { return JSON.parse(ls.get('ge_read') || '{}'); } catch { return {}; } };
export function markRead(conv, at = Date.now()) {
  const m = readMap();
  if ((m[conv] || 0) >= at) return;
  m[conv] = at; ls.set('ge_read', JSON.stringify(m));
  window.dispatchEvent(new Event('ge-read'));
}
function useReadTick() {
  const [t, setT] = useState(0);
  useEffect(() => { const f = () => setT((x) => x + 1); window.addEventListener('ge-read', f); return () => window.removeEventListener('ge-read', f); }, []);
  return t;
}
export const openChat = (conv = '') => window.dispatchEvent(new CustomEvent('ge-chat', { detail: { conv } }));

// Membres d'un groupe de séance : inscrits (présentiel + visio) + créateur. Se met à jour tout seul.
export const sessionMembers = (s) => [...new Set([...(s.attendees || []), s.createdBy].filter(Boolean))].filter((id) => !hiddenId(id) || id === s.createdBy);
export const isSessionMember = (s, meId) => !!meId && sessionMembers(s).includes(meId);

// Liste de mes conversations
export function useChatList(convs, sessions, people, me) {
  const tick = useReadTick();
  return useMemo(() => {
    if (!me || !convs || !sessions) return [];
    const read = readMap();
    const byConv = Object.fromEntries(convs.map((c) => [c.id, c]));
    const limitIso = isoDate(addDays(new Date(), -14));
    const byId = Object.fromEntries((people || []).map((p) => [p.id, p]));
    const items = [];
    for (const s of sessions) {
      if (!isSessionMember(s, me.id) || s.date < limitIso) continue;
      const id = sessionConvId(s.id); const c = byConv[id];
      items.push({ id, type: 'session', s, title: s.title, sub: `${fmtDay(s.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmt(s.s)}${s.cancelled ? ' · annulée' : ''}`,
        members: sessionMembers(s), c, lastAt: c?.lastAt || 0 });
    }
    for (const c of convs) {
      if (c.type !== 'dm' || !(c.members || []).includes(me.id)) continue;
      const other = byId[(c.members || []).find((x) => x !== me.id)];
      if (!other) continue;
      items.push({ id: c.id, type: 'dm', other, title: `${other.prenom} ${other.nom || ''}`.trim(), members: c.members, c, lastAt: c.lastAt || 0 });
    }
    for (const it of items) it.unread = !!(it.c && it.c.lastBy !== me.id && it.c.lastAt > (read[it.id] || 0));
    return items.sort((a, b) => (b.lastAt - a.lastAt) || (a.s && b.s ? a.s.date.localeCompare(b.s.date) : 0));
  }, [convs, sessions, people, me, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------- Bouton d'en-tête avec pastille ----------
export function ChatButton({ list, onClick }) {
  const n = list.filter((x) => x.unread).length;
  return (
    <button className="icon-btn chat-btn" onClick={onClick} aria-label="Messages" title="Messages">
      <MessageCircle size={20} />{n > 0 && <span className="chat-badge">{n}</span>}
    </button>
  );
}

// ---------- Fenêtre de messagerie (plein écran sur téléphone) ----------
export default function ChatPanel({ initialConv, list, people, me, onClose, onSession }) {
  const [conv, setConv] = useState(initialConv || '');
  const [picking, setPicking] = useState(false);
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  useEffect(() => { setConv(initialConv || ''); }, [initialConv]);
  useEffect(() => { const f = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);

  let current = conv && list.find((x) => x.id === conv);
  if (conv && !current && conv.startsWith('dm_')) {
    const other = byId[conv.slice(3).split('_').find((x) => x !== me.id)];
    if (other) current = { id: conv, type: 'dm', other, title: `${other.prenom} ${other.nom || ''}`.trim(), members: [me.id, other.id] };
  }

  return (
    <div className="chat-wrap" role="dialog" aria-modal="true">
      {current ? <Conversation key={current.id} item={current} me={me} byId={byId} onBack={() => setConv('')} onClose={onClose} onSession={onSession} />
        : picking ? <PeoplePicker people={people} me={me} onBack={() => setPicking(false)} onPick={(p) => { setPicking(false); setConv(dmConvId(me.id, p.id)); }} />
          : (
            <>
              <div className="chat-top">
                <b className="grow">Messages</b>
                <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
              </div>
              <div className="chat-scroll">
                <button className="btn primary chat-new" onClick={() => setPicking(true)}><Plus size={16} /> Nouveau message privé</button>
                <p className="muted tiny chat-hint">Pas de notification : pense à passer voir tes messages. Les groupes de séance se créent tout seuls avec les inscrits.</p>
                <ListSection title="Groupes de séance" items={list.filter((x) => x.type === 'session')} byId={byId} onOpen={setConv}
                  empty="Inscris-toi à une séance pour rejoindre son groupe." />
                <ListSection title="Messages privés" items={list.filter((x) => x.type === 'dm')} byId={byId} onOpen={setConv}
                  empty="Aucun message privé pour l’instant." />
              </div>
            </>
          )}
    </div>
  );
}

function ListSection({ title, items, byId, onOpen, empty }) {
  return (
    <section className="chat-sec">
      <h4>{title}</h4>
      {!items.length && <p className="muted tiny">{empty}</p>}
      {items.map((it) => (
        <button key={it.id} className={'chat-item' + (it.unread ? ' unread' : '')} onClick={() => onOpen(it.id)}>
          {it.type === 'dm' ? <Avatar p={it.other} size={38} /> : <span className="chat-gico" style={{ '--sc': it.s?.color }}><Users size={18} /></span>}
          <span className="grow ci-main">
            <span className="ci-top"><b>{it.title}</b>{it.c?.lastAt ? <span className="muted tiny">{timeAgo(it.c.lastAt)}</span> : null}</span>
            <span className="muted tiny ci-sub">
              {it.c?.lastText ? `${it.c.lastByName?.split(' ')[0]} : ${it.c.lastText}` : it.type === 'session' ? `${it.sub} · ${it.members.length} membres` : ''}
            </span>
          </span>
          {it.unread && <i className="ci-dot" />}
        </button>
      ))}
    </section>
  );
}

function PeoplePicker({ people, me, onBack, onPick }) {
  const [q, setQ] = useState('');
  const list = people.filter((p) => p.id !== me.id && (!q || normName(`${p.prenom}${p.nom}`).includes(normName(q))));
  return (
    <>
      <div className="chat-top">
        <button className="icon-btn" onClick={onBack} aria-label="Retour"><ArrowLeft size={20} /></button>
        <b className="grow">Écrire à…</b>
      </div>
      <div className="chat-scroll">
        <div className="search"><Search size={16} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un participant…" /></div>
        <div className="who-list">
          {list.map((p) => (
            <button key={p.id} className="who" onClick={() => onPick(p)}><Avatar p={p} size={30} /><span className="grow">{p.prenom} <b>{p.nom}</b></span></button>
          ))}
        </div>
      </div>
    </>
  );
}

function Conversation({ item, me, byId, onBack, onClose, onSession }) {
  const msgs = useMessages(item.id);
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [lastAnn, setLastAnn] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const s = item.s;
  const isMember = item.type === 'dm' || isSessionMember(s, me.id);
  const canAnnounce = s && s.createdBy === me.id;

  useEffect(() => { if (msgs) { end.current?.scrollIntoView({ block: 'end' }); markRead(item.id, Math.max(Date.now(), ...msgs.map((m) => m.at))); } }, [msgs, item.id]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      if (announce && canAnnounce) { await postAnnounce(s, me, text); setLastAnn(text.trim()); setAnnounce(false); }
      else await sendMessage(item.id, me, text, item.type === 'dm' ? { type: 'dm', members: [...item.members].sort() } : { type: 'session', sessionId: s.id });
      setText('');
    } finally { setBusy(false); }
  };

  let lastDay = '';
  return (
    <>
      <div className="chat-top">
        <button className="icon-btn" onClick={onBack} aria-label="Retour"><ArrowLeft size={20} /></button>
        {item.type === 'dm' ? <Avatar p={item.other} size={30} /> : null}
        <button className="grow chat-title" onClick={() => (s ? setShowMembers(!showMembers) : null)}>
          <b>{item.title}</b>
          {s && <span className="muted tiny">{item.sub} · {item.members.length} membres ▾</span>}
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={20} /></button>
      </div>
      {showMembers && s && (
        <div className="chat-members">
          {item.members.map((id) => byId[id]).filter(Boolean).map((p) => <span key={p.id} className="chat-mem"><Avatar p={p} size={22} /> {p.prenom}{p.id === s.createdBy ? ' (organise)' : ''}</span>)}
          <button className="link tiny" onClick={() => { onClose(); onSession?.(s); }}>Voir la séance →</button>
        </div>
      )}
      <div className="chat-scroll chat-msgs">
        {msgs === null && <p className="muted tiny">Chargement…</p>}
        {msgs && !msgs.length && <p className="muted tiny chat-hint">{s ? 'Groupe de la séance : tous les inscrits y sont automatiquement. Dis bonjour !' : 'Début de la conversation.'}</p>}
        {(msgs || []).map((m) => {
          const day = isoDate(new Date(m.at));
          const sep = day !== lastDay ? (lastDay = day) : null;
          const mine = m.by === me.id;
          const p = byId[m.by];
          return (
            <div key={m.id}>
              {sep && <div className="chat-day">{fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</div>}
              <div className={'msg' + (mine ? ' mine' : '') + (m.kind === 'announce' ? ' ann' : '')}>
                {!mine && (p ? <Avatar p={p} size={26} /> : <span className="pcom-av">?</span>)}
                <div className="bubble">
                  {m.kind === 'announce' && <span className="ann-tag"><Megaphone size={13} /> Annonce</span>}
                  {!mine && item.type === 'session' && <span className="msg-who">{m.byName}</span>}
                  <span className="msg-text">{m.text}</span>
                  <span className="msg-time">{new Date(m.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {mine && <button className="icon-btn msg-del" onClick={() => deleteMessage(m)} aria-label="Supprimer"><Trash2 size={13} /></button>}
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {lastAnn && (
        <div className="ann-done">
          <span className="grow">Annonce publiée. Préviens aussi sur WhatsApp :</span>
          <WaButton onClick={() => { shareWhatsApp(announceMessage(s, lastAnn)); setLastAnn(null); }} />
          <button className="icon-btn" onClick={() => setLastAnn(null)} aria-label="Fermer"><X size={16} /></button>
        </div>
      )}
      {isMember ? (
        <div className="chat-compose">
          {canAnnounce && (
            <label className="ann-toggle">
              <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} /> <Megaphone size={14} /> Envoyer comme annonce (rappel pour tous les inscrits)
            </label>
          )}
          <div className="pcom-input">
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={announce ? 'Ton annonce…' : 'Écris un message…'}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
            <button className="btn primary" disabled={busy || !text.trim()} onClick={send} aria-label="Envoyer"><Send size={16} /></button>
          </div>
        </div>
      ) : <p className="chat-left muted tiny">Tu ne fais plus partie de ce groupe (tu n’es plus inscrit(e) à la séance).</p>}
    </>
  );
}

// ---------- Dans la fiche de séance : annonce + accès au groupe ----------
export function SessionChatBlock({ s, me, canManage, concerned }) {
  const member = isSessionMember(s, me?.id);
  const a = s.announce;
  const [text, setText] = useState('');
  const [done, setDone] = useState(null);
  const [writing, setWriting] = useState(false);
  if (!me || me.id === 'admin') return a ? <div className="ann-box"><b><Megaphone size={15} /> Annonce</b><p>{a.text}</p><span className="muted tiny">{a.byName} · {timeAgo(a.at)}</span></div> : null;
  return (
    <>
      {a && (concerned || member || canManage) && (
        <div className="ann-box">
          <b><Megaphone size={15} /> Annonce de {a.byName?.split(' ')[0]}</b>
          <p>{a.text}</p>
          <span className="muted tiny">{timeAgo(a.at)}</span>
        </div>
      )}
      <div className="row-btns sess-chat">
        {member && <button className="btn" onClick={() => openChat(sessionConvId(s.id))}><MessageCircle size={16} /> Discussion du groupe</button>}
        {s.createdBy === me.id && !s.cancelled && !writing && <button className="btn ghost" onClick={() => setWriting(true)}><Megaphone size={16} /> Publier une annonce</button>}
      </div>
      {writing && (
        <div className="ann-write">
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder="Ex : on se retrouve devant la BU, pensez aux annales !" autoFocus />
          <div className="row-btns">
            <button className="btn ghost" onClick={() => setWriting(false)}>Annuler</button>
            <button className="btn primary" disabled={!text.trim()} onClick={async () => { await postAnnounce(s, me, text); setDone(text.trim()); setText(''); setWriting(false); }}><Megaphone size={15} /> Publier</button>
          </div>
          <p className="muted tiny">Visible par les inscrits (et les « Peut-être » / la liste d’attente), dans le groupe et en rappel à l’ouverture du site.</p>
        </div>
      )}
      {done && (
        <div className="ann-done">
          <span className="grow">Annonce publiée. Préviens aussi sur WhatsApp :</span>
          <WaButton onClick={() => { shareWhatsApp(announceMessage(s, done)); setDone(null); }} />
        </div>
      )}
    </>
  );
}

// Annonces non vues qui me concernent (inscrit, liste d'attente, « Peut-être »)
const annSeen = () => { try { return JSON.parse(ls.get('ge_ann_seen') || '[]'); } catch { return []; } };
export const annKey = (s) => `${s.id}:${s.announce?.at}`;
export function announcesFor(sessions, meId, isConcerned) {
  const seen = annSeen();
  return (sessions || []).filter((s) => s.announce && !s.cancelled && !isPast(s.date, s.e) && s.announce.by !== meId && isConcerned(s) && !seen.includes(annKey(s)));
}
export function ackAnnounce(s) {
  ls.set('ge_ann_seen', JSON.stringify([...new Set([...annSeen(), annKey(s)])]));
  window.dispatchEvent(new Event('ge-cancel-seen'));
}
