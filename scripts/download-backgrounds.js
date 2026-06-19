/**
 * download-backgrounds.js — descarga stock footage cinematográfico de Pexels.
 *
 * Pexels es gratis, sin atribución requerida. Registrate en pexels.com/api
 * y agrega PEXELS_API_KEY al .env.
 *
 * Uso: node scripts/download-backgrounds.js
 *
 * Descarga ~20 clips verticales (o landscape → ffmpeg los cropea).
 * Los guarda en assets/backgrounds/ y assets/sages/ para que
 * assemble.js los use como fondos animados en lugar de imágenes estáticas.
 */
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import 'dotenv/config';

const PEXELS_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_KEY) {
  console.error('\n⚠️  Falta PEXELS_API_KEY en .env');
  console.error('   1. Registrate gratis en https://www.pexels.com/api/');
  console.error('   2. Agrega: PEXELS_API_KEY=tu_clave_aqui\n');
  process.exit(1);
}

const ROOT     = process.cwd();
const BG_DIR   = path.join(ROOT, 'assets', 'backgrounds');
const SAGE_DIR = path.join(ROOT, 'assets', 'sages');
fs.mkdirSync(BG_DIR,   { recursive: true });
fs.mkdirSync(SAGE_DIR, { recursive: true });

// Temas pensados para un canal de sabiduría/filosofía
// Cada grupo tiene: carpeta destino, queries de búsqueda, cuántos clips por query
const THEMES = [
  // ─── BACKGROUNDS generales ─────────────────────────────────────────
  { dir: BG_DIR,   query: 'ocean waves cinematic',      count: 2, label: 'ocean' },
  { dir: BG_DIR,   query: 'mountain sunrise fog',        count: 2, label: 'mountain' },
  { dir: BG_DIR,   query: 'venice canal gondola',        count: 2, label: 'venice' },
  { dir: BG_DIR,   query: 'ancient temple ruins',        count: 2, label: 'temple' },
  { dir: BG_DIR,   query: 'rain window night city',      count: 1, label: 'rain' },
  { dir: BG_DIR,   query: 'desert sunset golden',        count: 1, label: 'desert' },
  { dir: BG_DIR,   query: 'forest light mystical',       count: 2, label: 'forest' },
  { dir: BG_DIR,   query: 'night sky stars timelapse',   count: 1, label: 'stars' },
  // ─── SAGES — más íntimos/cálidos ──────────────────────────────────
  { dir: SAGE_DIR, query: 'candle flame close up',       count: 2, label: 'candle' },
  { dir: SAGE_DIR, query: 'old library books light',     count: 2, label: 'library' },
  { dir: SAGE_DIR, query: 'meditation nature peaceful',  count: 2, label: 'meditation' },
  { dir: SAGE_DIR, query: 'fireplace warm cozy',         count: 2, label: 'fireplace' },
];

async function searchVideos(query, perPage = 5) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=portrait`;
  const res = await fetch(url, {
    headers: { Authorization: PEXELS_KEY },
  });
  if (!res.ok) throw new Error(`Pexels API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.videos || [];
}

/** Elige el archivo de video de mejor calidad dentro del límite de tamaño. */
function pickFile(video, maxMB = 80) {
  const files = (video.video_files || [])
    .filter(f => f.width && f.height && f.link)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  for (const f of files) {
    // Pexels no siempre da el tamaño, así que aceptamos sin filtrar por MB si no viene
    if (f.file_type === 'video/mp4') return f;
  }
  return files[0] || null;
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function run() {
  console.log('\nDescargando footage de Pexels...\n');
  let downloaded = 0, skipped = 0, failed = 0;

  for (const theme of THEMES) {
    let videos;
    try {
      videos = await searchVideos(theme.query, Math.max(theme.count * 2, 5));
    } catch (e) {
      console.error(`  ✗ [${theme.label}] búsqueda falló: ${e.message}`);
      failed++;
      continue;
    }

    let taken = 0;
    for (const video of videos) {
      if (taken >= theme.count) break;
      const file = pickFile(video);
      if (!file) continue;

      const ext = '.mp4';
      const fname = `${theme.label}_${video.id}${ext}`;
      const dest = path.join(theme.dir, fname);

      if (fs.existsSync(dest) && fs.statSync(dest).size > 512 * 1024) {
        console.log(`  ✓ [${theme.label}] ${fname} (ya existe)`);
        skipped++; taken++; continue;
      }

      process.stdout.write(`  ↓ [${theme.label}] ${fname} ... `);
      try {
        await downloadFile(file.link, dest);
        const size = fs.statSync(dest).size;
        if (size < 512 * 1024) {
          fs.unlinkSync(dest);
          console.log('muy pequeño, descartado');
          continue;
        }
        console.log(`OK (${(size / 1024 / 1024).toFixed(1)} MB)`);
        downloaded++; taken++;
      } catch (e) {
        console.log(`ERROR: ${e.message}`);
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        failed++;
      }
    }

    // Pequeña pausa para no sobrecargar la API
    await new Promise(r => setTimeout(r, 300));
  }

  // Resumen
  console.log(`\n── Resumen ──────────────────────────────`);
  console.log(`  Descargados: ${downloaded}`);
  console.log(`  Ya existían: ${skipped}`);
  console.log(`  Errores:     ${failed}`);

  const bgFiles   = fs.readdirSync(BG_DIR).filter(f => /\.mp4$/i.test(f));
  const sageFiles = fs.readdirSync(SAGE_DIR).filter(f => /\.mp4$/i.test(f));
  console.log(`\nassets/backgrounds/ → ${bgFiles.length} MP4(s)`);
  console.log(`assets/sages/       → ${sageFiles.length} MP4(s)`);
  console.log('\nListo. Ejecutá "node src/run.js sabiduria --upload" para generar videos.');
}

run().catch(e => { console.error('\nError fatal:', e.message); process.exit(1); });
