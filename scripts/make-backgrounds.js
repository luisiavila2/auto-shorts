/**
 * make-backgrounds.js — genera fondos cinematográficos para los videos.
 * Crea PNG en assets/backgrounds/ y assets/sages/ usando @napi-rs/canvas.
 *   node scripts/make-backgrounds.js
 */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

const W = 1920, H = 1920; // cuadrado grande; Ken Burns lo recorta al ángulo pedido
const bgDir  = path.join(process.cwd(), 'assets', 'backgrounds');
const sageDir = path.join(process.cwd(), 'assets', 'sages');
fs.mkdirSync(bgDir, { recursive: true });
fs.mkdirSync(sageDir, { recursive: true });

GlobalFonts.registerFromPath('C:\\Windows\\Fonts\\georgiab.ttf', 'Georgia');

// ── PRNG determinista ───────────────────────────────────────────────────────
function makePRNG(seed) {
  let s = seed;
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function save(canvas, file) {
  fs.writeFileSync(file, canvas.toBuffer('image/jpeg', 95));
  console.log('✓', path.basename(file));
}

// ── Helpers de dibujo ───────────────────────────────────────────────────────
function radialGrad(ctx, cx, cy, r, stops) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
}
function linearGrad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
}
function stars(ctx, rng, count, alpha = 1) {
  for (let i = 0; i < count; i++) {
    const x = rng() * W, y = rng() * H;
    const r = rng() * 1.8 + 0.2;
    const a = (rng() * 0.7 + 0.3) * alpha;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,240,${a.toFixed(2)})`; ctx.fill();
  }
}
function dustParticles(ctx, rng, count, color, maxR) {
  for (let i = 0; i < count; i++) {
    const x = rng() * W, y = rng() * H;
    const r = rng() * maxR + 0.3;
    const a = rng() * 0.25 + 0.05;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color.replace('A', a.toFixed(2)); ctx.fill();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CIELO NOCTURNO ESTRELLADO — oscuro con Vía Láctea
// ═══════════════════════════════════════════════════════════════════════════════
(function nightSky() {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  const rng = makePRNG(1);

  // Fondo negro azulado
  const bg = linearGrad(ctx, 0, 0, 0, H, [[0, '#020408'], [0.5, '#08101E'], [1, '#0D1A2E']]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Banda de la Vía Láctea
  const mw = ctx.createLinearGradient(W*0.2, 0, W*0.8, H);
  mw.addColorStop(0,   'rgba(80,100,160,0)');
  mw.addColorStop(0.3, 'rgba(80,100,160,0.12)');
  mw.addColorStop(0.5, 'rgba(100,120,180,0.18)');
  mw.addColorStop(0.7, 'rgba(80,100,160,0.10)');
  mw.addColorStop(1,   'rgba(80,100,160,0)');
  ctx.fillStyle = mw; ctx.fillRect(0, 0, W, H);

  // Nebulosa sutil
  ctx.fillStyle = radialGrad(ctx, W*0.55, H*0.35, 400, [[0,'rgba(60,40,120,0.18)'], [1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = radialGrad(ctx, W*0.3, H*0.6, 350, [[0,'rgba(20,80,100,0.15)'], [1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, H);

  // Estrellas en capas
  stars(ctx, rng, 1200, 0.7);  // fondo difuso
  stars(ctx, makePRNG(2), 400, 1);  // estrellas brillantes

  // Brillos de estrellas principales
  for (let i = 0; i < 8; i++) {
    const x = rng() * W, y = rng() * H;
    const r = rng() * 12 + 6;
    ctx.fillStyle = radialGrad(ctx, x, y, r, [[0,'rgba(255,255,230,0.8)'], [0.3,'rgba(255,255,200,0.3)'], [1,'rgba(0,0,0,0)']]);
    ctx.fillRect(x-r, y-r, r*2, r*2);
  }

  // Polvo galáctico
  dustParticles(ctx, makePRNG(3), 800, 'rgba(200,210,255,A)', 2);

  // Horizonte tenue (base del video)
  const hor = linearGrad(ctx, 0, H*0.8, 0, H, [[0,'rgba(0,0,0,0)'], [1,'rgba(5,10,20,0.85)']]);
  ctx.fillStyle = hor; ctx.fillRect(0, 0, W, H);

  save(canvas, path.join(bgDir, 'night_sky.jpg'));
})();

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AMANECER DORADO — oscuro arriba, oro intenso abajo
// ═══════════════════════════════════════════════════════════════════════════════
(function goldenDawn() {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  const rng = makePRNG(10);

  // Gradiente vertical: noche arriba → amanecer dorado al centro → oscuro abajo
  const bg = linearGrad(ctx, 0, 0, 0, H, [
    [0,    '#010306'],
    [0.25, '#0A0D15'],
    [0.45, '#1A1208'],
    [0.60, '#5C3200'],
    [0.72, '#C46A00'],
    [0.82, '#E89020'],
    [0.88, '#F5B840'],
    [0.94, '#FFD060'],
    [1.0,  '#FFA020'],
  ]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Sol / fuente de luz central
  const sunY = H * 0.85;
  ctx.fillStyle = radialGrad(ctx, W/2, sunY, 0, [[0,'rgba(255,240,180,1)'], [0.05,'rgba(255,200,80,0.9)'], [0.2,'rgba(220,140,20,0.6)'], [0.5,'rgba(180,90,0,0.25)'], [1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, sunY - W, W, W);

  // Rayo de luz hacia arriba
  for (let i = 0; i < 6; i++) {
    const angle = (rng() - 0.5) * 0.6;
    const len = H * (0.5 + rng() * 0.3);
    const width = W * (0.02 + rng() * 0.04);
    ctx.save();
    ctx.translate(W/2, sunY);
    ctx.rotate(angle);
    const ray = ctx.createLinearGradient(0, 0, 0, -len);
    ray.addColorStop(0, `rgba(255,220,100,${0.08 + rng()*0.06})`);
    ray.addColorStop(1, 'rgba(255,220,100,0)');
    ctx.fillStyle = ray;
    ctx.fillRect(-width/2, -len, width, len);
    ctx.restore();
  }

  // Estrellas en la parte oscura (arriba)
  stars(ctx, rng, 300, 0.5);

  // Nubes/niebla en el horizonte
  for (let i = 0; i < 5; i++) {
    const cx = rng() * W, cy = H * (0.7 + rng() * 0.25);
    const rr = 200 + rng() * 400;
    ctx.fillStyle = radialGrad(ctx, cx, cy, rr, [[0,`rgba(255,160,40,${0.06 + rng()*0.05})`], [1,'rgba(0,0,0,0)']]);
    ctx.fillRect(cx-rr, cy-rr, rr*2, rr*2);
  }

  save(canvas, path.join(bgDir, 'golden_dawn.jpg'));
})();

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PIEDRA ANTIGUA — textura oscura tipo manuscrito medieval
// ═══════════════════════════════════════════════════════════════════════════════
(function ancientStone() {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  const rng = makePRNG(20);

  // Base: pergamino oscuro
  const bg = linearGrad(ctx, 0, 0, W, H, [[0,'#12100A'], [0.5,'#1E1A10'], [1,'#0E0C08']]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Textura rugosa (muchos rectángulos semitransparentes pequeños)
  for (let i = 0; i < 3000; i++) {
    const x = rng() * W, y = rng() * H;
    const s = rng() * 6 + 1;
    const a = rng() * 0.06;
    ctx.fillStyle = `rgba(${120+rng()*80},${100+rng()*60},${60+rng()*40},${a})`;
    ctx.fillRect(x, y, s, s * (0.5 + rng()));
  }

  // Venas de luz dorada (como grietas iluminadas)
  for (let i = 0; i < 15; i++) {
    ctx.save();
    ctx.strokeStyle = `rgba(${180+rng()*60},${130+rng()*50},${20+rng()*30},${0.04+rng()*0.06})`;
    ctx.lineWidth = rng() * 3 + 0.5;
    ctx.beginPath();
    let x = rng() * W, y = rng() * H;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (rng() - 0.5) * 400; y += (rng() - 0.5) * 400;
      ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.restore();
  }

  // Luz central tenue dorada (como vela)
  ctx.fillStyle = radialGrad(ctx, W*0.5, H*0.45, 0, [[0,'rgba(200,150,40,0.15)'], [0.4,'rgba(160,100,20,0.08)'], [1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, H);

  // Vigñeta
  ctx.fillStyle = radialGrad(ctx, W/2, H/2, W*0.4, [[0,'rgba(0,0,0,0)'], [0.6,'rgba(0,0,0,0.1)'], [1,'rgba(0,0,0,0.7)']]);
  ctx.fillRect(0, 0, W, H);

  // Partículas doradas flotando
  for (let i = 0; i < 200; i++) {
    const x = rng() * W, y = rng() * H;
    const r = rng() * 2 + 0.3;
    const a = rng() * 0.3 + 0.05;
    ctx.fillStyle = `rgba(220,170,60,${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }

  save(canvas, path.join(bgDir, 'ancient_stone.jpg'));
})();

