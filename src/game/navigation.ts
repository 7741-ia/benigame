import { CELL, GRID_LINES, HALF, WORLD } from "./constants";
import { DISTRICTS, POIS, landmarkWorld, getDistrictAt, type PoiType } from "./districts";

export interface Point2D {
  x: number;
  z: number;
}

export interface RoadRoute {
  points: Point2D[];
  distanceMeters: number;
  targetDistrict: string;
  targetLabel: string;
}

export interface MapPlace {
  id: string;
  name: string;
  short: string;
  emoji: string;
  kind: string;
  type: PoiType | "district" | "avenue";
  x: number;
  z: number;
  district: string;
  minZoomTier: 1 | 2 | 3 | 4; // 1: visible at all zooms, 2: medium+, 3: close+, 4: very close
}

export const ROAD_COORDS: number[] = Array.from(
  { length: GRID_LINES },
  (_, i) => i * CELL - HALF
);

/** Trouve la coordonnée de route la plus proche d'une valeur le long d'un axe */
export function nearestRoadCoord(val: number): number {
  let best = ROAD_COORDS[0];
  let minD = Infinity;
  for (const c of ROAD_COORDS) {
    const d = Math.abs(c - val);
    if (d < minD) {
      minD = d;
      best = c;
    }
  }
  return best;
}

/** Projette un point quelconque sur le réseau routier le plus proche */
export function snapToRoadNetwork(x: number, z: number): Point2D {
  const rx = nearestRoadCoord(x);
  const rz = nearestRoadCoord(z);
  const dx = Math.abs(rx - x);
  const dz = Math.abs(rz - z);
  // Aligne sur l'axe le plus proche
  if (dx < dz) {
    return { x: rx, z };
  }
  return { x, z: rz };
}

/**
 * Calcule un itinéraire routier réaliste qui suit strictement les avenues et carrefours de Beni.
 * Ne traverse JAMAIS les bâtiments en ligne droite.
 */
export function calculateRoadRoute(
  startX: number,
  startZ: number,
  destX: number,
  destZ: number,
  label = "Destination"
): RoadRoute {
  const pStartRoad = snapToRoadNetwork(startX, startZ);
  const pDestRoad = snapToRoadNetwork(destX, destZ);

  // Carrefours de la grille routière
  const roadX1 = nearestRoadCoord(pStartRoad.x);
  const roadZ1 = nearestRoadCoord(pStartRoad.z);
  const roadX2 = nearestRoadCoord(pDestRoad.x);
  const roadZ2 = nearestRoadCoord(pDestRoad.z);

  // Deux options d'itinéraires sur la grille (X d'abord ou Z d'abord)
  // Option A : le joueur emprunte l'axe X le plus proche puis bifurque sur l'axe Z
  const candA: Point2D[] = [
    { x: startX, z: startZ },
    { x: pStartRoad.x, z: pStartRoad.z },
    { x: roadX1, z: pStartRoad.z },
    { x: roadX1, z: roadZ2 },
    { x: roadX2, z: roadZ2 },
    { x: pDestRoad.x, z: pDestRoad.z },
    { x: destX, z: destZ },
  ];

  // Option B : le joueur emprunte l'axe Z le plus proche puis bifurque sur l'axe X
  const candB: Point2D[] = [
    { x: startX, z: startZ },
    { x: pStartRoad.x, z: pStartRoad.z },
    { x: pStartRoad.x, z: roadZ1 },
    { x: roadX2, z: roadZ1 },
    { x: roadX2, z: roadZ2 },
    { x: pDestRoad.x, z: pDestRoad.z },
    { x: destX, z: destZ },
  ];

  const calcLen = (pts: Point2D[]) => {
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    return d;
  };

  const lenA = calcLen(candA);
  const lenB = calcLen(candB);
  const rawPoints = lenA <= lenB ? candA : candB;

  // Nettoyage des points consécutifs trop proches ou colinéaires
  const cleaned: Point2D[] = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i];
    if (cleaned.length === 0) {
      cleaned.push(pt);
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.z - prev.z) < 1.0) {
      continue;
    }
    // Si 3 points sont alignés sur le même axe X ou Z, simplifier le point intermédiaire
    if (cleaned.length >= 2) {
      const prevPrev = cleaned[cleaned.length - 2];
      const sameX = Math.abs(prevPrev.x - prev.x) < 0.1 && Math.abs(prev.x - pt.x) < 0.1;
      const sameZ = Math.abs(prevPrev.z - prev.y) < 0.1 && Math.abs(prev.z - pt.z) < 0.1;
      if (sameX || sameZ) {
        cleaned.pop(); // remplace le point intermédiaire
      }
    }
    cleaned.push(pt);
  }

  // Distance totale réelle calculée le long du tracé routier
  let totalDistance = 0;
  for (let i = 1; i < cleaned.length; i++) {
    totalDistance += Math.hypot(cleaned[i].x - cleaned[i - 1].x, cleaned[i].z - cleaned[i - 1].z);
  }

  return {
    points: cleaned,
    distanceMeters: Math.round(totalDistance),
    targetDistrict: getDistrictAt(destX, destZ),
    targetLabel: label,
  };
}

/** Formate la distance de manière lisible (ex: "850 m" ou "1.4 km") */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Construit la liste enrichie de tous les lieux de Beni avec niveau de zoom recommandé */
export function getEnrichedMapPlaces(): MapPlace[] {
  const places: MapPlace[] = [];

  // 1. Quartiers principaux
  DISTRICTS.forEach((d, i) => {
    const [x, z] = landmarkWorld(d);
    const isMajor =
      d.name.includes("Biautu") ||
      d.name.includes("Masiani") ||
      d.name.includes("Bungulu") ||
      d.name.includes("Mulekera") ||
      d.name.includes("Ruwenzori") ||
      d.name.includes("Marché") ||
      d.name.includes("Hôpital") ||
      d.name.includes("Mairie") ||
      d.name.includes("Boulevard");

    places.push({
      id: `district-${i}`,
      name: d.name,
      short: d.short,
      emoji: d.emoji,
      kind: d.kind,
      type: "district",
      x,
      z,
      district: getDistrictAt(x, z),
      minZoomTier: isMajor ? 1 : 2,
    });
  });

  // 2. Points d'intérêt (commerces, maison, restaurants, services)
  POIS.forEach((p, i) => {
    const [x, z] = landmarkWorld(p);
    const isPrimary = p.type === "home" || p.type === "restaurant" || p.type === "shop" || p.type === "fuel";
    const isSecondary = p.type === "pharmacy" || p.type === "market" || p.type === "clothing";

    places.push({
      id: `poi-${i}`,
      name: p.name,
      short: p.name,
      emoji: p.emoji,
      kind: p.type === "home" ? "Maison du joueur" : p.type,
      type: p.type,
      x,
      z,
      district: getDistrictAt(x, z),
      minZoomTier: isPrimary ? 1 : isSecondary ? 2 : 3,
    });
  });

  return places;
}
