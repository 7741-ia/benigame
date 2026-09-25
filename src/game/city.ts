import * as THREE from "three";
import { GRID_LINES, CELL, ROAD, WORLD, HALF } from "./constants";
import {
  makeAsphalt,
  makeConcrete,
  makeDirt,
  makeGrass,
  makeMetalRoof,
  makePlaster,
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

export interface VisitableBuilding {
  id: "home" | "restaurant" | "shop" | "pharmacy";
  name: string;
  x: number;
  z: number;
  doorX: number;
  doorZ: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  rooms?: { name: string; x: number; z: number; icon: string }[];
}

export interface CityResult {
  colliders: Collider[];
  lampMaterial: THREE.MeshStandardMaterial;
  lampGlowMaterial: THREE.MeshBasicMaterial;
  facadeMaterials: THREE.MeshStandardMaterial[];
  roadMaterials: THREE.MeshStandardMaterial[];
  shopFronts: { x: number; z: number; facing: number }[];
  doorSpots: { x: number; z: number }[];
  visitableBuildings: VisitableBuilding[];
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
  | "school"
  | "fuel"
  | "admin"
  | "airport"
  | "restaurant";

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

const WALL_COLORS = [0xe9dfc8, 0xbfd2e2, 0xebdaa8, 0xd6a06c, 0xf1ede6, 0xc7d8be, 0xdfb09c, 0xd2ccc3, 0xa9c4c9, 0xe4c78f];
const DOOR_COLORS = [0x2c4f7c, 0x3b6b4a, 0x6b3f2a, 0x8b2f2f, 0x2f3236, 0x1f6f8b];
const AWNING_COLORS = [0x9c3b3b, 0x2f6b53, 0x2f5a86, 0xb5862a, 0x6b4f8a, 0xc9642a];
const GOODS_COLORS = [0xd63b2f, 0xe8c531, 0x4f8a3a, 0xc27a3a, 0x2c4f7c, 0xf2f2f2, 0x8b2f2f];

const SIGN_ROWS = SHOP_SIGNS.length + PLACE_SIGNS.length;
const ROW_MARKET = SHOP_SIGNS.length + 4;

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

function signPlane(w: number, h: number, row: number, rows: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1) / rows + uv.getY(i) / rows);
  return g;
}

