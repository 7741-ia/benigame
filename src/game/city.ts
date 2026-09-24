import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GRID_LINES, CELL, ROAD, WORLD, HALF } from "./constants";
import {
  makeAsphalt,
  makeConcrete,
  makeDirt,
  makeGrass,
  makeMetalRoof,
  makePlaster,
  makeCinderBlock,
  makeShutter,
  makeSignAtlas,
  SHOP_SIGNS,
  PLACE_SIGNS,
} from "./textures";
import type { Quality } from "./environment";

export interface Collider {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

export interface CityResult {
  colliders: Collider[];
  /** matériau des têtes de lampadaires (émissif la nuit) */
  lampMaterial: THREE.MeshStandardMaterial;
  lampGlowMaterial: THREE.MeshBasicMaterial;
  /** fenêtres éclairées + enseignes : emissiveIntensity pilotée la nuit */
  facadeMaterials: THREE.MeshStandardMaterial[];
  /** chaussée / trottoir : rugosité modulée par la pluie */
  roadMaterials: THREE.MeshStandardMaterial[];
  /** devantures de commerces (petits groupes de passants) */
  shopFronts: { x: number; z: number; facing: number }[];
  /** points d'arrêt devant les portes */
  doorSpots: { x: number; z: number }[];
}
type Face = 0 | 1 | 2 | 3; // 0:+x 1:+z 2:-x 3:-z
type District =
  | "market"
  | "commercial"
  | "mixed"
  | "residential"
  | "park"
  | "stadium"
  | "church"
  | "hospital"
  | "campus"
  | "airport";

const lineCoord = (i: number) => i * CELL - HALF;

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

const darken = (hex: number, f: number) => new THREE.Color(hex).multiplyScalar(f).getHex();

// Palettes sobres et réalistes (enduits pastel, portes métalliques peintes, auvents)
const WALL_COLORS = [0xe9dfc8, 0xbfd2e2, 0xebdaa8, 0xd6a06c, 0xf1ede6, 0xc7d8be, 0xdfb09c, 0xd2ccc3, 0xa9c4c9, 0xe4c78f];
const DOOR_COLORS = [0x2c4f7c, 0x3b6b4a, 0x6b3f2a, 0x8b2f2f, 0x2f3236, 0x1f6f8b];
const AWNING_COLORS = [0x9c3b3b, 0x2f6b53, 0x2f5a86, 0xb5862a, 0x6b4f8a, 0xc9642a];
const TRIM_COLORS = [0xf0ece3, 0x3b3a38, 0x5a3d28, 0x8c8c8c];
const GOODS_COLORS = [0xd63b2f, 0xe8c531, 0x4f8a3a, 0xc27a3a, 0x2c4f7c, 0xf2f2f2, 0x8b2f2f];
const SIGN_ROWS = SHOP_SIGNS.length + PLACE_SIGNS.length;
const ROW_HOSPITAL = SHOP_SIGNS.length;
const ROW_UCBC = SHOP_SIGNS.length + 1;
const ROW_AIRPORT = SHOP_SIGNS.length + 2;
const ROW_STADIUM = SHOP_SIGNS.length + 3;
const ROW_MARKET = SHOP_SIGNS.length + 4;

/** Boîte avec répétitions UV par face : rw = faces ±z, rd = faces ±x, ry = hauteur, top = dessus */
function boxUV(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  rw: number, rd: number, ry: number, top: [number, number],
  rotY = 0
) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    let sx = 1;
    let sy = 1;
    if (f < 2) { sx = rd; sy = ry; }
    else if (f < 4) { sx = top[0]; sy = top[1]; }
    else { sx = rw; sy = ry; }
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * sx, uv.getY(idx) * sy);
    }
  }
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, tile = 4, rotY = 0) {
  return boxUV(w, h, d, x, y, z, w / tile, d / tile, h / tile, [w / tile, d / tile], rotY);
}

function plane(w: number, h: number, x: number, y: number, z: number, tile: number, rotZ = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile));
  g.rotateX(-Math.PI / 2);
  if (rotZ) g.rotateY(rotZ);
  g.translate(x, y, z);
  return g;
}

/** ajoute une couleur de sommet uniforme (matériaux vertexColors → 1 draw call pour toutes les teintes) */
function tint(geo: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** quad d'enseigne dont les UV pointent sur une ligne de l'atlas */
function signPlane(w: number, h: number, row: number, rows: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1) / rows + uv.getY(i) / rows);
  return g;
}

