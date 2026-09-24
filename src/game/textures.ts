import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  Textures procédurales (canvas) — aucune ressource externe.
//  Elles restent légères (256–512 px) et fonctionnent hors ligne.
// ─────────────────────────────────────────────────────────────

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return { c, ctx: c.getContext("2d")! };
}

function finish(c: HTMLCanvasElement, repeat = 1, srgb = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** bruit granuleux (pixels) — grain, salissures, usure */
function grain(ctx: CanvasRenderingContext2D, size: number, rnd: () => number, amount: number, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

export function makeAsphalt(seed = 1) {
  const size = 512;
  const { c, ctx } = canvas(size);
  const rnd = mulberry(seed);
  ctx.fillStyle = "#3d3f45";
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, rnd, 9000, 0.12);
  // plaques de réparation plus claires / plus sombres
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = rnd() < 0.5 ? "rgba(70,72,78,0.35)" : "rgba(28,29,33,0.35)";
    ctx.fillRect(rnd() * size, rnd() * size, 40 + rnd() * 120, 20 + rnd() * 60);
  }
  // fissures fines
  ctx.strokeStyle = "rgba(20,20,24,0.55)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = rnd() * size;
    let y = rnd() * size;
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rnd() - 0.5) * 40;
      y += (rnd() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}

