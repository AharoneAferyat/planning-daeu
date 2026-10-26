// Accès Firestore « protégé » : en mode test LECTURE SEULE (admin qui regarde le site au nom de quelqu'un),
// toutes les écritures sont ignorées. On lit les vraies données, mais rien n'est enregistré.
import * as F from 'firebase/firestore';
import { ss } from './utils';

export * from 'firebase/firestore';

export const readOnly = () => !!ss.get('ge_as') && ss.get('ge_ro') === '1';
let last = 0;
const blocked = () => {
  const now = Date.now();
  if (now - last > 1500) { last = now; window.dispatchEvent(new Event('ge-ro-blocked')); }
};

export const addDoc = (...a) => (readOnly() ? (blocked(), Promise.resolve({ id: 'lecture-seule' })) : F.addDoc(...a));
export const setDoc = (...a) => (readOnly() ? (blocked(), Promise.resolve()) : F.setDoc(...a));
export const updateDoc = (...a) => (readOnly() ? (blocked(), Promise.resolve()) : F.updateDoc(...a));
export const deleteDoc = (...a) => (readOnly() ? (blocked(), Promise.resolve()) : F.deleteDoc(...a));
export const runTransaction = (db, fn) => (readOnly()
  ? (blocked(), fn({ get: (ref) => F.getDoc(ref), update() {}, set() {}, delete() {} }))
  : F.runTransaction(db, fn));
export const writeBatch = (db) => (readOnly()
  ? { set() {}, update() {}, delete() {}, commit: () => (blocked(), Promise.resolve()) }
  : F.writeBatch(db));
