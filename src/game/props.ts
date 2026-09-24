import * as THREE from "three";
import type { PoiType } from "./districts";
import { makeLabelTexture, makeMetalRoof, makePlaster } from "./textures";

// Petits commerces et lieux nommés (POI) : vrais kiosques, maison, paillote —
// quelques dizaines d'objets, donc des meshes classiques avec matériaux partagés.

const cache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  let m = cache.get(key);
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
}
const paint = (hex: number, roughness = 0.7, metalness = 0) =>
  mat(`p${hex}-${roughness}-${metalness}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness }));
const plaster = (hex: number) =>
  mat(`pl${hex}`, () => new THREE.MeshStandardMaterial({ map: makePlaster(41), color: hex, roughness: 0.95 }));
const roof = (rusty: boolean) =>
  mat(`roof${rusty}`, () =>
    new THREE.MeshStandardMaterial({
      map: makeMetalRoof(rusty, rusty ? 43 : 44),
      roughness: rusty ? 0.8 : 0.55,
      metalness: rusty ? 0.25 : 0.5,
    })
  );
const bulb = (hex: number) =>
  mat(`b${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.6 }));

const SIGN_BG: Record<PoiType, string> = {
  shop: "#1f4e79",
  restaurant: "#2e7d4f",
  kiosk: "#e07a1f",
  home: "#8b5e3c",
  market: "#b3261e",
  clothing: "#5b2d8e",
  leisure: "#0e7c86",
};
const GOODS = [0xd63b2f, 0xe8c531, 0x4f8a3a, 0xc27a3a, 0x2c4f7c, 0xf2f2f2, 0x8b2f2f];
const CLOTHES = [0xd63b2f, 0xf2c12e, 0x2c4f7c, 0x2e7d4f, 0xf5f1e8, 0x5b2d8e, 0xe07a1f];

export interface KioskGroup extends THREE.Group {
  signMat: THREE.MeshStandardMaterial;
}

