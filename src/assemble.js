/**
 * assemble.js — Arma el video final con ffmpeg.
 *
 *   fondo (imagen Ken Burns o gradiente)  +  subtítulos ASS karaoke
 *   +  voz (líneas concatenadas)  +  música  →  MP4
 *
 * Sin Playwright ni capturas frame-por-frame: todo en una pasada de ffmpeg,
 * rápido incluso para videos de 10+ minutos.
 */
import fs from 'fs';
import path from 'path';
import { ffmpeg } from './util/ff.js';

/**
 * Concatena las líneas de voz (mp3) con un silencio entre cada una, en UNA
 * pista. Como las líneas son secuenciales, alcanza con concatenar (sin amix).
 * @returns {Promise<string>} ruta del archivo de voz (m4a)
 */
async function buildVoiceTrack(clips, workDir, gapMs = 280) {
  // silencio del gap
  const sil = path.join(workDir, 'sil.m4a');
  await ffmpeg([
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`,
    '-t', (gapMs / 1000).toFixed(3), '-c:a', 'aac', '-b:a', '128k', sil,
  ]);

  // lista de concat: line0, sil, line1, sil, ...
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
 *   bgImage      ruta a imagen de fondo (o null → gradiente)
 *   music        ruta a mp3 de música (o null)
 *   outFile      mp4 de salida
 *   width,height (def 1080x1920 vertical; para largo horizontal usar 1920x1080)
 *   fps          (def 30)
 *   musicVolume  (def 0.14)
 *   gapMs        (def 280) silencio entre líneas (debe coincidir con synthLines)
 */
export async function assemble(o) {
  const {
    clips, assFile, bgImage = null, music = null, outFile,
    width = 1080, height = 1920, fps = 30, musicVolume = 0.14, gapMs = 280,
  } = o;

  const workDir = path.dirname(outFile);
  fs.mkdirSync(workDir, { recursive: true });

  // 1) voz
  const voice = await buildVoiceTrack(clips, workDir, gapMs);

  // duración total = último clip + su duración + colita
  const last = clips[clips.length - 1];
  const totalSec = (last.startMs + last.durMs) / 1000 + 1.2;

  // 2) copiar el .ass al workDir para referenciarlo por basename (evita
  //    el escape de rutas con ':' de Windows en el filtro subtitles)
  const assLocal = path.join(workDir, 'subs.ass');
  if (path.resolve(assFile) !== path.resolve(assLocal)) fs.copyFileSync(assFile, assLocal);

  // 3) inputs + cadena de video
  const args = ['-y'];
  let vfilter;

  if (bgImage && fs.existsSync(bgImage)) {
    // imagen con Ken Burns (zoom lento). Escalamos para cubrir y animamos zoom.
    args.push('-loop', '1', '-i', path.resolve(bgImage));
    const frames = Math.ceil(totalSec * fps);
    vfilter =
      `scale=${width * 1.5}:${height * 1.5}:force_original_aspect_ratio=increase,` +
      `crop=${width * 1.5}:${height * 1.5},` +
      `zoompan=z='min(zoom+0.00035,1.30)':d=${frames}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps},` +
      `setsar=1`;
  } else {
    // gradiente cinematográfico generado (fallback sin assets)
    args.push('-f', 'lavfi', '-i',
      `gradients=s=${width}x${height}:c0=0x0b1622:c1=0x1c2a3a:x0=0:y0=0:x1=${width}:y1=${height}:d=${Math.ceil(totalSec)}:speed=0.01`);
    vfilter = `format=yuv420p`;
  }

  // viñeta sutil + quemar subtítulos
  vfilter += `,subtitles=subs.ass`;

  // 4) audio: voz + música
  args.push('-i', path.resolve(voice));
  let audioMap, filterComplex = null;
  if (music && fs.existsSync(music)) {
    args.push('-stream_loop', '-1', '-i', path.resolve(music));
    filterComplex =
      `[1:a]volume=1.0[v];` +
      `[2:a]volume=${musicVolume}[m];` +
      `[v][m]amix=inputs=2:duration=first:normalize=0[a]`;
    audioMap = '[a]';
  } else {
    audioMap = '1:a';
  }

  args.push('-vf', vfilter);
  if (filterComplex) args.push('-filter_complex', filterComplex);
  args.push('-map', '0:v');
  args.push('-map', audioMap);

  // Encoder configurable. Server: libx264 (default). Dev/local sin libx264:
  // VIDEO_ENCODER=mpeg4 (software) o h264_mf (MediaFoundation Windows).
  const enc = process.env.VIDEO_ENCODER || 'libx264';
  args.push('-t', totalSec.toFixed(2), '-r', String(fps), '-c:v', enc);
  if (/^libx26[45]$/.test(enc)) args.push('-preset', 'veryfast', '-crf', '21');
  else if (/^(mpeg4|msmpeg4)/.test(enc)) args.push('-q:v', '4');
  else args.push('-b:v', '6M'); // encoders por hardware (h264_mf/nvenc/qsv/amf)
  args.push('-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', 'out.mp4');

  // correr con cwd = workDir para que subtitles=subs.ass resuelva sin escapes
  await ffmpeg(args, { cwd: workDir, timeoutMs: 25 * 60 * 1000 });

  const produced = path.join(workDir, 'out.mp4');
  if (path.resolve(produced) !== path.resolve(outFile)) {
    fs.renameSync(produced, outFile);
  }

  // limpieza de temporales
  for (const f of ['sil.m4a', 'voicelist.txt']) {
    const p = path.join(workDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  return outFile;
}
