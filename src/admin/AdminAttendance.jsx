import { useMemo, useState } from 'react';
import { UserX } from 'lucide-react';
import { FLAKY_MIN, isFlaky, reliabilityStats } from '../attendance';
import { fmtDayShort } from '../utils';
import { Avatar, Empty } from '../components/ui';

// Fiabilité : qui annonce venir… et ne vient pas (visible uniquement par l'admin)
export default function AdminAttendance({ people, sessions }) {
  const stats = useMemo(() => reliabilityStats(sessions), [sessions]);
  const [open, setOpen] = useState(null);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const rows = Object.values(stats).filter((r) => byId[r.id]).sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100) || b.missed - a.missed);
  const flaky = rows.filter((r) => r.flakes > 0 || r.excused > 0);

  return (
    <div className="card">
      <h4 className="card-title"><UserX size={18} /> Fiabilité</h4>
      <p className="muted tiny">« Absent » = noté par le créateur de la séance ; un absent <b>excusé</b> compte pour moitié dans la fiabilité. « Désistement tardif » = désinscrit moins de 24 h avant. Les autres désinscriptions ne comptent pas. <b>⚠️ ATTENTION</b> = absent (excusé ou non) à plus de 90 % des séances, à partir de {FLAKY_MIN} (visible par les créateurs de séance).</p>
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
                    <span className="muted tiny">{r.noShow ? `❌ ${r.noShow} absent${r.noShow > 1 ? 's' : ''}` : ''}{r.excused ? `${r.noShow ? ' · ' : ''}🙋 ${r.excused} excusé${r.excused > 1 ? 's' : ''}` : ''}{r.excused && !r.noShow && r.lateLeaves ? ' · ' : ''}{r.noShow && r.lateLeaves ? ' · ' : ''}{r.lateLeaves ? `⚠️ ${r.lateLeaves} désistement${r.lateLeaves > 1 ? 's' : ''} tardif${r.lateLeaves > 1 ? 's' : ''}` : ''} · sur {r.total + r.lateLeaves} séance{r.total + r.lateLeaves > 1 ? 's' : ''}</span>
                  </span>
                  <span className="att-score"><b>{r.rate !== null ? `${r.rate} %` : '—'}</b><small className="muted">fiable</small></span>
                </button>
                {open === r.id && (
                  <div className="ma-hist">
                    {r.history.map((h, i) => (
                      <div key={i} className="ma-row">
                        <span className="grow">{h.s.title} <span className="muted tiny">· {fmtDayShort(h.s.date)}</span></span>
                        <span>{h.v === 'noShow' ? '❌ Absent' : h.v === 'excused' ? '🙋 Absent excusé' : '⚠️ Désistement < 24 h'}</span>
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
