/**
 * test-tts.js — prueba rápida de Edge TTS: genera un mp3 y muestra los
 * primeros word boundaries para confirmar que tenemos timings.
 *   node scripts/test-tts.js
 */
import { synthesize } from '../src/audio/tts.js';
import fs from 'fs';

const text = 'El que vive en sabiduría no teme al futuro. Como dijo Séneca, no es que tengamos poco tiempo, sino que perdemos mucho.';

console.log('Sintetizando con Edge TTS…');
const { file, durationMs, words } = await synthesize(text, '.diagnosis/tts-test.mp3');

const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
console.log(`\nArchivo: ${file} (${(size / 1024).toFixed(1)} KB)`);
console.log(`Duración: ${(durationMs / 1000).toFixed(2)} s`);
console.log(`Palabras con timing: ${words.length}`);
console.log('\nPrimeras 8 palabras:');
for (const w of words.slice(0, 8)) {
  console.log(`  ${(w.startMs / 1000).toFixed(2)}s  +${w.durMs}ms  "${w.text}"`);
}
if (words.length === 0) console.log('⚠ NO vinieron word boundaries — revisar versión de msedge-tts');
console.log('\nOK');
