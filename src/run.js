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
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const upload = args.includes('--upload');
const scheduledPublish = upload && !args.includes('--no-schedule');
const only = args.includes('--only-shorts') ? 'shorts' : args.includes('--only-long') ? 'long' : null;
const channelArg = args.find(a => !a.startsWith('--'));
const targets = channelArg ? [channelArg] : Object.keys(CHANNELS);

for (const id of targets) {
  await runChannel(id, { upload, scheduledPublish, only });
}
console.log('\nListo.');
