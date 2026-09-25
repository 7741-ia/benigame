import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  Personnages 3D humanoïdes réalistes (procéduraux, sans ressource externe)
//  - Proportions humaines naturelles (hauteur ~1.75 m, tête 1/7.5)
//  - Anatomie détaillée : cou, clavicules, torse, coudes, poignets, mains,
//    hanches, cuisses galbées, genoux avec rotule, mollets, pieds avec semelles
//  - Visage expressif : yeux complets (sclérotique + iris + pupille + reflet spéculaire),
//    paupières, arête nasale et ailes, lèvres sculptées, oreilles
//  - Coiffures et tenues locales inspirées de Beni et de la RDC :
//    imprimés wax colorés, jeans denim, chemises à col, baskets et sandales
//  - Animations physiques naturelles sans glissement (stride lié à la distance),
//    accélération, inclinaison dans les virages, balancement des hanches et respiration
// ─────────────────────────────────────────────────────────────

export type Pose =
  | "idle"
  | "walk"
  | "run"
  | "wave"
  | "handover"
  | "sit"
  | "ride"
  | "cheer"
  | "talk"
  | "enter";

export const RIG_SCALE = 1.0;

export interface MovementConfig {
  walkSpeed: number; // m/s (marche naturelle 1.65)
  runSpeed: number;  // m/s (course dynamique 5.2)
  acceleration: number; // m/s² (accélération progressive 8.5)
  deceleration: number; // m/s² (freinage doux 11.0)
  turnSpeedWalk: number;
  turnSpeedRun: number;
}

export const DEFAULT_MOVEMENT: MovementConfig = {
  walkSpeed: 1.65,
  runSpeed: 5.2,
  acceleration: 8.5,
  deceleration: 11.0,
  turnSpeedWalk: 4.2,
  turnSpeedRun: 3.0,
};

export interface CharacterLook {
  skin: number;
  hair: number;
  hairStyle: "court" | "afro" | "tresses" | "rase" | "locks" | "chignon" | "foulard" | "degrade";
  top: number;
  bottom: number;
  outfit: "chemise" | "tshirt" | "robe" | "pagne" | "boubou" | "gilet" | "veste";
  shoes: number;
  height: number; // 0.95..1.08
  build: number;  // 0.9..1.12
  accessory?: "casquette" | "sac" | "casque" | "lunettes" | "montre" | "none";
  female: boolean;
}

// Carnations réalistes d'Afrique centrale (du bronze doré au brun ébène)
export const SKIN_TONES = [
  0x7d4f32, 0x6e4126, 0x5e351d, 0x512c17, 0x432413,
  0x381d0f, 0x2c170b, 0x8a5b3d, 0x56321c, 0x482816
];

const HAIR_TONES = [0x140e0b, 0x1c130e, 0x0a0705, 0x24160f, 0x331e15];
const TOP_COLORS = [
  0x2b4c7e, 0xd03728, 0xebb928, 0x277a48, 0xf2ece0,
  0x552885, 0xd9721a, 0x1b7f7f, 0x1e293b, 0x822929,
  0x334155, 0x0284c7
];
const BOTTOM_COLORS = [0x1e293b, 0x273646, 0x473729, 0x4b5563, 0x1f2937, 0x5c4033, 0x3f3f46];
const WAX_COLORS = [0xd97706, 0x2563eb, 0xdc2626, 0x16a34a, 0x9333ea, 0xf59e0b, 0x0891b2, 0xe11d48];
const SHOE_COLORS = [0x171717, 0x543622, 0xf5f2eb, 0x262626, 0xd97706];

