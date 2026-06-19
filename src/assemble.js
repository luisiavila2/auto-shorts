/**
 * assemble.js — Arma el video final con ffmpeg.
 *
 *   fondo (imagen/video/gradiente) + subtítulos drawtext + voz + música → MP4
 *
 * Subtítulos via drawtext (freetype), NO via subtitles=subs.ass (libass).
 * libass + DirectWrite crashea con 0xC0000005 en este servidor Windows.
 * drawtext no usa libass → estable en cualquier build de ffmpeg para Windows.
 *
 * Nota sobre imágenes cuadradas (1920×1920) → destino vertical (1080×1920):
 *   Paso A: scale al target exacto → max 1920×1920 de intermedio.
 *   Paso B: scale×1.06 (≤ 1145×2035) + animated crop.
 *   Escalar directo a 1.25× produce 2400×2400 → Access Violation.
 */
import fs from 'fs';
import path from 'path';
import { ffmpeg } from './util/ff.js';
import { buildDrawtextVf } from './render/subtitles.js';

// Fuentes candidatas para drawtext (busca la primera disponible)
const FONT_CANDIDATES = [
  'C:/Windows/Fonts/Arialbd.ttf',
  'C:/Windows/Fonts/Arial.ttf',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/times.ttf',
  'C:/Windows/Fonts/cour.ttf',
];

/** Copia la primera fuente disponible al workDir como 'Arial.ttf'. Retorna la ruta relativa. */
function prepareFont(workDir) {
  const dest = path.join(workDir, 'Arial.ttf');
  if (fs.existsSync(dest)) return 'Arial.ttf';
  for (const src of FONT_CANDIDATES) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      return 'Arial.ttf';
    }
  }
  // Ninguna fuente encontrada: drawtext intentará con el nombre genérico
  console.warn('      [warn] No se encontró fuente TTF en Windows/Fonts — usando fallback sans-serif');
  return null;
}

