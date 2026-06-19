/**
 * ff.js — utilidades de ffmpeg compartidas.
 * El binario se toma de FFMPEG_PATH si está definido (útil en desarrollo),
 * o 'ffmpeg' del PATH (servidor).
 */
import { spawn } from 'child_process';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/** Ejecuta ffmpeg con los args dados. Resuelve con stderr; rechaza si exit != 0. */
export function ffmpeg(args, { timeoutMs = 20 * 60 * 1000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'], cwd });
    let err = '';
    p.stderr.on('data', d => { err = (err + d.toString()).slice(-4000); });
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`ffmpeg timeout`)); }, timeoutMs);
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(err);
      else reject(new Error('ffmpeg exit ' + code + ':\n' + err.replace(/\r/g, '\n').slice(-800)));
    });
  });
}

/** Devuelve la duración de un archivo de audio/video en ms (vía ffmpeg). */
export async function probeDurationMs(file) {
  let stderr = '';
  try {
    stderr = await ffmpeg(['-i', file, '-f', 'null', '-'], { timeoutMs: 60000 });
  } catch (e) {
    stderr = e.message; // ffmpeg "falla" con -f null a veces pero igual imprime Duration
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr);
  if (!m) return 0;
  const h = +m[1], min = +m[2], s = +m[3];
  return Math.round((h * 3600 + min * 60 + s) * 1000);
}
