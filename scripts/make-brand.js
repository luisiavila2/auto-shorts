/**
 * make-brand.js — genera avatar (800×800) y banner (2560×1440) para el canal.
 * Estética Lumen Aeternum: azul medianoche + oro + luz desde adentro.
 *   node scripts/make-brand.js
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

// Registrar Georgia (serif clásica disponible en Windows)
const FONTS_DIR = 'C:\\Windows\\Fonts';
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'georgiab.ttf'), 'Georgia');
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'georgiai.ttf'), 'GeorgiaItalic');

const out = path.join(process.cwd(), 'brand');
fs.mkdirSync(out, { recursive: true });

// ─── PALETA ───────────────────────────────────────────────────────────────────
const C = {
  night:    '#070B18',
  midnight: '#0D1528',
  navy:     '#1A2645',
  gold:     '#D4A843',
  goldL:    '#F0C85A',
  goldD:    '#8A6520',
  ivory:    '#F5EDD8',
};

// ─── PARTÍCULAS (PRNG determinista) ──────────────────────────────────────────
function drawParticles(ctx, cx, cy, count, maxR, alpha) {
  let s = 42;
  const rng = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist  = Math.sqrt(rng()) * maxR;
    const r     = rng() * 1.8 + 0.4;
    const a     = (rng() * 0.6 + 0.1) * alpha;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(240,200,90,${a.toFixed(2)})`;
    ctx.fill();
  }
}

// ─── RESPLANDOR RADIAL ────────────────────────────────────────────────────────
function glow(ctx, x, y, r, colorIn, colorOut) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colorIn);
  g.addColorStop(1, colorOut);
  return g;
}

// ─── LÁMPARA DE ACEITE ────────────────────────────────────────────────────────
function drawLamp(ctx, scale = 1) {
  const s = scale;
  const bodyGrad = ctx.createLinearGradient(-80*s, -40*s, 80*s, 60*s);
  bodyGrad.addColorStop(0,   C.goldL);
  bodyGrad.addColorStop(0.4, C.gold);
  bodyGrad.addColorStop(1,   C.goldD);

  // Cuerpo ovalado
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.ellipse(0, 20*s, 90*s, 45*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = C.goldL; ctx.lineWidth = 2*s;
  ctx.beginPath(); ctx.ellipse(0, 20*s, 90*s, 45*s, 0, 0, Math.PI*2); ctx.stroke();

  // Pico
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.ellipse(70*s, 12*s, 22*s, 10*s, -0.3, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = C.goldL; ctx.lineWidth = 1.5*s;
  ctx.beginPath(); ctx.ellipse(70*s, 12*s, 22*s, 10*s, -0.3, 0, Math.PI*2); ctx.stroke();

  // Asa
  ctx.strokeStyle = C.gold; ctx.lineWidth = 4*s;
  ctx.beginPath(); ctx.arc(-72*s, 0, 28*s, 0.8, Math.PI*2 - 0.8, false); ctx.stroke();

  // Pedestal
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.ellipse(0, 65*s, 55*s, 8*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-18*s, 63*s); ctx.lineTo(18*s, 63*s);
  ctx.lineTo(12*s, 40*s);  ctx.lineTo(-12*s, 40*s);
  ctx.closePath(); ctx.fill();
}

// ─── LLAMA ────────────────────────────────────────────────────────────────────
function drawFlame(ctx, x, y, scale = 1) {
  const s = scale;
  // Exterior naranja
  ctx.fillStyle = 'rgba(255,140,0,0.85)';
  ctx.beginPath();
  ctx.moveTo(x, y+18*s); ctx.bezierCurveTo(x-18*s, y, x-22*s, y-30*s, x, y-52*s);
  ctx.bezierCurveTo(x+22*s, y-30*s, x+18*s, y, x, y+18*s); ctx.fill();
  // Interior dorado
  ctx.fillStyle = 'rgba(240,200,80,0.9)';
  ctx.beginPath();
  ctx.moveTo(x, y+10*s); ctx.bezierCurveTo(x-11*s, y-4*s, x-13*s, y-24*s, x, y-40*s);
  ctx.bezierCurveTo(x+13*s, y-24*s, x+11*s, y-4*s, x, y+10*s); ctx.fill();
  // Núcleo blanco
  ctx.fillStyle = glow(ctx, x, y-15*s, 12*s, 'rgba(255,255,220,1)', 'rgba(240,200,80,0)');
  ctx.beginPath(); ctx.ellipse(x, y-15*s, 12*s, 18*s, 0, 0, Math.PI*2); ctx.fill();
}

// ═══════════════════════════════════════════════════════════════════════════════
// AVATAR 800×800
// ═══════════════════════════════════════════════════════════════════════════════
(function makeAvatar() {
  const W = 800, H = 800;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Fondo radial profundo
  const bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.75);
  bg.addColorStop(0, C.navy); bg.addColorStop(0.6, C.midnight); bg.addColorStop(1, C.night);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Halo dorado tenue
  ctx.fillStyle = glow(ctx, W/2, H*0.46, 280, 'rgba(212,168,67,0.15)', 'rgba(0,0,0,0)');
  ctx.fillRect(0, 0, W, H);

  // Partículas
  drawParticles(ctx, W/2, H*0.46, 120, 320, 0.85);

  // Lámpara centrada
  const lx = W/2, ly = H * 0.52, sc = 1.4;
  ctx.save(); ctx.translate(lx, ly);
  // Halo bajo la lámpara
  ctx.fillStyle = glow(ctx, 0, 0, 180*sc, 'rgba(212,168,67,0.2)', 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.ellipse(0, 10*sc, 200*sc, 120*sc, 0, 0, Math.PI*2); ctx.fill();
  drawLamp(ctx, sc);
  ctx.restore();

  // Llama
  const flx = lx + 70*sc * Math.cos(-0.3);
  const fly = ly + 12*sc * Math.sin(-0.3) - 30*sc;
  ctx.fillStyle = glow(ctx, flx, fly-10, 80, 'rgba(255,140,0,0.2)', 'rgba(0,0,0,0)');
  ctx.fillRect(flx-80, fly-90, 160, 160);
  drawFlame(ctx, flx, fly);

  // Texto: "SABIDURÍA ETERNA"
  const ty = H * 0.86;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.letterSpacing = '4px';
  ctx.fillStyle = C.gold;
  ctx.font = 'bold 36px Georgia';
  ctx.fillText('SABIDURÍA ETERNA', W/2, ty);

  // Línea divisoria
  ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.moveTo(W/2 - 150, ty - 22); ctx.lineTo(W/2 + 150, ty - 22); ctx.stroke();
  ctx.globalAlpha = 1;

  // Tagline
  ctx.letterSpacing = '1px';
  ctx.fillStyle = C.ivory; ctx.globalAlpha = 0.75;
  ctx.font = 'italic 18px GeorgiaItalic';
  ctx.fillText('Biblia · Filosofía · Verdad', W/2, ty + 28);
  ctx.globalAlpha = 1;

  fs.writeFileSync(path.join(out, 'avatar.png'), canvas.toBuffer('image/png'));
  console.log('✓ brand/avatar.png (800×800)');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// BANNER 2560×1440
// ═══════════════════════════════════════════════════════════════════════════════
(function makeBanner() {
  const W = 2560, H = 1440;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Fondo
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0,    C.night); bg.addColorStop(0.4,  C.midnight);
  bg.addColorStop(0.75, C.navy);  bg.addColorStop(1,    C.night);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Halo central azul
  ctx.fillStyle = glow(ctx, W/2, H/2, 700, 'rgba(26,38,69,0.7)', 'rgba(0,0,0,0)');
  ctx.fillRect(0, 0, W, H);

  // Halo dorado
  ctx.fillStyle = glow(ctx, W/2, H/2, 500, 'rgba(212,168,67,0.10)', 'rgba(0,0,0,0)');
  ctx.fillRect(0, 0, W, H);

  // Partículas
  drawParticles(ctx, W/2, H/2, 400, W * 0.48, 1);

  // Lámparas decorativas laterales (izquierda)
  const lampY = H * 0.52, sc = 0.9;
  ctx.save(); ctx.translate(W * 0.285, lampY); ctx.globalAlpha = 0.45;
  drawLamp(ctx, sc);
  const flx1 = 70*sc*Math.cos(-0.3), fly1 = 12*sc*Math.sin(-0.3) - 30*sc;
  drawFlame(ctx, flx1, fly1, 1);
  ctx.restore();

  // Derecha (espejada)
  ctx.save(); ctx.translate(W * 0.715, lampY); ctx.scale(-1, 1); ctx.globalAlpha = 0.45;
  drawLamp(ctx, sc);
  drawFlame(ctx, flx1, fly1, 1);
  ctx.restore();

  // Llama central grande (sobre el texto)
  const fx = W/2, fy = H * 0.285;
  ctx.fillStyle = glow(ctx, fx, fy, 100, 'rgba(255,200,80,0.25)', 'rgba(0,0,0,0)');
  ctx.fillRect(fx-100, fy-100, 200, 200);
  drawFlame(ctx, fx, fy, 1.3);

  // Líneas doradas horizontales (safe zone delimitada)
  ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.moveTo(W*0.22, H*0.385); ctx.lineTo(W*0.78, H*0.385); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W*0.22, H*0.635); ctx.lineTo(W*0.78, H*0.635); ctx.stroke();
  ctx.globalAlpha = 1;

  // ─ Texto ─
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // Subtítulo superior pequeño
  ctx.letterSpacing = '8px';
  ctx.fillStyle = C.gold; ctx.globalAlpha = 0.6;
  ctx.font = '30px Georgia';
  ctx.fillText('CANAL DE SABIDURÍA', W/2, H * 0.415);
  ctx.globalAlpha = 1;

  // Título principal
  ctx.shadowColor = 'rgba(212,168,67,0.45)'; ctx.shadowBlur = 50;
  ctx.letterSpacing = '12px';
  ctx.fillStyle = C.goldL;
  ctx.font = 'bold 148px Georgia';
  ctx.fillText('SABIDURÍA ETERNA', W/2, H * 0.502);
  ctx.shadowBlur = 0;

  // Tagline
  ctx.letterSpacing = '3px';
  ctx.fillStyle = C.ivory; ctx.globalAlpha = 0.85;
  ctx.font = 'italic 52px GeorgiaItalic';
  ctx.fillText('Biblia  ·  Filosofía  ·  Verdad', W/2, H * 0.594);
  ctx.globalAlpha = 1;

  fs.writeFileSync(path.join(out, 'banner.png'), canvas.toBuffer('image/png'));
  console.log('✓ brand/banner.png (2560×1440)');
})();
