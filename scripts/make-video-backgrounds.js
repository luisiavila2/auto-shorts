/**
 * make-video-backgrounds.js — genera fondos animados MP4 con ffmpeg lavfi.
 * Duración 90s; assemble.js los repite con -stream_loop -1.
 *   npm run video-backgrounds
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
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p'];

function run(args, label) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`  ${label}… `);
    const p = spawn(FFMPEG, ['-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err = (err + d.toString()).slice(-3000); });
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) { console.log('OK'); resolve(); }
      else reject(new Error(`ffmpeg exit ${code}\n${err.replace(/\r/g, '\n').slice(-600)}`));
    });
  });
}

// ─── 1. CAMPO DE ESTRELLAS (azul) ────────────────────────────────────────────
// Conway Life muy disperso + mold = partículas que aparecen y desaparecen.
// negate → blanco sobre negro. colorchannelmixer → azul/blanco.
async function starsFlow() {
  const out = path.join(bgDir, 'stars_flow.mp4');
  await run([
    '-f', 'lavfi',
    '-i', `life=size=${W}x${H}:rate=${FPS}:ratio=0.0008:mold=180`,
    '-vf',
      `negate,` +
      `colorchannelmixer=rr=0.12:rg=0:rb=0.88:gr=0.08:gg=0.22:gb=0.9:br=0.04:bg=0.08:bb=1.0,` +
      `curves=r='0/0 255/55':g='0/0 255/75':b='0/0 255/210',` +
      `vignette`,
    '-t', String(DUR), ...ENC, out,
  ], 'stars_flow.mp4');
}

// ─── 2. PARTÍCULAS DORADAS ────────────────────────────────────────────────────
// Life con mold más rápido + colores ámbar/dorado.
async function goldenGlow() {
  const out = path.join(bgDir, 'golden_glow.mp4');
  await run([
    '-f', 'lavfi',
    '-i', `life=size=${W}x${H}:rate=${FPS}:ratio=0.001:mold=150`,
    '-vf',
      `negate,` +
      `colorchannelmixer=rr=0.95:rg=0:rb=0.05:gr=0.55:gg=0.1:gb=0.02:br=0.05:bg=0.02:bb=0.01,` +
      `curves=r='0/0 128/100 255/240':g='0/0 128/50 255/130':b='0/0 255/20',` +
      `vignette`,
    '-t', String(DUR), ...ENC, out,
  ], 'golden_glow.mp4');
}

// ─── 3. PLASMA CÓSMICO OSCURO ────────────────────────────────────────────────
// plasma lavfi re-coloreado a azul-morado profundo.
async function cosmic() {
  const out = path.join(bgDir, 'cosmic.mp4');
  // Intentar con plasma lavfi (disponible en builds completos de ffmpeg)
  await run([
    '-f', 'lavfi',
    '-i', `plasma=size=${W}x${H}:rate=${FPS}`,
    '-vf',
      `curves=` +
        `r='0/0 64/5 128/15 192/25 255/40':` +
        `g='0/0 64/3 128/8 192/15 255/25':` +
        `b='0/0 64/30 128/80 192/140 255/200',` +
      `vignette`,
    '-t', String(DUR), ...ENC, out,
  ], 'cosmic.mp4 (plasma)').catch(async () => {
    // Fallback: life con colores violeta/azul
    console.log('\n  (plasma no disponible — fallback life purple)');
    await run([
      '-f', 'lavfi',
      '-i', `life=size=${W}x${H}:rate=${FPS}:ratio=0.002:mold=120`,
      '-vf',
        `negate,` +
        `colorchannelmixer=rr=0.35:rb=0.65:gr=0.08:gb=0.42:br=0.02:bb=0.85,` +
        `curves=r='0/0 255/55':g='0/0 255/28':b='0/0 255/185',` +
        `vignette`,
      '-t', String(DUR), ...ENC, out,
    ], 'cosmic.mp4 (fallback life)');
  });
}

// ─── 4. LLAMA / VELA (sage) ──────────────────────────────────────────────────
// Plasma coloreado en ámbar oscuro → atmósfera de vela.
async function candleFlame() {
  const out = path.join(sageDir, 'candle_flame.mp4');
  await run([
    '-f', 'lavfi',
    '-i', `plasma=size=${W}x${H}:rate=${FPS}`,
    '-vf',
      `curves=` +
        `r='0/0 64/45 128/105 192/185 255/235':` +
        `g='0/0 64/12 128/32 192/62 255/92':` +
        `b='0/0 64/2 128/6 192/10 255/18',` +
      `vignette,vignette`,
    '-t', String(DUR), ...ENC, out,
  ], 'candle_flame.mp4 (plasma)').catch(async () => {
    // Fallback: life ámbar
    console.log('\n  (plasma no disponible — fallback life amber)');
    await run([
      '-f', 'lavfi',
      '-i', `life=size=${W}x${H}:rate=${FPS}:ratio=0.0012:mold=160`,
      '-vf',
        `negate,` +
        `colorchannelmixer=rr=0.95:gr=0.5:gb=0.02:br=0.04,` +
        `curves=r='0/0 128/120 255/245':g='0/0 128/55 255/110':b='0/0 255/18',` +
        `vignette`,
      '-t', String(DUR), ...ENC, out,
    ], 'candle_flame.mp4 (fallback life)');
  });
}

// ─── Runner ───────────────────────────────────────────────────────────────────
console.log(`Generando fondos animados MP4 (puede tardar ~1-3 min)…\n`);
const tasks = [
  ['stars_flow',   starsFlow],
  ['golden_glow',  goldenGlow],
  ['cosmic',       cosmic],
  ['candle_flame', candleFlame],
];

for (const [name, fn] of tasks) {
  try { await fn(); }
  catch (e) { console.error(`  ✗ ${name}: ${e.message.split('\n')[0]}`); }
}

const bgMp4s   = fs.readdirSync(bgDir).filter(f => /\.mp4$/i.test(f));
const sageMp4s = fs.readdirSync(sageDir).filter(f => /\.mp4$/i.test(f));
console.log(`\nassets/backgrounds/ — ${bgMp4s.length} MP4s: ${bgMp4s.join(', ')}`);
console.log(`assets/sages/       — ${sageMp4s.length} MP4s: ${sageMp4s.join(', ')}`);
console.log('\nTambién podés copiar tus propios MP4s a esas carpetas.');