/** Construit un commerce nommé face à +z local ; rotY oriente la devanture vers la route. */
export function buildKiosk(
  scene: THREE.Scene,
  x: number,
  z: number,
  rotY: number,
  type: PoiType,
  label: string,
  accent: number
): KioskGroup {
  const g = new THREE.Group() as KioskGroup;
  const M = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    px: number,
    py: number,
    pz: number,
    rx = 0,
    ry = 0,
    rz = 0
  ) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const signTex = makeLabelTexture(label, SIGN_BG[type]);
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissiveMap: signTex,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 0.7,
  });
  g.signMat = signMat;
  const y0 = 0.5; // dessus de la dalle
  const slabW = type === "restaurant" ? 5.8 : 4.2;
  M(new THREE.BoxGeometry(slabW, 0.2, 4.0), paint(0xa8a39a, 1), 0, 0.4, 0);
  const wood = paint(0x7d5a38, 0.9);
  const woodLight = paint(0xa77f55, 0.85);
  const dark = paint(0x2a2622, 0.8);
  const steel = paint(0x3a3d42, 0.5, 0.6);
  const accentLight = new THREE.Color(accent).lerp(new THREE.Color(0xffffff), 0.55).getHex();

  if (type === "home") {
    // petite maison : murs enduits, porte bleue, fenêtre à barreaux, toit en tôle, plantes, clôture
    const wallM = plaster(0xe9dfc8);
    M(new THREE.BoxGeometry(3.8, 2.8, 3.2), wallM, 0, y0 + 1.4, -0.2);
    M(new THREE.BoxGeometry(3.92, 0.45, 3.32), plaster(0xa8896a), 0, y0 + 0.22, -0.2);
    M(new THREE.BoxGeometry(0.9, 2.0, 0.06), paint(0x2c4f7c, 0.45, 0.4), 0.8, y0 + 1.0, 1.43);
    M(new THREE.BoxGeometry(1.1, 0.1, 0.1), paint(0xf0ece3), 0.8, y0 + 2.05, 1.43);
    for (const sx of [-1, 1]) M(new THREE.BoxGeometry(0.1, 2.0, 0.1), paint(0xf0ece3), 0.8 + sx * 0.5, y0 + 1.0, 1.43);
    M(new THREE.BoxGeometry(0.95, 0.9, 0.05), paint(0x1b2a38, 0.15, 0.6), -0.9, y0 + 1.6, 1.43);
    M(new THREE.BoxGeometry(1.15, 0.1, 0.1), paint(0xf0ece3), -0.9, y0 + 2.1, 1.43);
    M(new THREE.BoxGeometry(1.15, 0.1, 0.1), paint(0xf0ece3), -0.9, y0 + 1.1, 1.43);
    M(new THREE.BoxGeometry(1.15, 0.08, 0.28), paint(0xbfb9ad), -0.9, y0 + 1.02, 1.52);
    for (const k of [-1, 0, 1]) M(new THREE.BoxGeometry(0.04, 0.9, 0.04), steel, -0.9 + k * 0.25, y0 + 1.6, 1.48);
    M(new THREE.BoxGeometry(1.6, 0.14, 0.7), paint(0xa9a49b, 1), 0.8, y0 + 0.07, 1.75);
    // toit à deux pans (faîtage selon x) avec pignons
    const a = 0.4;
    const ridge = y0 + 2.8 + 1.6 * Math.tan(a);
    const L = (1.6 + 0.6) / Math.cos(a);
    for (const s of [1, -1]) {
      M(new THREE.BoxGeometry(4.8, 0.08, L), roof(true), 0, ridge - (L / 2) * Math.sin(a), -0.2 + s * (L / 2) * Math.cos(a), s * a);
    }
    M(new THREE.BoxGeometry(4.8, 0.08, 0.4), roof(true), 0, ridge + 0.03, -0.2);
    const tri = new THREE.Shape();
    tri.moveTo(-1.6, 0);
    tri.lineTo(1.6, 0);
    tri.lineTo(0, 1.6 * Math.tan(a));
    tri.closePath();
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), wallM);
      m.position.set(s * 1.9, y0 + 2.8, -0.2);
      m.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(m);
    }
    // enseigne discrète au-dessus de la porte
    M(new THREE.BoxGeometry(2.3, 0.44, 0.05), dark, -0.1, y0 + 2.5, 1.43);
    M(new THREE.PlaneGeometry(2.2, 0.36), signMat, -0.1, y0 + 2.5, 1.46);
    for (const sx of [-1, 1]) {
      M(new THREE.CylinderGeometry(0.2, 0.16, 0.35, 8), paint(0xb0603a, 0.9), sx * 1.7, y0 + 0.175, 1.6);
      M(new THREE.IcosahedronGeometry(0.32, 1), paint(0x3f7d32, 0.9), sx * 1.7, y0 + 0.62, 1.6);
    }
    // clôture basse en bois devant, avec passage vers la porte
    for (let k = 0; k < 7; k++) {
      const px = -2.0 + k * 0.66;
      if (px > 0.2 && px < 1.4) continue;
      M(new THREE.BoxGeometry(0.06, 0.7, 0.06), woodLight, px, y0 + 0.35, 1.92);
    }
    M(new THREE.BoxGeometry(2.3, 0.05, 0.04), woodLight, -0.85, y0 + 0.55, 1.92);
    M(new THREE.BoxGeometry(0.6, 0.05, 0.04), woodLight, 1.75, y0 + 0.55, 1.92);
  } else if (type === "leisure") {
    // paillote : quatre poteaux, toit en tôle, bancs, guirlande, enceinte
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M(new THREE.CylinderGeometry(0.1, 0.1, 3.0, 8), paint(0x5a3d28, 0.9), sx * 1.7, y0 + 1.5, sz * 1.5);
    M(new THREE.BoxGeometry(4.4, 0.08, 4.0), roof(false), 0, y0 + 3.05, 0);
    for (const sx of [-1, 1]) {
      M(new THREE.BoxGeometry(1.5, 0.08, 0.4), woodLight, sx * 0.9, y0 + 0.55, -0.9);
      for (const k of [-1, 1]) M(new THREE.BoxGeometry(0.08, 0.5, 0.35), wood, sx * 0.9 + k * 0.6, y0 + 0.25, -0.9);
    }
    const colors = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xea80fc];
    for (let k = 0; k < 9; k++) M(new THREE.SphereGeometry(0.06, 6, 6), bulb(colors[k % colors.length]), -1.6 + k * 0.4, y0 + 2.88 - (k % 2) * 0.12, 1.9);
    M(new THREE.BoxGeometry(0.5, 0.8, 0.4), paint(0x1b1b1b, 0.8), -1.5, y0 + 0.4, 0.8);
    M(new THREE.BoxGeometry(3.5, 0.6, 0.06), dark, 0, y0 + 2.65, 2.0);
    M(new THREE.PlaneGeometry(3.4, 0.5), signMat, 0, y0 + 2.65, 2.04);
  } else {
    // kiosque / boutique : trois murs, comptoir, étagères garnies, poteaux, toit en tôle, enseigne
    const woodenShack = type === "kiosk" || type === "market";
    const wallM = woodenShack ? wood : plaster(accentLight);
    M(new THREE.BoxGeometry(3.2, 2.3, 0.12), wallM, 0, y0 + 1.15, -1.4);
    for (const sx of [-1, 1]) M(new THREE.BoxGeometry(0.12, 2.3, 2.8), wallM, sx * 1.6, y0 + 1.15, 0);
    M(new THREE.BoxGeometry(3.2, 0.95, 0.5), wood, 0, y0 + 0.475, 1.15);
    M(new THREE.BoxGeometry(3.3, 0.06, 0.62), woodLight, 0, y0 + 0.98, 1.15);
    for (const sy of [1.05, 1.6]) {
      M(new THREE.BoxGeometry(2.8, 0.05, 0.35), woodLight, 0, y0 + sy, -1.2);
      for (let k = 0; k < 6; k++) {
        M(new THREE.BoxGeometry(0.3, 0.32, 0.25), paint(GOODS[(k + (sy > 1.2 ? 3 : 0)) % GOODS.length], 0.6), -1.25 + k * 0.5, y0 + sy + 0.19, -1.2);
      }
    }
    for (const sx of [-1, 1]) M(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), steel, sx * 1.55, y0 + 1.2, 1.35);
    M(new THREE.BoxGeometry(4.4, 0.08, 4.6), roof(woodenShack), 0, y0 + 2.62, 0.3, 0.1);
    M(new THREE.BoxGeometry(3.5, 0.72, 0.06), dark, 0, y0 + 2.1, 1.4);
    M(new THREE.PlaneGeometry(3.4, 0.6), signMat, 0, y0 + 2.1, 1.44);

    if (type === "restaurant") {
      M(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16), paint(0xd9d3c7, 0.6), 2.35, y0 + 0.76, 1.2);
      M(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8), steel, 2.35, y0 + 0.375, 1.2);
      for (const k of [-1, 1]) M(new THREE.BoxGeometry(0.42, 0.42, 0.42), paint(0xb3261e, 0.5), 2.35 + k * 0.7, y0 + 0.21, 1.2);
      M(new THREE.ConeGeometry(1.2, 0.6, 8), paint(accent, 0.9), 2.35, y0 + 2.3, 1.2);
      M(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), steel, 2.35, y0 + 1.5, 1.2);
    } else if (type === "clothing") {
      M(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 6), steel, 0, y0 + 1.95, 1.0, 0, 0, Math.PI / 2);
      for (let k = 0; k < 6; k++) M(new THREE.BoxGeometry(0.36, 0.52, 0.06), paint(CLOTHES[k % CLOTHES.length], 0.85), -1.25 + k * 0.5, y0 + 1.65, 1.0);
    } else if (type === "market") {
      const produce = [0xd63b2f, 0xe8c531, 0x4f8a3a, 0xc27a3a];
      for (let k = 0; k < 4; k++) {
        M(new THREE.BoxGeometry(0.6, 0.4, 0.5), wood, -1.35 + k * 0.9, y0 + 0.2, 1.75);
        M(new THREE.BoxGeometry(0.52, 0.16, 0.42), paint(produce[k], 0.8), -1.35 + k * 0.9, y0 + 0.48, 1.75);
      }
    } else if (type === "kiosk") {
      for (let k = 0; k < 3; k++) M(new THREE.BoxGeometry(0.5, 0.34, 0.36), paint(k % 2 ? 0xe8c531 : 0xb3261e, 0.5), -1.7, y0 + 0.17 + k * 0.34, 1.75);
      M(new THREE.ConeGeometry(1.1, 0.55, 8), paint(accent, 0.9), 1.7, y0 + 2.25, 1.7);
      M(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), steel, 1.7, y0 + 1.45, 1.7);
    } else {
      // boutique moto : pneus, fût d'huile
      M(new THREE.TorusGeometry(0.32, 0.1, 8, 18), paint(0x1b1b1b, 0.9), 1.75, y0 + 0.42, 1.7, 0, 0.3);
      M(new THREE.TorusGeometry(0.32, 0.1, 8, 18), paint(0x1b1b1b, 0.9), 1.35, y0 + 0.42, 1.95, 0, -0.4);
      M(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), paint(0x2c4f7c, 0.5, 0.3), -1.7, y0 + 0.45, 1.7);
    }
  }

  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  return g;
}
