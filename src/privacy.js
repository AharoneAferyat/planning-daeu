// Cercles (listes de personnes) et contenus « sur invitation ».
// Caché dans l'interface uniquement (sécurité légère, comme le reste du site).
import { useEffect, useState } from 'react';

let circles = [];
const subs = new Set();
export const setCirclesStore = (list) => { circles = list || []; subs.forEach((f) => f(circles)); };
export const getCircles = () => circles;
export function useCirclesStore() {
  const [c, setC] = useState(circles);
  useEffect(() => { subs.add(setC); return () => subs.delete(setC); }, []);
  return c;
}

export const circleById = (id) => circles.find((c) => c.id === id);
// Cercles visibles par une personne : ceux qu'elle a créés ou dont elle fait partie (l'admin voit tout)
export const myCircles = (meId) => circles.filter((c) => meId === 'admin' || c.createdBy === meId || (c.members || []).includes(meId));

// Invités d'un sondage / d'une séance : personnes choisies + membres des cercles choisis
export function invitedIds(item) {
  const ids = new Set(item?.invite?.ids || []);
  for (const cid of item?.invite?.circles || []) for (const m of circleById(cid)?.members || []) ids.add(m);
  return [...ids];
}
export const isInvited = (item, id) => !item?.private || item.createdBy === id || invitedIds(item).includes(id);
export const privateLabel = (item) => {
  const n = invitedIds(item).length;
  const cs = (item?.invite?.circles || []).map((c) => circleById(c)?.name).filter(Boolean);
  return `Sur invitation${cs.length ? ` · ${cs.join(', ')}` : ''} · ${n} invité${n > 1 ? 's' : ''}`;
};
