/**
 * planner.js — estado persistente + utilidades de anti-repetición.
 * Este canal no usa arcos: cada video es independiente. El planner solo
 * provee los títulos recientes para que el guionista no repita temas.
 */
import fs from 'fs';
import path from 'path';

const STATE_DIR = path.join(process.cwd(), 'state');

export function loadState(channelId) {
  const f = path.join(STATE_DIR, `${channelId}.json`);
  if (!fs.existsSync(f)) return { videos: [] };
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function saveState(channelId, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, `${channelId}.json`), JSON.stringify(state, null, 2));
}

/** Títulos de los últimos N videos (para evitar repetir temas). */
export function recentTitles(channelId, n = 15) {
  return loadState(channelId).videos.slice(-n).map(v => v.title).filter(Boolean);
}
