// Toutes les heures : rappel par mail aux inscrits des séances qui commencent dans moins de 24 h
import { runReminders } from '../lib/send.mjs';

export default async () => {
  const r = await runReminders();
  console.log('rappels envoyés :', r.sent);
};

export const config = { schedule: '@hourly' };
