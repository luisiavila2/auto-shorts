import Anthropic from '@anthropic-ai/sdk';
import { buildShortPrompt, buildLongPrompt } from './prompts/recipes.js';

const client = new Anthropic();

function extractJSON(text) {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('No se encontró JSON en la respuesta');
  return JSON.parse(t.slice(a, b + 1));
}

function normMeta(s) {
  s.title = (s.title || 'Sabiduría para hoy').toString().slice(0, 100);
  s.description = (s.description || '').toString().trim();
  s.pinnedComment = (s.pinnedComment || '').toString().trim().slice(0, 200) || null;
  s.bgStyle = (s.bgStyle === 'sage' || s.bgStyle === 'cinematic') ? s.bgStyle : 'auto';
  let tags = Array.isArray(s.hashtags) ? s.hashtags : [];
  tags = tags.map(t => String(t).replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '')).filter(Boolean).slice(0, 10);
  for (const base of ['shorts']) if (!tags.includes(base)) tags.unshift(base);
  s.hashtags = [...new Set(tags)];
  return s;
}

function cleanNarration(arr) {
  return (arr || [])
    .map(x => String(x).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

async function callClaude(cfg, system, user, maxTokens) {
  const maxTries = cfg.retries ?? 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const userContent = attempt === 1 ? user
        : user + '\n\nIMPORTANTE: devolvé SOLO JSON válido, sin texto extra ni backticks.';
      const resp = await client.messages.create({
        model: cfg.model || 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
      });
      const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
      const u = resp.usage || {};
      console.log(`      tokens: in=${u.input_tokens} out=${u.output_tokens}`);
      return extractJSON(text);
    } catch (e) {
      lastErr = e;
      if (attempt < maxTries) console.log(`      (intento ${attempt} falló: ${e.message} — reintento)`);
    }
  }
  throw new Error(`No se pudo generar guión tras ${maxTries} intentos: ${lastErr.message}`);
}

/**
 * Genera el guión de un SHORT.
 * @returns {Promise<{ title, description, hashtags, pinnedComment, bgStyle, narration:string[], kind:'short' }>}
 */
export async function generateShort(cfg) {
  const { system, user } = buildShortPrompt(cfg.channelContext, { recentTitles: cfg.recentTitles || [] });
  const raw = await callClaude(cfg, system, user, 2000);
  const s = normMeta(raw);
  s.narration = cleanNarration(s.narration);
  if (s.narration.length < 8) throw new Error(`short con muy pocas frases (${s.narration.length})`);
  s.kind = 'short';
  return s;
}

/**
 * Genera el guión del VIDEO LARGO.
 * @returns {Promise<{ title, description, hashtags, pinnedComment, bgStyle, sections:[{heading,narration[]}], narration:string[], kind:'long' }>}
 */
export async function generateLong(cfg) {
  const { system, user } = buildLongPrompt(cfg.channelContext, { recentTitles: cfg.recentTitles || [] });
  const raw = await callClaude(cfg, system, user, 8000);
  const s = normMeta(raw);
  const sections = Array.isArray(s.sections) ? s.sections : [];
  s.sections = sections.map(sec => ({
    heading: String(sec.heading || '').trim(),
    narration: cleanNarration(sec.narration),
  })).filter(sec => sec.narration.length);
  // narración aplanada para TTS, con los headings como marcadores de fondo
  s.narration = s.sections.flatMap(sec => sec.narration);
  if (s.narration.length < 60) throw new Error(`video largo con muy pocas frases (${s.narration.length})`);
  s.kind = 'long';
  return s;
}
