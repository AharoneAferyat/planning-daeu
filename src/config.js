// PIN admin utilisé tant qu'aucun PIN n'a été défini dans Admin → Réglages.
// Change-le dès la première connexion.
export const DEFAULT_ADMIN_PIN = '1234';

export const DEFAULT_SETTINGS = {
  appTitle: "Groupes d'étude",
  welcome: "Indique tes dispos de la semaine pour qu'on organise des groupes de travail ensemble.",
  requireCode: true,
  adminPinHash: null,
  // Google Sheet des spots (partagé « tous les utilisateurs disposant du lien ») : le site s'y synchronise
  spotsSheet: 'https://docs.google.com/spreadsheets/d/1v_M2PPDgV0mhI4f0dAT2vul_MwxXayli8r5zy4g5H74/edit?usp=sharing',
};

export const ADMIN_ME = { id: 'admin', prenom: 'Admin', nom: '' };
