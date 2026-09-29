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
import { houseManager } from "./houseManager";

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
  | "center"
  | "popular"
  | "mixed"
  | "residential"
  | "peripheral"
  | "industrial"
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
  add(dirtMat, plane(WORLD + 600, WORLD + 600, 0, -0.03, 0, 16));

  // ── Réseau routier hiérarchisé ──
  // Axes principaux asphaltés (Boulevard Nyamwisi, Route Nationale 2) vs axes secondaires et pistes
  for (let i = 0; i < GRID_LINES; i++) {
    const c = lineCoord(i);
    // Boulevards centraux asphaltés (indices 7, 8) et grandes avenues (4, 11)
    const isMainBoulevard = i === 7 || i === 8;
    const isSecondaryAvenue = i === 4 || i === 11;
    const isAsphalt = isMainBoulevard || isSecondaryAvenue || i % 2 === 0;
    const roadSurface = isAsphalt ? asphaltMat : dirtMat;

    add(roadSurface, plane(WORLD + ROAD, ROAD, 0, 0.01, c, 12));
    for (let j = -1; j < GRID_LINES; j++) {
      const z0 = j < 0 ? -HALF - ROAD / 2 : lineCoord(j) + ROAD / 2;
      const z1 = j + 1 >= GRID_LINES ? HALF + ROAD / 2 : lineCoord(j + 1) - ROAD / 2;
      if (z1 - z0 < 0.5) continue;
      add(roadSurface, plane(ROAD, z1 - z0, c, 0.01, (z0 + z1) / 2, 12));
    }
  }

  // Marquages routiers sur les boulevards et avenues asphaltés
  for (let i = 0; i < GRID_LINES; i++) {
    const isMainBoulevard = i === 7 || i === 8;
    const isSecondaryAvenue = i === 4 || i === 11;
    const isAsphalt = isMainBoulevard || isSecondaryAvenue || i % 2 === 0;
    if (!isAsphalt) continue;

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

  // 1. MAISON DU JOUEUR (Quartier Masiani) — Salon, Cuisine, Salle à Manger, Chambre, Salle de bain & Cour
  const buildPlayerHouse = (hx: number, hz: number) => {
    const hw = 13.0;
    const hd = 10.0;
    const wallH = 3.2;
    const wallThick = 0.28;
    const floorY = 0.2;

    // Initialisation du manager d'interactions maison
    houseManager.initHouseCoordinates(hx, hz);

    // ── SOL CARRELÉ INTÉRIEUR ──
    add(floorTileMat, box(hw, 0.2, hd, hx, floorY, hz, 3));

    // ── MURS EXTÉRIEURS AVEC ÉPAISSEUR RÉELLE & FENÊTRES ──
    const doorW = 1.25;
    const frontHalf = (hw - doorW) / 2;
    // Façade Sud (côté entrée) avec soubassement foncé et enduit ocre sable
    add(wallMat, tint(box(frontHalf, wallH, wallThick, hx - doorW / 2 - frontHalf / 2, wallH / 2 + floorY, hz + hd / 2, 2), 0xebdaa8));
    add(wallMat, tint(box(frontHalf, wallH, wallThick, hx + doorW / 2 + frontHalf / 2, wallH / 2 + floorY, hz + hd / 2, 2), 0xebdaa8));
    // Soubassement de protection anti-pluie
    add(wallMat, tint(box(hw + 0.1, 0.45, wallThick + 0.04, hx, 0.45 / 2 + floorY, hz + hd / 2, 1), 0x4a3b32));
    // Linteau au-dessus de la porte
    add(wallMat, tint(box(doorW, wallH - 2.2, wallThick, hx, 2.2 + (wallH - 2.2) / 2 + floorY, hz + hd / 2, 1), 0xebdaa8));

    // Fenêtre Sud du salon avec cadre bois et vitre
    add(woodMat, box(1.4, 1.2, 0.08, hx - 3.8, floorY + 1.6, hz + hd / 2, 1));
    add(glassMat, box(1.2, 1.0, 0.03, hx - 3.8, floorY + 1.6, hz + hd / 2, 1));
    // Rideau wax intérieur
    add(paintMat, tint(box(0.25, 1.1, 0.04, hx - 4.45, floorY + 1.6, hz + hd / 2 - 0.1, 1), 0xd97706));
    add(paintMat, tint(box(0.25, 1.1, 0.04, hx - 3.15, floorY + 1.6, hz + hd / 2 - 0.1, 1), 0xd97706));

    // Porte d'entrée interactive en bois massif avec poignée
    const frontHinge = new THREE.Group();
    frontHinge.position.set(hx - doorW / 2 + 0.05, floorY + 0.1, hz + hd / 2);
    const frontDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.05, 2.15, 0.06), woodMat);
    frontDoorMesh.position.set((doorW - 0.05) / 2, 2.15 / 2, 0);
    frontDoorMesh.castShadow = true;
    frontHinge.add(frontDoorMesh);
    // Poignée métallique
    const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.08), steelMat);
    doorHandle.position.set((doorW - 0.05) * 0.85, 1.05, 0.04);
    frontHinge.add(doorHandle);
    scene.add(frontHinge);
    houseManager.frontDoorGroup = frontHinge;

    // Auvent protecteur au-dessus du porche d'entrée
    add(roofRust, box(doorW + 0.8, 0.06, 1.2, hx, floorY + 2.45, hz + hd / 2 + 0.6, 1));
    // Deux poteaux en bois pour l'auvent
    for (const sx of [-1, 1]) {
      add(woodMat, box(0.12, 2.4, 0.12, hx + sx * (doorW / 2 + 0.35), floorY + 1.2, hz + hd / 2 + 1.15, 1));
    }
    // Lanterne extérieure au-dessus de la porte
    add(metalMat, tint(box(0.18, 0.25, 0.15, hx + doorW / 2 + 0.25, floorY + 2.0, hz + hd / 2 + 0.1, 1), 0x0f172a));

    // Mur arrière Nord plein avec fenêtre chambre et salle de bain
    add(wallMat, tint(box(hw, wallH, wallThick, hx, wallH / 2 + floorY, hz - hd / 2, 3), 0xebdaa8));
    add(wallMat, tint(box(hw + 0.1, 0.45, wallThick + 0.04, hx, 0.45 / 2 + floorY, hz - hd / 2, 1), 0x4a3b32));
    // Fenêtre chambre Nord
    add(woodMat, box(1.3, 1.1, 0.08, hx - 3.8, floorY + 1.6, hz - hd / 2, 1));
    add(glassMat, box(1.1, 0.9, 0.03, hx - 3.8, floorY + 1.6, hz - hd / 2, 1));
    // Fenêtre salle de bain Nord (verre dépoli)
    add(woodMat, box(0.75, 0.65, 0.08, hx + 3.8, floorY + 2.0, hz - hd / 2, 1));
    add(glassMat, box(0.65, 0.55, 0.03, hx + 3.8, floorY + 2.0, hz - hd / 2, 1));

    // Mur Est avec fenêtre de cuisine
    add(wallMat, tint(box(wallThick, wallH, hd, hx + hw / 2, wallH / 2 + floorY, hz, 3), 0xebdaa8));
    add(wallMat, tint(box(wallThick + 0.04, 0.45, hd + 0.1, hx + hw / 2, 0.45 / 2 + floorY, hz, 1), 0x4a3b32));
    add(woodMat, box(0.08, 1.1, 1.4, hx + hw / 2, floorY + 1.6, hz + 2.5, 1));
    add(glassMat, box(0.03, 0.9, 1.2, hx + hw / 2, floorY + 1.6, hz + 2.5, 1));

    // Mur Ouest avec fenêtre de salon
    add(wallMat, tint(box(wallThick, wallH, hd, hx - hw / 2, wallH / 2 + floorY, hz, 3), 0xebdaa8));
    add(wallMat, tint(box(wallThick + 0.04, 0.45, hd + 0.1, hx - hw / 2, 0.45 / 2 + floorY, hz, 1), 0x4a3b32));
    add(woodMat, box(0.08, 1.1, 1.4, hx - hw / 2, floorY + 1.6, hz + 2.5, 1));
    add(glassMat, box(0.03, 0.9, 1.2, hx - hw / 2, floorY + 1.6, hz + 2.5, 1));

    // ── CLOISONS INTÉRIEURES RÉALISTES AVEC PORTES LARGES (1.4m D'OUVERTURE) ──
    // 1. Cloison Ouest (chambre, à gauche de la porte)
    add(wallMat, tint(box(4.0, wallH, wallThick, hx - 4.5, wallH / 2 + floorY, hz, 2), 0xf6f3ed));
    // Linteau au-dessus de la porte de chambre
    add(wallMat, tint(box(1.4, wallH - 2.15, wallThick, hx - 1.8, 2.15 + (wallH - 2.15) / 2 + floorY, hz, 1), 0xf6f3ed));
    // 2. Cloison centrale entre les deux portes
    add(wallMat, tint(box(2.2, wallH, wallThick, hx, wallH / 2 + floorY, hz, 2), 0xf6f3ed));
    // Linteau au-dessus de la porte de salle de bain
    add(wallMat, tint(box(1.4, wallH - 2.15, wallThick, hx + 1.8, 2.15 + (wallH - 2.15) / 2 + floorY, hz, 1), 0xf6f3ed));
    // 3. Cloison Est (salle de bain, à droite de la porte)
    add(wallMat, tint(box(4.0, wallH, wallThick, hx + 4.5, wallH / 2 + floorY, hz, 2), 0xf6f3ed));
    // 4. Cloison Nord-Sud séparant Chambre et Salle de bain
    const divWallLen = hd / 2 - wallThick / 2;
    add(wallMat, tint(box(wallThick, wallH, divWallLen, hx, wallH / 2 + floorY, hz - divWallLen / 2 - wallThick / 4, 2), 0xf6f3ed));

    // Portes intérieures pivotantes en bois (battants larges 1.3m s'ouvrant contre les murs)
    const bedHinge = new THREE.Group();
    bedHinge.position.set(hx - 2.45, floorY + 0.1, hz);
    const bedDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.15, 0.05), woodMat);
    bedDoorMesh.position.set(1.3 / 2, 2.15 / 2, 0);
    bedHinge.add(bedDoorMesh);
    scene.add(bedHinge);
    houseManager.bedroomDoorGroup = bedHinge;

    const bathHinge = new THREE.Group();
    bathHinge.position.set(hx + 2.45, floorY + 0.1, hz);
    const bathDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.15, 0.05), woodMat);
    bathDoorMesh.position.set(-1.3 / 2, 2.15 / 2, 0);
    bathHinge.add(bathDoorMesh);
    scene.add(bathHinge);
    houseManager.bathroomDoorGroup = bathHinge;

    // ── TOITURE EN TÔLE ONDULÉE AVEC GROUPE DYNAMIQUE VISIBLE / CACHÉ ──
    const houseRoofGroup = new THREE.Group();
    const span = hd;
    const len = hw;
    const pitch = 0.42;
    const rH = (span / 2) * pitch;
    const over = 0.65;
    const slopeLen = Math.hypot(span / 2 + over, rH);
    const ang = Math.atan2(rH, span / 2);
    for (const side of [-1, 1]) {
      const rGeo = new THREE.BoxGeometry(len + over * 2, 0.08, slopeLen);
      const rMesh = new THREE.Mesh(rGeo, roofRust);
      rMesh.rotation.x = side * ang;
      rMesh.position.set(hx, wallH + floorY + rH / 2 + 0.1, hz + (side * span) / 4);
      rMesh.castShadow = true;
      rMesh.receiveShadow = true;
      houseRoofGroup.add(rMesh);
    }
    // Pignons triangulaires en tôle peinte
    const gableGeo = new THREE.ConeGeometry(span / 2, rH, 4);
    const gableMesh = new THREE.Mesh(gableGeo, wallMat);
    gableMesh.scale.set(0.1, 1, 1);
    gableMesh.rotation.y = Math.PI / 4;
    gableMesh.position.set(hx + len / 2, wallH + floorY + rH / 2, hz);
    houseRoofGroup.add(gableMesh);
    scene.add(houseRoofGroup);
    houseManager.roofGroup = houseRoofGroup;

    // ── SALON (Sud-Ouest) : HABITÉ & CHALEUREUX ──
    // Grand canapé 3 places royal blue
    const sofaHex = 0x1d4ed8;
    add(paintMat, tint(box(2.5, 0.45, 0.95, hx - 3.8, floorY + 0.25, hz + 2.8, 1), sofaHex));
    add(paintMat, tint(box(2.5, 0.55, 0.24, hx - 3.8, floorY + 0.65, hz + 3.25, 1), sofaHex));
    // Coussins décoratifs colorés (wax jaune & vert émeraude)
    add(paintMat, tint(box(0.42, 0.38, 0.14, hx - 4.6, floorY + 0.58, hz + 3.05, 1), 0xf59e0b));
    add(paintMat, tint(box(0.42, 0.38, 0.14, hx - 3.8, floorY + 0.58, hz + 3.05, 1), 0x10b981));
    add(paintMat, tint(box(0.42, 0.38, 0.14, hx - 3.0, floorY + 0.58, hz + 3.05, 1), 0xef4444));
    // 2 Fauteuils individuels
    for (const [fx, frot] of [[hx - 2.1, -0.3], [hx - 5.5, 0.3]]) {
      add(paintMat, tint(box(0.9, 0.45, 0.85, fx, floorY + 0.25, hz + 1.8, 1, frot), 0x1e40af));
      add(paintMat, tint(box(0.9, 0.55, 0.18, fx, floorY + 0.65, hz + 2.15, 1, frot), 0x1e40af));
    }
    // Table basse en bois avec accessoires
    add(woodMat, box(1.5, 0.4, 0.8, hx - 3.8, floorY + 0.2, hz + 1.5, 1));
    // Livre et télécommande sur la table basse
    add(paintMat, tint(box(0.3, 0.04, 0.22, hx - 3.9, floorY + 0.42, hz + 1.45, 1), 0x0284c7));
    add(metalMat, tint(box(0.08, 0.02, 0.2, hx - 3.4, floorY + 0.42, hz + 1.5, 1), 0x0f172a));
    // Tapis de salon à motifs géométriques
    add(paintMat, tint(box(3.2, 0.02, 2.4, hx - 3.8, floorY + 0.02, hz + 2.2, 1), 0x9a3412));

    // Meuble TV en bois avec étagères
    add(woodMat, box(2.2, 0.58, 0.52, hx - 5.5, floorY + 0.3, hz + 1.4, 1, Math.PI / 2));
    // Cadre TV moderne
    add(metalMat, tint(box(1.35, 0.85, 0.08, hx - 5.5, floorY + 1.0, hz + 1.4, 1, Math.PI / 2), 0x020617));
    // Écran TV dynamique animé (CanvasTexture)
    const tvScreenGeo = new THREE.PlaneGeometry(1.24, 0.74);
    const tvScreenMat = new THREE.MeshBasicMaterial({ map: houseManager.tv.texture, toneMapped: false });
    const tvScreenMesh = new THREE.Mesh(tvScreenGeo, tvScreenMat);
    tvScreenMesh.position.set(hx - 5.45, floorY + 1.0, hz + 1.4);
    tvScreenMesh.rotation.y = Math.PI / 2;
    scene.add(tvScreenMesh);
    houseManager.tvScreenMesh = tvScreenMesh;

    // Décorations murales : Tableau paysage volcanique
    add(woodMat, box(1.2, 0.75, 0.04, hx - 3.8, floorY + 2.1, hz + hd / 2 - 0.05, 1));
    add(paintMat, tint(box(1.1, 0.65, 0.02, hx - 3.8, floorY + 2.1, hz + hd / 2 - 0.07, 1), 0x047857));
    // Horloge murale
    const clockCyl = new THREE.CylinderGeometry(0.24, 0.24, 0.04, 12);
    clockCyl.rotateX(Math.PI / 2);
    clockCyl.translate(hx - 1.8, floorY + 2.2, hz + hd / 2 - 0.06);
    add(paintMat, tint(clockCyl, 0xf8fafc));
    // Plante verte d'intérieur en pot
    const potCyl = new THREE.CylinderGeometry(0.25, 0.18, 0.45, 8);
    potCyl.translate(hx - 5.7, floorY + 0.25, hz + 3.8);
    add(paintMat, tint(potCyl, 0xb45309));
    for (let l = 0; l < 4; l++) {
      const leafGeo = new THREE.ConeGeometry(0.12, 0.5, 5);
      leafGeo.rotateZ(0.4 * (l % 2 === 0 ? 1 : -1));
      leafGeo.translate(hx - 5.7, floorY + 0.6, hz + 3.8);
      add(grassMat, leafGeo);
    }

    // ── ENTRÉE : DÉTAILS DE VIE DU QUOTIDIEN ──
    // Paire de babouches/sandales près de la porte d'entrée
    for (const [bx, bz] of [[hx - 0.4, hz + 4.3], [hx - 0.15, hz + 4.3]]) {
      add(paintMat, tint(box(0.14, 0.04, 0.3, bx, floorY + 0.03, bz, 1), 0x475569));
    }
    // Interrupteur mural blanc à l'entrée
    add(paintMat, tint(box(0.1, 0.14, 0.03, hx - 0.5, floorY + 1.25, hz + hd / 2 - 0.03, 1), 0xf8fafc));
    // Porte-manteau mural avec casquette et veste
    add(woodMat, box(0.8, 0.12, 0.05, hx - 1.2, floorY + 1.7, hz + hd / 2 - 0.04, 1));
    add(paintMat, tint(box(0.35, 0.55, 0.12, hx - 1.2, floorY + 1.45, hz + hd / 2 - 0.08, 1), 0x0284c7));

    // ── CUISINE RÉALISTE & FONCTIONNELLE (Sud-Est) ──
    // Bloc de cuisine en L avec plan de travail granit
    add(roofConcrete, box(2.6, 0.88, 0.75, hx + 4.2, floorY + 0.45, hz + 1.6, 1, Math.PI / 2));
    add(woodMat, box(2.6, 0.82, 0.72, hx + 4.2, floorY + 0.42, hz + 1.6, 1, Math.PI / 2));

    // Évier inox encastré et robinet chrome
    add(steelMat, box(0.7, 0.1, 0.45, hx + 4.2, floorY + 0.85, hz + 1.6, 1));
    const tapGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6);
    tapGeo.translate(hx + 4.2, floorY + 1.0, hz + 1.6);
    add(steelMat, tapGeo);
    // Filet d'eau animé
    const waterGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6);
    const waterMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.set(hx + 4.2, floorY + 0.68, hz + 1.6);
    waterMesh.visible = false;
    scene.add(waterMesh);
    houseManager.waterStreamMesh = waterMesh;

    // Cuisinière à gaz avec réchaud et bouteille bleue
    const gasBot = new THREE.CylinderGeometry(0.22, 0.22, 0.58, 8);
    gasBot.translate(hx + 3.4, floorY + 0.3, hz + 1.15);
    add(paintMat, tint(gasBot, 0x0284c7));
    // Réchaud à 2 feux
    add(metalMat, tint(box(0.7, 0.12, 0.45, hx + 3.4, floorY + 0.88, hz + 1.15, 1), 0x1e293b));
    // Four encastré sous la cuisinière avec vitre noire et poignée inox
    add(metalMat, tint(box(0.68, 0.55, 0.45, hx + 3.4, floorY + 0.42, hz + 1.15, 1), 0x0f172a));
    add(glassMat, tint(box(0.52, 0.35, 0.02, hx + 3.4, floorY + 0.42, hz + 1.15 + 0.23, 1), 0x000000));
    add(steelMat, box(0.42, 0.03, 0.04, hx + 3.4, floorY + 0.62, hz + 1.15 + 0.25, 1));
    // Casserole et poêle
    const potGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.15, 8);
    potGeo.translate(hx + 3.25, floorY + 0.98, hz + 1.15);
    add(metalMat, potGeo);
    const panGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 8);
    panGeo.translate(hx + 3.55, floorY + 0.93, hz + 1.15);
    add(metalMat, panGeo);
    // Flamme de cuisson animée
    const flameGeo = new THREE.ConeGeometry(0.09, 0.18, 6);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const flameMesh = new THREE.Mesh(flameGeo, flameMat);
    flameMesh.position.set(hx + 3.25, floorY + 0.92, hz + 1.15);
    flameMesh.visible = false;
    scene.add(flameMesh);
    houseManager.stoveFlameMesh = flameMesh;

    // Placards hauts suspendus au-dessus de la cuisine
    add(woodMat, box(2.4, 0.65, 0.35, hx + 4.2, floorY + 2.2, hz + 1.6, 1, Math.PI / 2));
    // Bouteille d'huile de palme rouge et sac de farine sur le plan de travail
    const oilBot = new THREE.CylinderGeometry(0.04, 0.05, 0.25, 6);
    oilBot.translate(hx + 4.2, floorY + 0.98, hz + 1.1);
    add(paintMat, tint(oilBot, 0xd97706));
    add(paintMat, tint(box(0.2, 0.26, 0.15, hx + 4.2, floorY + 0.98, hz + 0.8, 1), 0xfef08a));

    // Réfrigérateur moderne blanc avec porte pivotante
    add(paintMat, tint(box(0.9, 1.82, 0.85, hx + 5.5, floorY + 0.91, hz + 3.4, 1), 0xf8fafc));
    const fridgeDoorGroup = new THREE.Group();
    fridgeDoorGroup.position.set(hx + 5.05, floorY + 0.91, hz + 3.82);
    const fridgeDoorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 1.78, 0.82),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
    );
    fridgeDoorMesh.position.set(0, 0, -0.41);
    fridgeDoorGroup.add(fridgeDoorMesh);
    const fridgeHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.45, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7 })
    );
    fridgeHandle.position.set(-0.04, 0.15, -0.75);
    fridgeDoorGroup.add(fridgeHandle);
    scene.add(fridgeDoorGroup);
    houseManager.fridgeDoorGroup = fridgeDoorGroup;

    // Étagère à épices murale & corbeille de bananes/makemba
    add(woodMat, box(1.2, 0.06, 0.22, hx + 4.2, floorY + 1.7, hz + 1.6, 1, Math.PI / 2));
    const basketGeo = new THREE.CylinderGeometry(0.24, 0.16, 0.14, 8);
    basketGeo.translate(hx + 4.2, floorY + 0.96, hz + 2.2);
    add(woodMat, basketGeo);
    // Bananes plantains
    for (let b = 0; b < 3; b++) {
      const bGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.24, 5);
      bGeo.rotateZ(0.6 + b * 0.2);
      bGeo.translate(hx + 4.2, floorY + 1.05, hz + 2.2 + (b - 1) * 0.08);
      add(paintMat, tint(bGeo, 0xeab308));
    }
    // Poubelle à pédale
    const binGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.45, 8);
    binGeo.translate(hx + 5.8, floorY + 0.25, hz + 2.2);
    add(steelMat, binGeo);

    // ── SALLE À MANGER (Sud-Est) : TABLE FAMILIALE & CHAISES ──
    add(woodMat, box(1.7, 0.78, 1.25, hx + 2.4, floorY + 0.39, hz + 3.6, 1));
    for (const [dx, dz] of [[-0.95, 0], [0.95, 0], [0, -0.75], [0, 0.75]]) {
      add(woodMat, box(0.42, 0.45, 0.42, hx + 2.4 + dx, floorY + 0.23, hz + 3.6 + dz, 1));
      add(woodMat, box(0.42, 0.55, 0.06, hx + 2.4 + dx, floorY + 0.68, hz + 3.6 + dz + (dz === 0 ? 0.2 : 0), 1));
    }
    // Vaisselle : 4 Assiettes et verres
    for (const [ax, az] of [[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]]) {
      add(paintMat, tint(box(0.28, 0.03, 0.28, hx + 2.4 + ax, floorY + 0.8, hz + 3.6 + az, 1), 0xf8fafc));
      const cupCyl = new THREE.CylinderGeometry(0.04, 0.035, 0.12, 6);
      cupCyl.translate(hx + 2.4 + ax + 0.2, floorY + 0.85, hz + 3.6 + az);
      add(glassMat, cupCyl);
    }
    // Carafe d'eau en verre au centre de la table
    const jugGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.24, 8);
    jugGeo.translate(hx + 2.4, floorY + 0.9, hz + 3.6);
    add(glassMat, jugGeo);

    // ── CHAMBRE (Nord-Ouest) : GRAND LIT, MOUSTIQUAIRE & ARMOIRE ──
    // Grand tapis au pied du lit
    add(paintMat, tint(box(2.2, 0.02, 1.3, hx - 4.2, floorY + 0.02, hz - 1.8, 1), 0x7c3aed));
    // Cadre de lit en bois massif
    add(woodMat, box(2.2, 0.45, 1.8, hx - 4.2, floorY + 0.23, hz - 3.2, 1));
    // Tête de lit en bois sculpté
    add(woodMat, box(2.2, 1.1, 0.08, hx - 4.2, floorY + 0.75, hz - 4.15, 1));
    // Matelas confortable avec couverture wax colorée
    add(paintMat, tint(box(2.05, 0.22, 1.65, hx - 4.2, floorY + 0.48, hz - 3.2, 1), 0xb45309));
    // Deux oreillers blancs
    add(paintMat, tint(box(0.7, 0.12, 0.45, hx - 4.8, floorY + 0.62, hz - 3.8, 1), 0xf8fafc));
    add(paintMat, tint(box(0.7, 0.12, 0.45, hx - 3.6, floorY + 0.62, hz - 3.8, 1), 0xf8fafc));
    // Cadre à 4 montants pour moustiquaire
    for (const [cx, cz] of [[-1.05, -0.85], [1.05, -0.85], [-1.05, 0.85], [1.05, 0.85]]) {
      add(steelMat, box(0.04, 2.3, 0.04, hx - 4.2 + cx, floorY + 1.15, hz - 3.2 + cz, 1));
    }
    // Barres transversales de moustiquaire
    add(steelMat, box(2.14, 0.03, 1.74, hx - 4.2, floorY + 2.3, hz - 3.2, 1));
    // Table de nuit et lampe de chevet
    add(woodMat, box(0.55, 0.55, 0.55, hx - 2.8, floorY + 0.28, hz - 4.1, 1));
    const lampBase = new THREE.CylinderGeometry(0.1, 0.14, 0.25, 8);
    lampBase.translate(hx - 2.8, floorY + 0.68, hz - 4.1);
    add(woodMat, lampBase);
    const lampShade = new THREE.ConeGeometry(0.18, 0.2, 8);
    lampShade.translate(hx - 2.8, floorY + 0.85, hz - 4.1);
    add(paintMat, tint(lampShade, 0xfef08a));
    // Grande armoire à double porte pour les vêtements
    add(woodMat, box(1.4, 2.1, 0.65, hx - 1.2, floorY + 1.05, hz - 4.1, 1));
    for (const sx of [-0.2, 0.2]) {
      add(metalMat, tint(box(0.03, 0.2, 0.03, hx - 1.2 + sx, floorY + 1.1, hz - 3.75, 1), 0x94a3b8));
    }

    // ── SALLE DE BAIN (Nord-Est) : DOUCHE ITALIENNE, LAVABO & WC ──
    // Receveur de douche antidérapant
    add(paintMat, tint(box(1.4, 0.12, 1.4, hx + 4.8, floorY + 0.08, hz - 3.8, 1), 0x0284c7));
    // Cloison vitrée de douche
    add(glassMat, box(0.05, 2.1, 1.2, hx + 4.1, floorY + 1.05, hz - 3.8, 1));
    // Colonne de douche et pommeau chrome
    const showerPipe = new THREE.CylinderGeometry(0.02, 0.02, 1.9, 6);
    showerPipe.translate(hx + 5.3, floorY + 1.25, hz - 3.8);
    add(steelMat, showerPipe);
    const showerHead = new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8);
    showerHead.translate(hx + 5.15, floorY + 2.15, hz - 3.8);
    add(steelMat, showerHead);
    // Jet d'eau animé de douche
    const sprayGeo = new THREE.ConeGeometry(0.3, 0.85, 8);
    const sprayMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.65 });
    const sprayMesh = new THREE.Mesh(sprayGeo, sprayMat);
    sprayMesh.position.set(hx + 5.15, floorY + 1.7, hz - 3.8);
    sprayMesh.rotation.x = Math.PI;
    sprayMesh.visible = false;
    scene.add(sprayMesh);
    houseManager.showerSprayMesh = sprayMesh;

    // Meuble lavabo céramique et miroir
    add(paintMat, tint(box(0.7, 0.8, 0.5, hx + 2.2, floorY + 0.4, hz - 4.4, 1), 0xf8fafc));
    add(woodMat, box(0.72, 0.92, 0.03, hx + 2.2, floorY + 1.35, hz - 4.5, 1));
    add(glassMat, tint(box(0.65, 0.85, 0.04, hx + 2.2, floorY + 1.35, hz - 4.48, 1), 0x93c5fd));
    // Tapis de bain moelleux devant la douche
    add(paintMat, tint(box(1.0, 0.02, 0.65, hx + 3.2, floorY + 0.02, hz - 3.8, 1), 0x0284c7));
    // Porte-serviette et serviette bleue
    add(steelMat, box(0.6, 0.04, 0.08, hx + 1.4, floorY + 1.2, hz - 4.48, 1));
    add(paintMat, tint(box(0.45, 0.65, 0.06, hx + 1.4, floorY + 0.95, hz - 4.45, 1), 0x0284c7));

    // Toilettes modernes avec réservoir (adossées au mur séparateur pour dégager l'accès)
    add(paintMat, tint(box(0.58, 0.45, 0.48, hx + 0.65, floorY + 0.23, hz - 2.5, 1), 0xf8fafc));
    add(paintMat, tint(box(0.24, 0.48, 0.48, hx + 0.35, floorY + 0.68, hz - 2.5, 1), 0xf8fafc));

    // ── ÉCLAIRAGE INTÉRIEUR AMBIANT (PLAFONNIER) ──
    const ceilingLight = new THREE.PointLight(0xfff5ea, 1.5, 20);
    ceilingLight.position.set(hx, floorY + 2.9, hz);
    scene.add(ceilingLight);
    houseManager.ceilingLight = ceilingLight;

    // ── EXTÉRIEUR DE LA MAISON : CLÔTURE, COUR, BANANIERS & ABRI VÉHICULE ──
    // Cour pavée en pierre naturelle menant au porche
    add(sidewalkMat, box(2.4, 0.08, 6.0, hx, floorY - 0.05, hz + 7.5, 1));
    // Muret d'enceinte / clôture de la parcelle
    add(wallMat, tint(box(18.0, 1.4, 0.2, hx + 1.0, 0.7, hz + 10.5, 1), 0x64748b));
    add(wallMat, tint(box(0.2, 1.4, 16.0, hx - 8.0, 0.7, hz + 2.5, 1), 0x64748b));
    add(wallMat, tint(box(0.2, 1.4, 16.0, hx + 10.0, 0.7, hz + 2.5, 1), 0x64748b));
    // Piliers de portail d'entrée
    for (const px of [hx - 2.0, hx + 2.0]) {
      add(wallMat, tint(box(0.6, 1.9, 0.6, px, 0.95, hz + 10.5, 1), 0x334155));
    }
    // Portail métallique ouvert
    add(steelMat, box(1.8, 1.6, 0.06, hx - 2.9, 0.85, hz + 10.5, 1, 0.4));

    // Abri véhicule / Carport avec toit en tôle ondulée
    const carX = hx + 8.2;
    const carZ = hz + 5.5;
    for (const [cx, cz] of [[-1.8, -2.0], [1.8, -2.0], [-1.8, 2.0], [1.8, 2.0]]) {
      add(woodMat, box(0.16, 2.8, 0.16, carX + cx, floorY + 1.4, carZ + cz, 1));
    }
    add(roofRust, box(4.2, 0.08, 4.6, carX, floorY + 2.85, carZ, 1, 0.08));
    // Sol de stationnement cimenté
    add(sidewalkMat, box(4.0, 0.12, 4.4, carX, floorY - 0.04, carZ, 1));

    // Végétation : Bananiers dans la cour et bougainvillier
    addBanana(hx - 5.5, hz + 8.5);
    addBanana(hx - 6.2, hz + 6.8);
    addBanana(hx - 4.8, hz + 5.5);
    addTree(hx + 8.5, hz - 2.5, 1.15);

    // ── COLLISIONS PHYSIQUES RÉALISTES ──
    // Murs extérieurs (avec demi-épaisseur exacte wallThick / 2 = 0.14)
    colliders.push({ x: hx - doorW / 2 - frontHalf / 2, z: hz + hd / 2, hw: frontHalf / 2, hd: wallThick / 2 });
    colliders.push({ x: hx + doorW / 2 + frontHalf / 2, z: hz + hd / 2, hw: frontHalf / 2, hd: wallThick / 2 });
    colliders.push({ x: hx, z: hz - hd / 2, hw: hw / 2, hd: wallThick / 2 });
    colliders.push({ x: hx + hw / 2, z: hz, hw: wallThick / 2, hd: hd / 2 });
    colliders.push({ x: hx - hw / 2, z: hz, hw: wallThick / 2, hd: hd / 2 });

    // Cloisons intérieures avec passages de porte spacieux (1.4m d'ouverture)
    // 1. Cloison Ouest (chambre, à gauche de la porte)
    colliders.push({ x: hx - 4.5, z: hz, hw: 2.0, hd: wallThick / 2 });
    // 2. Cloison centrale (entre chambre et salle de bain)
    colliders.push({ x: hx, z: hz, hw: 1.1, hd: wallThick / 2 });
    // 3. Cloison Est (salle de bain, à droite de la porte)
    colliders.push({ x: hx + 4.5, z: hz, hw: 2.0, hd: wallThick / 2 });
    // 4. Cloison séparatrice Nord-Sud (entre chambre et salle de bain)
    colliders.push({ x: hx, z: hz - divWallLen / 2, hw: wallThick / 2, hd: divWallLen / 2 });

    // Meubles volumineux (colliders pour ne pas traverser canapé, lit, cuisine, frigo, sanitaires)
    colliders.push({ x: hx - 3.8, z: hz + 2.8, hw: 1.25, hd: 0.55 }); // Canapé salon
    colliders.push({ x: hx + 4.2, z: hz + 1.6, hw: 0.45, hd: 1.4 });  // Plan travail cuisine
    colliders.push({ x: hx + 5.5, z: hz + 3.4, hw: 0.5, hd: 0.5 });   // Réfrigérateur
    colliders.push({ x: hx - 4.2, z: hz - 3.2, hw: 1.15, hd: 0.95 }); // Grand lit chambre
    colliders.push({ x: hx + 2.4, z: hz + 3.6, hw: 0.85, hd: 0.65 }); // Table à manger
    colliders.push({ x: hx + 4.8, z: hz - 3.8, hw: 0.7, hd: 0.7 });   // Douche salle de bain
    colliders.push({ x: hx + 0.65, z: hz - 2.5, hw: 0.35, hd: 0.35 }); // Toilettes salle de bain

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
        { name: "Salon", x: hx - 3.8, z: hz + 2.2, icon: "🛋️" },
        { name: "Cuisine", x: hx + 4.0, z: hz + 2.0, icon: "🍳" },
        { name: "Salle à manger", x: hx + 2.4, z: hz + 3.6, icon: "🍽️" },
        { name: "Chambre", x: hx - 3.8, z: hz - 2.8, icon: "🛏️" },
        { name: "Salle de bain", x: hx + 3.8, z: hz - 2.8, icon: "🚿" },
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
  //  GÉNÉRATION DES 225 BLOCS URBAINS DE BENI (15 x 15 - 780m)
  // ─────────────────────────────────────────────────────────────
  const districtOf = (gx: number, gz: number): District => {
    const key = `${gx},${gz}`;
    const specials: Record<string, District> = {
      // 1. Centre-Ville & Places Principales
      "7,7": "center",      // Place du Rond-Point Central (0, 0)
      "6,7": "admin",       // Mairie de Beni (Hôtel de Ville) (-52, 0)
      "7,6": "admin",       // Commissariat Central de Police (0, -52)
      "8,7": "commercial",  // Boulevard Commercial Est (52, 0)
      // 2. Grand Marché & Commerces Clés
      "9,7": "market",      // Grand Marché Central (104, 0)
      "8,6": "commercial",  // Avenue du Commerce & Boutique Kivu Express (52, -52)
      "9,8": "restaurant",  // Restaurant Chez Mama Léontine (104, 52)
      // 3. Transports, Carburant & Logistique
      "10,5": "fuel",       // Station-Service Cobil & Total (156, -104)
      "11,4": "industrial", // Gare Routière des Agences de Voyage (208, -156)
      // 4. Quartier Résidentiel Masiani (Maison du Joueur)
      "5,10": "residential",// Maison du Joueur (-104, 156)
      // 5. Santé & Éducation (Bungulu)
      "5,4": "hospital",    // Pharmacie & Dispensaire de l'Espoir (-104, -156)
      "5,3": "hospital",    // Hôpital Général de Référence (-104, -208)
      "4,4": "school",      // Institut de Beni (-156, -156)
      "3,4": "school",      // École Primaire Bungulu (-208, -156)
      // 6. Sport & Événements
      "11,7": "stadium",    // Grand Stade Municipal du 15 Octobre (208, 0)
      "11,8": "stadium",    // Terrains de Sport & Loisirs (208, 52)
      // 7. Culte & Campus
      "9,10": "church",     // Cathédrale Saint-Gustave (104, 156)
      "10,11": "campus",    // Université Chrétienne Bilingue - UCBC (156, 208)
      // 8. Espaces Verts & Parcs
      "2,8": "park",        // Parc Botanique & Collines Vertes (-260, 52)
      "8,2": "park",        // Réserve & Pépinière d'Eucalyptus (52, -260)
      "1,4": "park",        // Parc de la Colline Ouest (-312, -156)
      // 9. Périphérie
      "13,2": "airport",    // Route et Entrée Aéroport Mavivi (286, -260)
    };
    if (specials[key]) return specials[key];

    // Zonage urbain cohérent et diversifié par anneaux et quadrants
    if (gx <= 1 || gx >= 13 || gz <= 1 || gz >= 13) return "peripheral";
    if (gx >= 2 && gx <= 4 && gz >= 5 && gz <= 7) return "popular"; // Zone Populaire Malepe & Kalinda
    if (gx >= 6 && gx <= 8 && gz >= 6 && gz <= 8) return "center";  // Centre-Ville
    if (gx >= 8 && gx <= 10 && gz >= 5 && gz <= 8) return "commercial"; // Quartier Commercial
    if (gx >= 4 && gx <= 6 && gz >= 9 && gz <= 12) return "residential"; // Quartier Masiani
    if (gx >= 10 && gx <= 12 && gz >= 3 && gz <= 5) return "industrial"; // Zone Industrielle & Garages

    const d = Math.hypot(gx - 7, gz - 7);
    if (d <= 2.5) return "center";
    if (d <= 4.5) return rnd() < 0.5 ? "commercial" : "mixed";
    return rnd() < 0.5 ? "residential" : "popular";
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
          if (rnd() < 0.7) addTree(cx + sx * 18.2, cz + sz * 18.2, 0.95);
        }
      }

      // ── CAS SPÉCIAUX PAR DISTRICT ──

      // 1. Maison du joueur (Quartier Masiani : gx 5, gz 10 -> cx = -104, cz = 156)
      if (gx === 5 && gz === 10) {
        buildPlayerHouse(cx, cz);
        for (let k = 0; k < 4; k++) addBanana(cx + 8, cz - 10 + k * 6);
        for (let k = 0; k < 3; k++) addTree(cx - 10, cz - 8 + k * 7, 1.1);
        continue;
      }

      // 2. Restaurant Chez Mama Léontine (gx 9, gz 8)
      if (gx === 9 && gz === 8) {
        buildRestaurant(cx, cz);
        for (let k = 0; k < 3; k++) addTree(cx + 10, cz - 6 + k * 6, 1.0);
        continue;
      }

      // 3. Boutique Kivu Express (gx 8, gz 6)
      if (gx === 8 && gz === 6) {
        buildShop(cx - 4, cz);
        building({
          x: cx + 9, z: cz, w: 8, d: 9, floors: 1, color: 0xd6a06c, style: "shop", roof: "gable", front: 1,
        });
        continue;
      }

      // 4. Pharmacie & Dispensaire (gx 5, gz 4)
      if (gx === 5 && gz === 4) {
        buildPharmacy(cx, cz);
        addTree(cx + 8, cz + 8, 1.2);
        continue;
      }

      // 5. Station-Service Cobil & Total (gx 10, gz 5)
      if (gx === 10 && gz === 5) {
        // Grand auvent métallique au-dessus des pistes de carburant
        add(roofMetal, box(18, 0.4, 12, cx, 4.8, cz, 3));
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const pillar = new THREE.CylinderGeometry(0.3, 0.3, 4.6, 8);
            pillar.translate(cx + sx * 7.5, 2.4, cz + sz * 4.5);
            add(steelMat, pillar);
          }
        }
        // Pompes à essence (rouge Total / bleu Cobil)
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

      // 6. Mairie de Beni / Hôtel de Ville (gx 6, gz 7)
      if (gx === 6 && gz === 7) {
        building({
          x: cx, z: cz - 4, w: 26, d: 14, floors: 2, color: 0xf1ede6, style: "office", roof: "flat", front: 1,
        });
        const pole = new THREE.CylinderGeometry(0.08, 0.08, 9, 6);
        pole.translate(cx, 4.8, cz + 10);
        add(steelMat, pole);
        add(paintMat, tint(box(1.8, 1.1, 0.04, cx + 0.9, 8.5, cz + 10, 1), 0x0284c7));
        continue;
      }

      // 7. Commissariat Central de Police (gx 7, gz 6)
      if (gx === 7 && gz === 6) {
        building({
          x: cx, z: cz, w: 22, d: 12, floors: 2, color: 0x2c4f7c, style: "office", roof: "flat", front: 1,
        });
        // Mât d'antenne radio télécom
        const ant = new THREE.CylinderGeometry(0.06, 0.1, 14, 6);
        ant.translate(cx + 8, 11, cz);
        add(steelMat, ant);
        continue;
      }

      // 8. Place du Rond-Point Central & Monument de la Paix (gx 7, gz 7)
      if (gx === 7 && gz === 7) {
        // Terrasse circulaire centrale avec obélisque et fontaine
        add(sidewalkMat, box(28, 0.4, 28, cx, 0.2, cz, 4));
        const pedestal = new THREE.BoxGeometry(4, 2, 4);
        pedestal.translate(cx, 1.2, cz);
        add(wallMat, tint(pedestal, 0xf1ede6));
        const obelisk = new THREE.CylinderGeometry(0.5, 1.2, 8, 4);
        obelisk.translate(cx, 6.2, cz);
        obelisk.rotateY(Math.PI / 4);
        add(wallMat, tint(obelisk, 0xe2e8f0));
        colliders.push({ x: cx, z: cz, hw: 3, hd: 3 });
        for (let a = 0; a < 4; a++) {
          const px = cx + Math.cos((a * Math.PI) / 2) * 8.5;
          const pz = cz + Math.sin((a * Math.PI) / 2) * 8.5;
          addBanana(px, pz);
        }
        continue;
      }

      // 9. Grand Marché Central (gx 9, gz 7)
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
        add(roofMetal, box(16, 0.3, 8, cx, 4.4, cz, 3));
        const Fh = faceOf(cx, cz, 16, 8, 1);
        add(signMat, Fh.put(signPlane(12, 0.65, ROW_MARKET, SIGN_ROWS), 0, 4.4, 0.04));
        continue;
      }

      // 10. Grand Stade Municipal du 15 Octobre (gx 11, gz 7)
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

      // 11. Cathédrale Saint-Gustave (gx 9, gz 10)
      if (kind === "church") {
        const white = 0xf1ede6;
        add(wallMat, tint(box(13, 9, 24, cx, 4.8, cz, 3.2), white));
        colliders.push({ x: cx, z: cz, hw: 7, hd: 12.5 });
        add(wallMat, tint(box(4.2, 19, 4.2, cx - 4.5, 9.8, cz - 13.5, 3.2), white));
        colliders.push({ x: cx - 4.5, z: cz - 13.5, hw: 2.5, hd: 2.5 });
        add(paintMat, tint(box(0.3, 2.8, 0.3, cx - 4.5, 20.8, cz - 13.5, 1), 0xf1ede6));
        add(paintMat, tint(box(1.6, 0.3, 0.3, cx - 4.5, 21.2, cz - 13.5, 1), 0xf1ede6));
        gableRoof(cx, cz, 13, 24, 9.3, white, { pitch: 0.55, rusty: true, alongX: false });
        continue;
      }

      // 12. Campus Universitaire UCBC (gx 10, gz 11)
      if (kind === "campus") {
        building({
          x: cx, z: cz - 6, w: 24, d: 12, floors: 2, color: 0xdfb09c, style: "office", roof: "flat", front: 1,
        });
        add(grassMat, box(24, 0.35, 10, cx, 0.2, cz + 8, 4));
        addTree(cx - 7, cz + 8, 1.1);
        addTree(cx + 7, cz + 8, 1.1);
        continue;
      }

      // 13. Institut de Beni / Écoles (gx 4, gz 4)
      if (kind === "school") {
        building({
          x: cx - 4, z: cz, w: 20, d: 10, floors: 1, color: 0xe9dfc8, style: "office", roof: "gable", front: 1,
        });
        const pole = new THREE.CylinderGeometry(0.06, 0.06, 7, 6);
        pole.translate(cx + 10, 3.6, cz);
        add(steelMat, pole);
        add(paintMat, tint(box(1.4, 0.9, 0.03, cx + 10.7, 6.5, cz, 1), 0x0284c7));
        continue;
      }

      // 14. Gare Routière & Dépôts Fret (gx 11, gz 4)
      if (kind === "industrial") {
        building({
          x: cx - 6, z: cz, w: 16, d: 14, floors: 1, color: 0xc7d8be, style: "shop", roof: "flat", front: 1,
        });
        add(roofMetal, box(14, 0.3, 10, cx + 8, 3.8, cz, 2));
        colliders.push({ x: cx + 8, z: cz, hw: 7, hd: 5 });
        continue;
      }

      // 15. Espaces verts / Parcs
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

      // ── BÂTIMENTS STANDARDS PAR AMBIANCE DE QUARTIER ──

      // A. Centre-Ville : immeubles 2 à 3 étages, rez-de-chaussée commercial, balcons
      if (kind === "center") {
        building({
          x: cx - 7, z: cz, w: 13, d: 15, floors: 2 + (rnd() < 0.45 ? 1 : 0),
          color: pick(WALL_COLORS), style: "shop", roof: "flat", front: 1,
        });
        building({
          x: cx + 7, z: cz, w: 13, d: 15, floors: 2 + (rnd() < 0.45 ? 1 : 0),
          color: pick(WALL_COLORS), style: "office", roof: "flat", front: 3,
        });
        continue;
      }

      // B. Zone Populaire (Malepe & Kalinda) : habitations serrées, toits rouillés, petits commerces
      if (kind === "popular") {
        building({
          x: cx - 8, z: cz - 5, w: 9, d: 9, floors: 1,
          color: pick(WALL_COLORS), style: "shop", roof: "gable", front: 1, rusty: true,
        });
        building({
          x: cx + 8, z: cz - 5, w: 9, d: 9, floors: 1,
          color: pick(WALL_COLORS), style: "house", roof: "gable", front: 1, rusty: true,
        });
        building({
          x: cx, z: cz + 6, w: 12, d: 8, floors: 1,
          color: pick(WALL_COLORS), style: "shop", roof: "gable", front: 3, rusty: true,
        });
        // Petit kiosque de rue (Airtel Money / Coiffure)
        add(paintMat, tint(box(2.2, 2.2, 1.8, cx - 11, 1.2, cz + 8, 1), 0xdc2626));
        colliders.push({ x: cx - 11, z: cz + 8, hw: 1.2, hd: 1.0 });
        continue;
      }

      // C. Zone Périphérique (Kanzulinzuli, Paida, Mavivi) : parcelles agricoles, maisons espacées
      if (kind === "peripheral") {
        building({
          x: cx - 6, z: cz, w: 10, d: 9, floors: 1,
          color: pick(WALL_COLORS), style: "house", roof: "gable", front: 1, rusty: true,
        });
        // Champs de bananiers et manioc
        for (let k = 0; k < 6; k++) addBanana(cx + 6 + (k % 2) * 4, cz - 8 + Math.floor(k / 2) * 6);
        addTree(cx - 10, cz + 8, 1.2);
        continue;
      }

      // D. Zone Commerciale Standard
      if (kind === "commercial") {
        building({
          x: cx - 7, z: cz, w: 12, d: 14, floors: 1 + Math.floor(rnd() * 2),
          color: pick(WALL_COLORS), style: "shop", roof: rnd() < 0.6 ? "gable" : "flat", front: 1,
        });
        building({
          x: cx + 7, z: cz, w: 12, d: 14, floors: 1 + Math.floor(rnd() * 2),
          color: pick(WALL_COLORS), style: "shop", roof: "gable", front: 1,
        });
        continue;
      }

      // E. Zone Résidentielle Standard (Masiani etc)
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
