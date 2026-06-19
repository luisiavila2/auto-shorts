/**
 * make-video-backgrounds.js — genera fondos animados MP4 con ffmpeg lavfi.
 * Duración 90s; assemble.js los repite con -stream_loop -1.
 *   npm run video-backgrounds
 *
 * Nota: usa filtros muy simples para máxima compatibilidad con builds Windows.
 */
import { FFMPEG } from '../src/util/ff.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const bgDir   = path.join(process.cwd(), 'assets', 'backgrounds');
const sageDir = path.join(process.cwd(), 'assets', 'sages');
fs.mkdirSync(bgDir,   { recursive: true });
fs.mkdirSync(sageDir, { recursive: true });

const W = 1080, H = 1920, FPS = 30, DUR = 90;
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];

function run(args, label) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`  ${label}… `);
    const p = spawn(FFMPEG, ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err = (err + d.toString()).slice(-4000); });
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) { console.log('OK'); resolve(); }
      else reject(new Error(`ffmpeg exit ${code}\n${err.replace(/\r/g, '\n').slice(-1000)}`));
    });
  });
}

// ─── 1. PARTÍCULAS BLANCAS / AZUL ────────────────────────────────────────────
async function starsFlow() {
  const out = path.join(bgDir, 'stars_flow.mp4');
  // Opción A: life filter (partículas tipo estrellas, blanco puro → se colorea con hue)
  await run([
    '-f', 'lavfi', '-i', `life=size=${W}x${H}:rate=${FPS}:ratio=0.001:mold=200`,
    '-vf', `negate,hue=h=220:s=1,format=yuv420p`,
    '-t', String(DUR), ...ENC, out,
  ], 'stars_flow (life+hue)').catch(async (e1) => {
    console.log(`\n    (life falló: ${e1.message.split('\n')[0]})`);
    // Opción B: fondo sólido azul oscuro animado con gradiente de luminancia
    await run([
      '-f', 'lavfi', '-i', `color=c=#050D1E:s=${W}x${H}:r=${FPS}`,
      '-vf', `format=yuv420p`,
      '-t', String(DUR), ...ENC, out,
    ], 'stars_flow (color fallback)');
  });
}

// ─── 2. PARTÍCULAS DORADAS ────────────────────────────────────────────────────
async function goldenGlow() {
  const out = path.join(bgDir, 'golden_glow.mp4');
  await run([
    '-f', 'lavfi', '-i', `life=size=${W}x${H}:rate=${FPS}:ratio=0.001:mold=200`,
    '-vf', `negate,hue=h=40:s=1.5,format=yuv420p`,
    '-t', String(DUR), ...ENC, out,
  ], 'golden_glow (life+hue)').catch(async (e1) => {
    console.log(`\n    (life falló: ${e1.message.split('\n')[0]})`);
    await run([
      '-f', 'lavfi', '-i', `color=c=#150B00:s=${W}x${H}:r=${FPS}`,
      '-vf', `format=yuv420p`,
      '-t', String(DUR), ...ENC, out,
    ], 'golden_glow (color fallback)');
  });
}

// ─── 3. PLASMA CÓSMICO ───────────────────────────────────────────────────────
async function cosmic() {
  const out = path.join(bgDir, 'cosmic.mp4');
  // plasma filter (disponible en la mayoría de builds completos de ffmpeg)
  await run([
    '-f', 'lavfi', '-i', `plasma=size=${W}x${H}:rate=${FPS}`,
    '-vf',
      // Re-colorear a azul-morado oscuro con solo curves (simple, sin colorchannelmixer)
      `curves=all='0/0 128/20 255/60',` +
      `curves=b='0/0 128/80 255/200',` +
      `format=yuv420p`,
    '-t', String(DUR), ...ENC, out,
  ], 'cosmic (plasma)').catch(async (e1) => {
    console.log(`\n    (plasma/curves falló — fallback life: ${e1.message.split('\n')[0]})`);
    await run([
      '-f', 'lavfi', '-i', `life=size=${W}x${H}:rate=${FPS}:ratio=0.0015:mold=150`,
      '-vf', `negate,hue=h=260:s=1.5,format=yuv420p`,
      '-t', String(DUR), ...ENC, out,
    ], 'cosmic (life fallback)').catch(async (e2) => {
      console.log(`\n    (life también falló — usando color: ${e2.message.split('\n')[0]})`);
      await run([
        '-f', 'lavfi', '-i', `color=c=#050010:s=${W}x${H}:r=${FPS}`,
        '-vf', `format=yuv420p`,
        '-t', String(DUR), ...ENC, out,
      ], 'cosmic (color fallback)');
    });
  });
}

// ─── 4. LLAMA / VELA (sage) ──────────────────────────────────────────────────
async function candleFlame() {
  const out = path.join(sageDir, 'candle_flame.mp4');
  await run([
    '-f', 'lavfi', '-i', `plasma=size=${W}x${H}:rate=${FPS}`,
    '-vf',
      // Tonos ámbar-naranja: boost red/green, cortar blue
      `curves=all='0/0 128/30 255/80',` +
      `curves=r='0/0 128/110 255/240',` +
      `curves=g='0/0 128/50 255/100',` +
      `format=yuv420p`,
    '-t', String(DUR), ...ENC, out,
  ], 'candle_flame (plasma)').catch(async (e1) => {
    console.log(`\n    (plasma falló — fallback life amber: ${e1.message.split('\n')[0]})`);
    await run([
      '-f', 'lavfi', '-i', `life=size=${W}x${H}:rate=${FPS}:ratio=0.0012:mold=160`,
      '-vf', `negate,hue=h=25:s=2,format=yuv420p`,
      '-t', String(DUR), ...ENC, out,
    ], 'candle_flame (life fallback)').catch(async (e2) => {
      console.log(`\n    (life también falló — usando color: ${e2.message.split('\n')[0]})`);
      await run([
        '-f', 'lavfi', '-i', `color=c=#150800:s=${W}x${H}:r=${FPS}`,
        '-vf', `format=yuv420p`,
        '-t', String(DUR), ...ENC, out,
      ], 'candle_flame (color fallback)');
    });
  });
}

// ─── Runner ───────────────────────────────────────────────────────────────────
console.log(`Generando fondos animados MP4 (puede tardar 2-5 min)…\n`);
const tasks = [
  ['stars_flow',   starsFlow],
  ['golden_glow',  goldenGlow],
  ['cosmic',       cosmic],
  ['candle_flame', candleFlame],
];

for (const [name, fn] of tasks) {
  try { await fn(); }
  catch (e) { console.error(`\n✗ ${name} falló por completo:\n${e.message}\n`); }
}

function listMp4(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.mp4$/i.test(f))
    .map(f => {
      const size = fs.statSync(path.join(dir, f)).size;
      return `${f} (${Math.round(size/1024)}KB)`;
    });
}

console.log(`\nassets/backgrounds/: ${listMp4(bgDir).join(', ') || '(ninguno)'}`);
console.log(`assets/sages/:       ${listMp4(sageDir).join(', ') || '(ninguno)'}`);
console.log('\nTambién podés copiar tus propios MP4s a esas carpetas.');
