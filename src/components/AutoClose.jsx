import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, Save } from 'lucide-react';
import { autoPick, dueAutoClose } from '../autoclose';
import { cancelSession, claimAutoClose, closePoll, saveSessionInfo, skipAutoClose } from '../data';
import { isOver } from '../attendance';
import { isReadOnly } from '../testmode';
import { fmt, fmtDay } from '../utils';
import { useSpotsStore, spotInfo } from '../spots';
import { InfoFields, infoData, markInfoSeen } from './SessionInfo';
import { ConfirmButton, Modal } from './ui';

const needsPlace = (f) => f !== 'visio';
const needsVisio = (f) => f !== 'presentiel';
const filled = (format, v) => (!needsPlace(format) || (v?.place || '').trim()) && (!needsVisio(format) || (v?.visio || '').trim());

// N'importe quel appareil connecté clôture les sondages dont la date limite est passée (vérifié chaque minute)
export function useAutoClose(polls) {
  const spots = useSpotsStore();
  const running = useRef(new Set());
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!polls || isReadOnly()) return;
    for (const p of polls.filter((x) => dueAutoClose(x))) {
      if (running.current.has(p.id)) continue;
      running.current.add(p.id);
      (async () => {
        if (!(await claimAutoClose(p))) return;
        const opt = autoPick(p);
        if (!opt) return skipAutoClose(p);
        const format = p.format || 'hybride';
        const sp = p.spotId && spots.find((x) => x.id === p.spotId);
        const prepared = { ...(sp ? spotInfo(sp) : { place: p.place || '' }), ...(p.sessionInfo || {}) };
        await closePoll(p, opt, { format, notify: true, auto: true, spotId: p.spotId || null, infoData: infoData(format, prepared), needsInfo: !filled(format, prepared) }, 'Automatique (date limite)');
      })().catch((e) => console.warn('autoClose', e));
    }
  }, [polls, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

// À la connexion de l'organisateur : séance créée automatiquement sans infos -> il doit les remplir
export const pendingInfoSession = (sessions, me) => (sessions || []).find((x) => x.needsInfo && !x.cancelled && me && x.createdBy === me.id && !isOver(x));
export function NeedsInfoModal({ sessions, me }) {
  const s = pendingInfoSession(sessions, me);
  if (!s || isReadOnly()) return null;
  return <NeedsInfoForm key={s.id} s={s} me={me} />;
}

function NeedsInfoForm({ s, me }) {
  const format = s.format || 'hybride';
  const [info, setInfo] = useState(() => ({ place: s.info?.place || s.place || '', visio: s.info?.visio || '', note: s.info?.note || '' }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const actor = me.id === 'admin' ? 'Admin' : `${me.prenom} ${me.nom || ''}`.trim();
  const n = (s.attendees || []).length;
  const save = async () => {
    if (!filled(format, info)) return setErr(format === 'visio' ? 'Indique le lien de la visio.' : format === 'presentiel' ? 'Indique le lieu.' : 'Indique le lieu et le lien de la visio.');
    setBusy(true);
    await saveSessionInfo(s, info, actor);
    markInfoSeen(s.id);
    setBusy(false);
  };
  return (
    <Modal title="Ta séance a été créée 🎉"
      footer={<button className="btn primary" disabled={busy} onClick={save}><Save size={15} /> Enregistrer et prévenir les inscrits</button>}>
      <p className="ni-head"><CalendarCheck size={18} /> <span><b>{s.title}</b><br />{fmtDay(s.date)} · {fmt(s.s)}–{fmt(s.e)} · {n} inscrit{n > 1 ? 's' : ''}</span></p>
      <p className="muted tiny">La date limite du sondage est passée : la date avec le plus de « Oui » est devenue une séance. Il manque les infos importantes, à remplir maintenant.</p>
      {s.min > 0 && n < s.min && <p className="alert warn tiny">Seulement {n} inscrit{n > 1 ? 's' : ''} pour un minimum de {s.min}.</p>}
      <InfoFields required format={format} value={info} onChange={(v) => { setInfo(v); setErr(''); }} />
      {err && <p className="err">{err}</p>}
      <ConfirmButton className="link tiny danger" confirmText="Annuler la séance ? (les inscrits sont prévenus)" onConfirm={() => cancelSession(s, actor)}>Finalement, la séance n’a pas lieu</ConfirmButton>
    </Modal>
  );
}
