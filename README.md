# Auto-Shorts — Canal de Sabiduría (Biblia + Filosofías)

Motor automatizado que genera y sube a YouTube:
- **3 shorts/día** (~45-70s) con un golpe de sabiduría.
- **1 video largo/día** (~10-12 min) sobre un tema en profundidad.

Cada video: guión IA (Biblia + estoicos/filósofos) → voz **Edge TTS (gratis)** →
**subtítulos karaoke** sincronizados → fondo cinematográfico o rostro de sabio
(Ken Burns) → música ambient → subida con declaración de IA y **comentario fijado**
automático.

## Stack
- Node.js v24 (ES Modules)
- Anthropic SDK (Claude) — guiones (default **Haiku**, económico)
- Edge TTS (`msedge-tts`, gratis) con fallback a Google TTS
- ffmpeg — subtítulos ASS karaoke + Ken Burns + mezcla (sin Playwright)
- YouTube Data API v3 (OAuth2) — subida + comentarios

## Setup (servidor)
```powershell
npm install
copy .env.example .env        # completar ANTHROPIC_API_KEY + claves YouTube
npm run music                 # genera pads ambient en assets/music/
node scripts/auth-youtube.js .tokens/sabiduria.json   # autorizar el canal (incluye permiso de comentarios)
```

### Imágenes de fondo (opcional pero recomendado)
Dejá imágenes JPG/PNG en:
- `assets/backgrounds/` → fondos cinematográficos (naturaleza, estatuas, cielos, ruinas)
- `assets/sages/` → rostros de ancianos/sabios

Si están vacías, se usa un gradiente cinematográfico generado (funciona igual).

## Uso
```powershell
# Generar sin subir (prueba)
node src/run.js sabiduria --no-schedule --upload   # sube público inmediato
node src/run.js sabiduria                           # solo genera, no sube

# Solo shorts o solo el largo
node src/run.js sabiduria --only-shorts
node src/run.js sabiduria --only-long

# Producción (genera + sube programado escalonado)
node src/run.js sabiduria --upload
```

## Automatización (Windows Task Scheduler)
Como **Administrador**, una vez:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1 -Hour 9 -Minute 0
```
Crea dos tareas:
- `AutoShorts-Daily` — 09:00, genera y sube los 4 videos del día (programados).
- `AutoShorts-Comments` — cada 2h, postea el comentario fijado cuando cada video publica.

## Costo
Guiones con Haiku: ~$0.10-0.20/día. Voz, música y render: gratis.

## Variables de entorno
Ver `.env.example`. (Edge TTS y Google TTS no requieren clave.)
