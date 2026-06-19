/**
 * subtitles.js — Genera un archivo .ass (Advanced SubStation) con subtítulos
 * estilo "karaoke": cada línea aparece grande y centrada, y las palabras se
 * van resaltando (efecto \kf) a lo largo de la duración de esa línea.
 *
 * Es el formato de subtítulo viral del nicho (palabra por palabra). Se quema
 * con ffmpeg (filtro subtitles=).
 *
 * @param clips  array de { text, startMs, durMs } (de tts.synthLines)
 * @param outFile  ruta .ass
 * @param opts   { width, height, fontName, fontSize, marginV, primary, secondary, outline }
 */
import fs from 'fs';
import path from 'path';

function msToAss(ms) {
  const cs = Math.round(ms / 10); // centisegundos
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

// color ASS: &HAABBGGRR (alpha,blue,green,red en hex). alpha 00 = opaco.
function assColor(hex, alpha = '00') {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function escapeAss(t) {
  return t.replace(/\n/g, ' ').replace(/\{/g, '(').replace(/\}/g, ')');
}

/** Construye la parte \kf por palabra, repartiendo la duración por largo de palabra. */
function karaokeText(text, durMs) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return escapeAss(text);
  const totalChars = words.reduce((s, w) => s + w.length, 0) || 1;
  let acc = 0;
  const parts = words.map((w, i) => {
    let cs;
    if (i === words.length - 1) cs = Math.max(1, Math.round(durMs / 10) - acc);
    else { cs = Math.max(1, Math.round((durMs / 10) * (w.length / totalChars))); acc += cs; }
    return `{\\kf${cs}}${escapeAss(w)} `;
  });
  return parts.join('').trimEnd();
}

/** Parte una frase en trozos de <= maxWords, repartiendo su duración por caracteres. */
function chunkClip(clip, maxWords) {
  const words = clip.text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [clip];
  const groups = [];
  for (let i = 0; i < words.length; i += maxWords) groups.push(words.slice(i, i + maxWords));
  const totalChars = words.reduce((s, w) => s + w.length, 0) || 1;
  const out = [];
  let acc = 0;
  groups.forEach((g, i) => {
    const chars = g.reduce((s, w) => s + w.length, 0);
    let dur = i === groups.length - 1
      ? clip.durMs - acc
      : Math.round(clip.durMs * (chars / totalChars));
    dur = Math.max(200, dur);
    out.push({ text: g.join(' '), startMs: clip.startMs + acc, durMs: dur });
    acc += dur;
  });
  return out;
}

export function buildAss(clips, outFile, opts = {}) {
  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const vertical = height > width;
  const fontName = opts.fontName || 'Arial';
  const fontSize = opts.fontSize || (vertical ? 92 : 64);
  const marginV = opts.marginV ?? Math.round(height * (vertical ? 0.32 : 0.12));
  const marginH = opts.marginH ?? 80;
  const maxWords = opts.maxWords || (vertical ? 4 : 7);

  // partir cada frase en trozos cortos (estilo subtítulo viral)
  clips = clips.flatMap(c => chunkClip(c, maxWords));

  const primary = assColor(opts.primary || '#FFD54A');    // palabra resaltada (dorado)
  const secondary = assColor(opts.secondary || '#FFFFFF'); // aún no dicha (blanco)
  const outline = assColor(opts.outline || '#000000');
  const back = assColor(opts.back || '#000000', '90');

  // BorderStyle 1 = outline+shadow. Bold 1. Alignment 2 = abajo-centro (margins controlan posición).
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
    // pequeño fade-in + el karaoke por palabra
    const text = `{\\fad(120,80)}${karaokeText(c.text, c.durMs)}`;
    return `Dialogue: 0,${start},${end},Main,,0,0,0,,${text}`;
  });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, header + lines.join('\n') + '\n', 'utf8');
  return outFile;
}
