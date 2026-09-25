import { HALF } from "./constants";

// ─────────────────────────────────────────────────────────────
//  BENI (Nord-Kivu, RDC) — Communes, quartiers, avenues et points d'intérêt
//  Positions normalisées 0..1 sur la carte du jeu (0 = -HALF, 1 = +HALF)
// ─────────────────────────────────────────────────────────────

export interface Landmark {
  name: string;
  short: string;
  emoji: string;
  kind: string;
  fx: number;
  fz: number;
}

export type PoiType =
  | "shop"
  | "restaurant"
  | "kiosk"
  | "home"
  | "market"
  | "clothing"
  | "leisure"
  | "pharmacy"
  | "fuel"
  | "admin";

export interface Poi {
  name: string;
  type: PoiType;
  emoji: string;
  fx: number;
  fz: number;
  hasInterior?: boolean;
}

// Les 4 communes historiques de Beni + quartiers réels
const NEIGHBOURHOODS: Landmark[] = [
  // Commune de Beu
  { name: "Quartier Biautu - Beu", short: "Biautu", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.14, fz: 0.16 },
  { name: "Quartier Lyakobo - Beu", short: "Lyakobo", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.24, fz: 0.16 },
  { name: "Quartier Benengule - Beu", short: "Benengule", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.34, fz: 0.16 },
  { name: "Quartier Malepe - Beu", short: "Malepe", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.14, fz: 0.28 },
  { name: "Quartier Butanuka - Beu", short: "Butanuka", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.24, fz: 0.28 },
  { name: "Quartier Rwangoma - Beu", short: "Rwangoma", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.34, fz: 0.28 },
  // Commune de Bungulu
  { name: "Quartier Cité Belge - Bungulu", short: "Cité Belge", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.44, fz: 0.14 },
  { name: "Quartier Kanzulinzuli - Bungulu", short: "Kanzulinzuli", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.54, fz: 0.14 },
  { name: "Quartier Mabolio - Bungulu", short: "Mabolio", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.64, fz: 0.14 },
  { name: "Quartier Mambango - Bungulu", short: "Mambango", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.44, fz: 0.26 },
  { name: "Quartier Mukulya - Bungulu", short: "Mukulya", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.54, fz: 0.26 },
  { name: "Quartier Résidentiel - Bungulu", short: "Résidentiel", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.54, fz: 0.38 },
  // Commune de Mulekera
  { name: "Quartier Masiani - Mulekera", short: "Masiani", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.2, fz: 0.72 },
  { name: "Quartier Matembo - Mulekera", short: "Matembo", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.32, fz: 0.72 },
  { name: "Quartier Bundji - Mulekera", short: "Bundji", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.44, fz: 0.72 },
  { name: "Quartier Butsili - Mulekera", short: "Butsili", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.56, fz: 0.72 },
  { name: "Quartier Matonge - Mulekera", short: "Matonge", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.32, fz: 0.84 },
  { name: "Quartier Tamende - Mulekera", short: "Tamende", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.56, fz: 0.84 },
  // Commune de Ruwenzori
  { name: "Quartier Ngadi - Ruwenzori", short: "Ngadi", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.76, fz: 0.44 },
  { name: "Quartier Kasabinyole - Ruwenzori", short: "Kasabinyole", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.88, fz: 0.44 },
  { name: "Quartier Boikene - Ruwenzori", short: "Boikene", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.76, fz: 0.58 },
  { name: "Quartier Paida - Ruwenzori", short: "Paida", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.88, fz: 0.58 },
];

// Grands axes routiers et avenues de Beni
const AVENUES: Landmark[] = [
  { name: "Boulevard Mbusa Nyamwisi", short: "Bd Nyamwisi", emoji: "🛣️", kind: "Boulevard principal", fx: 0.32, fz: 0.45 },
  { name: "Avenue du Commerce", short: "Av. du Commerce", emoji: "🛣️", kind: "Avenue commerciale", fx: 0.5, fz: 0.46 },
  { name: "Route Nationale 2 (RN2 / Butembo)", short: "RN2", emoji: "🛣️", kind: "Route nationale", fx: 0.62, fz: 0.62 },
  { name: "Avenue de l'Aéroport Mavivi", short: "Av. Mavivi", emoji: "🛣️", kind: "Avenue", fx: 0.82, fz: 0.78 },
  { name: "Avenue de l'Hôpital Général", short: "Av. Hôpital", emoji: "🛣️", kind: "Avenue", fx: 0.42, fz: 0.18 },
  { name: "Avenue de l'Université UCBC", short: "Av. UCBC", emoji: "🛣️", kind: "Avenue", fx: 0.36, fz: 0.72 },
];

