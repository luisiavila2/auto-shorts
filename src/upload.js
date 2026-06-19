import { google } from 'googleapis';
import fs from 'fs';

/* ============================================================
   Subida a YouTube.

   Cumplimiento IA YouTube 2026:
   - status.selfDeclaredMadeForKids = false
   - status.containsSyntheticMedia  = true (toggle "Altered or synthetic content")
   - El disclaimer textual ya NO se anexa a la descripción: el toggle es la
     declaración oficial y duplicarlo en texto perjudica el algoritmo.

   Schedule (publishAt):
   - Si se pasa publishAt, el video se sube como 'private' y YouTube lo
     publica automáticamente en ese instante. Sirve para escalonar 7
     uploads diarios sin que se vean como spam.
   - publishAt requiere privacyStatus 'private' (la API lo demanda).
   ============================================================ */

function getClient(channel) {
  const oauth = new google.auth.OAuth2(
    process.env.YT_CLIENT_ID,
    process.env.YT_CLIENT_SECRET,
    process.env.YT_REDIRECT_URI || 'http://localhost:5555/oauth2callback'
  );
  if (!fs.existsSync(channel.youtubeTokenFile))
    throw new Error(`Faltan tokens OAuth: ${channel.youtubeTokenFile}. Corré: node scripts/auth-youtube.js ${channel.youtubeTokenFile}`);
  oauth.setCredentials(JSON.parse(fs.readFileSync(channel.youtubeTokenFile, 'utf8')));
  return oauth;
}

function buildTags(tags) {
  const out = new Set((tags || []).map(t => String(t).replace(/^#/, '').trim().toLowerCase()).filter(Boolean));
  return [...out].slice(0, 15);
}

/**
 * Sube un Short. Si se pasa publishAt, va como private + scheduled.
 * Caso contrario: se sube directamente con el privacyStatus que recibe (default 'public').
 *
 * @returns {Promise<{id:string, publishAt?:string}>}
 */
export async function uploadShort(channel, {
  file, title, description, tags = [],
  privacyStatus = 'public',
  publishAt = null,        // ISO8601 string (e.g. "2026-06-09T19:30:00.000Z")
  categoryId = '27',       // 27 = Education (encaja con contenido de sabiduría)
}) {
  const auth = getClient(channel);
  const yt = google.youtube({ version: 'v3', auth });

  // publishAt obliga a privacyStatus 'private' (YouTube API).
  const finalPrivacy = publishAt ? 'private' : privacyStatus;

  const status = {
    privacyStatus: finalPrivacy,
    selfDeclaredMadeForKids: false,
    containsSyntheticMedia: true,
    embeddable: true,
    license: 'youtube',
  };
  if (publishAt) status.publishAt = publishAt;

  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: title.slice(0, 100),
        description: (description || '').trim(),
        tags: buildTags(tags),
        categoryId,
        defaultLanguage: 'es',
        defaultAudioLanguage: 'es',
      },
      status,
    },
    media: { body: fs.createReadStream(file) },
  });
  return { id: res.data.id, publishAt: publishAt || null };
}

/**
 * Postea un comentario en un video (el "comentario del canal" que activa
 * la conversación). Requiere scope youtube.force-ssl en el token OAuth.
 * OJO: falla si el video todavía está privado/programado — postearlo
 * recién cuando el video ya esté público (run.js maneja la cola).
 */
export async function postComment(channel, videoId, text) {
  const auth = getClient(channel);
  const yt = google.youtube({ version: 'v3', auth });
  const res = await yt.commentThreads.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        videoId,
        topLevelComment: { snippet: { textOriginal: text } },
      },
    },
  });
  return { id: res.data.id };
}

/** Devuelve el privacyStatus actual de una lista de videos (para saber si ya publicaron). */
export async function fetchPrivacyStatus(channel, videoIds) {
  if (!videoIds.length) return {};
  const auth = getClient(channel);
  const yt = google.youtube({ version: 'v3', auth });
  const res = await yt.videos.list({ part: ['status'], id: videoIds.join(',') });
  const out = {};
  for (const v of res.data.items || []) out[v.id] = v.status.privacyStatus;
  return out;
}

export async function fetchStats(channel, videoIds) {
  if (!videoIds.length) return {};
  const auth = getClient(channel);
  const yt = google.youtube({ version: 'v3', auth });
  const res = await yt.videos.list({ part: ['statistics'], id: videoIds.join(',') });
  const out = {};
  for (const v of res.data.items || []) {
    out[v.id] = {
      views: Number(v.statistics.viewCount || 0),
      likes: Number(v.statistics.likeCount || 0),
      comments: Number(v.statistics.commentCount || 0),
    };
  }
  return out;
}
