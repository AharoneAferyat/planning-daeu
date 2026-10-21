import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Config du projet Firebase "planning-daeu"
export const firebaseConfig = {
  apiKey: 'AIzaSyBmr6RPgSl_EaZebwmu0ejONDxG5VDGpuI',
  authDomain: 'planning-daeu.firebaseapp.com',
  projectId: 'planning-daeu',
  storageBucket: 'planning-daeu.firebasestorage.app',
  messagingSenderId: '163779125369',
  appId: '1:163779125369:web:19a85471d81dff87b6b4a8',
};

export const isConfigured = !String(firebaseConfig.apiKey).startsWith('A_REMPLIR');

let db = null;
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}
export { db };
