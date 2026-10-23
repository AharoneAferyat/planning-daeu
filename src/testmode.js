// Mode test (admin) : voir le site comme un participant, sans toucher à sa propre connexion.
// L'identité « vue » est gardée dans l'onglet (sessionStorage) uniquement.
import { ss } from './utils';

export const TEST_ID = 'test_admin';
export const viewAsId = () => ss.get('ge_as');
export const inTestMode = () => !!viewAsId();
export const isTestId = (id) => typeof id === 'string' && id.startsWith('test_');

// Les traces du profil test sont invisibles pour tout le monde, sauf en mode test
export const hiddenId = (id) => isTestId(id) && !inTestMode();

export function startViewAs(id) { ss.set('ge_as', id); ss.del('ge_polls_later'); window.location.href = '/'; }
export function stopViewAs(toAdmin = true) { ss.del('ge_as'); window.location.href = toAdmin ? '/admin' : '/'; }
