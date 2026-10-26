// Mode test (admin) : voir le site comme un participant, sans toucher à sa propre connexion.
// L'identité « vue » est gardée dans l'onglet (sessionStorage) uniquement.
import { ss } from './utils';

export const TEST_ID = 'test_admin';
export const viewAsId = () => ss.get('ge_as');
export const inTestMode = () => !!viewAsId();
export const isTestId = (id) => typeof id === 'string' && id.startsWith('test_');

// Les traces du profil test sont invisibles pour tout le monde, sauf en mode test
export const hiddenId = (id) => isTestId(id) && !inTestMode();

// readOnly : on regarde le site au nom de la personne sans rien enregistrer
export function startViewAs(id, readOnly = false) {
  ss.set('ge_as', id); ss.del('ge_polls_later');
  if (readOnly) ss.set('ge_ro', '1'); else ss.del('ge_ro');
  window.location.href = '/';
}
export function stopViewAs(toAdmin = true) { ss.del('ge_as'); ss.del('ge_ro'); window.location.href = toAdmin ? '/admin' : '/'; }
export const isReadOnly = () => !!viewAsId() && ss.get('ge_ro') === '1';
