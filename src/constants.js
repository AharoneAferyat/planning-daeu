export const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
export const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export const PALETTE = [
  '#E4572E', '#F3A712', '#2E86AB', '#6A4C93', '#1B998B', '#C83E74',
  '#3D5A80', '#7CB518', '#FF7F11', '#00A6A6', '#9B5DE5', '#8D6E63',
];

// Plusieurs choix possibles (sauf « Peu importe », qui est seul)
export const MOMENTS = {
  matin: { label: 'Le matin',       short: 'Matin' },
  aprem: { label: "L'après-midi",   short: 'Après-midi' },
  soir:  { label: 'Le soir',        short: 'Soir' },
  egal:  { label: 'Peu importe',    short: 'Peu importe' },
};

export const FORMATS = {
  presentiel: { label: 'Présentiel uniquement', short: 'Présentiel', color: '#0E9F6E' },
  visio:      { label: 'Visio uniquement',      short: 'Visio',      color: '#7C3AED' },
  both:       { label: 'Les deux me vont',      short: 'Les deux',   color: '#2563EB' },
};

export const DISTANCES = {
  proche: { label: 'Pas loin',   hint: '≤ 15 min',   level: 1, color: '#16A34A' },
  moyen:  { label: 'Moyennement', hint: '≤ 45 min',  level: 2, color: '#D97706' },
  loin:   { label: 'Loin, ça va', hint: '+ de 45 min', level: 3, color: '#DB2777' },
};

export const SESSION_FORMATS = {
  presentiel: 'Présentiel',
  visio: 'Visio',
  hybride: 'Hybride',
};

export const VOTE = {
  yes:   { label: 'Oui',       short: '✓', color: '#16A34A' },
  maybe: { label: 'Peut-être', short: '?', color: '#D97706' },
  no:    { label: 'Non',       short: '✕', color: '#DC2626' },
};

export const PRESETS = [
  { label: 'Matin', s: '08:00', e: '12:00' },
  { label: 'Midi', s: '12:00', e: '14:00' },
  { label: 'Aprèm', s: '14:00', e: '18:00' },
  { label: 'Soir', s: '18:00', e: '22:00' },
  { label: 'Journée', s: '09:00', e: '18:00' },
];

export const LOG_TYPES = {
  participant_create: 'Inscription',
  participant_update: 'Modification',
  participant_delete: 'Suppression',
  participant_login: 'Connexion',
  participant_login_fail: 'Code perso erroné',
  participant_merge: 'Fusion de fiches',
  participant_logout: 'Déconnexion',
  poll_create: 'Sondage créé',
  poll_update: 'Sondage modifié',
  poll_vote: 'Vote',
  poll_close: 'Sondage clôturé',
  poll_reopen: 'Sondage rouvert',
  poll_cancel: 'Sondage annulé',
  poll_comment: 'Commentaire',
  ticket_create: 'Demande à l’admin',
  ticket_reply: 'Réponse de l’admin',
  ticket_status: 'Demande (statut)',
  session_attendance: 'Absents notés',
  session_announce: 'Annonce de séance',
  session_maybe_no: 'Peut-être → ne vient pas',
  cleanup: 'Ménage (suppression auto)',
  poll_comment_delete: 'Commentaire supprimé',
  poll_restore: 'Sondage rétabli',
  poll_delete: 'Sondage supprimé',
  session_create: 'Séance créée',
  session_update: 'Séance modifiée',
  session_delete: 'Séance supprimée',
  session_join: 'Inscription séance',
  session_wait: 'Liste d’attente',
  session_cancel: 'Séance annulée',
  session_restore: 'Séance rétablie',
  session_keep: 'Séance maintenue',
  session_info: 'Infos de séance',
  session_leave: 'Désinscription séance',
  invite_create: 'Code créé',
  invite_update: 'Code modifié',
  invite_delete: 'Code supprimé',
  invite_use: 'Code utilisé',
  invite_refused: 'Code refusé',
  admin_login: 'Connexion admin',
  admin_login_fail: 'PIN admin erroné',
  settings_update: 'Réglages',
  data_reset: 'Remise à zéro',
};