export function buildCity(scene: THREE.Scene, _quality: Quality): CityResult {
  const rnd = mulberry(20240613);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const colliders: Collider[] = [];
  const shopFronts: CityResult["shopFronts"] = [];
  const doorSpots: CityResult["doorSpots"] = [];
  const visitableBuildings: VisitableBuilding[] = [];

  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (mat: THREE.Material, geo: THREE.BufferGeometry) => {
    if ((mat as THREE.MeshStandardMaterial).vertexColors && !geo.getAttribute("color")) tint(geo, 0xffffff);
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat)!.push(geo);
  };

  // ── Matériaux procéduraux PBR ──
  const asphaltTex = makeAsphalt();
  const concreteTex = makeConcrete();
  const dirtTex = makeDirt();
  const grassTex = makeGrass();
  const metalRoofTex = makeMetalRoof(false);
  const rustRoofTex = makeMetalRoof(true, 11);
  const plasterTex = makePlaster();
  const shutterTex = makeShutter();

  const asphaltMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95, metalness: 0.0 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.98 });
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 });
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });
  const lineWhite = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.6 });
  const lineYellow = new THREE.MeshStandardMaterial({ color: 0xd9b640, roughness: 0.6 });
  const roofConcrete = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0xb9b3a8, roughness: 0.98 });
  const roofMetal = new THREE.MeshStandardMaterial({ map: metalRoofTex, roughness: 0.55, metalness: 0.5 });
  const roofRust = new THREE.MeshStandardMaterial({ map: rustRoofTex, roughness: 0.8, metalness: 0.25 });
  const wallMat = new THREE.MeshStandardMaterial({ map: plasterTex, vertexColors: true, roughness: 0.96 });
  const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 });
  const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.12, metalness: 0.6 });
  const glassLit = new THREE.MeshStandardMaterial({
    color: 0x24303c, emissive: 0xffd39a, emissiveIntensity: 0, roughness: 0.2, metalness: 0.4,
  });
  const shutterMat = new THREE.MeshStandardMaterial({ map: shutterTex, roughness: 0.5, metalness: 0.55 });
  const floorTileMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0xd1c7bd, roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85 });
  const signAtlas = makeSignAtlas([...SHOP_SIGNS, ...PLACE_SIGNS]);
  const signMat = new THREE.MeshStandardMaterial({
    map: signAtlas.texture, emissiveMap: signAtlas.texture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7,
  });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x6e737a, roughness: 0.5, metalness: 0.7 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffd27a, emissiveIntensity: 0, roughness: 0.4 });
  const lampGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  // ── Vaste sol extérieur (terre battue rouge latéritique de Beni) ──
  add(dirtMat, plane(WORLD + 300, WORLD + 300, 0, -0.03, 0, 16));

  // ── Réseau routier hiérarchisé ──
  // Axes principaux asphaltés (Boulevard Nyamwisi, Route Nationale) vs axes secondaires et pistes
  for (let i = 0; i < GRID_LINES; i++) {
    const c = lineCoord(i);
    // Boulevards centraux (indices 4, 5) plus soignés
    const isMainBoulevard = i === 4 || i === 5;
    const roadSurface = isMainBoulevard ? asphaltMat : (i % 2 === 0 ? asphaltMat : dirtMat);

    add(roadSurface, plane(WORLD + ROAD, ROAD, 0, 0.01, c, 12));
    for (let j = -1; j < GRID_LINES; j++) {
      const z0 = j < 0 ? -HALF - ROAD / 2 : lineCoord(j) + ROAD / 2;
      const z1 = j + 1 >= GRID_LINES ? HALF + ROAD / 2 : lineCoord(j + 1) - ROAD / 2;
      if (z1 - z0 < 0.5) continue;
      add(roadSurface, plane(ROAD, z1 - z0, c, 0.01, (z0 + z1) / 2, 12));
    }
  }

  // Marquages routiers sur les boulevards asphaltés
  for (let i = 0; i < GRID_LINES; i++) {
    const c = lineCoord(i);
    for (let d = -HALF + 6; d <= HALF - 6; d += 8) {
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

  // Passages piétons aux intersections principales
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

  // ── Instances optimisées pour végétation et mobilier urbain ──
  const trees: THREE.Matrix4[] = [];
  const treeColors: THREE.Color[] = [];
  const bananas: THREE.Matrix4[] = [];
  const bushes: THREE.Matrix4[] = [];
  const lamps: THREE.Matrix4[] = [];
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
  };

  // Lampadaires solaires urbains le long des boulevards
  for (let i = 1; i < GRID_LINES - 1; i++) {
    const lx = lineCoord(i);
    for (let d = -HALF + 20; d <= HALF - 20; d += 28) {
      lamps.push(mat4(lx - ROAD / 2 - 1.2, 0, d, Math.PI / 2));
      lamps.push(mat4(lx + ROAD / 2 + 1.2, 0, d, -Math.PI / 2));
    }
  }

  // ── Repère de façade ──
  const faceOf = (x: number, z: number, w: number, d: number, f: Face) => {
    const nx = f === 0 ? 1 : f === 2 ? -1 : 0;
    const nz = f === 1 ? 1 : f === 3 ? -1 : 0;
    const th = Math.atan2(nx, nz);
    const tx = nz;
    const tz = -nx;
    const cx = x + (nx * w) / 2;
    const cz = z + (nz * d) / 2;
    const len = f === 1 || f === 3 ? w : d;
    const put = (geo: THREE.BufferGeometry, s: number, y: number, p: number) => {
      geo.rotateY(th);
      geo.translate(cx + tx * s + nx * p, y, cz + tz * s + nz * p);
      return geo;
    };
    return { put, len, nx, nz, cx, cz };
  };
  type F = ReturnType<typeof faceOf>;

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
    if (opts.sill !== false) {
      add(paintMat, tint(F.put(new THREE.BoxGeometry(ww + fr * 2 + 0.1, 0.06, 0.18), s, y - wh / 2 - fr - 0.03, 0.09), frameHex));
    }
  };

  const doorAt = (
    F: F, s: number, dw: number, dh: number, doorHex: number, frameHex: number,
    opts: { step?: boolean; canopy?: boolean; double?: boolean } = {}
  ) => {
    add(paintMat, tint(F.put(new THREE.BoxGeometry(dw, dh, 0.08), s, dh / 2 + 0.3, 0.04), doorHex));
    add(paintMat, tint(F.put(new THREE.BoxGeometry(dw + 0.2, 0.1, 0.14), s, dh + 0.35, 0.06), frameHex));
    if (opts.canopy) {
      const c = F.put(new THREE.BoxGeometry(dw + 0.6, 0.08, 0.8), s, dh + 0.5, 0.4);
      c.rotateX(0.12);
      add(roofRust, c);
    }
  };

  const shopFrontAt = (F: F, s: number, w: number, h: number, signRow: number, awningHex: number) => {
    const sw = w - 0.3;
    add(shutterMat, F.put(new THREE.BoxGeometry(sw, h, 0.06), s, h / 2 + 0.3, 0.03));
    const awW = w + 0.4;
    const awD = 1.35;
    const aw = F.put(new THREE.BoxGeometry(awW, 0.06, awD), s, h + 0.35, awD / 2);
    aw.rotateX(0.2);
    add(paintMat, tint(aw, awningHex));
    add(signMat, F.put(signPlane(w * 0.9, 0.62, signRow, SIGN_ROWS), s, h + 0.85, 0.05));
  };

  const gableRoof = (
    x: number, z: number, w: number, d: number, baseH: number, _wallHex: number,
    opts: { pitch?: number; rusty?: boolean; alongX?: boolean; overhang?: number } = {}
  ) => {
    const alongX = opts.alongX ?? w >= d;
    const span = alongX ? d : w;
    const len = alongX ? w : d;
    const pitch = opts.pitch ?? 0.4;
    const h = (span / 2) * pitch;
    const over = opts.overhang ?? 0.45;
    const slopeLen = Math.hypot(span / 2 + over, h);
    const ang = Math.atan2(h, span / 2);
    const roofM = opts.rusty ? roofRust : roofMetal;

    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(alongX ? len + over * 2 : slopeLen, 0.08, alongX ? slopeLen : len + over * 2);
      if (alongX) {
        g.rotateX(side * ang);
        g.translate(x, baseH + h / 2, z + (side * span) / 4);
      } else {
        g.rotateZ(-side * ang);
        g.translate(x + (side * span) / 4, baseH + h / 2, z);
      }
      add(roofM, g);
    }
  };

  const flatRoof = (x: number, z: number, w: number, d: number, baseH: number, wallHex: number) => {
    add(roofConcrete, box(w, 0.2, d, x, baseH + 0.1, z, 3));
    const ph = 0.55;
    const pt = 0.22;
    add(wallMat, tint(box(w + 0.04, ph, pt, x, baseH + ph / 2 + 0.2, z - d / 2 + pt / 2, 2), wallHex));
    add(wallMat, tint(box(w + 0.04, ph, pt, x, baseH + ph / 2 + 0.2, z + d / 2 - pt / 2, 2), wallHex));
    add(wallMat, tint(box(pt, ph, d - pt * 2, x - w / 2 + pt / 2, baseH + ph / 2 + 0.2, z, 2), wallHex));
    add(wallMat, tint(box(pt, ph, d - pt * 2, x + w / 2 - pt / 2, baseH + ph / 2 + 0.2, z, 2), wallHex));
  };

  const building = (o: {
    x: number; z: number; w: number; d: number; floors: number;
    color: number; style: "shop" | "house" | "office"; roof: "gable" | "flat";
    front: Face; signRow?: number; doorColor?: number; frameColor?: number; rusty?: boolean;
  }) => {
    const { x, z, w, d, floors } = o;
    const groundH = 3.2;
    const floorH = 2.8;
    const totalH = groundH + (floors - 1) * floorH;
    const y0 = 0.3;
    const wallHex = o.color;
    const doorHex = o.doorColor ?? pick(DOOR_COLORS);
    const trimHex = o.frameColor ?? 0xf0ece3;
    const awningHex = pick(AWNING_COLORS);

    add(wallMat, tint(box(w, totalH, d, x, y0 + totalH / 2, z, 3.2), wallHex));
    add(paintMat, tint(box(w + 0.2, 0.3, d + 0.2, x, 0.15, z, 4), 0x3d3a36));

    for (let f = 0 as Face; f < 4; f = (f + 1) as Face) {
      const F = faceOf(x, z, w, d, f);
      const isFront = f === o.front;
      if (F.len < 2.6) continue;
      if (isFront) {
        if (o.style === "shop") {
          const sw = Math.min(F.len * 0.58, 4.4);
          shopFrontAt(F, 0, sw, 2.3, o.signRow ?? Math.floor(rnd() * SHOP_SIGNS.length), awningHex);
          const dx = F.cx + F.nx * 2.0;
          const dz = F.cz + F.nz * 2.0;
          shopFronts.push({ x: dx, z: dz, facing: Math.atan2(-F.nx, -F.nz) });
          doorSpots.push({ x: dx, z: dz });
        } else {
          doorAt(F, 0, 1.1, 2.2, doorHex, trimHex, { step: true, canopy: true });
          if (F.len >= 5.4) for (const k of [-1, 1]) windowAt(F, k * 1.9, y0 + 1.75, 1.05, 1.1, trimHex, { grille: true });
          doorSpots.push({ x: F.cx + F.nx * 2.2, z: F.cz + F.nz * 2.2 });
        }
      } else {
        const spacing = 2.8;
        const n = Math.max(0, Math.floor((F.len - 1.0) / spacing));
        for (let i = 0; i < n; i++) {
          const s = (i - (n - 1) / 2) * spacing;
          windowAt(F, s, y0 + 1.8, 1.1, 1.1, trimHex, { grille: true });
        }
      }
    }

    const topY = y0 + totalH;
    if (o.roof === "gable") gableRoof(x, z, w, d, topY, wallHex, { rusty: o.rusty ?? true });
    else flatRoof(x, z, w, d, topY, wallHex);

    colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
  };

  // ─────────────────────────────────────────────────────────────
  //  BÂTIMENTS VISITABLES AVEC INTÉRIEURS 3D COMPLETS
  // ─────────────────────────────────────────────────────────────

  // 1. MAISON DU JOUEUR (Quartier Masiani) — Salon, Cuisine, Chambre, Salle de bain
  const buildPlayerHouse = (hx: number, hz: number) => {
    const hw = 13.0;
    const hd = 10.0;
    const wallH = 3.2;
    const wallThick = 0.24;
    const floorY = 0.2;

    // Sol carrelé intérieur
    add(floorTileMat, box(hw, 0.2, hd, hx, floorY, hz, 3));

    // Murs extérieurs avec porte d'entrée ouverte en façade Sud (z + hd/2)
    // Façade avant coupée en deux avec passage de porte (1.2m)
    const doorW = 1.25;
    const frontHalf = (hw - doorW) / 2;
    add(wallMat, tint(box(frontHalf, wallH, wallThick, hx - doorW / 2 - frontHalf / 2, wallH / 2 + floorY, hz + hd / 2, 2), 0xebdaa8));
    add(wallMat, tint(box(frontHalf, wallH, wallThick, hx + doorW / 2 + frontHalf / 2, wallH / 2 + floorY, hz + hd / 2, 2), 0xebdaa8));
    // Linteau au-dessus de la porte
    add(wallMat, tint(box(doorW, wallH - 2.2, wallThick, hx, 2.2 + (wallH - 2.2) / 2 + floorY, hz + hd / 2, 1), 0xebdaa8));

    // Mur arrière Nord plein
    add(wallMat, tint(box(hw, wallH, wallThick, hx, wallH / 2 + floorY, hz - hd / 2, 3), 0xebdaa8));
    // Mur Est
    add(wallMat, tint(box(wallThick, wallH, hd, hx + hw / 2, wallH / 2 + floorY, hz, 3), 0xebdaa8));
    // Mur Ouest
    add(wallMat, tint(box(wallThick, wallH, hd, hx - hw / 2, wallH / 2 + floorY, hz, 3), 0xebdaa8));

    // Cloisons intérieures :
    // Cloison Est-Ouest séparant jour (Sud) et nuit (Nord)
    add(wallMat, tint(box(hw * 0.42, wallH, wallThick, hx - hw * 0.28, wallH / 2 + floorY, hz, 2), 0xf1ede6));
    add(wallMat, tint(box(hw * 0.42, wallH, wallThick, hx + hw * 0.28, wallH / 2 + floorY, hz, 2), 0xf1ede6));
    // Cloison Nord-Sud séparant Chambre et Salle de bain
    add(wallMat, tint(box(wallThick, wallH, hd * 0.45, hx, wallH / 2 + floorY, hz - hd * 0.26, 2), 0xf1ede6));

    // Toiture en tôle ondulée
    gableRoof(hx, hz, hw + 0.8, hd + 0.8, wallH + floorY, 0xebdaa8, { rusty: true });

    // ── MEUBLES DU SALON (Sud-Ouest) ──
    // Canapé confortable
    const sofaHex = 0x2563eb;
    add(paintMat, tint(box(2.2, 0.45, 0.9, hx - 3.8, floorY + 0.25, hz + 2.8, 1), sofaHex));
    add(paintMat, tint(box(2.2, 0.55, 0.2, hx - 3.8, floorY + 0.65, hz + 3.2, 1), sofaHex));
    // Table basse
    add(woodMat, box(1.3, 0.4, 0.7, hx - 3.8, floorY + 0.2, hz + 1.4, 1));
    // Meuble TV et écran
    add(woodMat, box(1.8, 0.55, 0.45, hx - 5.5, floorY + 0.3, hz + 1.4, 1, Math.PI / 2));
    add(metalMat, tint(box(1.2, 0.75, 0.08, hx - 5.5, floorY + 0.95, hz + 1.4, 1, Math.PI / 2), 0x0f172a));

    // ── MEUBLES DE LA CUISINE (Sud-Est) ──
    // Plan de travail et évier
    add(roofConcrete, box(2.6, 0.85, 0.7, hx + 4.2, floorY + 0.45, hz + 1.6, 1, Math.PI / 2));
    // Bouteille de gaz bleue congolaise & réchaud
    const gasBot = new THREE.CylinderGeometry(0.2, 0.2, 0.55, 8);
    gasBot.translate(hx + 3.4, floorY + 0.3, hz + 1.2);
    add(paintMat, tint(gasBot, 0x0284c7));
    // Bidons jaunes d'eau de 20L
    for (let b = 0; b < 2; b++) {
      add(paintMat, tint(box(0.28, 0.42, 0.22, hx + 5.2, floorY + 0.22, hz + 2.2 + b * 0.35, 1), 0xfacc15));
    }

    // ── MEUBLES DE LA CHAMBRE (Nord-Ouest) ──
    // Grand lit avec matelas, oreillers et moustiquaire
    add(woodMat, box(2.1, 0.4, 1.7, hx - 4.2, floorY + 0.22, hz - 3.2, 1));
    add(paintMat, tint(box(2.0, 0.2, 1.6, hx - 4.2, floorY + 0.45, hz - 3.2, 1), 0xf8fafc));
    // Cadre moustiquaire
    add(steelMat, box(2.1, 1.8, 0.04, hx - 4.2, floorY + 1.1, hz - 2.35, 1));
    // Armoire penderie
    add(woodMat, box(1.2, 1.9, 0.55, hx - 1.2, floorY + 1.0, hz - 4.2, 1));

    // ── MEUBLES DE LA SALLE DE BAIN (Nord-Est) ──
    // Receveur de douche carrelé
    add(paintMat, tint(box(1.2, 0.12, 1.2, hx + 4.8, floorY + 0.08, hz - 3.8, 1), 0x0284c7));
    // Pommeau de douche
    const showerPipe = new THREE.CylinderGeometry(0.02, 0.02, 1.8, 6);
    showerPipe.translate(hx + 5.3, floorY + 1.2, hz - 3.8);
    add(steelMat, showerPipe);
    // Lavabo
    add(paintMat, tint(box(0.65, 0.75, 0.45, hx + 2.2, floorY + 0.4, hz - 4.4, 1), 0xf8fafc));

    // Collisions précises (murs extérieurs + cloisons laissant passer la porte)
    colliders.push({ x: hx - doorW / 2 - frontHalf / 2, z: hz + hd / 2, hw: frontHalf / 2, hd: wallThick });
    colliders.push({ x: hx + doorW / 2 + frontHalf / 2, z: hz + hd / 2, hw: frontHalf / 2, hd: wallThick });
    colliders.push({ x: hx, z: hz - hd / 2, hw: hw / 2, hd: wallThick });
    colliders.push({ x: hx + hw / 2, z: hz, hw: wallThick, hd: hd / 2 });
    colliders.push({ x: hx - hw / 2, z: hz, hw: wallThick, hd: hd / 2 });
    colliders.push({ x: hx - hw * 0.28, z: hz, hw: (hw * 0.42) / 2, hd: wallThick });
    colliders.push({ x: hx + hw * 0.28, z: hz, hw: (hw * 0.42) / 2, hd: wallThick });
    colliders.push({ x: hx, z: hz - hd * 0.26, hw: wallThick, hd: (hd * 0.45) / 2 });

    const doorX = hx;
    const doorZ = hz + hd / 2 + 1.2;
    doorSpots.push({ x: doorX, z: doorZ });
    visitableBuildings.push({
      id: "home",
      name: "Maison du joueur - Masiani",
      x: hx,
      z: hz,
      doorX,
      doorZ,
      bounds: { minX: hx - hw / 2, maxX: hx + hw / 2, minZ: hz - hd / 2, maxZ: hz + hd / 2 },
      rooms: [
        { name: "Salon", x: hx - 3.5, z: hz + 2.2, icon: "🛋️" },
        { name: "Cuisine", x: hx + 3.5, z: hz + 2.2, icon: "🍳" },
        { name: "Chambre", x: hx - 3.5, z: hz - 2.5, icon: "🛏️" },
        { name: "Salle de bain", x: hx + 3.5, z: hz - 2.5, icon: "🚿" },
      ],
    });
  };

  // 2. RESTAURANT "CHEZ MAMA LÉONTINE" — Grande terrasse couverte, tables, bar, grill
  const buildRestaurant = (rx: number, rz: number) => {
    const rw = 14.0;
    const rd = 11.0;
    const floorY = 0.2;
    const wallH = 3.4;

    add(floorTileMat, box(rw, 0.2, rd, rx, floorY, rz, 3));
    // Mur de fond et côté Est
    add(wallMat, tint(box(rw, wallH, 0.25, rx, wallH / 2 + floorY, rz - rd / 2, 3), 0xd6a06c));
    add(wallMat, tint(box(0.25, wallH, rd, rx + rw / 2, wallH / 2 + floorY, rz, 3), 0xd6a06c));
    // Façade avant ouverte avec poteaux en bois
    for (let p = -2; p <= 2; p++) {
      const col = new THREE.CylinderGeometry(0.12, 0.12, wallH, 8);
      col.translate(rx + p * 2.8, wallH / 2 + floorY, rz + rd / 2);
      add(woodMat, col);
    }
    // Toit en tôle
    gableRoof(rx, rz, rw + 1.2, rd + 1.2, wallH + floorY, 0xd6a06c, { rusty: true });

    // Enseigne Mama Léontine
    const F = faceOf(rx, rz + rd / 2, rw, 0.3, 1);
    add(signMat, F.put(signPlane(7.0, 0.8, 1, SIGN_ROWS), 0, wallH + 0.2, 0.1));

    // Comptoir bar & casiers de boissons
    add(woodMat, box(4.5, 1.1, 0.8, rx - 3.5, floorY + 0.55, rz - 2.5, 1));
    add(woodMat, box(4.5, 2.2, 0.4, rx - 3.5, floorY + 1.1, rz - 4.5, 1));

    // 4 Tables avec chaises colorées
    const chairColors = [0x2563eb, 0xdc2626, 0xfacc15, 0x16a34a];
    const tablePositions = [
      { x: rx + 2.8, z: rz + 2.0 },
      { x: rx + 2.8, z: rz - 1.8 },
      { x: rx - 2.5, z: rz + 2.5 },
      { x: rx - 2.5, z: rz },
    ];
    tablePositions.forEach((tp, idx) => {
      // Table ronde ou carrée avec nappe
      add(paintMat, tint(box(1.4, 0.75, 1.4, tp.x, floorY + 0.38, tp.z, 1), 0xf8fafc));
      // 4 Chaises autour
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const cColor = chairColors[(idx + (dx + dz + 2)) % chairColors.length];
        add(paintMat, tint(box(0.42, 0.8, 0.42, tp.x + dx * 0.95, floorY + 0.4, tp.z + dz * 0.95, 1), cColor));
      }
    });

    // Barbecue / grill kamundele
    add(metalMat, tint(box(1.2, 0.9, 0.6, rx + 5.2, floorY + 0.45, rz + 2.5, 1), 0x171717));

    // Colliders (murs arrières et comptoir)
    colliders.push({ x: rx, z: rz - rd / 2, hw: rw / 2, hd: 0.3 });
    colliders.push({ x: rx + rw / 2, z: rz, hw: 0.3, hd: rd / 2 });
    colliders.push({ x: rx - 3.5, z: rz - 2.5, hw: 2.3, hd: 0.5 });

    const doorX = rx;
    const doorZ = rz + rd / 2 + 1.5;
    doorSpots.push({ x: doorX, z: doorZ });
    visitableBuildings.push({
      id: "restaurant",
      name: "Restaurant Chez Mama Léontine",
      x: rx,
      z: rz,
      doorX,
      doorZ,
      bounds: { minX: rx - rw / 2, maxX: rx + rw / 2, minZ: rz - rd / 2, maxZ: rz + rd / 2 },
    });
  };

  // 3. BOUTIQUE ALIMENTATION & QUINCAILLERIE "KIVU EXPRESS"
  const buildShop = (sx: number, sz: number) => {
    const sw = 12.0;
    const sd = 9.0;
    const floorY = 0.2;
    const wallH = 3.2;

    add(floorTileMat, box(sw, 0.2, sd, sx, floorY, sz, 3));
    // Murs avec grande entrée
    const doorW = 2.4;
    const halfW = (sw - doorW) / 2;
    add(wallMat, tint(box(halfW, wallH, 0.25, sx - doorW / 2 - halfW / 2, wallH / 2 + floorY, sz + sd / 2, 2), 0xbfd2e2));
    add(wallMat, tint(box(halfW, wallH, 0.25, sx + doorW / 2 + halfW / 2, wallH / 2 + floorY, sz + sd / 2, 2), 0xbfd2e2));
    add(wallMat, tint(box(sw, wallH, 0.25, sx, wallH / 2 + floorY, sz - sd / 2, 3), 0xbfd2e2));
    add(wallMat, tint(box(0.25, wallH, sd, sx - sw / 2, wallH / 2 + floorY, sz, 2), 0xbfd2e2));
    add(wallMat, tint(box(0.25, wallH, sd, sx + sw / 2, wallH / 2 + floorY, sz, 2), 0xbfd2e2));

    // Toit plat avec acrotère
    flatRoof(sx, sz, sw, sd, wallH + floorY, 0xbfd2e2);

    // Enseigne
    const F = faceOf(sx, sz + sd / 2, sw, 0.3, 1);
    add(signMat, F.put(signPlane(8.0, 0.8, 0, SIGN_ROWS), 0, wallH + 0.4, 0.1));

    // Rayonnages de magasin
    for (let r = 0; r < 2; r++) {
      const rx = sx - 2.5 + r * 5.0;
      add(steelMat, box(0.8, 2.2, 5.0, rx, floorY + 1.1, sz - 0.5, 2));
      // Marchandises colorées sur les étagères
      for (let j = 0; j < 6; j++) {
        add(paintMat, tint(box(0.6, 0.25, 0.5, rx, floorY + 0.6 + (j % 3) * 0.6, sz - 2.0 + j * 0.7, 1), pick(GOODS_COLORS)));
      }
    }

    // Comptoir de caisse
    add(woodMat, box(2.4, 1.0, 0.7, sx, floorY + 0.5, sz + 2.0, 1));
    // Caisse enregistreuse
    add(metalMat, tint(box(0.5, 0.35, 0.4, sx - 0.4, floorY + 1.15, sz + 2.0, 1), 0x1f2937));

    colliders.push({ x: sx - doorW / 2 - halfW / 2, z: sz + sd / 2, hw: halfW / 2, hd: 0.3 });
    colliders.push({ x: sx + doorW / 2 + halfW / 2, z: sz + sd / 2, hw: halfW / 2, hd: 0.3 });
    colliders.push({ x: sx, z: sz - sd / 2, hw: sw / 2, hd: 0.3 });
    colliders.push({ x: sx - sw / 2, z: sz, hw: 0.3, hd: sd / 2 });
    colliders.push({ x: sx + sw / 2, z: sz, hw: 0.3, hd: sd / 2 });
    colliders.push({ x: sx, z: sz + 2.0, hw: 1.2, hd: 0.4 });

    const doorX = sx;
    const doorZ = sz + sd / 2 + 1.5;
    doorSpots.push({ x: doorX, z: doorZ });
    visitableBuildings.push({
      id: "shop",
      name: "Boutique Alimentation Kivu Express",
      x: sx,
      z: sz,
      doorX,
      doorZ,
      bounds: { minX: sx - sw / 2, maxX: sx + sw / 2, minZ: sz - sd / 2, maxZ: sz + sd / 2 },
    });
  };

  // 4. PHARMACIE & DISPENSAIRE DE L'ESPOIR
  const buildPharmacy = (px: number, pz: number) => {
    const pw = 11.0;
    const pd = 8.5;
    const floorY = 0.2;
    const wallH = 3.2;

    add(floorTileMat, box(pw, 0.2, pd, px, floorY, pz, 3));
    const doorW = 1.6;
    const halfW = (pw - doorW) / 2;
    add(wallMat, tint(box(halfW, wallH, 0.25, px - doorW / 2 - halfW / 2, wallH / 2 + floorY, pz + pd / 2, 2), 0xf1ede6));
    add(wallMat, tint(box(halfW, wallH, 0.25, px + doorW / 2 + halfW / 2, wallH / 2 + floorY, pz + pd / 2, 2), 0xf1ede6));
    add(wallMat, tint(box(pw, wallH, 0.25, px, wallH / 2 + floorY, pz - pd / 2, 3), 0xf1ede6));
    add(wallMat, tint(box(0.25, wallH, pd, px - pw / 2, wallH / 2 + floorY, pz, 2), 0xf1ede6));
    add(wallMat, tint(box(0.25, wallH, pd, px + pw / 2, wallH / 2 + floorY, pz, 2), 0xf1ede6));

    flatRoof(px, pz, pw, pd, wallH + floorY, 0xf1ede6);

    // Croix verte lumineuse
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const F = faceOf(px, pz + pd / 2, pw, 0.3, 1);
    add(crossMat, F.put(new THREE.BoxGeometry(0.8, 0.24, 0.1), 0, wallH + 0.3, 0.1));
    add(crossMat, F.put(new THREE.BoxGeometry(0.24, 0.8, 0.1), 0, wallH + 0.3, 0.1));

    // Comptoir en verre
    add(paintMat, tint(box(3.2, 1.0, 0.65, px, floorY + 0.5, pz + 1.2, 1), 0x0284c7));
    // Armoires de médicaments au mur
    add(steelMat, box(4.0, 2.2, 0.4, px, floorY + 1.1, pz - pd / 2 + 0.3, 2));

    colliders.push({ x: px - doorW / 2 - halfW / 2, z: pz + pd / 2, hw: halfW / 2, hd: 0.3 });
    colliders.push({ x: px + doorW / 2 + halfW / 2, z: pz + pd / 2, hw: halfW / 2, hd: 0.3 });
    colliders.push({ x: px, z: pz - pd / 2, hw: pw / 2, hd: 0.3 });
    colliders.push({ x: px - pw / 2, z: pz, hw: 0.3, hd: pd / 2 });
    colliders.push({ x: px + pw / 2, z: pz, hw: 0.3, hd: pd / 2 });

    const doorX = px;
    const doorZ = pz + pd / 2 + 1.5;
    doorSpots.push({ x: doorX, z: doorZ });
    visitableBuildings.push({
      id: "pharmacy",
      name: "Pharmacie & Dispensaire de l'Espoir",
      x: px,
      z: pz,
      doorX,
      doorZ,
      bounds: { minX: px - pw / 2, maxX: px + pw / 2, minZ: pz - pd / 2, maxZ: pz + pd / 2 },
    });
  };

  // ─────────────────────────────────────────────────────────────
  //  GÉNÉRATION DES 81 BLOCS URBAINS DE BENI (9 x 9)
  // ─────────────────────────────────────────────────────────────
  const districtOf = (gx: number, gz: number): District => {
    const key = `${gx},${gz}`;
    const specials: Record<string, District> = {
      "4,4": "market",     // Grand Marché Central au cœur de la ville
      "4,3": "commercial", // Avenue du Commerce & Boutique Kivu Express
      "3,4": "admin",      // Mairie de Beni (Hôtel de Ville)
      "5,4": "fuel",       // Station Cobil & Commissariat
      "5,5": "restaurant", // Chez Mama Léontine
      "2,7": "residential",// Maison du Joueur (Masiani)
      "2,2": "hospital",   // Hôpital Général
      "6,3": "stadium",    // Stade du 15 Octobre
      "5,7": "church",     // Cathédrale Saint-Gustave
      "4,8": "campus",     // Université UCBC
      "2,5": "school",     // Institut de Beni
      "7,7": "airport",    // Aéroport de Mavivi
      "1,4": "park",       // Espace vert
      "6,1": "park",
      "1,1": "park",
    };
    if (specials[key]) return specials[key];
    const ring = Math.max(Math.abs(gx - 4), Math.abs(gz - 4));
    if (ring <= 1) return "commercial";
    if (ring === 2) return rnd() < 0.6 ? "mixed" : "residential";
    return "residential";
  };

  const inner = CELL - ROAD; // 52 - 16 = 36 m

  for (let gx = 0; gx < GRID_LINES - 1; gx++) {
    for (let gz = 0; gz < GRID_LINES - 1; gz++) {
      const cx = lineCoord(gx) + CELL / 2;
      const cz = lineCoord(gz) + CELL / 2;
      const kind = districtOf(gx, gz);

      // Trottoir d'îlot surélevé (0.3m)
      add(sidewalkMat, box(inner + 4, 0.3, inner + 4, cx, 0.15, cz, 4));

      // Arbres d'alignement tropicaux (manguiers, palmiers)
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          if (rnd() < 0.75) addTree(cx + sx * 18.2, cz + sz * 18.2, 0.95);
        }
      }

      // ── CAS SPÉCIAUX PAR DISTRICT ──

      // A. Maison du joueur (Quartier Masiani : gx 2, gz 7)
      if (gx === 2 && gz === 7) {
        buildPlayerHouse(cx, cz);
        for (let k = 0; k < 4; k++) addBanana(cx + 8, cz - 10 + k * 6);
        for (let k = 0; k < 3; k++) addTree(cx - 10, cz - 8 + k * 7, 1.1);
        continue;
      }

      // B. Restaurant Chez Mama Léontine (gx 5, gz 5)
      if (gx === 5 && gz === 5) {
        buildRestaurant(cx, cz);
        for (let k = 0; k < 3; k++) addTree(cx + 10, cz - 6 + k * 6, 1.0);
        continue;
      }

      // C. Boutique Kivu Express (gx 4, gz 3)
      if (gx === 4 && gz === 3) {
        buildShop(cx - 4, cz);
        // Autre petite quincaillerie voisine
        building({
          x: cx + 9, z: cz, w: 8, d: 9, floors: 1, color: 0xd6a06c, style: "shop", roof: "gable", front: 1,
        });
        continue;
      }

      // D. Pharmacie & Dispensaire (gx 2, gz 2)
      if (gx === 2 && gz === 2) {
        buildPharmacy(cx, cz);
        addTree(cx + 8, cz + 8, 1.2);
        continue;
      }

      // E. Station Service Cobil (gx 5, gz 4)
      if (gx === 5 && gz === 4) {
        // Grand auvent métallique au-dessus des pistes de carburant
        add(roofMetal, box(18, 0.4, 12, cx, 4.8, cz, 3));
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const pillar = new THREE.CylinderGeometry(0.3, 0.3, 4.6, 8);
            pillar.translate(cx + sx * 7.5, 2.4, cz + sz * 4.5);
            add(steelMat, pillar);
          }
        }
        // Pompes à essence (rouge/bleu Cobil)
        for (const sx of [-1, 1]) {
          add(metalMat, tint(box(1.2, 1.6, 0.8, cx + sx * 4.5, 0.9, cz, 1), 0xdc2626));
          add(metalMat, tint(box(1.2, 1.6, 0.8, cx + sx * 4.5, 0.9, cz + 2.5, 1), 0x2563eb));
        }
        // Boutique express arrière
        building({
          x: cx, z: cz - 11, w: 14, d: 8, floors: 1, color: 0xf1ede6, style: "shop", roof: "flat", front: 1,
        });
        continue;
      }

      // F. Mairie de Beni / Administration (gx 3, gz 4)
      if (gx === 3 && gz === 4) {
        // Façade imposante avec colonnes et drapeau congolais
        building({
          x: cx, z: cz - 4, w: 26, d: 14, floors: 2, color: 0xf1ede6, style: "office", roof: "flat", front: 1,
        });
        // Mât de drapeau
        const pole = new THREE.CylinderGeometry(0.08, 0.08, 9, 6);
        pole.translate(cx, 4.8, cz + 10);
        add(steelMat, pole);
        // Drapeau RDC
        add(paintMat, tint(box(1.8, 1.1, 0.04, cx + 0.9, 8.5, cz + 10, 1), 0x0284c7));
        continue;
      }

      // G. Grand Marché Central (gx 4, gz 4)
      if (kind === "market") {
        add(sidewalkMat, box(inner - 1, 0.34, inner - 1, cx, 0.2, cz, 4));
        for (let r = 0; r < 4; r++) {
          for (let k = 0; k < 6; k++) {
            const ux = cx - 13 + k * 5.2;
            const uz = cz - 11 + r * 7.4;
            umbrellas.push({ m: mat4(ux, 0, uz, rnd() * 0.6), c: new THREE.Color().setHSL(rnd(), 0.7, 0.5) });
            add(woodMat, box(2.4, 0.08, 1.2, ux, 0.95, uz + 1.1, 2));
            for (const k2 of [-1, 1]) add(woodMat, box(0.08, 0.62, 1.1, ux + k2 * 1.1, 0.62, uz + 1.1, 2));
            for (let j = 0; j < 3; j++) {
              add(paintMat, tint(box(0.65, 0.32, 0.55, ux - 0.75 + j * 0.75, 1.15, uz + 1.1, 1), pick(GOODS_COLORS)));
            }
            colliders.push({ x: ux, z: uz + 1.1, hw: 1.2, hd: 0.75 });
          }
        }
        // Hangar central en tôle
        add(roofMetal, box(16, 0.3, 8, cx, 4.4, cz, 3));
        const Fh = faceOf(cx, cz, 16, 8, 1);
        add(signMat, Fh.put(signPlane(12, 0.65, ROW_MARKET, SIGN_ROWS), 0, 4.4, 0.04));
        continue;
      }

      // H. Stade du 15 Octobre (gx 6, gz 3)
      if (kind === "stadium") {
        add(grassMat, box(26, 0.36, 20, cx, 0.2, cz, 6));
        add(lineWhite, box(26.4, 0.05, 0.2, cx, 0.4, cz - 10, 1));
        add(lineWhite, box(26.4, 0.05, 0.2, cx, 0.4, cz + 10, 1));
        add(lineWhite, box(0.2, 0.05, 20, cx, 0.4, cz, 1));
        for (const s of [-1, 1]) {
          add(wallMat, tint(box(28, 3.4, 3.2, cx, 2.0, cz + s * 13.6, 4), 0xdfe3e6));
          add(roofMetal, box(29, 0.15, 4.2, cx, 3.9, cz + s * 13.6, 3));
          colliders.push({ x: cx, z: cz + s * 13.6, hw: 14.4, hd: 2 });
        }
        continue;
      }

      // I. Cathédrale Saint-Gustave (gx 5, gz 7)
      if (kind === "church") {
        const white = 0xf1ede6;
        add(wallMat, tint(box(13, 9, 24, cx, 4.8, cz, 3.2), white));
        colliders.push({ x: cx, z: cz, hw: 7, hd: 12.5 });
        // Tour clocher
        add(wallMat, tint(box(4.2, 19, 4.2, cx - 4.5, 9.8, cz - 13.5, 3.2), white));
        colliders.push({ x: cx - 4.5, z: cz - 13.5, hw: 2.5, hd: 2.5 });
        // Croix au sommet
        add(paintMat, tint(box(0.3, 2.8, 0.3, cx - 4.5, 20.8, cz - 13.5, 1), 0xf1ede6));
        add(paintMat, tint(box(1.6, 0.3, 0.3, cx - 4.5, 21.2, cz - 13.5, 1), 0xf1ede6));
        gableRoof(cx, cz, 13, 24, 9.3, white, { pitch: 0.55, rusty: true, alongX: false });
        continue;
      }

      // J. Espace vert / Parc (gx 1, gz 4 etc)
      if (kind === "park") {
        add(grassMat, box(inner - 2, 0.34, inner - 2, cx, 0.2, cz, 6));
        for (let k = 0; k < 12; k++) {
          const tx = cx + (rnd() - 0.5) * (inner - 8);
          const tz = cz + (rnd() - 0.5) * (inner - 8);
          addTree(tx, tz, 1.25);
        }
        for (let k = 0; k < 8; k++) addBush(cx + (rnd() - 0.5) * (inner - 6), cz + (rnd() - 0.5) * (inner - 6));
        continue;
      }

      // K. Bâtiments standards (Commerces, Maisons individuelles, Bureaux)
      const isCommercial = kind === "commercial";
      if (isCommercial) {
        // Deux commerces de front
        building({
          x: cx - 7, z: cz, w: 12, d: 14, floors: 1 + Math.floor(rnd() * 2),
          color: pick(WALL_COLORS), style: "shop", roof: rnd() < 0.6 ? "gable" : "flat", front: 1,
        });
        building({
          x: cx + 7, z: cz, w: 12, d: 14, floors: 1 + Math.floor(rnd() * 2),
          color: pick(WALL_COLORS), style: "shop", roof: "gable", front: 1,
        });
      } else {
        // Maisons individuelles avec cour et bananiers
        building({
          x: cx - 6, z: cz - 4, w: 11, d: 11, floors: 1,
          color: pick(WALL_COLORS), style: "house", roof: "gable", front: 1,
        });
        building({
          x: cx + 6, z: cz + 4, w: 10, d: 10, floors: 1,
          color: pick(WALL_COLORS), style: "house", roof: "gable", front: 3,
        });
        for (let k = 0; k < 3; k++) addBanana(cx + 8, cz - 8 + k * 4);
      }
    }
  }

  // ── Instanced Meshes pour les arbres, parasols et lampadaires ──
  // Arbres
  if (trees.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 3.8, 7);
    trunkGeo.translate(0, 1.9, 0);
    const crownGeo = new THREE.SphereGeometry(2.3, 7, 6);
    crownGeo.translate(0, 4.4, 0);
    crownGeo.scale(1, 0.9, 1);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.95 });
    const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, trees.length);
    trunkInst.castShadow = true;
    crownInst.castShadow = true;

    for (let i = 0; i < trees.length; i++) {
      trunkInst.setMatrixAt(i, trees[i]);
      crownInst.setMatrixAt(i, trees[i]);
      crownInst.setColorAt(i, treeColors[i]);
    }
    scene.add(trunkInst);
    scene.add(crownInst);
  }

  // Bananiers tropicaux
  if (bananas.length > 0) {
    const bGeo = new THREE.CylinderGeometry(0.12, 0.22, 2.6, 6);
    bGeo.translate(0, 1.3, 0);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x557a2b, roughness: 0.85 });
    const bInst = new THREE.InstancedMesh(bGeo, bMat, bananas.length);
    bInst.castShadow = true;
    for (let i = 0; i < bananas.length; i++) bInst.setMatrixAt(i, bananas[i]);
    scene.add(bInst);
  }

  // Parasols de marché
  if (umbrellas.length > 0) {
    const uPole = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6);
    uPole.translate(0, 1.2, 0);
    const uCap = new THREE.ConeGeometry(1.6, 0.7, 8);
    uCap.translate(0, 2.5, 0);

    const uMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const uInst = new THREE.InstancedMesh(uCap, uMat, umbrellas.length);
    for (let i = 0; i < umbrellas.length; i++) {
      uInst.setMatrixAt(i, umbrellas[i].m);
      uInst.setColorAt(i, umbrellas[i].c);
    }
    scene.add(uInst);
  }

  // Lampadaires
  if (lamps.length > 0) {
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7.2, 6);
    poleGeo.translate(0, 3.6, 0);
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 1.8);
    armGeo.translate(0, 7.2, 0.9);
    const headGeo = new THREE.BoxGeometry(0.4, 0.15, 0.6);
    headGeo.translate(0, 7.1, 1.7);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.4 });
    const lampInst = new THREE.InstancedMesh(poleGeo, poleMat, lamps.length);
    const headInst = new THREE.InstancedMesh(headGeo, lampMaterial, lamps.length);

    for (let i = 0; i < lamps.length; i++) {
      lampInst.setMatrixAt(i, lamps[i]);
      headInst.setMatrixAt(i, lamps[i]);
    }
    scene.add(lampInst);
    scene.add(headInst);
  }

  // ── Fusion des géométries statiques en maillages groupés par matériau ──
  const facadeMaterials: THREE.MeshStandardMaterial[] = [glassLit, signMat];
  const roadMaterials: THREE.MeshStandardMaterial[] = [asphaltMat, sidewalkMat];

  for (const [mat, geos] of buckets) {
    if (!geos.length) continue;
    // BufferGeometryUtils.mergeGeometries
    const merged = mergeBufferGeometries(geos);
    if (merged) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      if (mat !== asphaltMat && mat !== dirtMat && mat !== grassMat && mat !== sidewalkMat) {
        mesh.castShadow = true;
      }
      scene.add(mesh);
    }
  }

  return {
    colliders,
    lampMaterial,
    lampGlowMaterial,
    facadeMaterials,
    roadMaterials,
    shopFronts,
    doorSpots,
    visitableBuildings,
  };
}

