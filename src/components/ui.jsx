import { useEffect, useState } from 'react';
import { MapPin, Moon, Shuffle, Sun, Sunrise, SunMedium, Users, Video, X } from 'lucide-react';
import { DISTANCES, FORMATS, MOMENTS } from '../constants';
import { initials, shortName } from '../utils';

export const MOMENT_ICON = { matin: Sunrise, aprem: Sun, soir: Moon, journee: SunMedium, egal: Shuffle };

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={20} /></button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Avatar({ p, size = 32, ring }) {
  return (
    <span className={'avatar' + (ring ? ' ring' : '')} style={{ '--c': p.color || '#888', width: size, height: size, fontSize: size * 0.4 }}
      title={`${p.prenom} ${p.nom || ''}`}>
      {initials(`${p.prenom} ${p.nom || ''}`)}
    </span>
  );
}

export function Name({ p, meId, full }) {
  return (
    <span className="pname">
      {full ? `${p.prenom} ${p.nom || ''}` : shortName(p)}
      {meId && p.id === meId && <span className="me-tag">moi</span>}
    </span>
  );
}

export function DistanceDots({ level, color }) {
  return (
    <span className="dots" style={{ '--c': color }}>
      {[1, 2, 3].map((i) => <i key={i} className={i <= level ? 'on' : ''} />)}
    </span>
  );
}

export function FormatIcon({ format, size = 14 }) {
  if (format === 'visio') return <Video size={size} />;
  if (format === 'presentiel') return <Users size={size} />;
  return <span className="fmt-both"><Users size={size} /><Video size={size} /></span>;
}

export function PersonBadges({ p, compact }) {
  const MI = MOMENT_ICON[p.moment] || Shuffle;
  const f = FORMATS[p.format] || FORMATS.both;
  const dist = p.format !== 'visio' ? DISTANCES[p.distance] : null;
  return (
    <span className={'badges' + (compact ? ' compact' : '')}>
      <span className="badge freq" style={{ '--lvl': (p.freq || 1) / 7 }} title={`Veut bosser ${p.freq || 1} fois / semaine`}>
        {p.freq || 1}×{!compact && <small>/sem</small>}
      </span>
      <span className="badge" title={MOMENTS[p.moment]?.label}>
        <MI size={13} />{!compact && <span>{MOMENTS[p.moment]?.short}</span>}
      </span>
      <span className="badge tint" style={{ '--c': f.color }} title={f.label}>
        <FormatIcon format={p.format} size={13} />{!compact && <span>{f.short}</span>}
      </span>
      {dist && (
        <span className="badge tint" style={{ '--c': dist.color }} title={`Déplacement : ${dist.label} (${dist.hint})`}>
          <MapPin size={13} /><DistanceDots level={dist.level} color={dist.color} />{!compact && <span>{dist.label}</span>}
        </span>
      )}
    </span>
  );
}

export function ConfirmButton({ children, confirmText = 'Confirmer ?', onConfirm, className = 'btn danger ghost', disabled }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <button type="button" className={className + (armed ? ' armed' : '')} disabled={disabled || busy}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        try { await onConfirm(); } finally { setBusy(false); setArmed(false); }
      }}>
      {busy ? '…' : armed ? confirmText : children}
    </button>
  );
}

export function Chips({ options, value, onChange, multi }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = multi ? value.includes(o.value) : value === o.value;
        return (
          <button type="button" key={o.value} className={'chip' + (on ? ' on' : '')} style={o.color ? { '--c': o.color } : undefined}
            onClick={() => onChange(multi ? (on ? value.filter((v) => v !== o.value) : [...value, o.value]) : o.value)}>
            {o.icon}{o.label}{o.hint && <small>{o.hint}</small>}
          </button>
        );
      })}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={34} />}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Toast({ text, onDone }) {
  useEffect(() => { if (!text) return; const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [text, onDone]);
  if (!text) return null;
  return <div className="toast">{text}</div>;
}

export function Spinner({ label = 'Chargement…' }) {
  return <div className="center-screen"><div className="spinner" /><p className="muted">{label}</p></div>;
}