export function makeConcrete(seed = 2) {
  const size = 256;
  const { c, ctx } = canvas(size);
  const rnd = mulberry(seed);
  ctx.fillStyle = "#a9a49a";
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, rnd, 3500, 0.1);
  // dalles
  ctx.strokeStyle = "rgba(70,66,60,0.45)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (i * size) / 4;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  return finish(c);
}
export function makeDirt(seed = 3) {
  const size = 512;
  const { c, ctx } = canvas(size);
  const rnd = mulberry(seed);
  ctx.fillStyle = "#a8673a";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const r = 6 + rnd() * 30;
    ctx.fillStyle = rnd() < 0.5 ? "rgba(140,85,45,0.18)" : "rgba(190,125,80,0.16)";
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, r, r * (0.4 + rnd()), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, size, rnd, 6000, 0.08);
  // touffes d'herbe sèche
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(${90 + rnd() * 40},${110 + rnd() * 40},40,0.35)`;
    ctx.fillRect(rnd() * size, rnd() * size, 2, 3 + rnd() * 5);
  }
  return finish(c);
}
export function makeGrass(seed = 4) {
  const size = 256;
  const { c, ctx } = canvas(size);
  const rnd = mulberry(seed);
  ctx.fillStyle = "#5f8a3c";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(${50 + rnd() * 60},${110 + rnd() * 60},${30 + rnd() * 30},0.5)`;
    ctx.fillRect(rnd() * size, rnd() * size, 1, 2 + rnd() * 3);
  }
  // zones de terre visible
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = "rgba(150,100,60,0.25)";
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, 10 + rnd() * 25, 6 + rnd() * 14, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(c);
}
/** tôle ondulée (toits de Beni), version neuve ou rouillée */
export function makeMetalRoof(rusty: boolean, seed = 5) {
  const size = 256;
  const { c, ctx } = canvas(size);
  const rnd = mulberry(seed);
  ctx.fillStyle = rusty ? "#8a5a3a" : "#8c9096";
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 8) {
    ctx.fillStyle = rusty ? "rgba(60,35,20,0.35)" : "rgba(40,44,50,0.35)";
    ctx.fillRect(x, 0, 3, size);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 4, 0, 2, size);
  }
  if (rusty) {
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${120 + rnd() * 60},${50 + rnd() * 30},20,0.35)`;
      ctx.beginPath();
      ctx.ellipse(rnd() * size, rnd() * size, 4 + rnd() * 18, 3 + rnd() * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  grain(ctx, size, rnd, 2500, 0.08);
  return finish(c);
}
export interface FacadeOptions {
  base: string; // couleur du crépi
  trim: string; // encadrements
  ground: "shop" | "house" | "none"; // rez-de-chaussée
  seed?: number;
}
/**
 * Façade répétable : 1 tuile = 2 fenêtres de large × 1 étage de haut.
 * Retourne la carte de couleur ET une carte émissive (fenêtres éclairées la nuit).
 */
export function makeFacade(opts: FacadeOptions) {
  const size = 256;
  const { c, ctx } = canvas(size);
  const { c: ce, ctx: ctxE } = canvas(size);
  const rnd = mulberry(opts.seed ?? 7);

  ctx.fillStyle = opts.base;
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, rnd, 2600, 0.07);
  // coulures / salissures légères sous les fenêtres et au sol
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = "rgba(60,50,40,0.06)";
    ctx.fillRect(rnd() * size, rnd() * size, 3 + rnd() * 6, 20 + rnd() * 60);
  }
  ctx.fillStyle = "rgba(70,55,40,0.12)";
  ctx.fillRect(0, size - 18, size, 18); // soubassement

  ctxE.fillStyle = "#000";
  ctxE.fillRect(0, 0, size, size);
  const drawWindow = (x: number, y: number, w: number, h: number, lit: boolean) => {
    ctx.fillStyle = opts.trim;
    ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
    ctx.fillStyle = "#1c2a3a";
    ctx.fillRect(x, y, w, h);
    // reflet
    ctx.fillStyle = "rgba(160,200,230,0.28)";
    ctx.fillRect(x + 3, y + 3, w * 0.4, h - 6);
    // croisillons
    ctx.fillStyle = opts.trim;
    ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
    ctx.fillRect(x, y + h / 2 - 1.5, w, 3);
    if (lit) {
      ctxE.fillStyle = `rgba(255,${190 + rnd() * 40},${110 + rnd() * 40},1)`;
      ctxE.fillRect(x, y, w, h);
    }
  };
  if (opts.ground === "none") {
    // étage courant : 2 fenêtres, parfois un petit balcon peint
    drawWindow(38, 70, 58, 80, rnd() < 0.55);
    drawWindow(160, 70, 58, 80, rnd() < 0.55);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 150, size, 6); // ombre du plancher
  } else if (opts.ground === "shop") {
    // vitrine + porte + bandeau d'enseigne
    ctx.fillStyle = opts.trim;
    ctx.fillRect(0, 16, size, 34);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let i = 0; i < 6; i++) ctx.fillRect(30 + i * 34, 26, 18, 14); // « lettres »
    drawWindow(22, 80, 96, 120, rnd() < 0.7);
    ctx.fillStyle = "#3b2a1f";
    ctx.fillRect(160, 84, 62, 172);
    ctx.fillStyle = opts.trim;
    ctx.fillRect(154, 78, 74, 8);
    ctx.fillStyle = "#c9b27c";
    ctx.fillRect(208, 170, 6, 6); // poignée
    ctxE.fillStyle = "rgba(255,225,170,0.9)";
    ctxE.fillRect(0, 16, size, 34);
  } else {
    // maison : porte au centre, fenêtre de chaque côté, grille décorative
    drawWindow(22, 90, 56, 76, rnd() < 0.5);
    drawWindow(178, 90, 56, 76, rnd() < 0.5);
    ctx.fillStyle = "#4a3324";
    ctx.fillRect(104, 100, 48, 156);
    ctx.fillStyle = opts.trim;
    ctx.fillRect(98, 94, 60, 8);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 4; i++) ctx.fillRect(108, 112 + i * 34, 40, 3);
  }

  const map = finish(c);
  const emissive = finish(ce);
  return { map, emissive };
}

export function makeRainStreak() {
  const { c, ctx } = canvas(32);
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(220,235,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(14, 0, 4, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export function makeClouds(seed = 9) {
  const size = 512;
  const { c, ctx } = canvas(size);
  const rnd = mulberry(seed);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 30 + rnd() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = finish(c, 1, true);
  return tex;
}

export function makeSoftDot() {
  const { c, ctx } = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** crépi clair neutre : la couleur du mur est donnée par les couleurs de sommets (teinte) */
export function makePlaster(seed = 21) {
  const size = 256;
  const { c, ctx } = canvas(size);
  const rnd = mulberry(seed);
  ctx.fillStyle = "#d8d3c9";
  ctx.fillRect(0, 0, size, size);
  // joints de parpaings qui transparaissent sous l'enduit
  ctx.strokeStyle = "rgba(0,0,0,0.05)";
  ctx.lineWidth = 1;
  for (let y = 0; y < size; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }
  grain(ctx, size, rnd, 4200, 0.06);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(90,80,70,0.07)";
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, 10 + rnd() * 40, 6 + rnd() * 25, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // fissures capillaires
  ctx.strokeStyle = "rgba(60,50,40,0.25)";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    let x = rnd() * size;
    let y = rnd() * size;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rnd() - 0.5) * 26;
      y += rnd() * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}
/** mur en parpaings bruts (constructions non enduites, murs de parcelle) */
export function makeCinderBlock(seed = 22) {
  const size = 256;
  const { c, ctx } = canvas(size);
  const rnd = mulberry(seed);
  ctx.fillStyle = "#a19d95"; // mortier
  ctx.fillRect(0, 0, size, size);
  const bw = 64;
  const bh = 32;
  for (let row = 0; row < size / bh; row++) {
    const offset = row % 2 === 0 ? 0 : bw / 2;
    for (let col = -1; col < size / bw + 1; col++) {
      const x = col * bw + offset;
      const y = row * bh;
      const v = 118 + rnd() * 34;
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 7})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      // petits trous / éclats
      if (rnd() < 0.3) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(x + 6 + rnd() * 40, y + 6 + rnd() * 16, 3 + rnd() * 6, 2 + rnd() * 4);
      }
    }
  }
  grain(ctx, size, rnd, 5000, 0.1);
  return finish(c);
}

/** rideau métallique de boutique (lames horizontales) */
export function makeShutter(seed = 23) {
  const size = 128;
  const { c, ctx } = canvas(size);
  const rnd = mulberry(seed);
  ctx.fillStyle = "#7d8288";
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 10) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(0, y + 4, size, 2);
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(${120 + rnd() * 50},${60 + rnd() * 30},25,0.28)`;
    ctx.beginPath();
    ctx.ellipse(rnd() * size, rnd() * size, 3 + rnd() * 9, 2 + rnd() * 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, size, rnd, 900, 0.08);
  return finish(c);
}

