import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { CHANNELS } from '../config/channels.js';
import { generateShort, generateLong } from './generate-script.js';
import { synthLines } from './audio/tts.js';
import { buildAss } from './render/subtitles.js';
import { pickBackground } from './render/visuals.js';
import { assemble } from './assemble.js';
import { loadState, saveState, recentTitles } from './planner.js';
import { uploadShort } from './upload.js';
import { processPendingComments } from './comments.js';

const OUT = path.join(process.cwd(), 'output');
const GAP_MS = 280;

function pickMusic(channel) {
  const dir = path.join(process.cwd(), channel.musicDir || 'assets/music');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /\.(mp3|m4a|wav)$/i.test(f));
  return files.length ? path.join(dir, files[Math.floor(Math.random() * files.length)]) : null;
}

/** publishAt escalonado. shorts: +2h,+5h,+8h. largo: +3h. */
function publishAtFor(kind, idx) {
  const offsets = kind === 'long' ? [3] : [2, 5, 8];
  const hours = offsets[idx] ?? (2 + idx * 3);
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

/** Produce un video (short o largo) a partir de su guión. */
async function produce(channel, script, slug) {
  const workDir = path.join(OUT, slug);
  fs.mkdirSync(workDir, { recursive: true });

  const isLong = script.kind === 'long';
  const width = isLong ? 1920 : 1080;
  const height = isLong ? 1080 : 1920;

  console.log(`      Narrando ${script.narration.length} frases (TTS)…`);
  const { clips } = await synthLines(script.narration, path.join(workDir, 'voice'), {
    voice: channel.voice, provider: channel.ttsProvider || 'edge', gapMs: GAP_MS,
  });

  console.log('      Subtítulos…');
  const assFile = path.join(workDir, 'subs.ass');
  buildAss(clips, assFile, { width, height });

  const bg = pickBackground(script.bgStyle || 'auto');
  console.log(`      Fondo: ${bg.style}${bg.image ? ' (' + path.basename(bg.image) + ')' : ' (gradiente)'}`);

  console.log('      Ensamblando…');
  const outFile = path.join(workDir, 'video.mp4');
  await assemble({
    clips, assFile, bgImage: bg.image, music: pickMusic(channel),
    outFile, width, height, gapMs: GAP_MS,
    watermark: channel.watermark,
  });

  fs.writeFileSync(path.join(workDir, 'script.json'), JSON.stringify(script, null, 2));
  return outFile;
}

function buildDescription(script) {
  const hook = (script.description || '').trim();
  const tags = (script.hashtags || []).map(h => `#${h}`).join(' ');
  return `${hook}\n\n${tags}`;
}

async function runChannel(channelId, { upload, scheduledPublish, only }) {
  const channel = CHANNELS[channelId];
  if (!channel) throw new Error(`Canal desconocido: ${channelId}`);

  if (upload && !fs.existsSync(channel.youtubeTokenFile)) {
    console.log(`\n=== ${channel.displayName} — SALTEADO (sin token ${channel.youtubeTokenFile}) ===`);
    return;
  }
  console.log(`\n=== Canal: ${channel.displayName} (${channel.handle}) ===`);

  if (upload) await processPendingComments(channel, channelId);

  const day = new Date().toISOString().slice(0, 10);

  // armar la lista de trabajos del día
  const jobs = [];
  if (only !== 'long') {
    for (let i = 0; i < (channel.shortsPerDay || 3); i++) jobs.push({ kind: 'short', idx: i });
  }
  if (only !== 'shorts') {
    for (let i = 0; i < (channel.longPerDay || 1); i++) jobs.push({ kind: 'long', idx: i });
  }

  for (let n = 0; n < jobs.length; n++) {
    const job = jobs[n];
    console.log(`\n  [${n + 1}/${jobs.length}] ${job.kind === 'long' ? 'VIDEO LARGO' : 'SHORT'}…`);
    try {
      const recent = recentTitles(channelId, 15);
      const cfg = { channelContext: channel.channelContext, model: channel.model, recentTitles: recent };
      const script = job.kind === 'long' ? await generateLong(cfg) : await generateShort(cfg);
      console.log(`      "${script.title}"`);

      const slug = `${channelId}_${job.kind}_${Date.now()}`;
      const outFile = await produce(channel, script, slug);

      const state = loadState(channelId);
      const record = { slug, day, kind: job.kind, title: script.title, file: outFile };

      if (upload) {
        const tags = job.kind === 'short'
          ? [...new Set(['shorts', ...(script.hashtags || [])])]
          : (script.hashtags || []);
        const description = (job.kind === 'short' ? '' : '') + buildDescription(script);
        const publishAt = scheduledPublish ? publishAtFor(job.kind, job.idx) : null;

        console.log(`      Subiendo${publishAt ? ` (publica ${new Date(publishAt).toLocaleString()})` : ''}…`);
        const { id } = await uploadShort(channel, {
          file: outFile, title: script.title, description, tags, publishAt,
        });
        record.videoId = id;
        record.publishAt = publishAt;
        if (script.pinnedComment) {
          record.pendingComment = script.pinnedComment;
          console.log(`      Comentario en cola: "${script.pinnedComment}"`);
        }
        console.log(`      ✔ Subido: https://youtube.com/watch?v=${id}`);
      } else {
        console.log(`      ✔ Listo (sin subir): ${outFile}`);
      }

      state.videos.push(record);
      saveState(channelId, state);
    } catch (e) {
      console.error(`\n  [${n + 1}/${jobs.length}] ERROR:\n${(e.message || String(e)).replace(/\r/g, '\n')}\n`);
    }
  }

  // Conservar solo los últimos (shortsPerDay + longPerDay) × 2 outputs en disco
  const keepCount = ((channel.shortsPerDay || 3) + (channel.longPerDay || 1)) * 2;
  pruneOldOutputs(channelId, keepCount);
}

/**
 * Elimina del disco los outputs más antiguos, conservando solo los últimos keepCount.
 * Escanea la carpeta output/ directamente (no depende del state) para capturar
 * también carpetas de runs fallidos que nunca llegaron a guardarse en state.json.
 * El timestamp está embebido en el nombre: channelId_kind_TIMESTAMP.
 */
function pruneOldOutputs(channelId, keepCount = 8) {
  const outDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outDir)) return;

  // Listar carpetas que pertenecen a este canal
  const dirs = fs.readdirSync(outDir).filter(name => name.startsWith(`${channelId}_`));

  // Ordenar por timestamp embebido en el nombre (último segmento separado por _)
  dirs.sort((a, b) => {
    const tsA = parseInt(a.split('_').pop()) || 0;
    const tsB = parseInt(b.split('_').pop()) || 0;
    return tsA - tsB; // ascendente → más viejos primero
  });

  const toDelete = dirs.slice(0, Math.max(0, dirs.length - keepCount));
  let deleted = 0;

  for (const dir of toDelete) {
    const full = path.join(outDir, dir);
    try {
      fs.rmSync(full, { recursive: true, force: true });
      deleted++;
    } catch { /* ignorar */ }
  }

  // Limpiar punteros en state.json para carpetas ya borradas
  if (deleted) {
    const state = loadState(channelId);
    let changed = false;
    for (const record of state.videos) {
      if (record.file && !fs.existsSync(record.file)) { record.file = null; changed = true; }
    }
    if (changed) saveState(channelId, state);
    console.log(`  (Limpieza: ${deleted} carpeta(s) borradas, conservadas ${Math.min(keepCount, dirs.length)} más recientes)`);
  }
}