export function buildCity(scene: THREE.Scene, quality: Quality): CityResult {
  const rnd = mulberry(20240613);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const detail = quality !== "low";
  const colliders: Collider[] = [];
  const shopFronts: CityResult["shopFronts"] = [];
  const doorSpots: CityResult["doorSpots"] = [];
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (mat: THREE.Material, geo: THREE.BufferGeometry) => {
    if ((mat as THREE.MeshStandardMaterial).vertexColors && !geo.getAttribute("color")) tint(geo, 0xffffff);
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat)!.push(geo);
  };

  // ── matériaux ──
  const asphaltTex = makeAsphalt();
  const concreteTex = makeConcrete();
  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95, metalness: 0.0 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.98 });
  const dirtMat = new THREE.MeshStandardMaterial({ map: makeDirt(), roughness: 1 });
  const grassMat = new THREE.MeshStandardMaterial({ map: makeGrass(), roughness: 1 });
  const lineWhite = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.6 });
  const lineYellow = new THREE.MeshStandardMaterial({ color: 0xd9b640, roughness: 0.6 });
  const roofConcrete = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0xb9b3a8, roughness: 0.98 });
  const roofMetal = new THREE.MeshStandardMaterial({ map: makeMetalRoof(false), roughness: 0.55, metalness: 0.5 });
  const roofRust = new THREE.MeshStandardMaterial({ map: makeMetalRoof(true, 11), roughness: 0.8, metalness: 0.25 });
  // murs enduits : texture claire × couleur de sommet ; parpaings bruts ; peinture lisse (cadres, portes, auvents)
  const wallMat = new THREE.MeshStandardMaterial({ map: makePlaster(), vertexColors: true, roughness: 0.96 });
  const blockMat = new THREE.MeshStandardMaterial({ map: makeCinderBlock(), roughness: 1 });
  const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 });
  const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.12, metalness: 0.6 });
  const glassLit = new THREE.MeshStandardMaterial({
    color: 0x24303c, emissive: 0xffd39a, emissiveIntensity: 0, roughness: 0.2, metalness: 0.4,
  });
  const shutterMat = new THREE.MeshStandardMaterial({ map: makeShutter(), roughness: 0.5, metalness: 0.55 });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });
  const signAtlas = makeSignAtlas([...SHOP_SIGNS, ...PLACE_SIGNS]);
  const signMat = new THREE.MeshStandardMaterial({
    map: signAtlas.texture, emissiveMap: signAtlas.texture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7,
  });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.5, emissive: 0x330000 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2e, roughness: 0.9 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x6e737a, roughness: 0.5, metalness: 0.7 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffd27a, emissiveIntensity: 0, roughness: 0.4 });
  const lampGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  // ── sol ──
  add(dirtMat, plane(WORLD + 240, WORLD + 240, 0, -0.03, 0, 14));

  // ── routes (bandes horizontales pleines + segments verticaux, sans chevauchement) ──
  for (let i = 0; i < GRID_LINES; i++) {
    const c = lineCoord(i);
    add(asphaltMat, plane(WORLD + ROAD, ROAD, 0, 0.01, c, 12));
    for (let j = -1; j < GRID_LINES; j++) {
      const z0 = j < 0 ? -HALF - ROAD / 2 : lineCoord(j) + ROAD / 2;
      const z1 = j + 1 >= GRID_LINES ? HALF + ROAD / 2 : lineCoord(j + 1) - ROAD / 2;
      if (z1 - z0 < 0.5) continue;
      add(asphaltMat, plane(ROAD, z1 - z0, c, 0.01, (z0 + z1) / 2, 12));
    }
  }
  // marquages : axe jaune discontinu, rives blanches, passages piétons
  for (let i = 0; i < GRID_LINES; i++) {
    const c = lineCoord(i);
    for (let d = -HALF + 4; d <= HALF - 4; d += 8) {
      const m = (d + HALF) % CELL;
      const nearCross = m < ROAD / 2 + 1 || CELL - m < ROAD / 2 + 1;
      if (nearCross) continue;
      add(lineYellow, plane(2.6, 0.22, d, 0.025, c, 1));
      add(lineYellow, plane(0.22, 2.6, c, 0.025, d, 1));
    }
    add(lineWhite, plane(WORLD + ROAD, 0.2, 0, 0.024, c - ROAD / 2 + 0.5, 1));
    add(lineWhite, plane(WORLD + ROAD, 0.2, 0, 0.024, c + ROAD / 2 - 0.5, 1));
    add(lineWhite, plane(0.2, WORLD + ROAD, c - ROAD / 2 + 0.5, 0.024, 0, 1));
    add(lineWhite, plane(0.2, WORLD + ROAD, c + ROAD / 2 - 0.5, 0.024, 0, 1));
  }
  for (let i = 1; i < GRID_LINES - 1; i++) {
    for (let j = 1; j < GRID_LINES - 1; j++) {
      const x = lineCoord(i);
      const z = lineCoord(j);
      const off = ROAD / 2 + 1.6;
      for (let s = -3; s <= 3; s++) {
        const k = s * 1.4;
        add(lineWhite, plane(0.6, 2.6, x + k, 0.026, z - off, 1));
        add(lineWhite, plane(0.6, 2.6, x + k, 0.026, z + off, 1));
        add(lineWhite, plane(2.6, 0.6, x - off, 0.026, z + k, 1));
        add(lineWhite, plane(2.6, 0.6, x + off, 0.026, z + k, 1));
      }
    }
  }

  // ── instances ──
  const trees: THREE.Matrix4[] = [];
  const treeColors: THREE.Color[] = [];
  const bananas: THREE.Matrix4[] = [];
  const bushes: THREE.Matrix4[] = [];
  const bushColors: THREE.Color[] = [];
  const poles: THREE.Matrix4[] = [];
  const lamps: THREE.Matrix4[] = [];
  const motos: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const cars: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const umbrellas: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const tmpM = new THREE.Matrix4();
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const mat4 = (x: number, y: number, z: number, rotY = 0, s = 1, sy = s) =>
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromAxisAngle(UP, rotY), tmpS.set(s, sy, s)).clone();

  const addTree = (x: number, z: number, scale = 1) => {
    const s = scale * (0.8 + rnd() * 0.5);
    trees.push(mat4(x, 0, z, rnd() * Math.PI * 2, s, s * (0.85 + rnd() * 0.35)));
    treeColors.push(new THREE.Color().setHSL(0.27 + rnd() * 0.08, 0.45 + rnd() * 0.2, 0.28 + rnd() * 0.12));
    colliders.push({ x, z, hw: 0.7, hd: 0.7 });
  };
  const addBanana = (x: number, z: number) => {
    bananas.push(mat4(x, 0, z, rnd() * Math.PI * 2, 0.8 + rnd() * 0.5));
    colliders.push({ x, z, hw: 0.4, hd: 0.4 });
  };
  const addBush = (x: number, z: number) => {
    bushes.push(mat4(x, 0, z, rnd() * Math.PI * 2, 0.7 + rnd() * 0.7));
    bushColors.push(new THREE.Color().setHSL(0.25 + rnd() * 0.1, 0.5, 0.25 + rnd() * 0.12));
  };

  // ── repère de façade : place des éléments sur une face d'un volume ──
  const faceOf = (x: number, z: number, w: number, d: number, f: Face) => {
    const nx = f === 0 ? 1 : f === 2 ? -1 : 0;
    const nz = f === 1 ? 1 : f === 3 ? -1 : 0;
    const th = Math.atan2(nx, nz);
    const tx = nz;
    const tz = -nx;
    const cx = x + (nx * w) / 2;
    const cz = z + (nz * d) / 2;
    const len = f === 1 || f === 3 ? w : d;
    /** s : position le long de la façade, y : hauteur, p : distance du centre de l'élément devant le mur */
    const put = (geo: THREE.BufferGeometry, s: number, y: number, p: number) => {
      geo.rotateY(th);
      geo.translate(cx + tx * s + nx * p, y, cz + tz * s + nz * p);
      return geo;
    };
    return { put, len, nx, nz, cx, cz };
  };
  type F = ReturnType<typeof faceOf>;

  // fenêtre en relief : vitre, cadre, appui, casquette béton, barreaux
  const windowAt = (
    F: F, s: number, y: number, ww: number, wh: number, frameHex: number,
    opts: { grille?: boolean; shade?: boolean; sill?: boolean } = {}
  ) => {
    add(rnd() < 0.5 ? glassLit : glassMat, F.put(new THREE.BoxGeometry(ww, wh, 0.05), s, y, 0.03));
    const fr = 0.1;
    add(paintMat, tint(F.put(new THREE.BoxGeometry(ww + fr * 2, fr, 0.1), s, y + wh / 2 + fr / 2, 0.05), frameHex));
    add(paintMat, tint(F.put(new THREE.BoxGeometry(ww + fr * 2, fr, 0.1), s, y - wh / 2 - fr / 2, 0.05), frameHex));
    add(paintMat, tint(F.put(new THREE.BoxGeometry(fr, wh, 0.1), s - ww / 2 - fr / 2, y, 0.05), frameHex));
    add(paintMat, tint(F.put(new THREE.BoxGeometry(fr, wh, 0.1), s + ww / 2 + fr / 2, y, 0.05), frameHex));
    if (opts.sill !== false) add(paintMat, tint(F.put(new THREE.BoxGeometry(ww + 0.44, 0.09, 0.26), s, y - wh / 2 - fr - 0.045, 0.13), 0xbfb9ad));
    if (opts.shade) add(paintMat, tint(F.put(new THREE.BoxGeometry(ww + 0.5, 0.1, 0.42), s, y + wh / 2 + fr + 0.05, 0.21), 0xbfb9ad));
    if (opts.grille && detail) {
      for (const k of [-1, 0, 1]) add(metalMat, tint(F.put(new THREE.BoxGeometry(0.04, wh - 0.04, 0.04), s + (k * ww) / 4, y, 0.085), 0x2b2e33));
      add(metalMat, tint(F.put(new THREE.BoxGeometry(ww - 0.04, 0.04, 0.04), s, y, 0.085), 0x2b2e33));
    }
  };

  // porte métallique peinte : panneau, moulures, poignée, cadre, marche, auvent
  const doorAt = (
    F: F, s: number, dw: number, dh: number, doorHex: number, frameHex: number,
    opts: { step?: boolean; canopy?: boolean; double?: boolean } = {}
  ) => {
    const y0 = 0.3;
    add(metalMat, tint(F.put(new THREE.BoxGeometry(dw, dh, 0.07), s, y0 + dh / 2, 0.035), doorHex));
    if (detail) {
      const dark = darken(doorHex, 0.6);
      add(metalMat, tint(F.put(new THREE.BoxGeometry(dw * 0.72, 0.05, 0.03), s, y0 + dh * 0.64, 0.085), dark));
      add(metalMat, tint(F.put(new THREE.BoxGeometry(dw * 0.72, 0.05, 0.03), s, y0 + dh * 0.32, 0.085), dark));
      if (opts.double) add(metalMat, tint(F.put(new THREE.BoxGeometry(0.05, dh, 0.03), s, y0 + dh / 2, 0.085), dark));
      add(metalMat, tint(F.put(new THREE.BoxGeometry(0.05, 0.16, 0.06), s + dw * 0.35, y0 + dh * 0.48, 0.1), 0xd7c08a));
    }
    const fr = 0.12;
    add(paintMat, tint(F.put(new THREE.BoxGeometry(dw + fr * 2, fr, 0.12), s, y0 + dh + fr / 2, 0.06), frameHex));
    add(paintMat, tint(F.put(new THREE.BoxGeometry(fr, dh, 0.12), s - dw / 2 - fr / 2, y0 + dh / 2, 0.06), frameHex));
    add(paintMat, tint(F.put(new THREE.BoxGeometry(fr, dh, 0.12), s + dw / 2 + fr / 2, y0 + dh / 2, 0.06), frameHex));
    if (opts.step) add(paintMat, tint(F.put(new THREE.BoxGeometry(dw + 1.0, 0.16, 0.85), s, y0 + 0.08, 0.425), 0xa9a49b));
    if (opts.canopy) {
      const g = new THREE.BoxGeometry(dw + 1.1, 0.06, 0.95);
      g.rotateX(0.2);
      add(roofMetal, F.put(g, s, y0 + dh + 0.4, 0.47));
    }
  };

  // devanture : rideau métallique (ouvert ou fermé), étal, enseigne peinte, auvent
  const shopFrontAt = (F: F, s: number, sw: number, sh: number, signRow: number, awningHex: number) => {
    const y0 = 0.3;
    const open = rnd() < 0.72;
    add(interiorMat, F.put(new THREE.BoxGeometry(sw, sh, 0.03), s, y0 + sh / 2, 0.015));
    const shH = open ? sh * 0.36 : sh;
    add(shutterMat, F.put(boxUV(sw, shH, 0.05, 0, 0, 0, sw / 1.2, 1, shH / 1.2, [1, 1]), s, y0 + sh - shH / 2, 0.045));
    add(metalMat, tint(F.put(new THREE.BoxGeometry(sw + 0.3, 0.3, 0.3), s, y0 + sh + 0.15, 0.15), 0x3b3e43));
    for (const k of [-1, 1]) add(paintMat, tint(F.put(new THREE.BoxGeometry(0.18, sh, 0.14), s + k * (sw / 2 + 0.09), y0 + sh / 2, 0.07), 0xd9d3c7));
    if (open) {
      add(woodMat, F.put(new THREE.BoxGeometry(sw * 0.7, 0.85, 0.6), s, y0 + 0.425, 0.62));
      for (let k = 0; k < 4; k++) {
        add(paintMat, tint(F.put(new THREE.BoxGeometry(0.42, 0.28, 0.36), s - sw * 0.25 + (k * sw * 0.5) / 3, y0 + 0.99, 0.62), pick(GOODS_COLORS)));
      }
      if (rnd() < 0.5) {
        add(woodMat, F.put(new THREE.BoxGeometry(0.6, 0.45, 0.5), s + sw / 2 + 0.6, y0 + 0.225, 0.5));
        add(woodMat, F.put(new THREE.BoxGeometry(0.6, 0.45, 0.5), s + sw / 2 + 0.6, y0 + 0.675, 0.5));
      }
    }
    const signW = Math.min(F.len * 0.86, sw + 2.6);
    add(paintMat, tint(F.put(new THREE.BoxGeometry(signW + 0.12, 0.86, 0.08), s, y0 + sh + 0.78, 0.04), 0x2a2622));
    add(signMat, F.put(signPlane(signW, 0.74, signRow, SIGN_ROWS), s, y0 + sh + 0.78, 0.085));
    const ag = new THREE.BoxGeometry(sw + 1.0, 0.06, 1.3);
    ag.rotateX(0.28);
    add(paintMat, tint(F.put(ag, s, y0 + sh + 0.34, 0.63), awningHex));
    add(paintMat, tint(F.put(new THREE.BoxGeometry(sw + 1.0, 0.26, 0.04), s, y0 + sh - 0.15, 1.24), awningHex));
  };

  // véranda : dalle, colonnes, toit en tôle légèrement incliné
  const verandaAt = (F: F, wallHex: number) => {
    const y0 = 0.3;
    const vw = Math.min(F.len * 0.72, 6.5);
    add(paintMat, tint(F.put(new THREE.BoxGeometry(vw, 0.14, 1.9), 0, y0 + 0.07, 0.95), 0xa9a49b));
    for (const k of [-1, 1]) {
      add(wallMat, tint(F.put(new THREE.CylinderGeometry(0.11, 0.13, 2.0, 8), k * (vw / 2 - 0.25), y0 + 0.14 + 1.0, 1.72), darken(wallHex, 0.9)));
    }
    const rg = new THREE.BoxGeometry(vw + 0.5, 0.06, 2.3);
    rg.rotateX(0.15);
    add(rnd() < 0.5 ? roofRust : roofMetal, F.put(rg, 0, y0 + 2.72, 1.12));
  };


  const balconyAt = (F: F, s: number, yb: number, bw: number, trimHex: number) => {
    add(paintMat, tint(F.put(new THREE.BoxGeometry(bw, 0.14, 1.05), s, yb + 0.07, 0.525), 0xbfb9ad));
    add(paintMat, tint(F.put(new THREE.BoxGeometry(bw, 0.9, 0.06), s, yb + 0.59, 1.02), trimHex));
    for (const k of [-1, 1]) add(paintMat, tint(F.put(new THREE.BoxGeometry(0.06, 0.9, 1.0), s + k * (bw / 2 - 0.03), yb + 0.59, 0.52), trimHex));
  };

  // toit à deux pans en tôle : débord, planches de rive, faîtière, pignons
  const gableRoof = (
    x: number, z: number, w: number, d: number, topY: number, gableHex: number,
    opts: { pitch?: number; rusty?: boolean; alongX?: boolean; overhang?: number } = {}
  ) => {
    const a = opts.pitch ?? 0.32;
    const alongX = opts.alongX ?? w >= d;
    const span = alongX ? d : w;
    const len = alongX ? w : d;
    const over = opts.overhang ?? 0.85;
    const ridge = topY + (span / 2) * Math.tan(a);
    const L = (span / 2 + over) / Math.cos(a);
    const rm = opts.rusty ? roofRust : roofMetal;
    for (const s of [1, -1]) {
      const g = new THREE.BoxGeometry(len + 1.0, 0.1, L);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((len + 1) / 1.6), uv.getY(i) * (L / 1.6));
      g.rotateX(s * a);
      if (!alongX) g.rotateY(Math.PI / 2);
      const cy = ridge - (L / 2) * Math.sin(a);
      const off = (L / 2) * Math.cos(a);
      if (alongX) g.translate(x, cy, z + s * off);
      else g.translate(x + s * off, cy, z);
      add(rm, g);
      const eaveY = ridge - L * Math.sin(a);
      const eaveOff = L * Math.cos(a);
      const fg = alongX ? new THREE.BoxGeometry(len + 1.0, 0.22, 0.05) : new THREE.BoxGeometry(0.05, 0.22, len + 1.0);
      if (alongX) fg.translate(x, eaveY + 0.06, z + s * eaveOff);
      else fg.translate(x + s * eaveOff, eaveY + 0.06, z);
      add(paintMat, tint(fg, 0xf0ece3));
    }
    const cap = alongX ? new THREE.BoxGeometry(len + 1.0, 0.08, 0.42) : new THREE.BoxGeometry(0.42, 0.08, len + 1.0);
    cap.translate(x, ridge + 0.03, z);
    add(rm, cap);
    const tri = new THREE.Shape();
    tri.moveTo(-span / 2, 0);
    tri.lineTo(span / 2, 0);
    tri.lineTo(0, (span / 2) * Math.tan(a));
    tri.closePath();
    for (const s of [1, -1]) {
      const g = new THREE.ShapeGeometry(tri);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3.2, uv.getY(i) / 3.2);
      if (alongX) {
        if (s < 0) g.rotateY(Math.PI);
        g.rotateY(Math.PI / 2);
        g.translate(x + s * (len / 2), topY, z);
      } else {
        if (s < 0) g.rotateY(Math.PI);
        g.translate(x, topY, z + s * (len / 2));
      }
      add(wallMat, tint(g, gableHex));
    }
  };

  // toit-terrasse : dalle, acrotère, réservoir, fers à béton en attente, parabole
  const flatRoof = (x: number, z: number, w: number, d: number, topY: number, wallHex: number, raw: boolean) => {
    add(roofConcrete, box(w + 0.2, 0.25, d + 0.2, x, topY + 0.12, z, 4));
    const ph = 0.7;
    const seg = (bw: number, bd: number, bx: number, bz: number) => {
      const g = box(bw, ph, bd, bx, topY + 0.25 + ph / 2, bz, 3);
      if (raw) add(blockMat, g);
      else add(wallMat, tint(g, wallHex));
    };
    seg(w + 0.2, 0.25, x, z + d / 2);
    seg(w + 0.2, 0.25, x, z - d / 2);
    seg(0.25, d + 0.2, x + w / 2, z);
    seg(0.25, d + 0.2, x - w / 2, z);
    if (rnd() < 0.55) {
      const tg = new THREE.CylinderGeometry(0.75, 0.75, 1.3, 10);
      tg.translate(x + (rnd() - 0.5) * (w - 3), topY + 0.95, z + (rnd() - 0.5) * (d - 3));
      add(tankMat, tg);
    }
    if (raw && detail) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const rb = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4);
        rb.translate(x + sx * (w / 2 - 0.3), topY + 0.25 + ph + 0.55, z + sz * (d / 2 - 0.3));
        add(metalMat, tint(rb, 0x6b4b3a));
      }
    }
    if (detail && rnd() < 0.3) {
      const dish = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 14);
      dish.rotateX(-1.0);
      const dx = x + (rnd() - 0.5) * (w - 2);
      const dz = z + (rnd() - 0.5) * (d - 2);
      dish.translate(dx, topY + 1.45, dz);
      add(paintMat, tint(dish, 0xf1ede6));
      const stem = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5);
      stem.translate(dx, topY + 0.85, dz);
      add(metalMat, tint(stem, 0x3a3a3a));
    }
  };

  interface Bld {
    x: number; z: number; w: number; d: number; floors: number; color: number;
    style: "house" | "shop" | "office"; roof: "gable" | "flat"; front: Face;
    veranda?: boolean; balconies?: boolean; raw?: boolean; signRow?: number;
    doorColor?: number; frameColor?: number; rusty?: boolean;
  }

  const building = (o: Bld) => {
    const { x, z, w, d, floors } = o;
    const y0 = 0.3;
    const groundH = o.style === "house" ? 3.0 : 3.6;
    const floorH = 3.0;
    const totalH = groundH + (floors - 1) * floorH;
    const wallHex = o.raw ? 0x9a978f : o.color;
    const wallGeo = box(w, totalH, d, x, y0 + totalH / 2, z, 3.2);
    if (o.raw) add(blockMat, wallGeo);
    else add(wallMat, tint(wallGeo, o.color));
    const plinth = box(w + 0.12, 0.5, d + 0.12, x, y0 + 0.25, z, 3);
    if (o.raw) add(blockMat, plinth);
    else add(wallMat, tint(plinth, darken(o.color, 0.7)));
    const trimHex = o.frameColor ?? pick(TRIM_COLORS);
    const doorHex = o.doorColor ?? pick(DOOR_COLORS);
    const awningHex = pick(AWNING_COLORS);
    for (let k = 1; k < floors; k++) {
      add(paintMat, tint(box(w + 0.16, 0.14, d + 0.16, x, y0 + groundH + (k - 1) * floorH + 0.07, z, 3), 0xd8d2c6));
    }
    if (o.style !== "house") {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const g = box(0.34, totalH, 0.34, x + (sx * w) / 2, y0 + totalH / 2, z + (sz * d) / 2, 3);
        if (o.raw) add(blockMat, g);
        else add(wallMat, tint(g, darken(o.color, 0.88)));
      }
    }

    for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
      const F = faceOf(x, z, w, d, f);
      const isFront = f === o.front;
      if (F.len < 2.6) continue;
      if (isFront) {
        if (o.style === "shop") {
          const sw = Math.min(F.len * 0.58, 4.4);
          shopFrontAt(F, 0, sw, 2.3, o.signRow ?? Math.floor(rnd() * SHOP_SIGNS.length), awningHex);
          if (F.len / 2 - sw / 2 > 2.3) for (const k of [-1, 1]) windowAt(F, k * (sw / 2 + 1.25), y0 + 1.85, 1.0, 1.1, trimHex, { grille: true });
          const dx = F.cx + F.nx * 1.9;
          const dz = F.cz + F.nz * 1.9;
          shopFronts.push({ x: dx, z: dz, facing: Math.atan2(-F.nx, -F.nz) });
          doorSpots.push({ x: dx, z: dz });
        } else if (o.style === "office") {
          doorAt(F, 0, 1.8, 2.3, doorHex, trimHex, { step: true, double: true });
          const n = Math.floor((F.len / 2 - 1.6) / 2.6);
          for (let i = 1; i <= n; i++) for (const k of [-1, 1]) windowAt(F, k * (1.6 + (i - 0.5) * 2.6), y0 + 2.0, 1.5, 1.4, trimHex, { grille: rnd() < 0.4 });
          if (o.signRow !== undefined) {
            const signW = Math.min(F.len * 0.7, 11);
            add(paintMat, tint(F.put(new THREE.BoxGeometry(signW + 0.12, 0.9, 0.08), 0, y0 + groundH - 0.55, 0.04), 0x2a2622));
            add(signMat, F.put(signPlane(signW, 0.78, o.signRow, SIGN_ROWS), 0, y0 + groundH - 0.55, 0.085));
          }
          doorSpots.push({ x: F.cx + F.nx * 2.4, z: F.cz + F.nz * 2.4 });
        } else {
          doorAt(F, 0, 1.0, 2.1, doorHex, trimHex, { step: !o.veranda, canopy: !o.veranda });
          if (F.len >= 5.4) for (const k of [-1, 1]) windowAt(F, k * 1.9, y0 + 1.75, 1.05, 1.1, trimHex, { grille: true, shade: !o.veranda && rnd() < 0.6 });
          if (F.len >= 9.6) for (const k of [-1, 1]) windowAt(F, k * 4.2, y0 + 1.75, 1.05, 1.1, trimHex, { grille: true });
          if (o.veranda) verandaAt(F, wallHex);
          doorSpots.push({ x: F.cx + F.nx * 2.2, z: F.cz + F.nz * 2.2 });
        }
      } else {
        const isBack = f === ((o.front + 2) % 4);
        const spacing = o.style === "house" ? 2.7 : 2.8;
        const n = Math.max(0, Math.floor((F.len - 1.0) / spacing));
        // publicité peinte sur un mur latéral de commerce (très courant à Beni) à la place des fenêtres
        if (o.style !== "house" && !isBack && F.len >= 6 && rnd() < 0.3) {
          const aw = Math.min(F.len * 0.7, 6.5);
          add(paintMat, tint(F.put(new THREE.BoxGeometry(aw + 0.1, 1.5, 0.03), 0, y0 + 2.0, 0.015), 0xf1ede6));
          add(signMat, F.put(signPlane(aw, 1.3, Math.floor(rnd() * SHOP_SIGNS.length), SIGN_ROWS), 0, y0 + 2.0, 0.035));
          continue;
        }
        for (let i = 0; i < n; i++) {
          if (isBack && rnd() < 0.35) continue; // murs arrière plus aveugles
          const s = (i - (n - 1) / 2) * spacing;
          if (o.style === "house") windowAt(F, s, y0 + 1.75, 1.0, 1.05, trimHex, { grille: true, shade: rnd() < 0.5 });
          else windowAt(F, s, y0 + 2.0, 1.3, 1.3, trimHex, { grille: rnd() < 0.5 });
        }
      }
      for (let k = 1; k < floors; k++) {
        const yb = y0 + groundH + (k - 1) * floorH;
        const n = Math.max(1, Math.floor((F.len - 0.8) / 2.6));
        for (let i = 0; i < n; i++) {
          const s = (i - (n - 1) / 2) * 2.6;
          const balcony = isFront && o.balconies && (n <= 2 || i % 2 === 0);
          if (balcony) {
            balconyAt(F, s, yb, 2.2, trimHex);
            windowAt(F, s, yb + 1.15, 1.0, 2.0, trimHex, { sill: false });
          } else {
            windowAt(F, s, yb + 1.6, 1.2, 1.3, trimHex, { grille: rnd() < 0.35 });
          }
        }
      }
    }
    const topY = y0 + totalH;
    if (o.roof === "gable") gableRoof(x, z, w, d, topY, wallHex, { rusty: o.rusty ?? rnd() < 0.5 });
    else flatRoof(x, z, w, d, topY, wallHex, !!o.raw);
    colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
  };

  // murs de parcelle avec piliers, chaperon et portail métallique
  const compoundWall = (cx: number, cz: number, half: number, gateSide: number, hex: number, raw: boolean) => {
    const h = 1.9;
    const t = 0.28;
    const segs: { x: number; z: number; w: number; d: number }[] = [];
    for (let side = 0; side < 4; side++) {
      const horizontal = side === 0 || side === 2;
      const sign = side === 0 || side === 3 ? -1 : 1;
      if (side === gateSide) {
        const segLen = half - 2.4;
        if (horizontal) {
          segs.push({ x: cx - half + segLen / 2, z: cz + sign * half, w: segLen, d: t });
          segs.push({ x: cx + half - segLen / 2, z: cz + sign * half, w: segLen, d: t });
        } else {
          segs.push({ x: cx + sign * half, z: cz - half + segLen / 2, w: t, d: segLen });
          segs.push({ x: cx + sign * half, z: cz + half - segLen / 2, w: t, d: segLen });
        }
        const px = horizontal ? [cx - 2.4, cx + 2.4] : [cx + sign * half, cx + sign * half];
        const pz = horizontal ? [cz + sign * half, cz + sign * half] : [cz - 2.4, cz + 2.4];
        for (let k = 0; k < 2; k++) add(wallMat, tint(box(0.6, 2.4, 0.6, px[k], 1.5, pz[k], 2), 0xf1ede6));
        // portail à deux battants (tôle peinte) avec traverses
        const gateHex = pick([0x2c4f7c, 0x3b6b4a, 0x2f3236, 0x6b3f2a]);
        const gx = horizontal ? cx : cx + sign * half;
        const gz = horizontal ? cz + sign * half : cz;
        add(metalMat, tint(box(horizontal ? 4.6 : 0.08, 2.0, horizontal ? 0.08 : 4.6, gx, 1.3, gz, 2), gateHex));
        if (detail) {
          for (const yy of [0.75, 1.85]) add(metalMat, tint(box(horizontal ? 4.6 : 0.14, 0.08, horizontal ? 0.14 : 4.6, gx, yy, gz, 2), darken(gateHex, 0.65)));
        }
      } else if (horizontal) {
        segs.push({ x: cx, z: cz + sign * half, w: half * 2, d: t });
      } else {
        segs.push({ x: cx + sign * half, z: cz, w: t, d: half * 2 });
      }
    }
    for (const s of segs) {
      const g = box(s.w, h, s.d, s.x, 0.3 + h / 2, s.z, 3);
      if (raw) add(blockMat, g);
      else add(wallMat, tint(g, hex));
      add(paintMat, tint(box(s.w + 0.1, 0.08, s.d + 0.1, s.x, 0.3 + h + 0.04, s.z, 3), 0xd8d2c6));
      colliders.push({ x: s.x, z: s.z, hw: s.w / 2 + 0.2, hd: s.d / 2 + 0.2 });
    }
  };

  const districtOf = (gx: number, gz: number): District => {
    const key = `${gx},${gz}`;
    const specials: Record<string, District> = {
      "3,3": "market", "4,2": "stadium", "3,5": "church", "2,1": "hospital", "2,6": "campus", "6,5": "airport",
      "1,4": "park", "5,3": "park", "6,0": "park", "0,2": "park",
    };
    if (specials[key]) return specials[key];
    const ring = Math.max(Math.abs(gx - 3), Math.abs(gz - 3));
    if (ring <= 1) return "commercial";
    if (ring === 2) return rnd() < 0.7 ? "mixed" : "residential";
    return rnd() < 0.8 ? "residential" : "mixed";
  };

  const inner = CELL - ROAD; // 32
  for (let gx = 0; gx < GRID_LINES - 1; gx++) {
    for (let gz = 0; gz < GRID_LINES - 1; gz++) {
      const cx = lineCoord(gx) + CELL / 2;
      const cz = lineCoord(gz) + CELL / 2;
      const kind = districtOf(gx, gz);
      add(sidewalkMat, box(inner + 4, 0.3, inner + 4, cx, 0.15, cz, 4));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (rnd() < 0.7) addTree(cx + sx * 16.2, cz + sz * 16.2, 0.9);

      if (kind === "park") {
        add(grassMat, box(inner - 2, 0.34, inner - 2, cx, 0.2, cz, 6));
        add(sidewalkMat, box(3, 0.36, inner - 2, cx, 0.2, cz, 3));
        add(sidewalkMat, box(inner - 2, 0.36, 3, cx, 0.2, cz, 3));
        for (let k = 0; k < 10; k++) {
          const tx = cx + (rnd() - 0.5) * (inner - 8);
          const tz = cz + (rnd() - 0.5) * (inner - 8);
          if (Math.abs(tx - cx) < 2.5 || Math.abs(tz - cz) < 2.5) continue;
          addTree(tx, tz, 1.2);
        }
        for (let k = 0; k < 8; k++) addBush(cx + (rnd() - 0.5) * (inner - 6), cz + (rnd() - 0.5) * (inner - 6));
        for (let k = 0; k < 4; k++) {
          const bx = cx + (k < 2 ? -1 : 1) * 3.2;
          const bz = cz + (k % 2 === 0 ? -1 : 1) * 6;
          add(woodMat, box(1.8, 0.12, 0.5, bx, 0.9, bz, 2));
          add(woodMat, box(1.8, 0.5, 0.1, bx, 1.2, bz - 0.22, 2));
        }
        continue;
      }
      if (kind === "market") {
        add(sidewalkMat, box(inner - 1, 0.34, inner - 1, cx, 0.2, cz, 4));
        for (let r = 0; r < 4; r++) {
          for (let k = 0; k < 6; k++) {
            const ux = cx - 12 + k * 4.8;
            const uz = cz - 10.5 + r * 7;
            umbrellas.push({ m: mat4(ux, 0, uz, rnd() * 0.6), c: new THREE.Color().setHSL(rnd(), 0.6, 0.5) });
            add(woodMat, box(2.2, 0.08, 1.1, ux, 0.95, uz + 1.1, 2));
            for (const k2 of [-1, 1]) add(woodMat, box(0.08, 0.62, 1.0, ux + k2 * 1.0, 0.62, uz + 1.1, 2));
            for (let j = 0; j < 3; j++) add(paintMat, tint(box(0.6, 0.3, 0.5, ux - 0.7 + j * 0.7, 1.14, uz + 1.1, 1), pick(GOODS_COLORS)));
            colliders.push({ x: ux, z: uz + 1.1, hw: 1.1, hd: 0.7 });
          }
        }
        add(wallMat, tint(box(12, 0.6, 6, cx, 4.2, cz + 0.6, 3), 0xf1ede6));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const pg = new THREE.CylinderGeometry(0.25, 0.25, 4, 8);
          pg.translate(cx + sx * 5.6, 2.3, cz + 0.6 + sz * 2.6);
          add(steelMat, pg);
        }
        const Fh = faceOf(cx, cz + 0.6, 12, 6, 1);
        add(signMat, Fh.put(signPlane(9, 0.5, ROW_MARKET, SIGN_ROWS), 0, 4.2, 0.04));
        continue;
      }
      if (kind === "stadium") {
        add(grassMat, box(24, 0.36, 18, cx, 0.2, cz, 6));
        add(lineWhite, box(24.4, 0.05, 0.2, cx, 0.4, cz - 9, 1));
        add(lineWhite, box(24.4, 0.05, 0.2, cx, 0.4, cz + 9, 1));
        add(lineWhite, box(0.2, 0.05, 18, cx, 0.4, cz, 1));
        for (const s of [-1, 1]) {
          add(wallMat, tint(box(28, 3.4, 3.2, cx, 2.0, cz + s * 12.6, 4), 0xdfe3e6));
          add(roofMetal, box(29, 0.15, 4.2, cx, 3.9, cz + s * 12.6, 3));
          colliders.push({ x: cx, z: cz + s * 12.6, hw: 14.4, hd: 2 });
          add(wallMat, tint(box(3.2, 2.6, 18, cx + s * 14.5, 1.6, cz, 4), 0xdfe3e6));
          colliders.push({ x: cx + s * 14.5, z: cz, hw: 2, hd: 9.4 });
          const fl = new THREE.CylinderGeometry(0.18, 0.22, 14, 6);
          fl.translate(cx + s * 13, 7, cz - 13);
          add(steelMat, fl);
          const fl2 = fl.clone();
          fl2.translate(0, 0, 26);
          add(steelMat, fl2);
          for (const zz of [-13, 13]) add(lampMaterial, box(2, 0.6, 0.4, cx + s * 13, 14.1, cz + zz, 1));
        }
        const Fs = faceOf(cx, cz - 12.6, 28, 3.2, 3);
        add(signMat, Fs.put(signPlane(10, 0.7, ROW_STADIUM, SIGN_ROWS), 0, 2.6, 0.04));
        continue;
      }
      if (kind === "church") {
        const white = 0xf1ede6;
        add(wallMat, tint(box(11, 8, 22, cx, 4.3, cz, 3.2), white));
        colliders.push({ x: cx, z: cz, hw: 6, hd: 11.5 });
        for (const f of [0, 2] as Face[]) {
          const Fc = faceOf(cx, cz, 11, 22, f);
          for (let i = 0; i < 5; i++) windowAt(Fc, (i - 2) * 4, 4.6, 0.9, 2.6, 0x5a3d28, {});
        }
        const Ff = faceOf(cx, cz, 11, 22, 3);
        doorAt(Ff, -2.0, 2.2, 3.2, 0x5a3d28, white, { step: true, double: true });
        gableRoof(cx, cz, 11, 22, 8.3, white, { pitch: 0.55, rusty: true, alongX: false, overhang: 0.8 });
        add(wallMat, tint(box(3.6, 17, 3.6, cx - 3.6, 8.8, cz - 12.7, 3.2), white));
        colliders.push({ x: cx - 3.6, z: cz - 12.7, hw: 2.2, hd: 2.2 });
        for (const f of [1, 3, 0, 2] as Face[]) {
          const Ft = faceOf(cx - 3.6, cz - 12.7, 3.6, 3.6, f);
          add(interiorMat, Ft.put(new THREE.BoxGeometry(0.9, 1.8, 0.05), 0, 14.6, 0.03));
        }
        add(roofRust, box(4.4, 0.12, 4.4, cx - 3.6, 17.36, cz - 12.7, 2));
        add(paintMat, tint(box(0.3, 2.4, 0.3, cx - 3.6, 18.6, cz - 12.7, 1), 0xf1ede6));
        add(paintMat, tint(box(1.4, 0.3, 0.3, cx - 3.6, 19.0, cz - 12.7, 1), 0xf1ede6));
        for (let k = 0; k < 3; k++) addTree(cx + 11, cz - 8 + k * 8, 1.1);
        for (let k = 0; k < 3; k++) addTree(cx - 11, cz - 8 + k * 8, 1.1);
        for (let k = 0; k < 4; k++) addBush(cx + 8 + (rnd() - 0.5) * 3, cz - 6 + k * 4);
        doorSpots.push({ x: cx + 2, z: cz - 14 });
        continue;
      }
      if (kind === "hospital") {
        building({
          x: cx, z: cz - 6, w: 26, d: 10, floors: 2, color: 0xf1ede6, style: "office", roof: "flat", front: 3,
          signRow: ROW_HOSPITAL, frameColor: 0x3b3a38, doorColor: 0x2c4f7c,
        });
        const Fh = faceOf(cx, cz - 6, 26, 10, 3);
        add(redMat, Fh.put(new THREE.BoxGeometry(2.2, 0.7, 0.2), 0, 8.2, 0.12));
        add(redMat, Fh.put(new THREE.BoxGeometry(0.7, 2.2, 0.2), 0, 8.2, 0.12));
        building({
          x: cx - 6, z: cz + 8, w: 12, d: 8, floors: 1, color: 0xf1ede6, style: "house", roof: "gable", front: 1,
          doorColor: 0x2c4f7c, frameColor: 0x3b3a38, rusty: false,
        });
        addTree(cx + 8, cz + 8, 1.2);
        addTree(cx + 12, cz + 4, 1);
        for (let k = 0; k < 5; k++) addBush(cx + 4 + k * 2.2, cz + 12.5);
        compoundWall(cx, cz, 14.4, 0, 0xf1ede6, false);
        doorSpots.push({ x: cx, z: cz - 13.5 });
        continue;
      }
      if (kind === "campus") {
        const blocks: [number, number, number, number, Face][] = [
          [-8, -8, 12, 9, 3],
          [8, -8, 12, 9, 3],
          [0, 9, 20, 8, 3],
        ];
        blocks.forEach(([bx, bz, bw, bd, fr], i) => {
          building({
            x: cx + bx, z: cz + bz, w: bw, d: bd, floors: 2, color: i === 2 ? 0xbfd2e2 : 0xf1ede6, style: "office",
            roof: "flat", front: fr, signRow: i === 0 ? ROW_UCBC : undefined, frameColor: 0x3b3a38, doorColor: 0x2f3236,
          });
        });
        addTree(cx, cz - 1, 1.3);
        addTree(cx - 13, cz + 2, 1);
        addTree(cx + 13, cz + 2, 1);
        for (let k = 0; k < 6; k++) addBush(cx - 6 + k * 2.4, cz + 1.5);
        compoundWall(cx, cz, 14.4, 0, 0xf1ede6, false);
        doorSpots.push({ x: cx, z: cz - 19 });
        continue;
      }
      if (kind === "airport") {
        add(sidewalkMat, box(inner - 1, 0.32, inner - 1, cx, 0.2, cz, 6));
        building({
          x: cx - 3, z: cz - 9, w: 22, d: 9, floors: 1, color: 0xdfe3e6, style: "office", roof: "flat", front: 3,
          signRow: ROW_AIRPORT, frameColor: 0x3b3a38, doorColor: 0x2f3236,
        });
        const tw = new THREE.CylinderGeometry(1.1, 1.4, 12, 10);
        tw.translate(cx + 11, 6.3, cz - 9);
        add(wallMat, tint(tw, 0xf1ede6));
        add(glassMat, box(4, 2.2, 4, cx + 11, 13.4, cz - 9, 2));
        add(roofConcrete, box(4.6, 0.3, 4.6, cx + 11, 14.6, cz - 9, 2));
        colliders.push({ x: cx + 11, z: cz - 9, hw: 2, hd: 2 });
        add(asphaltMat, plane(26, 8, cx, 0.36, cz + 9, 12));
        add(lineWhite, plane(20, 0.4, cx, 0.38, cz + 9, 1));
        continue;
      }

      // ── îlots ordinaires ──
      if (kind === "commercial") {
        const base = Math.floor(rnd() * WALL_COLORS.length);
        for (const s of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            building({
              x: cx - 10 + k * 10, z: cz + s * 8.5, w: 8.6, d: 11,
              floors: 2 + Math.floor(rnd() * 3),
              color: WALL_COLORS[(base + k * 3 + (s > 0 ? 1 : 0)) % WALL_COLORS.length],
              style: "shop", roof: rnd() < 0.8 ? "flat" : "gable",
              front: s > 0 ? 1 : 3, balconies: rnd() < 0.7, raw: rnd() < 0.08,
            });
          }
        }
      } else if (kind === "mixed") {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          building({
            x: cx + sx * 7.6, z: cz + sz * 7.6, w: 10 + rnd() * 3, d: 10 + rnd() * 3,
            floors: 1 + Math.floor(rnd() * 3), color: pick(WALL_COLORS),
            style: rnd() < 0.5 ? "shop" : "house", roof: rnd() < 0.5 ? "flat" : "gable",
            front: sz > 0 ? 1 : 3, balconies: rnd() < 0.45, veranda: rnd() < 0.3, raw: rnd() < 0.1,
          });
        }
        for (let k = 0; k < 3; k++) {
          const side = rnd() < 0.5 ? -1 : 1;
          const mx = cx + (rnd() - 0.5) * 20;
          const mz = cz + side * (inner / 2 + 2 + ROAD / 2 - 1.2);
          motos.push({ m: mat4(mx, 0, mz, (side * Math.PI) / 2 + (rnd() - 0.5) * 0.4), c: new THREE.Color().setHSL(rnd(), 0.7, 0.45) });
          colliders.push({ x: mx, z: mz, hw: 0.9, hd: 0.5 });
        }
      } else {
        // résidentiel : parcelles murées, maisons en tôle, cour en terre battue, bananiers
        add(dirtMat, plane(26.8, 26.8, cx, 0.31, cz, 8));
        const gate = Math.floor(rnd() * 4);
        const compoundHex = pick(WALL_COLORS);
        for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
          const hx = cx + ix * 9.3;
          const hz = cz + iz * 9.3;
          if (ix === 0 && iz === 0) { addTree(hx + (rnd() - 0.5) * 3, hz + (rnd() - 0.5) * 3, 1.3); continue; }
          if (rnd() < 0.18) {
            for (let k = 0; k < 3; k++) addBanana(hx + (rnd() - 0.5) * 4, hz + (rnd() - 0.5) * 4);
            addBush(hx + 2.5, hz - 2.5);
            continue;
          }
          building({
            x: hx, z: hz, w: 6 + rnd() * 2, d: 5.5 + rnd() * 2,
            floors: rnd() < 0.15 ? 2 : 1,
            color: rnd() < 0.55 ? compoundHex : pick(WALL_COLORS),
            style: rnd() < 0.12 ? "shop" : "house", roof: rnd() < 0.88 ? "gable" : "flat",
            front: iz > 0 ? 1 : iz < 0 ? 3 : ix > 0 ? 0 : 2,
            veranda: rnd() < 0.45, raw: rnd() < 0.14,
          });
        }
        compoundWall(cx, cz, 13.6, gate, compoundHex, rnd() < 0.45);
        for (let k = 0; k < 3; k++) addBush(cx + (rnd() < 0.5 ? -1 : 1) * 15.6, cz + (rnd() - 0.5) * 16);
      }

      if ((kind === "commercial" || kind === "mixed") && rnd() < 0.7) {
        const side = rnd() < 0.5 ? -1 : 1;
        const vx = cx + side * (inner / 2 + 2 + ROAD / 2 - 1.9);
        const vz = cz + (rnd() - 0.5) * 18;
        cars.push({ m: mat4(vx, 0, vz, 0), c: new THREE.Color().setHSL(rnd(), 0.5, 0.45) });
        colliders.push({ x: vx, z: vz, hw: 1.1, hd: 2.2 });
      }
    }
  }

  // ── poteaux électriques + fils, lampadaires ──
  const wirePts: number[] = [];
  for (let i = 0; i < GRID_LINES; i++) {
    const c = lineCoord(i);
    const off = ROAD / 2 + 1.0;
    let prevH: THREE.Vector3 | null = null;
    let prevV: THREE.Vector3 | null = null;
    for (let d = -HALF + 12; d <= HALF - 12; d += 24) {
      const nearCross = Math.abs(((d + HALF) % CELL) - CELL / 2) > CELL / 2 - 7;
      if (nearCross) continue;
      poles.push(mat4(d, 0, c + off, 0));
      poles.push(mat4(c - off, 0, d, Math.PI / 2));
      const hTop = new THREE.Vector3(d, 6.9, c + off);
      const vTop = new THREE.Vector3(c - off, 6.9, d);
      if (prevH && hTop.distanceTo(prevH) < 30) wirePts.push(prevH.x, prevH.y, prevH.z, hTop.x, hTop.y, hTop.z, prevH.x, prevH.y - 0.4, prevH.z, hTop.x, hTop.y - 0.4, hTop.z);
      if (prevV && vTop.distanceTo(prevV) < 30) wirePts.push(prevV.x, prevV.y, prevV.z, vTop.x, vTop.y, vTop.z, prevV.x, prevV.y - 0.4, prevV.z, vTop.x, vTop.y - 0.4, vTop.z);
      prevH = hTop;
      prevV = vTop;
    }
  }
  for (let i = 0; i < GRID_LINES; i++) {
    for (let j = 0; j < GRID_LINES; j++) {
      const x = lineCoord(i);
      const z = lineCoord(j);
      lamps.push(mat4(x + ROAD / 2 + 1.4, 0, z - ROAD / 2 - 1.4, Math.PI));
      if ((i + j) % 2 === 0) lamps.push(mat4(x - ROAD / 2 - 1.4, 0, z + ROAD / 2 + 1.4, 0));
    }
  }

  // ── fusion : 1 draw call par matériau ──
  buckets.forEach((geos, mat) => {
    const merged = mergeGeometries(geos, false);
    if (!merged) {
      console.warn("city: fusion impossible pour un matériau", mat.type);
      return;
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mat !== dirtMat && mat !== asphaltMat && mat !== lineWhite && mat !== lineYellow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    geos.forEach((g) => g.dispose());
  });

  // ── instances ──
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colors?: THREE.Color[], shadow = true) => {
    if (!mats.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
    return im;
  };
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.2, 7);
  trunkGeo.translate(0, 1.6, 0);
  inst(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b4029, roughness: 1 }), trees);
  // houppiers : trois masses irrégulières (sommets légèrement bruités) pour casser l'aspect « boule »
  const lumpy = (r: number, dx: number, dy: number, dz: number, seed: number) => {
    const g = new THREE.IcosahedronGeometry(r, 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const rr = mulberry(seed);
    for (let i = 0; i < p.count; i++) {
      const k = 0.82 + rr() * 0.36;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    g.translate(dx, dy, dz);
    return g;
  };
  const leafFlat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  inst(lumpy(2.3, 0, 4.3, 0, 3), leafFlat, trees, treeColors);
  inst(lumpy(1.7, 1.0, 5.4, 0.5, 4), leafFlat, trees, treeColors);
  inst(lumpy(1.5, -1.1, 5.0, -0.6, 5), leafFlat, trees, treeColors);

  // bananiers : stipe + 6 grandes feuilles
  const stem = new THREE.CylinderGeometry(0.12, 0.17, 2.2, 7);
  stem.translate(0, 1.1, 0);
  inst(stem, new THREE.MeshStandardMaterial({ color: 0x7a8a4a, roughness: 0.9 }), bananas);
  const leafParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.PlaneGeometry(0.8, 2.6, 1, 3);
    leaf.translate(0, 1.3, 0);
    leaf.rotateX(-0.75 - (i % 2) * 0.25);
    leaf.rotateY((i / 6) * Math.PI * 2);
    leaf.translate(0, 2.1, 0);
    leafParts.push(leaf);
  }
  const leaves = mergeGeometries(leafParts, false);
  if (leaves) inst(leaves, new THREE.MeshStandardMaterial({ color: 0x4f8f3d, roughness: 0.8, side: THREE.DoubleSide }), bananas, undefined, false);
  // buissons
  const bushGeo = lumpy(0.7, 0, 0.5, 0, 6);
  bushGeo.scale(1, 0.8, 1);
  inst(bushGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), bushes, bushColors, false);

  if (detail) {
    const poleGeo = new THREE.CylinderGeometry(0.13, 0.17, 7.2, 6);
    poleGeo.translate(0, 3.6, 0);
    inst(poleGeo, poleMat, poles, undefined, false);
    const armGeo = new THREE.BoxGeometry(1.4, 0.12, 0.12);
    armGeo.translate(0, 6.9, 0);
    inst(armGeo, poleMat, poles, undefined, false);
    const wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute("position", new THREE.Float32BufferAttribute(wirePts, 3));
    scene.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x0f0f12, transparent: true, opacity: 0.8 })));
  }
  const lampPole = new THREE.CylinderGeometry(0.1, 0.14, 6.5, 6);
  lampPole.translate(0, 3.25, 0);
  inst(lampPole, steelMat, lamps, undefined, false);
  const lampArm = new THREE.BoxGeometry(0.12, 0.12, 1.6);
  lampArm.translate(0, 6.4, 0.8);
  inst(lampArm, steelMat, lamps, undefined, false);
  const lampHead = new THREE.BoxGeometry(0.5, 0.22, 0.9);
  lampHead.translate(0, 6.35, 1.5);
  inst(lampHead, lampMaterial, lamps, undefined, false);
  const glowGeo = new THREE.CircleGeometry(4.2, 18);
  glowGeo.rotateX(-Math.PI / 2);
  glowGeo.translate(0, 0.33, 1.5);
  inst(glowGeo, lampGlowMaterial, lamps, undefined, false);

  // motos garées
  if (motos.length) {
    const mm = motos.map((m) => m.m);
    const mc = motos.map((m) => m.c);
    const mBody = new THREE.BoxGeometry(0.5, 0.5, 1.8);
    mBody.translate(0, 0.8, 0);
    inst(mBody, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.4 }), mm, mc);
    const mSeat = new THREE.BoxGeometry(0.45, 0.25, 0.9);
    mSeat.translate(0, 1.15, -0.2);
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.8 });
    inst(mSeat, dark, mm);
    const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.18, 12);
    wheel.rotateZ(Math.PI / 2);
    const w1 = wheel.clone();
    w1.translate(0, 0.33, 0.75);
    const w2 = wheel.clone();
    w2.translate(0, 0.33, -0.75);
    inst(w1, dark, mm);
    inst(w2, dark, mm);
  }
  // voitures garées
  if (cars.length) {
    const cm = cars.map((c) => c.m);
    const cc = cars.map((c) => c.c);
    const cBody = new THREE.BoxGeometry(2.0, 1.0, 4.3);
    cBody.translate(0, 0.85, 0);
    inst(cBody, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5 }), cm, cc);
    const cCab = new THREE.BoxGeometry(1.8, 0.8, 2.2);
    cCab.translate(0, 1.75, -0.2);
    inst(cCab, new THREE.MeshStandardMaterial({ color: 0x1d2530, roughness: 0.15, metalness: 0.7 }), cm);
    const cw = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12);
    cw.rotateZ(Math.PI / 2);
    const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    for (const [ox, oz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      const g = cw.clone();
      g.translate(ox, 0.36, oz);
      inst(g, tyre, cm);
    }
  }
  // parasols du marché
  if (umbrellas.length) {
    const um = umbrellas.map((u) => u.m);
    const uc = umbrellas.map((u) => u.c);
    const cone = new THREE.ConeGeometry(1.9, 0.9, 8);
    cone.translate(0, 2.7, 0);
    inst(cone, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }), um, uc, false);
    const up = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5);
    up.translate(0, 1.2, 0);
    inst(up, steelMat, um, undefined, false);
  }

  return {
    colliders,
    lampMaterial,
    lampGlowMaterial,
    facadeMaterials: [glassLit, signMat],
    roadMaterials: [asphaltMat, sidewalkMat],
    shopFronts,
    doorSpots,
  };
}
