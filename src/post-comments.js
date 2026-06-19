/**
 * post-comments.js — Pasa liviano que postea los comentarios pendientes de
 * los videos que ya se publicaron. Pensado para correr cada ~2 horas vía
 * Task Scheduler (tarea "YoutubeIA-Comments"), independiente de la corrida
 * pesada de generación de videos.
 *
 * No genera nada ni gasta crédito de Claude: solo consulta YouTube y postea.
 *
 * Uso manual:
 *   node src/post-comments.js              (todos los canales)
 *   node src/post-comments.js chatsdramas  (un canal)
 */

import 'dotenv/config';
import fs from 'fs';
import { CHANNELS } from '../config/channels.js';
import { processPendingComments } from './comments.js';

const channelArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const targets = channelArg ? [channelArg] : Object.keys(CHANNELS);

for (const id of targets) {
  const channel = CHANNELS[id];
  if (!channel) { console.log(`Canal desconocido: ${id}`); continue; }
  if (!fs.existsSync(channel.youtubeTokenFile)) continue; // sin token, nada que postear

  console.log(`\n=== ${channel.displayName} (${channel.handle}) ===`);
  try {
    await processPendingComments(channel, id);
  } catch (e) {
    console.error(`  ERROR en ${id}:`, e.message);
  }
}
console.log('\nListo.');
