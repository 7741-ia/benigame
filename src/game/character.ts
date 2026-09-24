import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  Personnages articulés (procéduraux, sans ressource externe)
//  - squelette : hanches → torse → cou → tête ; épaules → coudes ; hanches → genoux
//  - vêtements en volume (chemise/robe/pagne/jean), coiffures, carnations
//  - animations : idle, marche, course, salut, remise, assis (conduite), moto
//  Toutes les rotations partent d'une pose de repos ; l'animation ne fait
//  qu'interpoler des cibles → aucun saut, membres jamais déformés.
// ─────────────────────────────────────────────────────────────

export type Pose = "idle" | "walk" | "run" | "wave" | "handover" | "sit" | "ride" | "cheer";

/** Échelle à appliquer à `rig.root` pour obtenir ≈1,75 m (le rig natif mesure ≈1,97 m à height=1). */
export const RIG_SCALE = 0.89;

export interface CharacterLook {
  skin: number;
  hair: number;
  hairStyle: "court" | "afro" | "tresses" | "rase" | "locks" | "chignon" | "foulard" | "none";
  top: number;
  bottom: number;
  outfit: "chemise" | "tshirt" | "robe" | "pagne" | "boubou" | "gilet" | "none" ;
  shoes: number;
  height: number; // 0.9..1.1
  build: number; // 0.85..1.2 (largeur)
  accessory?: "casquette" | "sac" | "casque" | "lunettes" | "none";
  female: boolean;
}

// Carnations d'Afrique centrale (large éventail, du plus clair au plus foncé)
export const SKIN_TONES = [0x8d5a3b, 0x7a4a2e, 0x6b3f26, 0x5b3320, 0x4a2a1a, 0x3d2214, 0x2f1a10, 0x9c6b4a, 0x5e3a22, 0x43261a];
const HAIR_TONES = [0x1a1210, 0x241814, 0x0f0b09, 0x2b1a12, 0x3a2418];
const TOP_COLORS = [0x2c4f7c, 0xd63b2f, 0xf2c12e, 0x2e7d4f, 0xf5f1e8, 0x5b2d8e, 0xe07a1f, 0x1f8a8a, 0xf0a3c4, 0x8b2f2f, 0x39424e, 0xb7d0e8];
const BOTTOM_COLORS = [0x263238, 0x1d3557, 0x4b3a2c, 0x5a5a5a, 0x2f2f2f, 0x6b4f8a, 0x8b5e3c];
const WAX_COLORS = [0xd97706, 0x2563eb, 0xdc2626, 0x16a34a, 0x9333ea, 0xf59e0b, 0x0891b2];
const SHOE_COLORS = [0x1b1b1b, 0x5a3d28, 0xf1ede6, 0x3a3a3a];

let lookSeed = 12345;
export function randomLook(rand: () => number = Math.random): CharacterLook {
  const female = rand() < 0.5;
  const styles: CharacterLook["hairStyle"][] = female
    ? ["tresses", "afro", "chignon", "foulard", "locks", "court"]
    : ["court", "rase", "afro", "locks", "court", "court"];
  const outfits: CharacterLook["outfit"][] = female
    ? ["robe", "pagne", "tshirt", "chemise", "boubou"]
    : ["chemise", "tshirt", "tshirt", "boubou", "gilet"];
  const acc: CharacterLook["accessory"][] = female ? ["none", "none", "sac", "lunettes"] : ["none", "none", "casquette", "lunettes"];
  const top = TOP_COLORS[Math.floor(rand() * TOP_COLORS.length)];
  return {
    skin: SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)],
    hair: HAIR_TONES[Math.floor(rand() * HAIR_TONES.length)],
    hairStyle: styles[Math.floor(rand() * styles.length)],
    top,
    bottom: BOTTOM_COLORS[Math.floor(rand() * BOTTOM_COLORS.length)],
    outfit: outfits[Math.floor(rand() * outfits.length)],
    shoes: SHOE_COLORS[Math.floor(rand() * SHOE_COLORS.length)],
    height: 0.92 + rand() * 0.16,
    build: (female ? 0.88 : 0.98) + rand() * 0.18,
    accessory: acc[Math.floor(rand() * acc.length)],
    female,
  };
}

/** générateur déterministe pour les PNJ (mêmes visages à chaque partie) */
export function seededLook(seed: number): CharacterLook {
  let a = (seed * 9301 + 49297) >>> 0;
  const rand = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  return randomLook(rand);
}
void lookSeed;