/** Sube videos del DÍA DE HOY que fueron generados pero no se subieron (sin videoId). */
async function reuploadFailed(channelId) {
  const channel = CHANNELS[channelId];
  if (!fs.existsSync(channel.youtubeTokenFile)) {
    console.log(`  SALTEADO — sin token ${channel.youtubeTokenFile}`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const state = loadState(channelId);
  // Solo videos de HOY — evita re-subir intentos viejos de días anteriores
  const pending = state.videos.filter(v => v.file && !v.videoId && v.day === today);

  if (!pending.length) {
    const totalPending = state.videos.filter(v => v.file && !v.videoId).length;
    if (totalPending > 0) {
      console.log(`  No hay videos pendientes de HOY (${today}).`);
      console.log(`  Hay ${totalPending} video(s) sin subir de días anteriores (ignorados).`);
    } else {
      console.log('  No hay videos pendientes de subida.');
    }
    return;
  }

  console.log(`  Encontrados ${pending.length} video(s) sin subir:\n`);

  for (const record of pending) {
    if (!fs.existsSync(record.file)) {
      console.log(`  ✗ Archivo ya no existe: ${record.file}`);
      continue;
    }
    const scriptPath = path.join(path.dirname(record.file), 'script.json');
    if (!fs.existsSync(scriptPath)) {
      console.log(`  ✗ Sin script.json para "${record.title}", saltando.`);
      continue;
    }
    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
    const isLong = record.kind === 'long';
    const tags = isLong
      ? (script.hashtags || [])
      : [...new Set(['shorts', ...(script.hashtags || [])])];
    const publishAt = publishAtFor(record.kind, 0);

    console.log(`  Subiendo (${record.kind}): "${record.title}"`);
    console.log(`    Archivo: ${record.file}`);
    try {
      const { id } = await uploadShort(channel, {
        file: record.file, title: script.title,
        description: buildDescription(script), tags, publishAt,
      });
      record.videoId = id;
      record.publishAt = publishAt;
      if (script.pinnedComment) {
        record.pendingComment = script.pinnedComment;
        console.log(`    Comentario en cola: "${script.pinnedComment}"`);
      }
      saveState(channelId, state);
      console.log(`    ✔ Subido: https://youtube.com/watch?v=${id}`);
    } catch (e) {
      console.error(`    ✗ Error: ${e.message.split('\n')[0]}`);
    }
    console.log();
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const upload = args.includes('--upload');
const scheduledPublish = upload && !args.includes('--no-schedule');
const only = args.includes('--only-shorts') ? 'shorts' : args.includes('--only-long') ? 'long' : null;
const reupload    = args.includes('--reupload-failed');
const prune       = args.includes('--prune');
const folderIdx   = args.indexOf('--upload-folder');
const folderArg   = folderIdx !== -1 ? args[folderIdx + 1] : null;
const channelArg  = args.find(a => !a.startsWith('--'));
const targets     = channelArg ? [channelArg] : Object.keys(CHANNELS);

if (folderArg) {
  // Subir un video ya generado desde una carpeta específica de output/
  for (const id of targets) {
    const channel = CHANNELS[id];
    if (!channel) continue;
    console.log(`\n=== Canal: ${channel.displayName} ===`);

    const outDir    = path.join(process.cwd(), 'output', folderArg);
    const videoFile = path.join(outDir, 'video.mp4');
    const scriptFile= path.join(outDir, 'script.json');

    if (!fs.existsSync(videoFile))  { console.error(`  ✗ No existe: ${videoFile}`);  continue; }
    if (!fs.existsSync(scriptFile)) { console.error(`  ✗ No existe: ${scriptFile}`); continue; }
    if (!fs.existsSync(channel.youtubeTokenFile)) { console.error(`  ✗ Sin token OAuth`); continue; }

    const script = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
    const isLong = folderArg.includes('_long_');
    const tags   = isLong
      ? (script.hashtags || [])
      : [...new Set(['shorts', ...(script.hashtags || [])])];
    const publishAt = scheduledPublish ? publishAtFor(isLong ? 'long' : 'short', 0) : null;

    console.log(`  Subiendo: "${script.title}"`);
    if (publishAt) console.log(`  Publicará: ${new Date(publishAt).toLocaleString()}`);
    else           console.log(`  Publicando: ahora (público inmediato)`);

    try {
      const { id: videoId } = await uploadShort(channel, {
        file: videoFile, title: script.title,
        description: buildDescription(script), tags, publishAt,
      });

      // Actualizar o crear entrada en state
      const state = loadState(id);
      let rec = state.videos.find(v => v.slug === folderArg);
      if (!rec) {
        rec = { slug: folderArg, day: new Date().toISOString().slice(0, 10),
                kind: isLong ? 'long' : 'short', title: script.title, file: videoFile };
        state.videos.push(rec);
      }
      rec.videoId = videoId;
      rec.publishAt = publishAt;
      if (script.pinnedComment) {
        rec.pendingComment = script.pinnedComment;
        console.log(`  Comentario en cola: "${script.pinnedComment}"`);
      }
      saveState(id, state);
      console.log(`  ✔ Subido: https://youtube.com/watch?v=${videoId}`);
    } catch (e) {
      console.error(`  ✗ Error: ${e.message.split('\n')[0]}`);
    }
  }
} else if (prune) {
  for (const id of targets) {
    const ch = CHANNELS[id];
    const keep = (ch?.shortsPerDay || 3) + (ch?.longPerDay || 1);
    console.log(`\n=== Canal: ${ch?.displayName} — limpiando outputs (conservando últimos ${keep}) ===`);
    pruneOldOutputs(id, keep);
  }
} else if (reupload) {
  for (const id of targets) {
    console.log(`\n=== Canal: ${CHANNELS[id]?.displayName} ===`);
    await reuploadFailed(id);
  }
} else {
  for (const id of targets) {
    await runChannel(id, { upload, scheduledPublish, only });
  }
}
console.log('\nListo.');
