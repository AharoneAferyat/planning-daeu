import { useEffect, useMemo, useState } from 'react';
import { UserX } from 'lucide-react';
import { FLAKY_MIN, isFlaky, reliabilityStats } from '../attendance';
import { fmtDayShort } from '../utils';
import { backfillLeaves } from '../data';
import { Avatar, Empty } from '../components/ui';

// Fiabilité : qui annonce venir… et ne vient pas (visible uniquement par l'admin)
export default function AdminAttendance({ people, sessions, settings }) {
  const stats = useMemo(() => reliabilityStats(sessions), [sessions]);
  const [open, setOpen] = useState(null);
  const [fill, setFill] = useState(null); // null | 'busy' | nombre récupéré
  const runFill = () => { setFill('busy'); backfillLeaves(sessions, people).then(setFill).catch(() => setFill(null)); };
  // Une seule fois : on récupère les anciens désistements depuis l'historique
  useEffect(() => { if (settings && !settings.leavesBackfillAt && sessions.length && people.length) runFill(); }, [settings?.leavesBackfillAt, sessions.length, people.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const rows = Object.values(stats).filter((r) => byId[r.id]).sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100) || b.missed - a.missed);
  const flaky = rows.filter((r) => r.flakes > 0 || r.excused > 0 || r.lateLeaves > 0 || r.lateCancels > 0);

  return (
    <div className="card">
      <h4 className="card-title"><UserX size={18} /> Fiabilité</h4>
      <div className="fia-legend">
        <b>Ce qui compte dans la fiabilité</b>
        <div className="fia-row"><span>❌ Absent sans prévenir <small>(noté par le créateur)</small></span><b className="fia-w full">lâchage entier</b></div>
        
        <div className="fia-row"><span>🙋 Absent excusé <small>(avait prévenu)</small></span><b className="fia-w half">½ lâchage</b></div>
        <div className="fia-row"><span>⚠️ Désinscrit moins de 24 h avant <small>(a prévenu, compté dès qu’il se désinscrit)</small></span><b className="fia-w half">½ lâchage</b></div>
        <div className="fia-row"><span>🚫 Organisateur qui annule sa séance moins de 24 h avant <small>(si d’autres étaient inscrits)</small></span><b className="fia-w half">½ lâchage</b></div>
        <div className="fia-row"><span>✅ Noté présent</span><b className="fia-w ok">compte comme venu</b></div>
        <div className="fia-row"><span>Désinscription plus de 24 h avant</span><b className="fia-w none">ne compte pas</b></div>
        <div className="fia-row"><span>Pas noté par le créateur <small>(oubli possible)</small></span><b className="fia-w none">ne compte pas</b></div>
        <p className="muted tiny">{fill === 'busy' ? 'Récupération des anciens désistements…' : typeof fill === 'number' ? (fill === 0 ? '✓ Aucun ancien désistement tardif à récupérer. ' : `✓ ${fill} ancien${fill > 1 ? 's' : ''} désistement${fill > 1 ? 's' : ''} tardif${fill > 1 ? 's' : ''} récupéré${fill > 1 ? 's' : ''} depuis l’historique. `) : ''}{fill !== 'busy' && <button className="link tiny" onClick={runFill}>Récupérer les anciens désistements</button>}</p>
        <p className="muted tiny"><b>⚠️ ATTENTION</b> (visible par les créateurs de séance) : n’est pas venu à plus de 90 % de ses séances, toutes raisons confondues, à partir de {FLAKY_MIN}.</p>
      </div>
      {!flaky.length ? <Empty icon={UserX} title="Personne ne lâche 👏">Rien à signaler pour l’instant.</Empty> : (
        <div className="att-table">
          {flaky.map((r) => {
            const p = byId[r.id];
            return (
              <div key={r.id} className={'att-person' + (r.flakes >= 2 ? ' ghost' : '')}>
                <button className="att-person-head" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <Avatar p={p} size={30} />
                  <span className="grow">
                    <b>{p.prenom} {p.nom}{isFlaky(r) && <span className="flaky">⚠️ ATTENTION</span>}</b>
                    <span className="muted tiny">{[
                      r.noShow && `❌ ${r.noShow} absent${r.noShow > 1 ? 's' : ''}`,
                      r.excused && `🙋 ${r.excused} excusé${r.excused > 1 ? 's' : ''}`,
                      r.lateLeaves && `⚠️ ${r.lateLeaves} désistement${r.lateLeaves > 1 ? 's' : ''} tardif${r.lateLeaves > 1 ? 's' : ''}`,
                      r.lateCancels && `🚫 ${r.lateCancels} séance${r.lateCancels > 1 ? 's' : ''} annulée${r.lateCancels > 1 ? 's' : ''} < 24 h`,
                      `sur ${r.total + r.lateLeaves + r.lateCancels} séance${r.total + r.lateLeaves + r.lateCancels > 1 ? 's' : ''} comptée${r.total + r.lateLeaves + r.lateCancels > 1 ? 's' : ''}`,
                      r.unmarked && `(${r.unmarked} pas notée${r.unmarked > 1 ? 's' : ''})`,
                    ].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="att-score"><b>{r.rate !== null ? `${r.rate} %` : '—'}</b><small className="muted">fiable</small></span>
                </button>
                {open === r.id && (
                  <div className="ma-hist">
                    {r.history.map((h, i) => (
                      <div key={i} className="ma-row">
                        <span className="grow">{h.s.title} <span className="muted tiny">· {fmtDayShort(h.s.date)}</span></span>
                        <span>{h.v === 'noShow' ? '❌ Absent' : h.v === 'excused' ? '🙋 Absent excusé' : h.v === 'lateCancel' ? '🚫 A annulé sa séance < 24 h' : '⚠️ Désistement < 24 h'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