// ═══════════════════════════════════════════════════════════════════════════════
// 4. NEBULOSA CÓSMICA — azul profundo y morado con partículas de luz
// ═══════════════════════════════════════════════════════════════════════════════
(function cosmicNebula() {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  const rng = makePRNG(30);

  ctx.fillStyle = '#000205'; ctx.fillRect(0, 0, W, H);

  // Capas de nebulosa
  const nebulae = [
    [W*0.3, H*0.3, 700, 'rgba(20,10,80,0.4)'],
    [W*0.7, H*0.6, 600, 'rgba(10,40,90,0.35)'],
    [W*0.5, H*0.5, 850, 'rgba(30,10,60,0.3)'],
    [W*0.2, H*0.7, 500, 'rgba(0,50,80,0.3)'],
    [W*0.8, H*0.2, 450, 'rgba(40,20,100,0.28)'],
  ];
  nebulae.forEach(([cx, cy, r, c]) => {
    ctx.fillStyle = radialGrad(ctx, cx, cy, r, [[0,c],[1,'rgba(0,0,0,0)']]);
    ctx.fillRect(cx-r, cy-r, r*2, r*2);
  });

  // Núcleo brillante
  ctx.fillStyle = radialGrad(ctx, W*0.5, H*0.45, 250, [[0,'rgba(160,120,255,0.5)'],[0.3,'rgba(100,70,200,0.3)'],[0.6,'rgba(60,40,140,0.15)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, H);

  // Estrellas
  stars(ctx, rng, 1500, 0.8);
  stars(ctx, makePRNG(31), 200, 1);

  // Partículas azul-morado más visibles
  dustParticles(ctx, makePRNG(32), 800, 'rgba(180,150,255,A)', 3);
  dustParticles(ctx, makePRNG(33), 500, 'rgba(80,200,255,A)', 2);

  // Rayos de luz desde el centro
  for (let i = 0; i < 5; i++) {
    const angle = rng() * Math.PI * 2;
    const len = 500 + rng() * 400;
    ctx.save(); ctx.translate(W/2, H*0.45); ctx.rotate(angle);
    const ray = ctx.createLinearGradient(0, 0, 0, -len);
    ray.addColorStop(0, 'rgba(120,100,220,0.15)');
    ray.addColorStop(1, 'rgba(120,100,220,0)');
    ctx.fillStyle = ray; ctx.fillRect(-15, -len, 30, len); ctx.restore();
  }

  // Vigneta oscura
  ctx.fillStyle = radialGrad(ctx, W/2, H/2, W*0.45, [[0,'rgba(0,0,0,0)'],[0.6,'rgba(0,0,0,0.05)'],[1,'rgba(0,0,0,0.65)']]);
  ctx.fillRect(0, 0, W, H);

  save(canvas, path.join(bgDir, 'cosmic_nebula.jpg'));
})();

// ═══════════════════════════════════════════════════════════════════════════════
// 5. NIEBLA AZUL — atmósfera mística oscura con capas de neblina
// ═══════════════════════════════════════════════════════════════════════════════
(function mistyBlue() {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  const rng = makePRNG(40);

  // Fondo oscuro azul-gris
  const bg = linearGrad(ctx, 0, 0, 0, H, [[0,'#03050A'],[0.4,'#080E18'],[0.75,'#0C1520'],[1,'#060A12']]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Capas de niebla horizontales
  for (let i = 0; i < 8; i++) {
    const y = rng() * H;
    const h = 100 + rng() * 300;
    const a = 0.04 + rng() * 0.08;
    const blue = 80 + rng() * 60;
    const fog = ctx.createLinearGradient(0, y, 0, y + h);
    fog.addColorStop(0, 'rgba(0,0,0,0)');
    fog.addColorStop(0.5, `rgba(20,30,${blue},${a})`);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fog; ctx.fillRect(0, y, W, h);
  }

  // Luna o fuente de luz pálida
  const moonY = H * 0.3;
  ctx.fillStyle = radialGrad(ctx, W*0.72, moonY, 0, [[0,'rgba(220,230,255,0.95)'],[0.02,'rgba(200,215,255,0.8)'],[0.08,'rgba(180,200,240,0.4)'],[0.25,'rgba(100,130,200,0.15)'],[0.5,'rgba(50,80,160,0.05)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, H);

  // Halo lunar
  ctx.fillStyle = radialGrad(ctx, W*0.72, moonY, 180, [[0,'rgba(180,200,255,0.05)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, H);

  // Estrellas tenues
  stars(ctx, rng, 400, 0.45);

  // Reflejos de luz en la base (como suelo mojado)
  for (let i = 0; i < 5; i++) {
    const cx = rng() * W; const cy = H * (0.8 + rng() * 0.2);
    const rr = 80 + rng() * 200;
    ctx.fillStyle = radialGrad(ctx, cx, cy, rr, [[0,'rgba(150,180,220,0.06)'],[1,'rgba(0,0,0,0)']]);
    ctx.fillRect(cx-rr, cy-rr, rr*2, rr*2);
  }

  // Vigneta
  ctx.fillStyle = radialGrad(ctx, W/2, H/2, W*0.5, [[0,'rgba(0,0,0,0)'],[0.55,'rgba(0,0,0,0.05)'],[1,'rgba(0,0,0,0.7)']]);
  ctx.fillRect(0, 0, W, H);

  save(canvas, path.join(bgDir, 'misty_blue.jpg'));
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SAGE 1 — SILUETA DE FILÓSOFO con luz detrás
// ═══════════════════════════════════════════════════════════════════════════════
(function sagePhilosopher() {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  const rng = makePRNG(50);

  // Fondo: azul oscuro con algo de profundidad
  const bg = linearGrad(ctx, 0, 0, 0, H, [[0,'#030810'],[0.5,'#080F1C'],[0.8,'#0E1828'],[1,'#060C18']]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Gran fuente de luz detrás de la figura (ventana o portal de luz)
  const lightY = H * 0.42;
  // Resplandor exterior amplio
  ctx.fillStyle = radialGrad(ctx, W/2, lightY, 0, [[0,'rgba(255,240,200,1)'],[0.04,'rgba(255,220,140,0.9)'],[0.12,'rgba(240,180,80,0.65)'],[0.28,'rgba(200,130,40,0.35)'],[0.55,'rgba(140,90,20,0.15)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, H);
  // Segunda capa de brillo
  ctx.fillStyle = radialGrad(ctx, W/2, lightY, 0, [[0,'rgba(255,255,230,0.6)'],[0.06,'rgba(255,220,130,0.3)'],[0.2,'rgba(200,140,40,0.12)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, H);

  // Rayos de luz verticales desde el foco
  for (let i = 0; i < 8; i++) {
    const angle = (rng() - 0.5) * 1.2;
    const len = H * 0.55;
    ctx.save(); ctx.translate(W/2, lightY); ctx.rotate(angle);
    const ray = ctx.createLinearGradient(0, 0, 0, len);
    ray.addColorStop(0, `rgba(255,220,100,${0.06 + rng()*0.08})`);
    ray.addColorStop(1, 'rgba(255,220,100,0)');
    ctx.fillStyle = ray; ctx.fillRect(-20, 0, 40, len); ctx.restore();
  }

  // Partículas doradas flotando
  stars(ctx, rng, 200, 0.3);
  dustParticles(ctx, makePRNG(51), 150, 'rgba(255,210,120,A)', 2);

  // SILUETA: figura sentada meditando (oscura y nítida contra la luz)
  const sx = W / 2, sy = H * 0.72;
  const s = 4.2; // escala
  ctx.fillStyle = '#010308';
  ctx.beginPath();
  // Cabeza
  ctx.arc(sx, sy - 178*s, 34*s, 0, Math.PI * 2);
  ctx.fill();
  // Cuello y torso
  ctx.beginPath();
  ctx.moveTo(sx - 20*s, sy - 148*s);
  ctx.bezierCurveTo(sx - 58*s, sy - 120*s, sx - 62*s, sy - 50*s, sx - 68*s, sy);
  ctx.lineTo(sx + 68*s, sy);
  ctx.bezierCurveTo(sx + 62*s, sy - 50*s, sx + 58*s, sy - 120*s, sx + 20*s, sy - 148*s);
  ctx.closePath(); ctx.fill();
  // Piernas cruzadas
  ctx.beginPath();
  ctx.ellipse(sx, sy + 18*s, 82*s, 26*s, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx - 42*s, sy + 8*s, 55*s, 18*s, -0.25, 0, Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.ellipse(sx + 42*s, sy + 8*s, 55*s, 18*s, 0.25, 0, Math.PI*2); ctx.fill();

  // Borde luminoso sutil alrededor de la silueta (efecto contraluz)
  ctx.shadowColor = 'rgba(255,200,80,0.5)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = 'rgba(0,0,0,0)'; // solo shadow
  ctx.beginPath(); ctx.arc(sx, sy - 178*s, 34*s, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  // Sombra suave al pie de la figura
  ctx.fillStyle = radialGrad(ctx, sx, sy + 40*s, 120*s, [[0,'rgba(0,0,0,0.5)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, H*0.8, W, H*0.2);

  // Zona inferior oscura para legibilidad de subtítulos
  const bot = linearGrad(ctx, 0, H*0.78, 0, H, [[0,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,0.88)']]);
  ctx.fillStyle = bot; ctx.fillRect(0, 0, W, H);
  // Vigneta leve en los bordes laterales
  ctx.fillStyle = radialGrad(ctx, W/2, H*0.45, W*0.42, [[0,'rgba(0,0,0,0)'],[0.7,'rgba(0,0,0,0.05)'],[1,'rgba(0,0,0,0.5)']]);
  ctx.fillRect(0, 0, W, H);

  save(canvas, path.join(sageDir, 'philosopher.jpg'));
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SAGE 2 — VELA ENCENDIDA con inscripción
// ═══════════════════════════════════════════════════════════════════════════════
(function sageCandle() {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  const rng = makePRNG(60);

  // Fondo muy oscuro
  const bg = linearGrad(ctx, 0, 0, 0, H, [[0,'#020104'],[0.5,'#070508'],[1,'#030204']]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Vela (cuerpo)
  const cx = W/2, candleBase = H*0.78, candleH = H*0.18, candleW = W*0.035;
  const waxGrad = linearGrad(ctx, cx-candleW, 0, cx+candleW, 0, [[0,'#B89060'],[0.3,'#D4AE78'],[0.7,'#C8A268'],[1,'#B08050']]);
  ctx.fillStyle = waxGrad;
  ctx.fillRect(cx - candleW, candleBase - candleH, candleW*2, candleH);

  // Mecha
  ctx.strokeStyle = '#3A2010'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx, candleBase - candleH); ctx.lineTo(cx + 5, candleBase - candleH - 28); ctx.stroke();

  // Llama
  const flameY = candleBase - candleH - 26;
  ctx.fillStyle = 'rgba(255,140,0,0.9)';
  ctx.beginPath();
  ctx.moveTo(cx, flameY + 22); ctx.bezierCurveTo(cx-20, flameY, cx-24, flameY-40, cx, flameY-70);
  ctx.bezierCurveTo(cx+24, flameY-40, cx+20, flameY, cx, flameY+22); ctx.fill();
  ctx.fillStyle = 'rgba(255,220,100,0.95)';
  ctx.beginPath();
  ctx.moveTo(cx, flameY+14); ctx.bezierCurveTo(cx-12, flameY, cx-14, flameY-26, cx, flameY-52);
  ctx.bezierCurveTo(cx+14, flameY-26, cx+12, flameY, cx, flameY+14); ctx.fill();
  ctx.fillStyle = radialGrad(ctx, cx, flameY-20, 10, [[0,'rgba(255,255,220,1)'],[1,'rgba(255,220,100,0)']]);
  ctx.fillRect(cx-10, flameY-30, 20, 20);

  // Halo de la vela
  ctx.fillStyle = radialGrad(ctx, cx, flameY-20, 0, [[0,'rgba(255,200,80,0.5)'],[0.1,'rgba(240,160,40,0.25)'],[0.35,'rgba(180,100,10,0.12)'],[0.7,'rgba(100,50,5,0.05)'],[1,'rgba(0,0,0,0)']]);
  ctx.fillRect(0, 0, W, H);

  // Partículas de luz alrededor de la llama
  for (let i = 0; i < 50; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = rng() * 200;
    const px = cx + Math.cos(angle) * dist;
    const py = (flameY-20) + Math.sin(angle) * dist * 0.6;
    const r = rng() * 2.5;
    const a = rng() * 0.4 * (1 - dist/200);
    ctx.fillStyle = `rgba(255,200,80,${a})`; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI*2); ctx.fill();
  }

  // Textura de fondo oscuro (libro o mesa)
  for (let i = 0; i < 1200; i++) {
    const x = rng()*W, y = rng()*H; const a = rng()*0.04;
    ctx.fillStyle = `rgba(80,60,30,${a})`; ctx.fillRect(x, y, rng()*4+1, 1);
  }

  // Estrellas muy tenues
  stars(ctx, rng, 100, 0.2);

  // Vigneta intensa (claridad solo en el centro)
  ctx.fillStyle = radialGrad(ctx, cx, H*0.5, W*0.32, [[0,'rgba(0,0,0,0)'],[0.45,'rgba(0,0,0,0.1)'],[1,'rgba(0,0,0,0.88)']]);
  ctx.fillRect(0, 0, W, H);
  const botDark = linearGrad(ctx, 0, H*0.75, 0, H, [[0,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,0.9)']]);
  ctx.fillStyle = botDark; ctx.fillRect(0, 0, W, H);

  save(canvas, path.join(sageDir, 'candle.jpg'));
})();

console.log('\nFondos listos. Imágenes en:');
console.log('  assets/backgrounds/ —', fs.readdirSync(bgDir).length, 'fondos');
console.log('  assets/sages/       —', fs.readdirSync(sageDir).length, 'sages');
