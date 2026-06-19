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
  const files = fs.readdirSync(abs).filter(f => {
    if (!MEDIA_RE.test(f) || f.startsWith('.')) return false;
    // Descarta MP4s rotos o incompletos (< 500 KB) para no crashear ffmpeg
    if (/\.mp4$/i.test(f) && fs.statSync(path.join(abs, f)).size < 512 * 1024) return false;
    return true;
  });
  if (!files.length) return null;
  return path.join(abs, files[Math.floor(Math.random() * files.length)]);
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
