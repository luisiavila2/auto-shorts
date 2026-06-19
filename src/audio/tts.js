/**
 * tts.js — Síntesis de voz por LÍNEA (frase corta de subtítulo).
 *
 * Provider primario: Edge TTS (gratis, neural, WebSocket) — mejor voz.
 * Fallback: Google Translate TTS (gratis, HTTPS) — por si el WS falla.
 *
 * La duración de cada línea se mide con ffmpeg (probeDurationMs), no con la
 * librería, así el timing de subtítulos es confiable con cualquier provider.
 *
 * Voces graves/serenas en español para contenido de sabiduría:
 *   es-CO-GonzaloNeural (default), es-MX-JorgeNeural, es-ES-AlvaroNeural
 */

import fs from 'fs';
import path from 'path';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { probeDurationMs } from '../util/ff.js';

export const DEFAULT_VOICE = 'es-CO-GonzaloNeural';

// ─── Edge TTS ────────────────────────────────────────────────────────────────
let _edge = null;
let _edgeVoice = null;

async function edgeClient(voice) {
  if (_edge && _edgeVoice === voice) return _edge;
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  _edge = tts; _edgeVoice = voice;
  return tts;
}

async function edgeSynth(text, outFile, opts) {
  const voice = opts.voice || DEFAULT_VOICE;
  const tts = await edgeClient(voice);
  const stream = tts.toStream(text, { rate: opts.rate || '-6%', pitch: opts.pitch || '-2Hz' });
  const chunks = [];
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('edge timeout')), 25000);
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => { clearTimeout(t); resolve(); });
    stream.on('error', e => { clearTimeout(t); reject(e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e) || 'edge-ws-error')); });
  });
  const buf = Buffer.concat(chunks);
  if (buf.length < 800) throw new Error('edge audio vacío');
  fs.writeFileSync(outFile, buf);
}

// ─── Google Translate TTS (fallback HTTPS) ───────────────────────────────────
async function gttsSynth(text, outFile) {
  // gTTS limita ~200 chars por request; las líneas de subtítulo son cortas, así que ok.
  const url = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=es&client=tw-ob&q=' +
    encodeURIComponent(text.slice(0, 200));
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('gtts HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800 || buf[0] !== 0xff) throw new Error('gtts audio inválido');
  fs.writeFileSync(outFile, buf);
}

/**
 * Sintetiza UNA línea a mp3 y devuelve su duración real.
 * @returns {Promise<{ file:string, durMs:number, provider:string }>}
 */
export async function synthLine(text, outFile, opts = {}) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const provider = opts.provider || 'edge';

  let used = null;
  if (provider === 'edge') {
    try { await edgeSynth(text, outFile, opts); used = 'edge'; }
    catch (e) {
      console.log(`        (edge falló: ${e?.message || String(e)} — uso gTTS)`);
      _edge = null; // forzar reconexión la próxima
      await gttsSynth(text, outFile); used = 'gtts';
    }
  } else {
    await gttsSynth(text, outFile); used = 'gtts';
    // Pausa leve para no saturar gTTS en videos largos (144 frases seguidas).
    await new Promise(r => setTimeout(r, 350));
  }

  const durMs = await probeDurationMs(outFile);
  return { file: outFile, durMs, provider: used };
}

/**
 * Sintetiza un array de líneas. Devuelve la lista con su mp3 y timing acumulado.
 * @param {string[]} lines
 * @param {string} dir   carpeta donde guardar los mp3 por línea
 * @param {object} opts  { voice, rate, pitch, provider, gapMs }
 * @returns {Promise<{ clips:Array<{idx,file,text,startMs,durMs}>, totalMs:number, provider:string }>}
 */
export async function synthLines(lines, dir, opts = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const gapMs = Number.isFinite(opts.gapMs) ? opts.gapMs : 280;
  const clips = [];
  let cursor = 0;
  let provider = null;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (!text) continue;
    const file = path.join(dir, `line_${String(i).padStart(3, '0')}.mp3`);
    const { durMs, provider: used } = await synthLine(text, file, opts);
    provider = provider || used;
    clips.push({ idx: i, file, text, startMs: cursor, durMs });
    cursor += durMs + gapMs;
  }
  return { clips, totalMs: cursor, provider };
}
