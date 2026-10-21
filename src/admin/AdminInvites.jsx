import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Pencil, Plus, Power, QrCode, RotateCcw, Trash2, Zap } from 'lucide-react';
import { deleteInvite, inviteStatus, resetInviteUses, saveInvite, setInviteActive } from '../data';
import { fmtDate, isoDate, randomCode, timeAgo, toDate } from '../utils';
import { Avatar, ConfirmButton, Empty, Modal, Toast } from '../components/ui';

const linkFor = (code) => `${window.location.origin}/?code=${code}`;

export default function AdminInvites({ invites, people }) {
  const [form, setForm] = useState(null); // 'new' | invite
  const [qr, setQr] = useState(null);
  const [toast, setToast] = useState('');

  const quickOpen = async () => {
    let c = randomCode(6);
    while (invites.some((i) => i.code === c)) c = randomCode(6);
    await saveInvite(c, { label: 'Ouvert à tous', expiresAt: null, maxUses: 0, active: true }, true);
    setQr({ code: c });
  };

  const copy = async (code) => {
    try { await navigator.clipboard.writeText(linkFor(code)); setToast('Lien copié !'); } catch { setToast(linkFor(code)); }
  };

  return (
    <div>
      <div className="toolbar">
        <p className="muted grow">Un même code peut servir à autant de personnes que tu veux (1 utilisation = 1 appareil). Partage-le par lien ou QR code.</p>
        <button className="btn primary" onClick={quickOpen}><Zap size={16} /> Code ouvert à tous</button>
        <button className="btn" onClick={() => setForm('new')}><Plus size={16} /> Code personnalisé</button>
      </div>
      {invites.length === 0 ? <div className="card"><Empty icon={QrCode} title="Aucun code pour l'instant">Crée un premier code pour inviter le groupe.</Empty></div> : (
        <div className="inv-grid">
          {invites.map((inv) => {
            const st = inviteStatus(inv);
            const joined = people.filter((p) => p.viaCode === inv.code);
            const exp = toDate(inv.expiresAt);
            return (
              <div key={inv.code} className={'card inv st-' + st.key}>
                <div className="inv-head">
                  <span className="inv-code mono">{inv.code}</span>
                  <span className={'pill ' + (st.key === 'ok' ? 'ok' : st.key === 'off' ? '' : 'bad')}>{st.label}</span>
                </div>
                {inv.label && <p className="inv-label">{inv.label}</p>}
                <div className="inv-uses">
                  <span>{inv.uses || 0} / {inv.maxUses > 0 ? inv.maxUses : '∞'} utilisation{(inv.uses || 0) > 1 ? 's' : ''}</span>
                  {inv.maxUses > 0 && <span className="bar-track"><i style={{ width: `${Math.min(100, ((inv.uses || 0) / inv.maxUses) * 100)}%` }} /></span>}
                </div>
                <div className="meta-grid small">
                  <span><em>Expire</em>{exp ? `${fmtDate(exp)} (${timeAgo(exp)})` : 'jamais'}</span>
                  <span><em>Créé</em>{fmtDate(inv.createdAt)}</span>
                  <span><em>Dernière utilisation</em>{inv.lastUsedAt ? timeAgo(inv.lastUsedAt) : '—'}</span>
                </div>
                {joined.length > 0 && (
                  <div className="inv-joined"><em>Inscrits via ce code :</em>
                    <div className="who-wrap">{joined.map((p) => <span key={p.id} className="who-chip"><Avatar p={p} size={20} />{p.prenom} {p.nom}</span>)}</div>
                  </div>
                )}
                <div className="inv-actions">
                  <button className="btn small" onClick={() => copy(inv.code)}><Copy size={15} /> Lien</button>
                  <button className="btn small" onClick={() => setQr(inv)}><QrCode size={15} /> QR</button>
                  <button className="icon-btn" title="Modifier" onClick={() => setForm(inv)}><Pencil size={17} /></button>
                  <button className="icon-btn" title={inv.active ? 'Désactiver' : 'Activer'} onClick={() => setInviteActive(inv.code, !inv.active)}><Power size={17} /></button>
                  <ConfirmButton className="icon-btn" confirmText="Remettre à 0 ?" onConfirm={() => resetInviteUses(inv.code)}><RotateCcw size={17} /></ConfirmButton>
                  <ConfirmButton className="icon-btn danger" confirmText="Supprimer ?" onConfirm={() => deleteInvite(inv.code)}><Trash2 size={17} /></ConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {form && <InviteForm inv={form === 'new' ? null : form} people={people} onClose={() => setForm(null)} />}
      {qr && <QrModal inv={qr} onClose={() => setQr(null)} onCopy={() => copy(qr.code)} />}
      <Toast text={toast} onDone={() => setToast('')} />
    </div>
  );
}

const DURATIONS = [
  { v: 'none', label: 'Illimitée' }, { v: '1', label: '24 h' }, { v: '3', label: '3 jours' },
  { v: '7', label: '1 semaine' }, { v: '30', label: '1 mois' }, { v: 'custom', label: 'Date précise' },
];

function InviteForm({ inv, people, onClose }) {
  const isNew = !inv;
  const [code, setCode] = useState(inv?.code || randomCode(6));
  const [label, setLabel] = useState(inv?.label || '');
  const [dur, setDur] = useState(inv ? (inv.expiresAt ? 'custom' : 'none') : 'none');
  const [custom, setCustom] = useState(inv?.expiresAt ? isoDate(toDate(inv.expiresAt)) : isoDate(new Date(Date.now() + 14 * 86400000)));
  const [maxUses, setMaxUses] = useState(inv?.maxUses ?? 0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr('');
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (c.length < 3) return setErr('Le code doit faire au moins 3 caractères (lettres/chiffres).');
    let expiresAt = null;
    if (dur === 'custom') { const d = new Date(custom); d.setHours(23, 59, 0, 0); expiresAt = d; }
    else if (dur !== 'none') expiresAt = new Date(Date.now() + Number(dur) * 86400000);
    setBusy(true);
    try {
      await saveInvite(c, { label: label.trim(), expiresAt, maxUses: Math.max(0, Number(maxUses) || 0), ...(isNew ? { active: true } : {}) }, isNew);
      onClose();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Modal title={isNew ? 'Nouveau code d’accès' : `Modifier ${inv.code}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Annuler</button><button className="btn primary" disabled={busy} onClick={save}>{isNew ? 'Créer' : 'Enregistrer'}</button></>}>
      <div className="grid2">
        <label className="field"><span>Code</span>
          <div className="row"><input className="mono" value={code} disabled={!isNew} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />
            {isNew && <button type="button" className="icon-btn" onClick={() => setCode(randomCode(6))} title="Générer"><RotateCcw size={16} /></button>}</div>
        </label>
        <label className="field"><span>Nom du code (optionnel)</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex : groupe TD B, promo 2026…" maxLength={60} /></label>
      </div>
      <div className="field"><span>Durée de validité</span>
        <div className="chips">{DURATIONS.map((d) => <button key={d.v} type="button" className={'chip' + (dur === d.v ? ' on' : '')} onClick={() => setDur(d.v)}>{d.label}</button>)}</div>
        {dur === 'custom' && <input type="date" value={custom} onChange={(e) => setCustom(e.target.value)} />}
        {!isNew && dur !== 'custom' && dur !== 'none' && <small className="muted">La durée repart d'aujourd'hui.</small>}
      </div>
      <label className="field narrow"><span>Nombre max d'utilisations (0 = illimité)</span>
        <input type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
      </label>
      {err && <p className="err">{err}</p>}
    </Modal>
  );
}

function QrModal({ inv, onClose, onCopy }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(linkFor(inv.code), { width: 600, margin: 2, color: { dark: '#1B1F2A', light: '#FFFFFF' } }).then(setSrc); }, [inv.code]);
  return (
    <Modal title={`QR code · ${inv.code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onCopy}><Copy size={16} /> Copier le lien</button>
        <a className="btn primary" href={src} download={`qr-${inv.code}.png`}><Download size={16} /> Télécharger</a></>}>
      <div className="qr-box">
        {src && <img src={src} alt={`QR code ${inv.code}`} />}
        <p className="mono">{linkFor(inv.code)}</p>
        <p className="muted tiny">Code à saisir à la main : <b className="mono">{inv.code}</b></p>
      </div>
    </Modal>
  );
}
