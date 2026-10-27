import { useMemo, useState } from 'react';
import { UserX } from 'lucide-react';
import { reliabilityStats } from '../attendance';
import { fmtDayShort } from '../utils';
import { Avatar, Empty } from '../components/ui';

// Fiabilité : qui annonce venir… et ne vient pas (visible uniquement par l'admin)
export default function AdminAttendance({ people, sessions }) {
  const stats = useMemo(() => reliabilityStats(sessions), [sessions]);
  const [open, setOpen] = useState(null);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const rows = Object.values(stats).filter((r) => byId[r.id]).sort((a, b) => b.flakes - a.flakes || (a.rate ?? 100) - (b.rate ?? 100));
  const flaky = rows.filter((r) => r.flakes > 0);

  return (
    <div className="card">
      <h4 className="card-title"><UserX size={18} /> Fiabilité</h4>
      <p className="muted tiny">« Pas venu » = noté par le créateur de la séance. « Désistement tardif » = désinscrit moins de 24 h avant. Les autres désinscriptions ne comptent pas.</p>
      {!flaky.length ? <Empty icon={UserX} title="Personne ne lâche 👏">Rien à signaler pour l’instant.</Empty> : (
        <div className="att-table">
          {flaky.map((r) => {
            const p = byId[r.id];
            return (
              <div key={r.id} className={'att-person' + (r.flakes >= 2 ? ' ghost' : '')}>
                <button className="att-person-head" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <Avatar p={p} size={30} />
                  <span className="grow">
                    <b>{p.prenom} {p.nom}</b>
                    <span className="muted tiny">{r.noShow ? `❌ ${r.noShow} pas venu${r.noShow > 1 ? 's' : ''}` : ''}{r.noShow && r.lateLeaves ? ' · ' : ''}{r.lateLeaves ? `⚠️ ${r.lateLeaves} désistement${r.lateLeaves > 1 ? 's' : ''} tardif${r.lateLeaves > 1 ? 's' : ''}` : ''} · sur {r.total + r.lateLeaves} séance{r.total + r.lateLeaves > 1 ? 's' : ''}</span>
                  </span>
                  <span className="att-score"><b>{r.rate !== null ? `${r.rate} %` : '—'}</b><small className="muted">fiable</small></span>
                </button>
                {open === r.id && (
                  <div className="ma-hist">
                    {r.history.map((h, i) => (
                      <div key={i} className="ma-row">
                        <span className="grow">{h.s.title} <span className="muted tiny">· {fmtDayShort(h.s.date)}</span></span>
                        <span>{h.v === 'noShow' ? '❌ Pas venu' : '⚠️ Désistement < 24 h'}</span>
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
