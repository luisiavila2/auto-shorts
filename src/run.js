import 'dotenv/config';
import { CHANNELS } from '../config/channels.js';

/* ============================================================
   run.js — Orquestador principal (ESQUELETO).

   Pipeline previsto (a completar según el tipo de contenido):
     1. planNext()        → decide qué producir
     2. generateScript()  → genera el guión via Claude
     3. captureFrames()   → render del contenido a frames PNG
     4. assemble()        → ffmpeg: frames + audio → MP4 vertical
     5. uploadShort()     → sube a YouTube (con declaración de IA)
     6. comentario automático

   Por ahora solo valida que la config exista. El cuerpo real se
   arma cuando definamos el tipo de videos del canal.
   ============================================================ */

const args = process.argv.slice(2);
const upload = args.includes('--upload');
const channelArg = args.find(a => !a.startsWith('--'));
const targets = channelArg ? [channelArg] : Object.keys(CHANNELS);

if (targets.length === 0) {
  console.log('No hay canales definidos todavía. Definí uno en config/channels.js.');
  process.exit(0);
}

for (const id of targets) {
  const channel = CHANNELS[id];
  if (!channel) { console.log(`Canal desconocido: ${id}`); continue; }
  console.log(`\n=== Canal: ${channel.displayName || id} ===`);
  console.log(`  upload=${upload}`);
  console.log('  (pipeline pendiente de implementar según el tipo de contenido)');
}
console.log('\nListo.');