export function randomLook(rand: () => number = Math.random): CharacterLook {
  const female = rand() < 0.48;
  const styles: CharacterLook["hairStyle"][] = female
    ? ["tresses", "afro", "chignon", "foulard", "locks", "court"]
    : ["degrade", "court", "rase", "afro", "locks", "court"];
  const outfits: CharacterLook["outfit"][] = female
    ? ["robe", "pagne", "tshirt", "chemise", "boubou"]
    : ["chemise", "tshirt", "tshirt", "veste", "gilet", "boubou"];
  const acc: CharacterLook["accessory"][] = female
    ? ["none", "none", "sac", "lunettes"]
    : ["none", "none", "casquette", "lunettes", "montre"];

  const top = TOP_COLORS[Math.floor(rand() * TOP_COLORS.length)];
  return {
    skin: SKIN_TONES[Math.floor(rand() * SKIN_TONES.length)],
    hair: HAIR_TONES[Math.floor(rand() * HAIR_TONES.length)],
    hairStyle: styles[Math.floor(rand() * styles.length)],
    top,
    bottom: BOTTOM_COLORS[Math.floor(rand() * BOTTOM_COLORS.length)],
    outfit: outfits[Math.floor(rand() * outfits.length)],
    shoes: SHOE_COLORS[Math.floor(rand() * SHOE_COLORS.length)],
    height: 0.95 + rand() * 0.1,
    build: (female ? 0.92 : 1.0) + (rand() - 0.5) * 0.16,
    accessory: acc[Math.floor(rand() * acc.length)],
    female,
  };
}

export function seededLook(seed: number): CharacterLook {
  let a = (seed * 9301 + 49297) >>> 0;
  const rand = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  return randomLook(rand);
}

// Matériaux optimisés avec cache
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

const skinMat = (hex: number) => mat(hex, 0.55, 0.02);
const clothMat = (hex: number) => mat(hex, 0.85, 0.0);
const denimMat = (hex: number) => mat(hex, 0.9, 0.02);
const hairMat = (hex: number) => mat(hex, 0.95, 0.0);
const shoeMat = (hex: number) => mat(hex, 0.6, 0.05);

export interface Rig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
  mouth: THREE.Mesh;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  look: CharacterLook;
  hipY: number;
  legLen: number;
  phase: number;
  blinkTimer: number;
  blend: {
    walk: number;
    run: number;
    wave: number;
    handover: number;
    sit: number;
    ride: number;
    cheer: number;
    talk: number;
  };
  skinMeshes: THREE.Mesh[];
  topMeshes: THREE.Mesh[];
  radius: number;
}

function capsule(r: number, len: number, m: THREE.Material, y: number, segs = 8) {
  const g = new THREE.CapsuleGeometry(r, len, segs, 10);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = y;
  mesh.castShadow = true;
  return mesh;
}

/**
 * Construit un personnage humanoïde réaliste aux proportions naturelles (1.75m).
 */
