/**
 * assemble.js — Arma el video final con ffmpeg.
 *
 *   fondo (imagen/video/gradiente) + subtítulos ASS + voz + música → MP4
 *
 * TODO de diseño importante (Windows):
 *   - NUNCA usar zoompan (0xC0000005 con imágenes grandes).
 *   - NUNCA mezclar -vf y -filter_complex en el mismo comando (conflicto).
 *   - Imágenes cuadradas (1920×1920) → destino vertical (1080×1920):
 *       scale con force_original_aspect_ratio=increase produce 2400×2400 si se
 *       escala a 1.25× → crash igual que zoompan.
 *       Solución: dos pasos: (1) scale+crop al target exacto, (2) scale×1.06 +
 *       crop animado. Máximo intermedio: 1920×1920 → luego 1145×2035. Seguro.
 *   - Todo en un único -filter_complex para evitar conflictos.
 */
import fs from 'fs';
import path from 'path';
import { ffmpeg } from './util/ff.js';

/**
 * Concatena las líneas de voz (mp3) en una pista, con silencio entre cada una.
 */
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
 *   clips        [{file,text,startMs,durMs}]  (de tts.synthLines)
 *   assFile      ruta al .ass de subtítulos
 *   bgImage      ruta a imagen/video de fondo (o null → gradiente oscuro)
 *   music        ruta a mp3 de música (o null)
 *   outFile      mp4 de salida
 *   width,height (def 1080×1920 vertical; largo horizontal: 1920×1080)
 *   fps          (def 30)
 *   musicVolume  (def 0.14)
 *   gapMs        (def 280)
 *   watermark    texto de copyright (ej. '© Sabiduría Eterna')
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

  // 2) Copiar .ass al workDir para que subtitles=subs.ass resuelva con cwd
  const assLocal = path.join(workDir, 'subs.ass');
  if (path.resolve(assFile) !== path.resolve(assLocal)) fs.copyFileSync(assFile, assLocal);

  // 3) Detectar tipo de fondo
  const isVideoBackground = bgImage && /\.(mp4|mov|webm|mkv)$/i.test(bgImage);
  const hasBackground     = bgImage && fs.existsSync(bgImage);
  const hasMusic          = music && fs.existsSync(music);

  // 4) Construir args de ffmpeg
  const args = ['-y'];

  // Input 0: fondo
  if (!hasBackground) {
    // Gradiente sólido oscuro (fallback)
    args.push('-f', 'lavfi', '-i', `color=c=#0D1528:s=${width}x${height}:r=${fps}`);
  } else if (isVideoBackground) {
    // Video animado en bucle hasta que termine el audio
    args.push('-stream_loop', '-1', '-t', String(Math.ceil(totalSec + 2)), '-i', path.resolve(bgImage));
  } else {
    // Imagen estática (loop)
    args.push('-loop', '1', '-t', String(Math.ceil(totalSec + 2)), '-i', path.resolve(bgImage));
  }

  // Input 1: voz
  args.push('-i', path.resolve(voice));

  // Input 2 (opcional): música en bucle
  if (hasMusic) args.push('-stream_loop', '-1', '-i', path.resolve(music));

  // 5) Filtro de video
  //
  // Para imágenes: 2 pasos para evitar buffers intermedios enormes (crash en Windows).
  //   Paso A: scale a exactamente el target + crop centrado → max 1920×1920 de intermedio.
  //   Paso B: scale×1.06 → animated crop suave. Intermedio ≤ 1145×2035. Seguro.
  //
  // Para videos: scale+crop directo (el video ya tiene movimiento, no necesita pan).
  // Para gradiente lavfi: solo format conversion.
  let vf;

  if (!hasBackground) {
    vf = `format=yuv420p,fps=${fps},setsar=1`;
  } else if (isVideoBackground) {
    vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
         `crop=${width}:${height},fps=${fps},setsar=1`;
  } else {
    // Imagen: paso A = scale+crop al target (1080×1920 max), paso B = scale×1.06 + pan suave
    const pw = Math.round(width  * 1.06);  // ej. 1145
    const ph = Math.round(height * 1.06);  // ej. 2035
    const ox = Math.round((pw - width)  / 2);  // ej. 32–33
    const oy = Math.round((ph - height) / 2);  // ej. 57–58
    // Pan sinusoidal: centro = ox/oy, swing = 90% del offset → siempre dentro del margen.
    // x ∈ [ox - px, ox + px] ⊆ [0, pw-width]. Ej: ox=33 px=30 → x ∈ [3, 63] ✓
    const px = Math.round(ox * 0.9);
    const py = Math.round(oy * 0.9);
    vf =
      // A) Cubrir target: para imagen cuadrada 1920×1920 → 1920×1920 (intermedio), luego crop 1080×1920
      `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},` +
      // B) Scale×1.06 (intermedio ≤ 1145×2035), pan sinusoidal lento y centrado
      `scale=${pw}:${ph},` +
      `crop=${width}:${height}:x='${ox}+${px}*sin(t*0.05)':y='${oy}+${py}*sin(t*0.04+0.8)',` +
      `fps=${fps},setsar=1`;
  }

  // Subtítulos + watermark
  vf += `,subtitles=subs.ass`;
  if (o.watermark) {
    const wm = o.watermark.replace(/'/g, "\\'");
    vf += `,drawtext=text='${wm}':fontsize=${Math.round(width * 0.022)}` +
          `:fontcolor=white@0.35:x=w-tw-${Math.round(width * 0.03)}` +
          `:y=h-th-${Math.round(height * 0.015)}:font=Arial`;
  }

  // 6) filter_complex unificado (video + audio en un único grafo)
  //    Evita el conflicto -vf / -filter_complex que crashea en algunos builds de Windows.
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

  args.push('-filter_complex', fc);
  args.push('-map', '[vout]', '-map', '[aout]');

  // 7) Encoder
  const enc = process.env.VIDEO_ENCODER || 'libx264';
  args.push('-t', totalSec.toFixed(2), '-r', String(fps), '-c:v', enc);
  if (/^libx26[45]$/.test(enc))   args.push('-preset', 'veryfast', '-crf', '21');
  else if (/^(mpeg4|msmpeg4)/.test(enc)) args.push('-q:v', '4');
  else args.push('-b:v', '6M');
  args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', 'out.mp4');

  await ffmpeg(args, { cwd: workDir, timeoutMs: 25 * 60 * 1000 });

  const produced = path.join(workDir, 'out.mp4');
  if (path.resolve(produced) !== path.resolve(outFile)) fs.renameSync(produced, outFile);

  for (const f of ['sil.m4a', 'voicelist.txt']) {
    const p = path.join(workDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  return outFile;
}
