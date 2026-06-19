/**
 * visuals.js — elige el fondo visual de un video.
 * Soporta imágenes (jpg/png) y videos (mp4/mov/webm).
 * Los MP4 rotos/incompletos (<500 KB) se ignoran automáticamente.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const MEDIA_RE = /\.(jpe?g|png|webp|mp4|mov|webm)$/i;

function pickFrom(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return null;
  const all = fs.readdirSync(abs).filter(f => {
    if (!MEDIA_RE.test(f) || f.startsWith('.')) return false;
    if (/\.(mp4|mov|webm)$/i.test(f) && fs.statSync(path.join(abs, f)).size < 512 * 1024) return false;
    return true;
  });
  if (!all.length) return null;
  // Preferir MP4s (videos reales) sobre imágenes estáticas
  const videos = all.filter(f => /\.(mp4|mov|webm)$/i.test(f));
  const pool   = videos.length ? videos : all;
  return path.join(abs, pool[Math.floor(Math.random() * pool.length)]);
}

/**
 * @param {('cinematic'|'sage'|'auto')} style
 * @returns {{ style, image:string|null }}
 */
export function pickBackground(style = 'auto') {
  let chosen = style;
  if (style === 'auto') chosen = Math.random() < 0.5 ? 'cinematic' : 'sage';

  let image = null;
  if (chosen === 'sage') image = pickFrom('assets/sages') || pickFrom('assets/backgrounds');
  else image = pickFrom('assets/backgrounds') || pickFrom('assets/sages');

  return { style: chosen, image };
}