export function buildCharacter(look: CharacterLook, lod: "high" | "low" = "high"): Rig {
  const s = look.height;
  const b = look.build;
  const segs = lod === "high" ? 10 : 6;
  const root = new THREE.Group();
  const hips = new THREE.Group();

  // Hauteur anatomique : jambes = 0.88m, torse = 0.52m, cou+tête = 0.32m -> total ~1.72-1.78m
  const legLen = 0.9 * s;
  const hipY = legLen + 0.04;
  hips.position.y = hipY;
  root.add(hips);

  const skin = skinMat(look.skin);
  const top = clothMat(look.top);
  const bottom = denimMat(look.bottom);
  const shoes = shoeMat(look.shoes);
  const skinMeshes: THREE.Mesh[] = [];
  const topMeshes: THREE.Mesh[] = [];

  // ── Bassin / Hanches anatomiques ──
  const isDress = look.outfit === "robe" || look.outfit === "pagne" || look.outfit === "boubou";
  const pelvisWidth = (look.female ? 0.35 : 0.33) * b;
  const pelvisDepth = 0.22 * b;
  const pelvisMat = isDress
    ? clothMat(look.outfit === "pagne" ? WAX_COLORS[look.top % WAX_COLORS.length] : look.top)
    : bottom;

  const pelvis = new THREE.Mesh(
    new THREE.BoxGeometry(pelvisWidth, 0.2, pelvisDepth),
    pelvisMat
  );
  pelvis.position.y = 0.05;
  pelvis.castShadow = true;
  hips.add(pelvis);

  if (isDress) {
    const len = look.outfit === "boubou" ? legLen * 0.94 : look.outfit === "pagne" ? legLen * 0.82 : legLen * 0.65;
    const skirtHex = look.outfit === "pagne" ? WAX_COLORS[look.top % WAX_COLORS.length] : look.top;
    const skirtMat = new THREE.MeshStandardMaterial({
      color: skirtHex,
      roughness: 0.88,
      side: THREE.DoubleSide,
    });
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(pelvisWidth * 0.52, pelvisWidth * 0.78, len, 12, 1, true),
      skirtMat
    );
    skirt.position.y = -len / 2 + 0.02;
    skirt.castShadow = true;
    hips.add(skirt);
    topMeshes.push(skirt);
  }

  // ── Torse & Poitrine avec colonne vertébrale ──
  const torso = new THREE.Group();
  torso.position.y = 0.14;
  hips.add(torso);

  const chestH = 0.52 * s;
  const chestW = (look.female ? 0.32 : 0.37) * b;
  const chestD = (look.female ? 0.21 : 0.23) * b;

  // Cage thoracique
  const chest = new THREE.Mesh(new THREE.BoxGeometry(chestW, chestH, chestD), top);
  chest.position.y = chestH / 2;
  chest.castShadow = true;
  torso.add(chest);
  topMeshes.push(chest);

  // Épaules galbées et clavicules
  const shoulderPads = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.09 * b, chestW * 0.95, 4, segs),
    top
  );
  shoulderPads.rotation.z = Math.PI / 2;
  shoulderPads.position.y = chestH - 0.02;
  torso.add(shoulderPads);

  // Col de chemise / veste
  if (look.outfit === "chemise" || look.outfit === "veste") {
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 * b, 0.06, 0.18 * b),
      clothMat(look.outfit === "veste" ? 0x1f2937 : 0xf8fafc)
    );
    collar.position.set(0, chestH + 0.02, 0.02);
    torso.add(collar);
  }

  // Poitrine féminine naturelle
  if (look.female && !isDress) {
    const bust = new THREE.Mesh(new THREE.SphereGeometry(0.1 * b, segs, segs), top);
    bust.scale.set(1.3, 0.85, 0.75);
    bust.position.set(0, chestH * 0.6, chestD * 0.48);
    torso.add(bust);
  }

  // Accessoire : sac en bandoulière
  if (look.accessory === "sac") {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, chestH * 1.1, chestD * 1.05), clothMat(0x451a03));
    strap.rotation.z = 0.52;
    strap.position.set(0.03, chestH / 2, 0);
    torso.add(strap);

    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.1), clothMat(0x451a03));
    bag.position.set(0.22 * b, -0.04, 0.06);
    torso.add(bag);
  }

  // ── Cou & Tête sculptée ──
  const neck = new THREE.Group();
  neck.position.y = chestH + 0.02;
  torso.add(neck);

  const neckMesh = capsule(0.048 * b, 0.06, skin, 0.05, segs);
  neck.add(neckMesh);
  skinMeshes.push(neckMesh);

  const head = new THREE.Group();
  head.position.y = 0.11;
  neck.add(head);

  // Crâne humain avec mâchoire
  const headR = 0.118 * (0.96 + b * 0.04);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(headR, segs + 2, segs + 2), skin);
  skull.scale.set(0.9, 1.1, 0.98);
  skull.position.y = headR;
  skull.castShadow = true;
  head.add(skull);
  skinMeshes.push(skull);

  // ── Visage détaillé : yeux, iris spéculaires, nez, bouche, oreilles ──
  let eyeL!: THREE.Mesh;
  let eyeR!: THREE.Mesh;
  let mouthMesh!: THREE.Mesh;

  for (const sx of [-1, 1]) {
    // Sclérotique (blanc de l'œil)
    const eyeWhite = new THREE.Mesh(
      new THREE.SphereGeometry(0.021, 8, 8),
      mat(0xf8fafc, 0.2)
    );
    eyeWhite.scale.set(1.2, 0.85, 0.6);
    eyeWhite.position.set(sx * 0.044, headR + 0.02, headR * 0.85);
    head.add(eyeWhite);
    if (sx === -1) eyeL = eyeWhite;
    else eyeR = eyeWhite;

    // Paupière supérieure naturelle
    const eyelid = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.007, 0.016),
      skin
    );
    eyelid.position.set(sx * 0.044, headR + 0.035, headR * 0.86);
    head.add(eyelid);
    skinMeshes.push(eyelid);

    // Iris & pupille réalistes
    const iris = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      mat(0x1e1510, 0.1, 0.2)
    );
    iris.position.set(sx * 0.044, headR + 0.02, headR * 0.85 + 0.012);
    head.add(iris);

    // Reflet blanc spéculaire
    const glint = new THREE.Mesh(
      new THREE.SphereGeometry(0.0035, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    glint.position.set(sx * 0.044 + 0.003, headR + 0.023, headR * 0.85 + 0.022);
    head.add(glint);

    // Sourcil expressif
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.046, 0.009, 0.012),
      hairMat(look.hair)
    );
    brow.position.set(sx * 0.044, headR + 0.052, headR * 0.88);
    brow.rotation.z = sx * -0.12;
    head.add(brow);

    // Pommette / joue sculptée
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 6, 6),
      skin
    );
    cheek.scale.set(1.1, 0.8, 0.9);
    cheek.position.set(sx * 0.056, headR - 0.015, headR * 0.78);
    head.add(cheek);
    skinMeshes.push(cheek);

    // Oreilles galbées
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), skin);
    ear.scale.set(0.45, 1.1, 0.8);
    ear.position.set(sx * headR * 0.94, headR, -0.01);
    head.add(ear);
    skinMeshes.push(ear);
  }

  // Nez avec arête et ailes narinaires
  const noseBridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.04, 0.022),
    skin
  );
  noseBridge.position.set(0, headR + 0.01, headR * 0.92);
  head.add(noseBridge);
  skinMeshes.push(noseBridge);

  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), skin);
  noseTip.scale.set(1.3, 0.85, 1);
  noseTip.position.set(0, headR - 0.015, headR * 0.98);
  head.add(noseTip);
  skinMeshes.push(noseTip);

  // Bouche avec lèvres sculptées et philtrum
  const lipColor = 0x5a2822;
  mouthMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.052, 0.015, 0.016),
    mat(lipColor, 0.45)
  );
  mouthMesh.position.set(0, headR - 0.058, headR * 0.93);
  head.add(mouthMesh);

  // Menton humain sculpté
  const chin = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 8, 8),
    skin
  );
  chin.scale.set(1.2, 0.9, 1.1);
  chin.position.set(0, headR - 0.088, headR * 0.84);
  head.add(chin);
  skinMeshes.push(chin);

  // Lunettes de soleil ou de vue
  if (look.accessory === "lunettes") {
    const frameMat = mat(0x0f172a, 0.2, 0.8);
    for (const sx of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 14), frameMat);
      rim.position.set(sx * 0.045, headR + 0.02, headR * 0.89);
      head.add(rim);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.005, 0.005), frameMat);
    bridge.position.set(0, headR + 0.02, headR * 0.89);
    head.add(bridge);
  }

  // Coiffures sculptées volumiques
  const hm = hairMat(look.hair);
  switch (look.hairStyle) {
    case "afro": {
      const h = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.34, segs + 2, segs + 2), hm);
      h.position.y = headR * 1.14;
      h.scale.set(1.02, 0.95, 1.02);
      head.add(h);
      break;
    }
    case "degrade":
    case "court": {
      const h = new THREE.Mesh(
        new THREE.SphereGeometry(headR * 1.05, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.56),
        hm
      );
      h.position.y = headR * 1.02;
      head.add(h);
      break;
    }
    case "rase": {
      const h = new THREE.Mesh(
        new THREE.SphereGeometry(headR * 1.01, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.5),
        mat(look.skin, 0.4)
      );
      h.position.y = headR * 1.01;
      head.add(h);
      break;
    }
    case "tresses": {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(headR * 1.06, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.6),
        hm
      );
      cap.position.y = headR * 1.02;
      head.add(cap);
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 1.4 - Math.PI * 0.7 + Math.PI;
        const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.24 * s, 4, 6), hm);
        br.position.set(Math.sin(a) * headR * 0.94, headR * 0.55, Math.cos(a) * headR * 0.94);
        br.rotation.x = 0.16;
        head.add(br);
      }
      break;
    }
    case "locks": {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(headR * 1.08, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hm
      );
      cap.position.y = headR * 1.02;
      head.add(cap);
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const lk = new THREE.Mesh(new THREE.CapsuleGeometry(0.015, 0.22 * s, 4, 6), hm);
        lk.position.set(Math.sin(a) * headR * 1.0, headR * 0.7, Math.cos(a) * headR * 1.0 - 0.02);
        head.add(lk);
      }
      break;
    }
    case "foulard": {
      const wrapHex = WAX_COLORS[(look.top + 3) % WAX_COLORS.length];
      const wrap = new THREE.Mesh(
        new THREE.SphereGeometry(headR * 1.15, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.64),
        clothMat(wrapHex)
      );
      wrap.position.y = headR * 1.0;
      head.add(wrap);

      const knot = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.45, segs, segs), clothMat(wrapHex));
      knot.position.set(0, headR * 1.95, 0.02);
      knot.scale.set(1.4, 0.8, 1);
      head.add(knot);
      break;
    }
    case "chignon": {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(headR * 1.06, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hm
      );
      cap.position.y = headR * 1.02;
      head.add(cap);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.55, segs, segs), hm);
      bun.position.set(0, headR * 1.9, -headR * 0.5);
      head.add(bun);
      break;
    }
  }

  // Casquette ou Casque moto
  if (look.accessory === "casque") {
    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(headR * 1.25, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.64),
      mat(0xf59e0b, 0.3, 0.4)
    );
    helm.position.y = headR * 1.0;
    head.add(helm);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(headR * 2.2, 0.04, 0.1), mat(0x0f172a, 0.2));
    visor.position.set(0, headR * 1.18, headR * 0.96);
    head.add(visor);
  } else if (look.accessory === "casquette") {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(headR * 1.1, segs + 2, segs + 2, 0, Math.PI * 2, 0, Math.PI * 0.5),
      clothMat(look.bottom)
    );
    cap.position.y = headR * 1.02;
    head.add(cap);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.6, 0.02, headR * 0.95), clothMat(look.bottom));
    visor.position.set(0, headR * 1.05, headR * 1.1);
    head.add(visor);
  }

  // ── Bras articulés : Épaule → Coude → Poignet → Main ──
  const upperLen = 0.3 * s;
  const foreLen = 0.27 * s;
  const isShortSleeve = look.outfit === "tshirt" || look.outfit === "robe" || look.outfit === "gilet";

  const mkArm = (side: 1 | -1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (chestW / 2 + 0.05 * b), chestH - 0.04, 0);
    torso.add(shoulder);

    const upper = capsule(0.052 * b, upperLen - 0.1, isShortSleeve ? top : (look.outfit === "boubou" ? top : skin), -upperLen / 2, segs);
    shoulder.add(upper);
    if (!isShortSleeve && look.outfit !== "boubou") skinMeshes.push(upper);
    else topMeshes.push(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -upperLen;
    shoulder.add(elbow);

    const fore = capsule(0.045 * b, foreLen - 0.09, skin, -foreLen / 2, segs);
    elbow.add(fore);
    skinMeshes.push(fore);

    // Main avec paume et doigts
    const hand = new THREE.Group();
    hand.position.y = -foreLen - 0.02;
    elbow.add(hand);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.065 * b, 0.08, 0.035), skin);
    palm.position.y = -0.04;
    hand.add(palm);
    skinMeshes.push(palm);

    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 0.025), skin);
    thumb.position.set(side * -0.035 * b, -0.03, 0.015);
    hand.add(thumb);
    skinMeshes.push(thumb);

    return { shoulder, elbow, hand };
  };

  const armL = mkArm(-1);
  const armR = mkArm(1);

  // ── Jambes articulées : Hanche → Cuisse → Genou → Mollet → Pied ──
  const thighLen = legLen * 0.52;
  const shinLen = legLen * 0.48;

  const mkLeg = (side: 1 | -1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1 * b, 0, 0);
    hips.add(hip);

    const legCloth = isDress ? skin : bottom;
    const thigh = capsule(0.068 * b, thighLen - 0.13, legCloth, -thighLen / 2, segs);
    hip.add(thigh);
    if (isDress) skinMeshes.push(thigh);

    const knee = new THREE.Group();
    knee.position.y = -thighLen;
    hip.add(knee);

    // Rotule anatomique
    const patella = new THREE.Mesh(new THREE.SphereGeometry(0.035 * b, 6, 6), legCloth);
    patella.position.set(0, 0, 0.05 * b);
    knee.add(patella);

    const shin = capsule(0.058 * b, shinLen - 0.11, isDress ? skin : legCloth, -shinLen / 2, segs);
    knee.add(shin);
    if (isDress) skinMeshes.push(shin);

    // Chaussure avec semelle et profil
    const footGroup = new THREE.Group();
    footGroup.position.set(0, -shinLen - 0.01, 0.05);
    knee.add(footGroup);

    // Empeigne
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.095 * b, 0.07, 0.23), shoes);
    foot.castShadow = true;
    footGroup.add(foot);

    // Semelle en caoutchouc réaliste
    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.102 * b, 0.024, 0.24),
      mat(0xf1f5f9, 0.6)
    );
    sole.position.y = -0.04;
    footGroup.add(sole);

    return { hip, knee };
  };

  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  const rig: Rig = {
    root,
    hips,
    torso,
    neck,
    head,
    eyeL,
    eyeR,
    mouth: mouthMesh,
    shoulderL: armL.shoulder,
    shoulderR: armR.shoulder,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
    handL: armL.hand,
    handR: armR.hand,
    hipL: legL.hip,
    hipR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
    look,
    hipY,
    legLen,
    phase: 0,
    blinkTimer: 2.0 + Math.random() * 3.0,
    blend: { walk: 0, run: 0, wave: 0, handover: 0, sit: 0, ride: 0, cheer: 0, talk: 0 },
    skinMeshes,
    topMeshes,
    radius: 0.38 * b,
  };

  // Pose de repos naturelle
  armL.shoulder.rotation.z = 0.08;
  armR.shoulder.rotation.z = -0.08;

  return rig;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (cur: number, target: number, rate: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-rate * dt));