/** enseignes peintes à la main, typiques des commerces de Beni */
export const SHOP_SIGNS = [
  "BOUTIQUE",
  "ALIMENTATION GÉNÉRALE",
  "SALON DE COIFFURE",
  "PHARMACIE",
  "CYBER CAFÉ",
  "QUINCAILLERIE",
  "RESTAURANT",
  "TRANSFERT D'ARGENT",
  "BOULANGERIE",
  "ATELIER DE COUTURE",
  "PIÈCES MOTO",
  "DÉPÔT DE BOISSONS",
  "ÉLECTRONIQUE",
  "PAPETERIE - LIBRAIRIE",
  "STUDIO PHOTO",
  "BUREAU DE CHANGE",
];
export const PLACE_SIGNS = [
  "HÔPITAL GÉNÉRAL DE BENI",
  "UCBC - UNIVERSITÉ CHRÉTIENNE BILINGUE",
  "AÉROPORT DE BENI-MAVIVI",
  "STADE MATATA",
  "MARCHÉ CENTRAL DE BENI",
  "COMMISSARIAT",
  "BEST TECH",
];

/** atlas d'enseignes : une ligne = une enseigne (texte réel dessiné sur canvas) */
export function makeSignAtlas(labels: string[]) {
  const W = 512;
  const RH = 64;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = RH * labels.length;
  const ctx = c.getContext("2d")!;
  const bgs = ["#b3261e", "#1f4e79", "#2e7d4f", "#f2c12e", "#e07a1f", "#f5f1e8", "#5b2d8e", "#0e7c86"];
  labels.forEach((label, i) => {
    const bg = bgs[i % bgs.length];
    const light = bg === "#f2c12e" || bg === "#f5f1e8";
    ctx.fillStyle = bg;
    ctx.fillRect(0, i * RH, W, RH);
    ctx.strokeStyle = light ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)";
    ctx.lineWidth = 3;
    ctx.strokeRect(7, i * RH + 7, W - 14, RH - 14);
    let fs = 30;
    ctx.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
    while (ctx.measureText(label).width > W - 44 && fs > 13) {
      fs -= 2;
      ctx.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillText(label, W / 2 + 2, i * RH + RH / 2 + 2);
    ctx.fillStyle = light ? "#1a1a1a" : "#ffffff";
    ctx.fillText(label, W / 2, i * RH + RH / 2);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { texture: tex, rows: labels.length };
}

/** panneau unique avec un texte (commerces nommés, maison du joueur) */
export function makeLabelTexture(text: string, bg: string, fg = "#ffffff") {
  const W = 512;
  const H = 96;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, W - 16, H - 16);
  let fs = 40;
  ctx.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
  while (ctx.measureText(text.toUpperCase()).width > W - 50 && fs > 14) {
    fs -= 2;
    ctx.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillText(text.toUpperCase(), W / 2 + 2, H / 2 + 2);
  ctx.fillStyle = fg;
  ctx.fillText(text.toUpperCase(), W / 2, H / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
