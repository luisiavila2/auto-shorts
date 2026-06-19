/**
 * make-music.js — genera pads ambient suaves (sin copyright) para fondo.
 * Acordes sostenidos con leve trémolo, ~90s loopeables.
 *   node scripts/make-music.js
 */
import fs from 'fs';
import path from 'path';
import { ffmpeg } from '../src/util/ff.js';

const dir = path.join(process.cwd(), 'assets', 'music');
fs.mkdirSync(dir, { recursive: true });

// acordes serenos (Hz). Cada pad = 3 notas sostenidas + reverb suave.
const PADS = {
  pad_calm:   [146.83, 220.00, 261.63], // Re menor-ish, calmo
  pad_hope:   [164.81, 207.65, 246.94], // Mi mayor-ish, esperanzador
  pad_deep:   [130.81, 196.00, 246.94], // Do, profundo
};

const DUR = 90;

async function makePad(name, freqs) {
  const inputs = [];
  const labels = [];
  freqs.forEach((f, i) => {
    inputs.push('-f', 'lavfi', '-i', `sine=frequency=${f}:duration=${DUR}`);
    labels.push(`[${i}:a]`);
  });
  const n = freqs.length;
  const filter =
    `${labels.join('')}amix=inputs=${n}:normalize=1,` +
    `tremolo=f=0.15:d=0.3,` +
    `afade=t=in:d=3,afade=t=out:st=${DUR - 4}:d=4,` +
    `volume=0.6,aresample=44100[a]`;
  // AAC (.m4a): disponible en todo ffmpeg (no requiere libmp3lame).
  const out = path.join(dir, `${name}.m4a`);
  await ffmpeg(['-y', ...inputs, '-filter_complex', filter, '-map', '[a]', '-c:a', 'aac', '-b:a', '128k', out]);
  console.log('ok', name + '.m4a');
}

for (const [name, freqs] of Object.entries(PADS)) await makePad(name, freqs);
console.log('Música lista en assets/music/');