/**
 * Anime le rig avec transition fluide entre états, balancement naturel,
 * foulée physique (sans patinage de pieds) et clignements d'yeux.
 */
export function animateRig(
  rig: Rig,
  dt: number,
  pose: Pose,
  moveDist: number,
  running = false,
  time = performance.now() / 1000
) {
  const b = rig.blend;
  const k = 10; // vitesse de transition rapide et sans à-coups

  b.walk = damp(b.walk, pose === "walk" ? 1 : 0, k, dt);
  b.run = damp(b.run, pose === "run" ? 1 : 0, k, dt);
  b.wave = damp(b.wave, pose === "wave" ? 1 : 0, k, dt);
  b.handover = damp(b.handover, pose === "handover" ? 1 : 0, k, dt);
  b.sit = damp(b.sit, pose === "sit" ? 1 : 0, 14, dt);
  b.ride = damp(b.ride, pose === "ride" ? 1 : 0, 14, dt);
  b.cheer = damp(b.cheer, pose === "cheer" ? 1 : 0, k, dt);
  b.talk = damp(b.talk, pose === "talk" ? 1 : 0, k, dt);

  // Clignement des yeux périodique (facial)
  rig.blinkTimer -= dt;
  if (rig.blinkTimer <= 0) {
    rig.blinkTimer = 2.5 + Math.random() * 3.5;
  }
  const isBlinking = rig.blinkTimer < 0.12;
  rig.eyeL.scale.y = isBlinking ? 0.1 : 0.85;
  rig.eyeR.scale.y = isBlinking ? 0.1 : 0.85;

  // Animation de parole
  if (b.talk > 0.05) {
    const talkScale = 1 + Math.sin(time * 16) * 0.4 * b.talk;
    rig.mouth.scale.y = talkScale;
  } else {
    rig.mouth.scale.y = 1;
  }

  // Foulée proportionnelle à la distance parcourue réelle
  const stride = running ? 1.85 : 1.35;
  rig.phase += (moveDist / stride) * Math.PI * 2;
  if (rig.phase > Math.PI * 200) rig.phase -= Math.PI * 200;
  const ph = rig.phase;

  const gait = Math.max(b.walk, b.run);
  const amp = lerp(0.58, 0.9, b.run);
  const kneeAmp = lerp(0.85, 1.35, b.run);

  // Respiration naturelle au repos
  const idle = 1 - Math.min(1, gait + b.sit + b.ride);
  const breath = Math.sin(time * 1.5) * 0.015 * idle;
  const idleSway = Math.sin(time * 0.8) * 0.02 * idle;

  // ── Jambes : rotation fluide + élévation des genoux ──
  const swingL = Math.sin(ph) * amp * gait;
  const swingR = Math.sin(ph + Math.PI) * amp * gait;
  const kneeL = Math.max(0, -Math.sin(ph - 0.55)) * kneeAmp * gait;
  const kneeR = Math.max(0, -Math.sin(ph + Math.PI - 0.55)) * kneeAmp * gait;

  const sitLeg = -1.45 * b.sit + -1.0 * b.ride;
  const sitKnee = 1.5 * b.sit + 1.15 * b.ride;

  rig.hipL.rotation.x = swingL + sitLeg;
  rig.hipR.rotation.x = swingR + sitLeg;
  rig.kneeL.rotation.x = kneeL + sitKnee;
  rig.kneeR.rotation.x = kneeR + sitKnee;

  // Écartement des genoux sur moto
  rig.hipL.rotation.z = 0.35 * b.ride + idleSway * 0.5;
  rig.hipR.rotation.z = -0.35 * b.ride - idleSway * 0.5;

  // ── Bras : balancement opposé aux jambes ──
  const armSwing = lerp(0.38, 0.72, b.run) * gait;
  let shL = -Math.sin(ph) * armSwing;
  let shR = -Math.sin(ph + Math.PI) * armSwing;
  let elL = -0.22 - 0.9 * b.run * gait;
  let elR = -0.22 - 0.9 * b.run * gait;
  let shLz = 0.08;
  let shRz = -0.08;

  // Salut de la main (wave)
  const wave = b.wave;
  shR = lerp(shR, -2.6, wave);
  shRz = lerp(shRz, -0.6 + Math.sin(time * 9) * 0.25, wave);
  elR = lerp(elR, -0.9 + Math.sin(time * 9) * 0.3, wave);

  // Discussion avec les mains (talk)
  const talk = b.talk;
  shL = lerp(shL, -0.8 + Math.sin(time * 5) * 0.25, talk);
  shR = lerp(shR, -0.8 + Math.cos(time * 5) * 0.25, talk);
  elL = lerp(elL, -0.7 + Math.sin(time * 7) * 0.2, talk);
  elR = lerp(elR, -0.7 + Math.cos(time * 7) * 0.2, talk);

  // Remise de colis
  shL = lerp(shL, -1.35, b.handover);
  shR = lerp(shR, -1.35, b.handover);
  elL = lerp(elL, -0.2, b.handover);
  elR = lerp(elR, -0.2, b.handover);
  shLz = lerp(shLz, 0.25, b.handover);
  shRz = lerp(shRz, -0.25, b.handover);

  // Conduite (mains sur guidon ou volant)
  const drive = Math.max(b.sit, b.ride);
  shL = lerp(shL, -1.15 + 0.2 * b.ride, drive);
  shR = lerp(shR, -1.15 + 0.2 * b.ride, drive);
  elL = lerp(elL, -0.55, drive);
  elR = lerp(elR, -0.55, drive);
  shLz = lerp(shLz, 0.3, drive);
  shRz = lerp(shRz, -0.3, drive);

  // Joie / Victoire
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

  // ── Torse & Tête : inclinaison en course, torsion et regard ──
  rig.torso.rotation.x = 0.16 * b.run * gait + 0.32 * b.ride + 0.05 * b.sit + breath;
  rig.torso.rotation.y = Math.sin(ph) * 0.09 * gait;
  rig.hips.rotation.z = Math.sin(ph) * 0.05 * gait;
  rig.head.rotation.x = -0.25 * b.ride - breath * 1.5;
  rig.head.rotation.y = Math.sin(time * 0.6) * 0.15 * idle;

  // ── Hauteur des hanches : rebond de foulée ──
  const bounce = Math.abs(Math.sin(ph)) * lerp(0.035, 0.075, b.run) * gait;
  const cheerJump = Math.abs(Math.sin(time * 6)) * 0.12 * b.cheer;
  const sitDrop = -rig.legLen * 0.42 * b.sit - rig.legLen * 0.18 * b.ride;
  rig.hips.position.y = rig.hipY + bounce + cheerJump + sitDrop;
}

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

  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fs = 26;
  while (ctx.measureText(text).width > 232 && fs > 14) {
    fs -= 2;
    ctx.font = `bold ${fs}px system-ui, -apple-system, sans-serif`;
  }
  ctx.fillText(text, 128, 36);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.4, 0.9, 1);
  sp.renderOrder = 20;
  return sp;
}
