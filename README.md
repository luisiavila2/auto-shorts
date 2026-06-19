# Auto-Shorts

Motor automatizado de YouTube Shorts (segundo canal, contexto distinto al de `youtube-ia`).

**Estado:** esqueleto base. Falta definir el tipo de contenido del canal.

## Stack previsto
- Node.js v24 + ES Modules
- Anthropic SDK (Claude) para guiones
- Playwright (Chromium headless) para render → frames PNG
- ffmpeg para ensamblar frames + audio → MP4 vertical 1080x1920
- YouTube Data API v3 (OAuth2) para subida + comentarios

## Estructura
```
src/
  run.js              ← orquestador principal (esqueleto)
  generate-script.js  ← guión via Claude (pendiente)
  prompts/recipes.js  ← prompts del guionista (esqueleto)
  render/             ← render del contenido a frames
  audio/              ← SFX / voces
config/
  channels.js         ← identidad de cada canal (esqueleto)
scripts/              ← utilidades (auth, tareas programadas)
assets/               ← música y SFX
state/                ← estado persistente (gitignored)
.tokens/              ← tokens OAuth por canal (gitignored)
```

## Setup (cuando esté el contenido definido)
```powershell
npm install
npx playwright install chromium
copy .env.example .env   # completar claves
```

## Variables de entorno
Ver `.env.example`.
