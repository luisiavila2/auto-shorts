/**
 * comments.js — Procesa la cola de comentarios pendientes.
 *
 * Los videos se suben programados (privados con publishAt), y YouTube NO
 * permite comentar un video que todavía no es público. Por eso cada video
 * guarda su comentario en state como `pendingComment`, y esta función:
 *   1. consulta el privacyStatus real de los videos con comentario pendiente
 *   2. en los que ya están 'public', postea el comentario y limpia la cola
 *   3. los que siguen privados/programados quedan para el próximo pase
 *
 * La llaman: run.js (al inicio de la corrida diaria) y post-comments.js
 * (tarea liviana cada 2h que va posteando a medida que los videos publican).
 */

import { postComment, fetchPrivacyStatus } from './upload.js';
import { loadState, saveState } from './planner.js';

export async function processPendingComments(channel, channelId) {
  const state = loadState(channelId);
  const pending = state.videos.filter(v => v.videoId && v.pendingComment);
  if (!pending.length) return { posted: 0, waiting: 0, failed: 0 };

  console.log(`  Comentarios en cola: ${pending.length}`);

  let privacy = {};
  try {
    privacy = await fetchPrivacyStatus(channel, pending.map(v => v.videoId));
  } catch (e) {
    console.log('  (no se pudo consultar estado de videos:', e.message, ')');
    return { posted: 0, waiting: pending.length, failed: 0 };
  }

  let posted = 0, waiting = 0, failed = 0;
  for (const v of pending) {
    const status = privacy[v.videoId];
    if (status !== 'public') {
      waiting++;
      continue; // aún no publicó → próximo pase
    }
    try {
      await postComment(channel, v.videoId, v.pendingComment);
      console.log(`  ✔ Comentario en ${v.videoId}: "${v.pendingComment}"`);
      v.pendingComment = null;
      saveState(channelId, state); // guardar tras cada uno (resistente a corte)
      posted++;
    } catch (e) {
      failed++;
      console.log(`  ✗ Comentario en ${v.videoId} falló: ${e.message}`);
      if (/insufficient|scope|forbidden|permission|401|403/i.test(e.message)) {
        console.log(`  → El token no tiene permiso de comentarios. Re-autenticá UNA vez:`);
        console.log(`    node scripts/auth-youtube.js ${channel.youtubeTokenFile}`);
        break; // sin scope no tiene sentido seguir
      }
    }
  }

  console.log(`  Comentarios: ${posted} posteados, ${waiting} esperando publicación, ${failed} con error`);
  return { posted, waiting, failed };
}
