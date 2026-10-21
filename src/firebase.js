import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// ⚠️ À remplir avec la config de TON projet Firebase
// (Console Firebase → Paramètres du projet → Vos applications → Config)
export const firebaseConfig = {
  apiKey: 'A_REMPLIR',
  authDomain: 'A_REMPLIR',
  projectId: 'A_REMPLIR',
  storageBucket: 'A_REMPLIR',
  messagingSenderId: 'A_REMPLIR',
  appId: 'A_REMPLIR',
};

export const isConfigured = !String(firebaseConfig.apiKey).startsWith('A_REMPLIR');

let db = null;
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}
export { db };
