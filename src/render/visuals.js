/**
 * visuals.js — elige el fondo visual de un video.
 *
 * Dos estilos (el usuario pidió ambos):
 *   - 'cinematic': imagen cinematográfica de assets/backgrounds/ (naturaleza,
 *     estatuas, cielos, ruinas) con zoom lento (Ken Burns).
 *   - 'sage': rostro de un anciano/sabio de assets/sages/ con zoom muy suave.
 *
 * Si no hay imágenes disponibles, devuelve null y assemble usa un gradiente
 * cinematográfico generado por ffmpeg (fallback, funciona sin assets).
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const IMG_RE = /\.(jpe?g|png|webp)$/i;

function pickFrom(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return null;
  const files = fs.readdirSync(abs).filter(f => IMG_RE.test(f));
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