// Lieux emblématiques de Beni
const LANDMARKS: Landmark[] = [
  { name: "Grand Marché Central de Beni", short: "Grand Marché", emoji: "🏪", kind: "Marché central", fx: 0.5, fz: 0.5 },
  { name: "Hôtel de Ville / Mairie de Beni", short: "Mairie de Beni", emoji: "🏛️", kind: "Administration", fx: 0.4, fz: 0.42 },
  { name: "Commissariat Central de Police", short: "Commissariat", emoji: "🚓", kind: "Sécurité", fx: 0.62, fz: 0.48 },
  { name: "Station Service Cobil - Rond-Point", short: "Station Cobil", emoji: "⛽", kind: "Station-service", fx: 0.46, fz: 0.54 },
  { name: "Hôpital Général de Référence de Beni", short: "Hôpital Général", emoji: "🏥", kind: "Hôpital", fx: 0.42, fz: 0.16 },
  { name: "Stade du 15 Octobre", short: "Stade 15 Oct.", emoji: "🏟️", kind: "Stade", fx: 0.64, fz: 0.36 },
  { name: "Cathédrale Saint-Gustave de Beni", short: "Cathédrale", emoji: "⛪", kind: "Lieu de culte", fx: 0.56, fz: 0.84 },
  { name: "Université Chrétienne Bilingue (UCBC)", short: "UCBC", emoji: "🎓", kind: "Université", fx: 0.44, fz: 0.94 },
  { name: "Institut de Beni (École secondaire)", short: "Institut Beni", emoji: "🏫", kind: "École", fx: 0.28, fz: 0.62 },
  { name: "Gare routière des agences", short: "Gare routière", emoji: "🚏", kind: "Transport", fx: 0.18, fz: 0.56 },
  { name: "Aéroport de Beni-Mavivi", short: "Aéroport", emoji: "✈️", kind: "Aéroport", fx: 0.88, fz: 0.84 },
];

export const DISTRICTS: Landmark[] = [...NEIGHBOURHOODS, ...AVENUES, ...LANDMARKS];

// ── Points d'intérêt interactifs (visites, intérieurs, commerces, repos) ──
export const POIS: Poi[] = [
  // Bâtiments avec intérieurs 3D complets
  { name: "Maison du joueur - Masiani", type: "home", emoji: "🏠", fx: 0.32, fz: 0.88, hasInterior: true },
  { name: "Boutique Alimentation Kivu Express", type: "shop", emoji: "🏪", fx: 0.48, fz: 0.48, hasInterior: true },
  { name: "Restaurant Chez Mama Léontine", type: "restaurant", emoji: "🍽️", fx: 0.68, fz: 0.66, hasInterior: true },
  { name: "Pharmacie & Dispensaire de l'Espoir", type: "pharmacy", emoji: "💊", fx: 0.38, fz: 0.22, hasInterior: true },
  { name: "Station Cobil Express", type: "fuel", emoji: "⛽", fx: 0.46, fz: 0.54, hasInterior: false },

  // Boutiques & Ateliers
  { name: "Atelier Moto & Pièces Bungulu", type: "shop", emoji: "🔧", fx: 0.22, fz: 0.26 },
  { name: "Mode & Tissus Wax Beni Centre", type: "clothing", emoji: "👕", fx: 0.46, fz: 0.44 },
  { name: "Dépôt Vivres Mavivi", type: "shop", emoji: "🏪", fx: 0.84, fz: 0.82 },
  { name: "Boutique Artisanale Boikene", type: "shop", emoji: "🏪", fx: 0.78, fz: 0.32 },

  // Restaurants & Cafés
  { name: "Maquis Le Kivu Gourmand", type: "restaurant", emoji: "🍽️", fx: 0.64, fz: 0.52 },
  { name: "Cantine Universitaire UCBC", type: "restaurant", emoji: "🍽️", fx: 0.42, fz: 0.92 },
  { name: "Terrasse du Boulevard", type: "restaurant", emoji: "☕", fx: 0.34, fz: 0.42 },

  // Kiosques de rue & Épiceries rapides
  { name: "Kiosque Télécom Airtel / Orange", type: "kiosk", emoji: "📱", fx: 0.52, fz: 0.46 },
  { name: "Buvette Fraîcheur du Stade", type: "kiosk", emoji: "🥤", fx: 0.6, fz: 0.34 },
  { name: "Étal Fruits & Légumes du Marché", type: "market", emoji: "🧺", fx: 0.53, fz: 0.52 },
  { name: "Terrain Communautaire Boikene", type: "leisure", emoji: "⚽", fx: 0.74, fz: 0.56 },
];

export function landmarkWorld(l: Landmark | Poi): [number, number] {
  return [l.fx * (HALF * 2) - HALF, l.fz * (HALF * 2) - HALF];
}

export function getDistrictAt(x: number, z: number): string {
  let closestDist = Infinity;
  let closestName = "Beni Centre";

  for (const d of DISTRICTS) {
    const [dx, dz] = landmarkWorld(d);
    const distSq = (x - dx) * (x - dx) + (z - dz) * (z - dz);
    if (distSq < closestDist) {
      closestDist = distSq;
      closestName = d.name;
    }
  }

  return closestName;
}
