/**
 * thumbnail.js — genera miniatura 1280×720 para el video largo.
 *
 * 1. Extrae un frame cinematográfico del video con ffmpeg (a los 8 segundos)
 * 2. Dibuja encima: overlay oscuro + título en dorado + nombre del canal
 *
 * Usa @napi-rs/canvas (ya en dependencias).
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ffmpeg } from '../util/ff.js';
import fs from 'fs';
import path from 'path';

const W = 1280;
const H = 720;

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {string} videoFile  - ruta al video.mp4 generado
 * @param {string} title      - título del video
 * @param {object} opts
 *   channelName  - nombre del canal (ej. 'Sabiduría Eterna')
 * @returns {Promise<string>} ruta al thumbnail.jpg generado
 */
export async function generateThumbnail(videoFile, title, opts = {}) {
  const outDir   = path.dirname(videoFile);
  const frameFile = path.join(outDir, 'thumb_frame.jpg');
  const thumbFile = path.join(outDir, 'thumbnail.jpg');

  // Extraer frame a los 8 segundos (ya pasó el intro, fondo estabilizado)
  try {
    await ffmpeg([
      '-y', '-ss', '8', '-i', videoFile,
      '-frames:v', '1',
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
      frameFile,
    ]);
  } catch { /* si falla, seguimos sin frame */ }

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Fondo: frame extraído o color oscuro de fallback
  if (fs.existsSync(frameFile)) {
    try {
      const img = await loadImage(frameFile);
      ctx.drawImage(img, 0, 0, W, H);
    } catch {
      ctx.fillStyle = '#0D1528';
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    ctx.fillStyle = '#0D1528';
    ctx.fillRect(0, 0, W, H);
  }

  // Overlay oscuro degradado (abajo más oscuro para legibilidad del texto)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    'rgba(0,0,0,0.15)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1,    'rgba(0,0,0,0.82)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── Título ───────────────────────────────────────────────────────────
  const fontSize   = title.length > 55 ? 56 : title.length > 38 ? 66 : 76;
  const lineHeight = fontSize * 1.28;
  ctx.font         = `bold ${fontSize}px Arial`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  const lines     = wrapText(ctx, title, W - 140);
  const blockH    = lines.length * lineHeight;
  const startY    = H * 0.52 - blockH / 2;

  // Sombra del texto
  ctx.shadowColor   = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur    = 14;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle     = '#FFD54A';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, startY + i * lineHeight);
  }

  // ── Nombre del canal (abajo derecha) ─────────────────────────────────
  ctx.shadowBlur    = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.font          = 'bold 30px Arial';
  ctx.fillStyle     = 'rgba(255,255,255,0.88)';
  ctx.textAlign     = 'right';
  ctx.textBaseline  = 'bottom';
  ctx.fillText(opts.channelName || '', W - 44, H - 36);

  // Guardar como JPG
  const buf = canvas.toBuffer('image/jpeg', { quality: 0.93 });
  fs.writeFileSync(thumbFile, buf);

  if (fs.existsSync(frameFile)) fs.unlinkSync(frameFile);

  return thumbFile;
}