// Fonction de fusion de géométries sans dépendance externe
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geometries.length === 0) return null;
  if (geometries.length === 1) return geometries[0];

  let totalPos = 0;
  let totalNorm = 0;
  let totalUv = 0;
  let totalCol = 0;
  let totalIdx = 0;
  let hasCol = false;

  for (const g of geometries) {
    totalPos += g.attributes.position ? g.attributes.position.count * 3 : 0;
    totalNorm += g.attributes.normal ? g.attributes.normal.count * 3 : 0;
    totalUv += g.attributes.uv ? g.attributes.uv.count * 2 : 0;
    if (g.attributes.color) {
      hasCol = true;
      totalCol += g.attributes.color.count * 3;
    }
    totalIdx += g.index ? g.index.count : 0;
  }

  const mergedPos = new Float32Array(totalPos);
  const mergedNorm = totalNorm > 0 ? new Float32Array(totalNorm) : null;
  const mergedUv = totalUv > 0 ? new Float32Array(totalUv) : null;
  const mergedCol = hasCol ? new Float32Array(totalPos) : null;
  const mergedIdx = totalIdx > 0 ? new Uint32Array(totalIdx) : null;

  let posOff = 0;
  let normOff = 0;
  let uvOff = 0;
  let colOff = 0;
  let idxOff = 0;
  let vertBase = 0;

  for (const g of geometries) {
    const pos = g.attributes.position;
    if (pos) {
      mergedPos.set(pos.array, posOff);
      posOff += pos.array.length;
    }
    const norm = g.attributes.normal;
    if (norm && mergedNorm) {
      mergedNorm.set(norm.array, normOff);
      normOff += norm.array.length;
    }
    const uv = g.attributes.uv;
    if (uv && mergedUv) {
      mergedUv.set(uv.array, uvOff);
      uvOff += uv.array.length;
    }
    const col = g.attributes.color;
    if (mergedCol) {
      if (col) {
        mergedCol.set(col.array, colOff);
        colOff += col.array.length;
      } else {
        const cnt = pos.count * 3;
        mergedCol.fill(1.0, colOff, colOff + cnt);
        colOff += cnt;
      }
    }
    if (g.index && mergedIdx) {
      const idxArr = g.index.array;
      for (let i = 0; i < idxArr.length; i++) {
        mergedIdx[idxOff + i] = idxArr[i] + vertBase;
      }
      idxOff += idxArr.length;
    }
    vertBase += pos.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(mergedPos, 3));
  if (mergedNorm) out.setAttribute("normal", new THREE.BufferAttribute(mergedNorm, 3));
  if (mergedUv) out.setAttribute("uv", new THREE.BufferAttribute(mergedUv, 2));
  if (mergedCol) out.setAttribute("color", new THREE.BufferAttribute(mergedCol, 3));
  if (mergedIdx) out.setIndex(new THREE.BufferAttribute(mergedIdx, 1));

  return out;
}