// matériaux partagés par couleur (économie de programmes/uniforms)
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(hex: number, roughness: number, metalness = 0) {
  const key = `${hex}-${roughness}-${metalness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
    matCache.set(key, m);
  }
  return m;
}
const skinMat = (hex: number) => mat(hex, 0.62);
const clothMat = (hex: number) => mat(hex, 0.88);
const hairMat = (hex: number) => mat(hex, 0.95);
const shoeMat = (hex: number) => mat(hex, 0.7);

export interface Rig {
  root: THREE.Group; // à poser dans le monde (pieds au sol)
  hips: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  handR: THREE.Group; // point d'attache (colis)
  look: CharacterLook;
  /** hauteur des hanches au repos (pour poser le personnage) */
  hipY: number;
  legLen: number;
  /** phase de pas (0..2π) pilotée par la distance parcourue */
  phase: number;
  /** poids courants des animations (pour fondus) */
  blend: { walk: number; run: number; wave: number; handover: number; sit: number; ride: number; cheer: number };
  skinMeshes: THREE.Mesh[];
  topMeshes: THREE.Mesh[];
  /** boîte de collision approximative (rayon) */
  radius: number;
}

function capsule(r: number, len: number, m: THREE.Material, y: number, segs = 6) {
  const g = new THREE.CapsuleGeometry(r, len, segs, 10);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = y;
  mesh.castShadow = true;
  return mesh;
}

/**
 * Construit un personnage. Détail "low" : moins de segments et pas d'accessoires.
 * Repère : hanches à l'origine du groupe `hips` ; `root` est au sol.
 */
export function buildCharacter(look: CharacterLook, lod: "high" | "low" = "high"): Rig {
  const s = look.height;
  const b = look.build;
  const segs = lod === "high" ? 8 : 4;
  const root = new THREE.Group();
  const hips = new THREE.Group();
  const legLen = 0.86 * s;
  const hipY = legLen + 0.06;
  hips.position.y = hipY;
  root.add(hips);

  const skin = skinMat(look.skin);
  const top = clothMat(look.top);
  const bottom = clothMat(look.bottom);
  const shoes = shoeMat(look.shoes);
  const skinMeshes: THREE.Mesh[] = [];
  const topMeshes: THREE.Mesh[] = [];

  // ── bassin / bas du corps ──
  const isDress = look.outfit === "robe" || look.outfit === "pagne" || look.outfit === "boubou";
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34 * b, 0.22, 0.22 * b), isDress ? clothMat(look.outfit === "pagne" ? WAX_COLORS[look.top % WAX_COLORS.length] : look.top) : bottom);
  pelvis.position.y = 0.06;
  pelvis.castShadow = true;
  hips.add(pelvis);
  if (isDress) {
    // jupe / pagne en volume (cône tronqué), longueur selon la tenue
    const len = look.outfit === "boubou" ? legLen * 0.95 : look.outfit === "pagne" ? legLen * 0.8 : legLen * 0.62;
    const skirtHex = look.outfit === "pagne" ? WAX_COLORS[look.top % WAX_COLORS.length] : look.top;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * b, 0.27 * b, len, 10, 1, true), clothMat(skirtHex));
    skirt.material = new THREE.MeshStandardMaterial({ color: skirtHex, roughness: 0.9, side: THREE.DoubleSide });
    skirt.position.y = -len / 2 + 0.02;
    skirt.castShadow = true;
    hips.add(skirt);
    topMeshes.push(skirt);
  }

  // ── torse (chemise/tshirt en volume) ──
  const torso = new THREE.Group();
  torso.position.y = 0.16;
  hips.add(torso);
  const chestH = 0.5 * s;
  const chestW = (look.female ? 0.3 : 0.36) * b;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(chestW, chestH, 0.2 * b), top);
  chest.position.y = chestH / 2;
  chest.castShadow = true;
  torso.add(chest);
  topMeshes.push(chest);
  // épaules arrondies et col
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.1 * b, chestW - 0.04, 4, segs), top);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = chestH - 0.02;
  torso.add(shoulders);
  if (look.outfit === "chemise" || look.outfit === "gilet") {
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.14 * b, 0.05, 0.16 * b), clothMat(0xf1ede6));
    collar.position.set(0, chestH + 0.01, 0.03);
    torso.add(collar);
    if (look.outfit === "gilet") {
      const vest = new THREE.Mesh(new THREE.BoxGeometry(chestW + 0.02, chestH * 0.8, 0.22 * b), clothMat(0xf59e0b));
      vest.position.y = chestH * 0.45;
      torso.add(vest);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(chestW + 0.03, 0.05, 0.23 * b), clothMat(0xd9d9d9));
      stripe.position.y = chestH * 0.55;
      torso.add(stripe);
    }
  }
  if (look.female && !isDress) {
    const bust = new THREE.Mesh(new THREE.SphereGeometry(0.11 * b, segs, segs), top);
    bust.scale.set(1.3, 0.8, 0.7);
    bust.position.set(0, chestH * 0.62, 0.09 * b);
    torso.add(bust);
  }
  if (look.accessory === "sac") {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, chestH, 0.22 * b), clothMat(0x5a3d28));
    strap.rotation.z = 0.5;
    strap.position.set(0.05, chestH / 2, 0);
    torso.add(strap);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.1), clothMat(0x5a3d28));
    bag.position.set(0.2 * b, -0.05, 0.05);
    torso.add(bag);
  }

  // ── cou / tête / visage ──
  const neck = new THREE.Group();
  neck.position.y = chestH + 0.03;
  torso.add(neck);
  const neckMesh = capsule(0.045 * b, 0.05, skin, 0.04, segs);
  neck.add(neckMesh);
  skinMeshes.push(neckMesh);
  const head = new THREE.Group();
  head.position.y = 0.1;
  neck.add(head);
  const headR = 0.12 * (0.95 + b * 0.05);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(headR, segs + 2, segs + 2), skin);
  skull.scale.set(0.92, 1.08, 0.98);
  skull.position.y = headR;
  skull.castShadow = true;
  head.add(skull);
  skinMeshes.push(skull);
  if (lod === "high") {
    // traits : yeux (blanc + iris), sourcils, nez, bouche, oreilles
    for (const sx of [-1, 1]) {
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), mat(0xf7f2ea, 0.4));
      eyeW.scale.set(1.3, 1, 0.6);
      eyeW.position.set(sx * 0.045, headR + 0.02, headR * 0.86);
      head.add(eyeW);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 6), mat(0x2a1a10, 0.3));
      iris.position.set(sx * 0.045, headR + 0.02, headR * 0.86 + 0.011);
      head.add(iris);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.008, 0.01), hairMat(look.hair));
      brow.position.set(sx * 0.045, headR + 0.05, headR * 0.9);
      brow.rotation.z = sx * -0.15;
      head.add(brow);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(sx * headR * 0.95, headR, 0);
      head.add(ear);
      skinMeshes.push(ear);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), skin);
    nose.scale.set(1.25, 0.8, 1);
    nose.position.set(0, headR - 0.015, headR * 0.98);
    head.add(nose);
    skinMeshes.push(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.01), mat(0x5c2e2a, 0.6));
    mouth.position.set(0, headR - 0.055, headR * 0.93);
    head.add(mouth);
    if (look.accessory === "lunettes") {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 12), mat(0x1b1b1b, 0.3, 0.6));
      for (const sx of [-1, 1]) {
        const f = frame.clone();
        f.position.set(sx * 0.045, headR + 0.02, headR * 0.9);
        head.add(f);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.005, 0.005), mat(0x1b1b1b, 0.3, 0.6));
      bridge.position.set(0, headR + 0.02, headR * 0.9);
      head.add(bridge);
    }
  }
  // coiffures en volume
  const hm = hairMat(look.hair);
  const addHair = () => {
    switch (look.hairStyle) {
      case "afro": {
        const h = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.32, segs + 2, segs + 2), hm);
        h.position.y = headR * 1.12;
        h.scale.set(1, 0.95, 1);
        head.add(h);
        break;
      }
      case "court": {
        const h = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.04, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.55), hm);
        h.position.y = headR * 1.02;
        head.add(h);
        break;
      }
      case "rase": {
        const h = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.01, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(look.skin, 0.5));
        h.position.y = headR * 1.02;
        head.add(h);
        break;
      }
      case "tresses": {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.05, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.6), hm);
        cap.position.y = headR * 1.02;
        head.add(cap);
        const n = lod === "high" ? 7 : 3;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 1.4 - Math.PI * 0.7 + Math.PI;
          const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.22 * s, 3, 5), hm);
          br.position.set(Math.sin(a) * headR * 0.95, headR * 0.55, Math.cos(a) * headR * 0.95);
          br.rotation.x = 0.15;
          head.add(br);
        }
        break;
      }
      case "locks": {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.08, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.55), hm);
        cap.position.y = headR * 1.02;
        head.add(cap);
        const n = lod === "high" ? 10 : 4;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const lk = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.18 * s, 3, 5), hm);
          lk.position.set(Math.sin(a) * headR * 1.0, headR * 0.7, Math.cos(a) * headR * 1.0 - 0.02);
          head.add(lk);
        }
        break;
      }
      case "chignon": {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.05, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.55), hm);
        cap.position.y = headR * 1.02;
        head.add(cap);
        const bun = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.55, segs, segs), hm);
        bun.position.set(0, headR * 1.9, -headR * 0.5);
        head.add(bun);
        break;
      }
      case "foulard": {
        const wrapHex = WAX_COLORS[(look.top + 3) % WAX_COLORS.length];
        const wrap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.12, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.62), clothMat(wrapHex));
        wrap.position.y = headR * 1.0;
        head.add(wrap);
        const knot = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.45, segs, segs), clothMat(wrapHex));
        knot.position.set(0, headR * 1.95, 0.02);
        knot.scale.set(1.4, 0.8, 1);
        head.add(knot);
        break;
      }
    }
  };
  if (look.accessory === "casque") {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.22, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(0xffd93d, 0.35, 0.2));
    helm.position.y = headR * 1.0;
    head.add(helm);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(headR * 2.2, 0.035, 0.09), mat(0x1b1b1b, 0.4));
    visor.position.set(0, headR * 1.18, headR * 0.95);
    head.add(visor);
  } else if (look.accessory === "casquette") {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.08, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.5), clothMat(look.bottom));
    cap.position.y = headR * 1.02;
    head.add(cap);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.6, 0.02, headR * 0.9), clothMat(look.bottom));
    peak.position.set(0, headR * 1.5, headR * 1.05);
    head.add(peak);
  } else {
    addHair();
  }

  // ── bras : épaule → coude → main ──
  const upperLen = 0.28 * s;
  const foreLen = 0.26 * s;
  const sleeve = look.outfit === "tshirt" || look.outfit === "robe" || look.outfit === "gilet";
  const mkArm = (side: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (chestW / 2 + 0.05 * b), chestH - 0.04, 0);
    torso.add(shoulder);
    const upper = capsule(0.05 * b, upperLen - 0.1, sleeve ? top : (look.outfit === "boubou" ? top : skin), -upperLen / 2, segs);
    shoulder.add(upper);
    if (!sleeve && look.outfit !== "boubou") skinMeshes.push(upper);
    else topMeshes.push(upper);
    if (look.outfit === "boubou") {
      const wide = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * b, 0.13 * b, upperLen, 8, 1, true), new THREE.MeshStandardMaterial({ color: look.top, roughness: 0.9, side: THREE.DoubleSide }));
      wide.position.y = -upperLen / 2;
      shoulder.add(wide);
    }
    const elbow = new THREE.Group();
    elbow.position.y = -upperLen;
    shoulder.add(elbow);
    const fore = capsule(0.045 * b, foreLen - 0.09, skin, -foreLen / 2, segs);
    elbow.add(fore);
    skinMeshes.push(fore);
    const hand = new THREE.Group();
    hand.position.y = -foreLen - 0.02;
    elbow.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.038 * b, segs, segs), skin);
    palm.scale.set(0.8, 1.2, 0.5);
    hand.add(palm);
    skinMeshes.push(palm);
    return { shoulder, elbow, hand };
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // ── jambes : hanche → genou → pied ──
  const thighLen = legLen * 0.5;
  const shinLen = legLen * 0.5;
  const mkLeg = (side: 1 | -1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.09 * b, 0, 0);
    hips.add(hip);
    const legMat = isDress ? skin : bottom;
    const thigh = capsule(0.065 * b, thighLen - 0.13, legMat, -thighLen / 2, segs);
    hip.add(thigh);
    if (isDress) skinMeshes.push(thigh);
    const knee = new THREE.Group();
    knee.position.y = -thighLen;
    hip.add(knee);
    const shin = capsule(0.055 * b, shinLen - 0.11, isDress || look.outfit === "tshirt" && false ? skin : legMat, -shinLen / 2, segs);
    knee.add(shin);
    if (isDress) skinMeshes.push(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1 * b, 0.07, 0.24), shoes);
    foot.position.set(0, -shinLen - 0.01, 0.06);
    foot.castShadow = true;
    knee.add(foot);
    return { hip, knee };
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  const rig: Rig = {
    root, hips, torso, neck, head,
    shoulderL: armL.shoulder, shoulderR: armR.shoulder,
    elbowL: armL.elbow, elbowR: armR.elbow,
    hipL: legL.hip, hipR: legR.hip, kneeL: legL.knee, kneeR: legR.knee,
    handR: armR.hand,
    look, hipY, legLen, phase: 0,
    blend: { walk: 0, run: 0, wave: 0, handover: 0, sit: 0, ride: 0, cheer: 0 },
    skinMeshes, topMeshes, radius: 0.35 * b,
  };
  // pose de repos naturelle : bras légèrement écartés
  armL.shoulder.rotation.z = 0.08;
  armR.shoulder.rotation.z = -0.08;
  return rig;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (cur: number, target: number, rate: number, dt: number) => lerp(cur, target, 1 - Math.exp(-rate * dt));

/**
 * Anime le squelette.
 *  - `moveDist` : distance parcourue depuis la dernière image (→ phase de pas, pas de glissement)
 *  - `pose` : pose cible ; les poids sont fondus (≈120 ms) pour éviter tout saut
 */
export function animateRig(rig: Rig, dt: number, pose: Pose, moveDist: number, running = false, time = performance.now() / 1000) {
  const b = rig.blend;
  const k = 9; // vitesse de fondu
  b.walk = damp(b.walk, pose === "walk" ? 1 : 0, k, dt);
  b.run = damp(b.run, pose === "run" ? 1 : 0, k, dt);
  b.wave = damp(b.wave, pose === "wave" ? 1 : 0, k, dt);
  b.handover = damp(b.handover, pose === "handover" ? 1 : 0, k, dt);
  b.sit = damp(b.sit, pose === "sit" ? 1 : 0, 14, dt);
  b.ride = damp(b.ride, pose === "ride" ? 1 : 0, 14, dt);
  b.cheer = damp(b.cheer, pose === "cheer" ? 1 : 0, k, dt);

  // phase de pas liée à la distance : une foulée ≈ 1.3 m (marche) / 1.9 m (course)
  const stride = running ? 1.9 : 1.3;
  rig.phase += (moveDist / stride) * Math.PI * 2;
  if (rig.phase > Math.PI * 200) rig.phase -= Math.PI * 200;
  const ph = rig.phase;
  const gait = Math.max(b.walk, b.run);
  const amp = lerp(0.55, 0.85, b.run);
  const kneeAmp = lerp(0.9, 1.3, b.run);

  // respiration / balancement au repos (très léger)
  const idle = 1 - Math.min(1, gait + b.sit + b.ride);
  const breath = Math.sin(time * 1.6) * 0.012 * idle;

  // ── jambes ──
  const swingL = Math.sin(ph) * amp * gait;
  const swingR = Math.sin(ph + Math.PI) * amp * gait;
  const kneeL = Math.max(0, -Math.sin(ph - 0.6)) * kneeAmp * gait;
  const kneeR = Math.max(0, -Math.sin(ph + Math.PI - 0.6)) * kneeAmp * gait;
  const sitLeg = -1.45 * b.sit + -1.0 * b.ride;
  const sitKnee = 1.5 * b.sit + 1.15 * b.ride;
  rig.hipL.rotation.x = swingL + sitLeg;
  rig.hipR.rotation.x = swingR + sitLeg;
  rig.kneeL.rotation.x = kneeL + sitKnee;
  rig.kneeR.rotation.x = kneeR + sitKnee;
  // moto : genoux écartés autour du réservoir
  rig.hipL.rotation.z = 0.35 * b.ride;
  rig.hipR.rotation.z = -0.35 * b.ride;

  // ── bras : balancement opposé aux jambes, coudes légèrement pliés en course ──
  const armSwing = lerp(0.35, 0.6, b.run) * gait;
  let shL = -Math.sin(ph) * armSwing;
  let shR = -Math.sin(ph + Math.PI) * armSwing;
  let elL = -0.25 - 0.8 * b.run * gait;
  let elR = -0.25 - 0.8 * b.run * gait;
  let shLz = 0.08;
  let shRz = -0.08;
  // salut : bras droit levé qui oscille
  const wave = b.wave;
  shR = lerp(shR, -2.6, wave);
  shRz = lerp(shRz, -0.6 + Math.sin(time * 9) * 0.25, wave);
  elR = lerp(elR, -0.9 + Math.sin(time * 9) * 0.3, wave);
  // remise du colis : les deux bras tendus vers l'avant
  shL = lerp(shL, -1.35, b.handover);
  shR = lerp(shR, -1.35, b.handover);
  elL = lerp(elL, -0.2, b.handover);
  elR = lerp(elR, -0.2, b.handover);
  shLz = lerp(shLz, 0.25, b.handover);
  shRz = lerp(shRz, -0.25, b.handover);
  // conduite : mains sur le volant / le guidon
  const drive = Math.max(b.sit, b.ride);
  shL = lerp(shL, -1.15 + 0.2 * b.ride, drive);
  shR = lerp(shR, -1.15 + 0.2 * b.ride, drive);
  elL = lerp(elL, -0.55, drive);
  elR = lerp(elR, -0.55, drive);
  shLz = lerp(shLz, 0.3, drive);
  shRz = lerp(shRz, -0.3, drive);
  // joie : deux bras en l'air + petits sauts
  shL = lerp(shL, -2.7 + Math.sin(time * 10) * 0.2, b.cheer);
  shR = lerp(shR, -2.7 - Math.sin(time * 10) * 0.2, b.cheer);
  shLz = lerp(shLz, 0.5, b.cheer);
  shRz = lerp(shRz, -0.5, b.cheer);
  elL = lerp(elL, -0.4, b.cheer);
  elR = lerp(elR, -0.4, b.cheer);
  rig.shoulderL.rotation.x = shL;
  rig.shoulderR.rotation.x = shR;
  rig.shoulderL.rotation.z = shLz;
  rig.shoulderR.rotation.z = shRz;
  rig.elbowL.rotation.x = elL;
  rig.elbowR.rotation.x = elR;

  // ── torse / tête ──
  rig.torso.rotation.x = 0.06 * b.run * gait + 0.32 * b.ride + 0.05 * b.sit + breath;
  rig.torso.rotation.y = Math.sin(ph) * 0.08 * gait;
  rig.hips.rotation.z = Math.sin(ph) * 0.04 * gait;
  rig.head.rotation.x = -0.25 * b.ride - breath * 2;
  rig.head.rotation.y = Math.sin(time * 0.7) * 0.15 * idle;

  // ── hauteur des hanches : rebond de la foulée, position assise ──
  const bounce = Math.abs(Math.sin(ph)) * lerp(0.03, 0.06, b.run) * gait;
  const cheerJump = Math.abs(Math.sin(time * 6)) * 0.12 * b.cheer;
  const sitDrop = -rig.legLen * 0.42 * b.sit - rig.legLen * 0.18 * b.ride;
  rig.hips.position.y = rig.hipY + bounce + cheerJump + sitDrop;
}

/** Applique une nouvelle carnation / couleur de haut (personnalisation du joueur). */
export function recolorRig(rig: Rig, skinHex: number, topHex: number) {
  const sm = skinMat(skinHex);
  const tm = clothMat(topHex);
  rig.skinMeshes.forEach((m) => (m.material = sm));
  rig.topMeshes.forEach((m) => {
    if ((m.material as THREE.MeshStandardMaterial).side === THREE.DoubleSide) {
      (m.material as THREE.MeshStandardMaterial).color.setHex(topHex);
    } else m.material = tm;
  });
  rig.look.skin = skinHex;
  rig.look.top = topHex;
}

/** Bulle de texte au-dessus d'un personnage (sprite canvas), avec fondu. */
export function makeSpeechBubble(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  const r = 22;
  ctx.beginPath();
  ctx.moveTo(r, 4);
  ctx.lineTo(256 - r, 4);
  ctx.quadraticCurveTo(252, 4, 252, r + 4);
  ctx.lineTo(252, 64 - r);
  ctx.quadraticCurveTo(252, 68, 256 - r, 68);
  ctx.lineTo(140, 68);
  ctx.lineTo(128, 86);
  ctx.lineTo(116, 68);
  ctx.lineTo(r, 68);
  ctx.quadraticCurveTo(4, 68, 4, 64 - r);
  ctx.lineTo(4, r + 4);
  ctx.quadraticCurveTo(4, 4, r, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1f2937";
  ctx.font = "bold 30px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fs = 30;
  while (ctx.measureText(text).width > 232 && fs > 14) {
    fs -= 2;
    ctx.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
  }
  ctx.fillText(text, 128, 36);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.2, 0.83, 1);
  sp.renderOrder = 20;
  return sp;
}