async function buildVoiceTrack(clips, workDir, gapMs = 280) {
  const sil = path.join(workDir, 'sil.m4a');
  await ffmpeg([
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`,
    '-t', (gapMs / 1000).toFixed(3), '-c:a', 'aac', '-b:a', '128k', sil,
  ]);

  const listFile = path.join(workDir, 'voicelist.txt');
  const entries = [];
  clips.forEach((c, i) => {
    entries.push(`file '${path.resolve(c.file).replace(/\\/g, '/')}'`);
    if (i < clips.length - 1) entries.push(`file '${path.resolve(sil).replace(/\\/g, '/')}'`);
  });
  fs.writeFileSync(listFile, entries.join('\n'));

  const voice = path.join(workDir, 'voice.m4a');
  await ffmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', voice,
  ]);
  return voice;
}

/**
 * @param {object} o
 *   clips        [{file,text,startMs,durMs}]
 *   assFile      ruta al .ass (generado pero no usado en ffmpeg)
 *   bgImage      ruta a imagen/video de fondo (o null → gradiente oscuro)
 *   music        ruta a mp3 de música (o null)
 *   outFile      mp4 de salida
 *   width,height (def 1080×1920; largo horizontal: 1920×1080)
 *   fps          (def 30)
 *   musicVolume  (def 0.14)
 *   gapMs        (def 280)
 *   watermark    texto copyright (ej. '© Sabiduría Eterna')
 */
export async function assemble(o) {
  const {
    clips, assFile, bgImage = null, music = null, outFile,
    width = 1080, height = 1920, fps = 30, musicVolume = 0.14, gapMs = 280,
  } = o;

  const workDir = path.dirname(outFile);
  fs.mkdirSync(workDir, { recursive: true });

  // 1) Pista de voz
  const voice = await buildVoiceTrack(clips, workDir, gapMs);

  const last = clips[clips.length - 1];
  const totalSec = (last.startMs + last.durMs) / 1000 + 1.2;

  // 2) Preparar fuente para drawtext (copia Arial.ttf al workDir)
  const fontFile = prepareFont(workDir);

  // 3) Detectar tipo de fondo
  const isVideoBackground = bgImage && /\.(mp4|mov|webm|mkv)$/i.test(bgImage);
  const hasBackground     = bgImage && fs.existsSync(bgImage);
  const hasMusic          = music && fs.existsSync(music);

  // 4) Construir args de ffmpeg
  const args = ['-y'];

  // Input 0: fondo
  if (!hasBackground) {
    args.push('-f', 'lavfi', '-i', `color=c=#0D1528:s=${width}x${height}:r=${fps}`);
  } else if (isVideoBackground) {
    args.push('-stream_loop', '-1', '-t', String(Math.ceil(totalSec + 2)), '-i', path.resolve(bgImage));
  } else {
    args.push('-loop', '1', '-t', String(Math.ceil(totalSec + 2)), '-i', path.resolve(bgImage));
  }

  // Input 1: voz
  args.push('-i', path.resolve(voice));

  // Input 2 (opcional): música
  if (hasMusic) args.push('-stream_loop', '-1', '-i', path.resolve(music));

  // 5) Filtro de video
  let vf;

  if (!hasBackground) {
    // Color sólido lavfi → ya en yuv420p
    vf = `format=yuv420p,fps=${fps},setsar=1`;
  } else if (isVideoBackground) {
    // Video: escalar a 1.08× del target y pan sinusoidal lento (slow zoom cinematic)
    const vw = Math.round(width  * 1.08);
    const vh = Math.round(height * 1.08);
    const vox = Math.round((vw - width)  / 2);
    const voy = Math.round((vh - height) / 2);
    const vpx = Math.round(vox * 0.85);
    const vpy = Math.round(voy * 0.85);
    vf = `scale=${vw}:${vh}:force_original_aspect_ratio=increase,` +
         `crop=${vw}:${vh},` +
         `crop=${width}:${height}:x='${vox}+${vpx}*sin(t*0.03)':y='${voy}+${vpy}*sin(t*0.025+1.0)',` +
         `format=yuv420p,fps=${fps},setsar=1`;
  } else {
    // Imagen: dos pasos para evitar buffers enormes (ver comentario al inicio).
    // Paso A: scale+crop al target. Para 1920×1920 → max 1920×1920 intermedio.
    // Paso B: scale×1.06 (max 1145×2035) + pan sinusoidal centrado.
    const pw = Math.round(width  * 1.06);
    const ph = Math.round(height * 1.06);
    const ox = Math.round((pw - width)  / 2);
    const oy = Math.round((ph - height) / 2);
    const px = Math.round(ox * 0.9);   // swing: 90% del offset → nunca sale del rango
    const py = Math.round(oy * 0.9);
    vf =
      `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},` +
      `scale=${pw}:${ph},` +
      `crop=${width}:${height}:x='${ox}+${px}*sin(t*0.05)':y='${oy}+${py}*sin(t*0.04+0.8)',` +
      `format=yuv420p,fps=${fps},setsar=1`;
  }

  // 6) Subtítulos via drawtext (freetype, sin libass — no crashea en Windows)
  const subtitleVf = buildDrawtextVf(clips, { width, height, fontFile: fontFile || undefined });
  if (subtitleVf) vf += `,${subtitleVf}`;

  // 7) Watermark / copyright
  if (o.watermark) {
    const wm = escapeDrawtextSimple(o.watermark);
    const wmFs = Math.round(width * 0.022);
    const wmX  = `w-tw-${Math.round(width * 0.03)}`;
    const wmY  = `h-th-${Math.round(height * 0.015)}`;
    const ff   = fontFile || 'Arial.ttf';
    vf += `,drawtext=text='${wm}':fontfile='${ff}':fontsize=${wmFs}:fontcolor=white@0.35:x=${wmX}:y=${wmY}`;
  }

  // 8) filter_complex unificado (video + audio en un único grafo)
  let fc;
  if (hasMusic) {
    fc = `[0:v]${vf}[vout];` +
         `[1:a]volume=1.0[va];` +
         `[2:a]volume=${musicVolume}[ma];` +
         `[va][ma]amix=inputs=2:duration=first:normalize=0[aout]`;
  } else {
    fc = `[0:v]${vf}[vout];` +
         `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[aout]`;
  }

  // Escribir filter_complex a archivo para evitar ENAMETOOLONG en Windows.
  // El video largo tiene 100+ frases → la cadena supera los 8191 chars del CLI.
  const fcFile = path.join(workDir, 'filter.txt');
  fs.writeFileSync(fcFile, fc, 'utf8');
  args.push('-filter_complex_script', 'filter.txt');
  args.push('-map', '[vout]', '-map', '[aout]');

  // 9) Encoder
  const enc = process.env.VIDEO_ENCODER || 'libx264';
  args.push('-t', totalSec.toFixed(2), '-r', String(fps), '-c:v', enc);
  if (/^libx26[45]$/.test(enc))         args.push('-preset', 'veryfast', '-crf', '21');
  else if (/^(mpeg4|msmpeg4)/.test(enc)) args.push('-q:v', '4');
  else                                    args.push('-b:v', '6M');
  args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', 'out.mp4');

  await ffmpeg(args, { cwd: workDir, timeoutMs: 25 * 60 * 1000 });

  const produced = path.join(workDir, 'out.mp4');
  if (path.resolve(produced) !== path.resolve(outFile)) fs.renameSync(produced, outFile);

  for (const f of ['sil.m4a', 'voicelist.txt', 'filter.txt']) {
    const p = path.join(workDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  return outFile;
}

/** Escape mínimo para el watermark (texto fijo, sin caracteres especiales esperados). */
function escapeDrawtextSimple(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\u2019')  // apostrofe ASCII -> tipografico
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%');
}
