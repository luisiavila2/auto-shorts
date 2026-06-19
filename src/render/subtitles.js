/**
 * subtitles.js — Subtítulos para los videos.
 *
 * buildAss()        → genera .ass (guardado como referencia, no se usa en ffmpeg)
 * buildDrawtextVf() → genera cadena de filtros drawtext para ffmpeg.
 *
 * ¿Por qué drawtext y no subtitles=subs.ass?
 *   libass + DirectWrite crashea con 0xC0000005 en este servidor Windows
 *   independientemente del formato de pixel. drawtext usa freetype directamente,
 *   sin libass, y es estable en cualquier build de ffmpeg.
 */
import fs from 'fs';
import path from 'path';

function msToAss(ms) {
  const cs = Math.round(ms / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function assColor(hex, alpha = '00') {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function escapeAss(t) {
  return t.replace(/\n/g, ' ').replace(/\{/g, '(').replace(/\}/g, ')');
}

function karaokeText(text, durMs) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return escapeAss(text);
  const totalChars = words.reduce((s, w) => s + w.length, 0) || 1;
  let acc = 0;
  return words.map((w, i) => {
    let cs;
    if (i === words.length - 1) cs = Math.max(1, Math.round(durMs / 10) - acc);
    else { cs = Math.max(1, Math.round((durMs / 10) * (w.length / totalChars))); acc += cs; }
    return `{\\kf${cs}}${escapeAss(w)} `;
  }).join('').trimEnd();
}

/**
 * Parte una frase en trozos cortos respetando TANTO un límite de palabras
 * COMO un límite de caracteres (para evitar que el texto supere el ancho del frame).
 *
 * @param {object} clip      - { text, startMs, durMs }
 * @param {number} maxWords  - máximo de palabras por chunk
 * @param {number} maxChars  - máximo de caracteres por chunk (incl. espacios)
 */
export function chunkClip(clip, maxWords, maxChars = 999) {
  const words = clip.text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [clip];

  // Construir grupos palabra a palabra
  const groups = [];
  let current = [];
  let currentChars = 0;

  for (const word of words) {
    // Cuántos chars suma esta palabra (+ espacio separador si ya hay palabras)
    const added = current.length > 0 ? 1 + word.length : word.length;
    const overWords = current.length >= maxWords;
    const overChars = current.length > 0 && currentChars + added > maxChars;

    if (current.length > 0 && (overWords || overChars)) {
      groups.push(current);
      current = [word];
      currentChars = word.length;
    } else {
      current.push(word);
      currentChars += added;
    }
  }
  if (current.length) groups.push(current);
  if (groups.length === 1) return [clip];

  // Distribuir duración proporcionalmente (por cantidad de chars de cada grupo)
  const totalChars = words.reduce((s, w) => s + w.length, 0) || 1;
  const n = groups.length;
  const out = [];
  let acc = 0;

  groups.forEach((g, i) => {
    const chars = g.reduce((s, w) => s + w.length, 0);
    let dur;
    if (i === n - 1) {
      // Último chunk: usa el tiempo restante (sin padding → subtítulos nunca superan el video)
      dur = Math.max(80, clip.durMs - acc);
    } else {
      // Chunks intermedios: proporcional, reservando mínimo 120ms para cada uno posterior
      const remaining = n - 1 - i;
      const proportional = Math.round(clip.durMs * (chars / totalChars));
      const maxAllowed   = clip.durMs - acc - remaining * 120;
      dur = Math.max(150, Math.min(proportional, maxAllowed));
    }
    out.push({ text: g.join(' '), startMs: clip.startMs + acc, durMs: dur });
    acc += dur;
  });
  return out;
}

/** Genera el .ass (útil como referencia/respaldo). */
export function buildAss(clips, outFile, opts = {}) {
  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const vertical = height > width;
  const fontName = opts.fontName || 'Arial';
  const fontSize = opts.fontSize || (vertical ? 92 : 64);
  const marginV = opts.marginV ?? Math.round(height * (vertical ? 0.32 : 0.12));
  const marginH = opts.marginH ?? 80;
  const maxWords = opts.maxWords || (vertical ? 4 : 7);

  clips = clips.flatMap(c => chunkClip(c, maxWords));

  const primary   = assColor(opts.primary   || '#FFD54A');
  const secondary = assColor(opts.secondary || '#FFFFFF');
  const outline   = assColor(opts.outline   || '#000000');
  const back      = assColor(opts.back      || '#000000', '90');

  const header =
`[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,${fontName},${fontSize},${primary},${secondary},${outline},${back},1,0,0,0,100,100,0,0,1,6,3,2,${marginH},${marginH},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = clips.map(c => {
    const start = msToAss(c.startMs);
    const end = msToAss(c.startMs + c.durMs);
    const text = `{\\fad(120,80)}${karaokeText(c.text, c.durMs)}`;
    return `Dialogue: 0,${start},${end},Main,,0,0,0,,${text}`;
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, header + lines.join('\n') + '\n', 'utf8');
  return outFile;
}

/**
 * Escapa texto para el argumento `text=` de drawtext.
 * drawtext usa freetype (sin libass) — no crashea en Windows.
 */
function escapeDrawtext(text) {
  return text
    .replace(/\\/g, '\\\\')        // backslash → \\
    .replace(/'/g, '\u2019')       // ' → ' (evita cerrar el quote del filtro)
    .replace(/:/g, '\\:')          // : → \: (separador de opciones en filtros)
    .replace(/%/g, '%%')           // % → %% (drawtext usa % para variables)
    .replace(/[\r\n]+/g, ' ');     // newlines → espacio
}

/**
 * Genera una cadena de filtros `drawtext` para ffmpeg, equivalente a
 * `subtitles=subs.ass` pero SIN libass (estable en Windows con DirectWrite roto).
 *
 * @param {Array}  clips    - [{text, startMs, durMs}] (antes de chunkear)
 * @param {object} opts     - mismas opciones que buildAss + fontFile
 * @param {string} opts.fontFile - ruta al .ttf relativa al cwd de ffmpeg (def 'Arial.ttf')
 * @returns {string} cadena de filtros drawtext, lista para insertar en filter_complex
 */
export function buildDrawtextVf(clips, opts = {}) {
  const width    = opts.width    || 1080;
  const height   = opts.height   || 1920;
  const vertical = height > width;
  const fontSize = opts.fontSize || (vertical ? 82 : 62);
  const maxWords = opts.maxWords || (vertical ? 4 : 7);
  const fontFile = opts.fontFile || 'Arial.ttf';

  // maxChars: ancho disponible / ancho promedio de carácter en Arial Bold.
  // Arial Bold ≈ fontSize × 0.58 px por carácter. Margen lateral 4% c/lado.
  const usableW  = Math.floor(width * 0.92);
  const charW    = fontSize * 0.58;
  const maxChars = opts.maxChars || Math.floor(usableW / charW);

  // Posición: parte baja pero dejando espacio para no cortar
  const marginV  = opts.marginV  ?? Math.round(height * (vertical ? 0.22 : 0.10));
  const y = height - marginV - fontSize * 2 - 8;

  // Caja de fondo semitransparente debajo del texto (mejor legibilidad sobre video real)
  const boxPad   = Math.round(fontSize * 0.35);

  const chunked = clips.flatMap(c => chunkClip(c, maxWords, maxChars));

  return chunked.map(c => {
    const start = (c.startMs / 1000).toFixed(3);
    const end   = ((c.startMs + c.durMs) / 1000).toFixed(3);
    const text  = escapeDrawtext(c.text);
    const en    = `enable='between(t\\,${start}\\,${end})'`;
    // Comas dentro de between() deben escaparse como \, para el parser de filter_complex
    return [
      `drawtext=text='${text}'`,
      `fontfile='${fontFile}'`,
      `fontsize=${fontSize}`,
      `fontcolor=white`,
      `x=(w-tw)/2`,
      `y=${y}`,
      `borderw=6`,
      `bordercolor=black@1.0`,
      `shadowx=4`,
      `shadowy=4`,
      `shadowcolor=black@0.85`,
      `box=1`,
      `boxcolor=black@0.45`,
      `boxborderw=${boxPad}`,
      en,
    ].join(':');
  }).join(',');
}
