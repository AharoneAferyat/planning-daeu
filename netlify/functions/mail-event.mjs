// Appelé par le site : séance créée depuis un sondage, place libérée
import { handleEvent } from '../lib/send.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('', { status: 405 });
  try {
    const { type, id } = await req.json();
    return Response.json(await handleEvent(type, id));
  } catch (e) {
    console.error(e);
    return Response.json({ sent: 0, error: e.message }, { status: 500 });
  }
};
