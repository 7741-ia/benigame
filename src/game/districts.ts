import { HALF } from "./constants";

// ─────────────────────────────────────────────────────────────
//  BENI (Nord-Kivu, RDC) — quartiers, communes, avenues et lieux réels
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
  | "leisure";

export interface Poi {
  name: string;
  type: PoiType;
  emoji: string;
  fx: number;
  fz: number;
}

// Les 4 communes de Beni + quartiers
const NEIGHBOURHOODS: Landmark[] = [
  // Commune de Beu (7 quartiers)
  { name: "Quartier Biautu - Beu", short: "Biautu", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.12, fz: 0.14 },
  { name: "Quartier Lyakobo - Beu", short: "Lyakobo", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.22, fz: 0.14 },
  { name: "Quartier Benengule - Beu", short: "Benengule", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.32, fz: 0.14 },
  { name: "Quartier Malepe - Beu", short: "Malepe", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.12, fz: 0.28 },
  { name: "Quartier Butanuka - Beu", short: "Butanuka", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.22, fz: 0.28 },
  { name: "Quartier Rwangoma - Beu", short: "Rwangoma", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.32, fz: 0.28 },
  { name: "Quartier Lubahemba - Beu", short: "Lubahemba", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.18, fz: 0.4 },
  // Commune de Bungulu (7 quartiers)
  { name: "Quartier Cité Belge - Bungulu", short: "Cité Belge", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.42, fz: 0.12 },
  { name: "Quartier Kanzulinzuli - Bungulu", short: "Kanzulinzuli", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.52, fz: 0.12 },
  { name: "Quartier Mabolio - Bungulu", short: "Mabolio", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.62, fz: 0.12 },
  { name: "Quartier Mambango - Bungulu", short: "Mambango", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.42, fz: 0.26 },
  { name: "Quartier Mukulya - Bungulu", short: "Mukulya", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.52, fz: 0.26 },
  { name: "Quartier Pasisi - Bungulu", short: "Pasisi", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.62, fz: 0.26 },
  { name: "Quartier Résidentiel - Bungulu", short: "Résidentiel", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.52, fz: 0.39 },
  // Commune de Mulekera (10 quartiers)
  { name: "Quartier Masiani - Mulekera", short: "Masiani", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.18, fz: 0.7 },
  { name: "Quartier Matembo - Mulekera", short: "Matembo", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.3, fz: 0.7 },
  { name: "Quartier Bundji - Mulekera", short: "Bundji", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.42, fz: 0.7 },
  { name: "Quartier Butsili - Mulekera", short: "Butsili", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.54, fz: 0.7 },
  { name: "Quartier Kasanga-Tuha - Mulekera", short: "Kasanga-Tuha", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.66, fz: 0.7 },
  { name: "Quartier Kalinda - Mulekera", short: "Kalinda", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.18, fz: 0.84 },
  { name: "Quartier Matonge - Mulekera", short: "Matonge", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.3, fz: 0.84 },
  { name: "Quartier Ngongolio - Mulekera", short: "Ngongolio", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.42, fz: 0.84 },
  { name: "Quartier Tamende - Mulekera", short: "Tamende", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.54, fz: 0.84 },
  { name: "Quartier Sayo - Mulekera", short: "Sayo", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.66, fz: 0.84 },
  // Commune de Ruwenzori (6 quartiers)
  { name: "Quartier Ngadi - Ruwenzori", short: "Ngadi", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.76, fz: 0.42 },
  { name: "Quartier Kasabinyole - Ruwenzori", short: "Kasabinyole", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.88, fz: 0.42 },
  { name: "Quartier Boikene - Ruwenzori", short: "Boikene", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.76, fz: 0.56 },
  { name: "Quartier Paida - Ruwenzori", short: "Paida", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.88, fz: 0.56 },
  { name: "Quartier Mabakanga - Ruwenzori", short: "Mabakanga", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.76, fz: 0.7 },
  { name: "Quartier Nzuma - Ruwenzori", short: "Nzuma", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.88, fz: 0.7 },
];

// Avenues et grands axes de Beni
const AVENUES: Landmark[] = [
  { name: "Avenue du Commerce", short: "Av. du Commerce", emoji: "🛣️", kind: "Avenue", fx: 0.5, fz: 0.44 },
  { name: "Boulevard Mbusa Nyamwisi", short: "Bd Nyamwisi", emoji: "🔵", kind: "Boulevard", fx: 0.28, fz: 0.42 },
  { name: "Route Nationale 2 (RN2)", short: "RN2", emoji: "🛣️", kind: "Route nationale", fx: 0.6, fz: 0.62 },
  { name: "Avenue de l'Aéroport", short: "Av. de l'Aéroport", emoji: "🛣️", kind: "Avenue", fx: 0.82, fz: 0.78 },
  { name: "Route de Butembo", short: "Route de Butembo", emoji: "🛣️", kind: "Route", fx: 0.68, fz: 0.18 },
  { name: "Route de Goma", short: "Route de Goma", emoji: "🛣️", kind: "Route", fx: 0.1, fz: 0.34 },
  { name: "Avenue de l'Hôpital", short: "Av. de l'Hôpital", emoji: "🛣️", kind: "Avenue", fx: 0.4, fz: 0.14 },
  { name: "Avenue de l'Université", short: "Av. de l'Université", emoji: "🛣️", kind: "Avenue", fx: 0.32, fz: 0.7 },
];

// Lieux emblématiques de Beni
const LANDMARKS: Landmark[] = [
  { name: "Grand Marché de Beni", short: "Grand Marché", emoji: "🏪", kind: "Marché", fx: 0.5, fz: 0.5 },
  { name: "Aéroport de Beni-Mavivi", short: "Aéroport", emoji: "✈️", kind: "Aéroport", fx: 0.88, fz: 0.85 },
  { name: "Hôpital Général de Beni", short: "Hôpital Général", emoji: "🏥", kind: "Hôpital", fx: 0.42, fz: 0.15 },
  { name: "Stade Matata", short: "Stade Matata", emoji: "🏟️", kind: "Stade", fx: 0.6, fz: 0.35 },
  {
    name: "Université Chrétienne Bilingue du Congo (UCBC)",
    short: "UCBC",
    emoji: "🎓",
    kind: "Université",
    fx: 0.42,
    fz: 0.95,
  },
  { name: "Université de Beni", short: "Université de Beni", emoji: "🎓", kind: "Université", fx: 0.35, fz: 0.68 },
  { name: "Gare routière de Beni", short: "Gare routière", emoji: "🚏", kind: "Gare", fx: 0.15, fz: 0.55 },
  { name: "Cathédrale de Beni", short: "Cathédrale", emoji: "⛪", kind: "Église", fx: 0.55, fz: 0.85 },
  { name: "Commissariat central de Beni", short: "Commissariat", emoji: "🚓", kind: "Police", fx: 0.62, fz: 0.5 },
  { name: "Port fluvial de Beni (Rwenzori)", short: "Port fluvial", emoji: "⚓", kind: "Port", fx: 0.9, fz: 0.68 },
];

export const DISTRICTS: Landmark[] = [...NEIGHBOURHOODS, ...AVENUES, ...LANDMARKS];

// ── Commerces : boutiques (véhicules + équipements), restaurants (repos), kiosques (nitro) ──
export const POIS: Poi[] = [
  { name: "Maison du joueur - Masiani", type: "home", emoji: "🏠", fx: 0.3, fz: 0.9 },
  // Boutiques — acheter véhicules et améliorations
  { name: "Boutique Moto Centre", type: "shop", emoji: "🏪", fx: 0.47, fz: 0.48 },
  { name: "Quincaillerie Bungulu", type: "shop", emoji: "🏪", fx: 0.18, fz: 0.25 },
  { name: "Boutique Mulekera", type: "shop", emoji: "🏪", fx: 0.78, fz: 0.3 },
  { name: "Dépôt de Mavivi", type: "shop", emoji: "🏪", fx: 0.85, fz: 0.82 },
  { name: "Boutique Masiani", type: "shop", emoji: "🏪", fx: 0.34, fz: 0.9 },
  { name: "Mode Beni Centre", type: "clothing", emoji: "👕", fx: 0.46, fz: 0.42 },
  { name: "Atelier Kanzulinzuli", type: "clothing", emoji: "👕", fx: 0.26, fz: 0.73 },
  // Restaurants — manger pour récupérer (fatigue)
  { name: "Chez Mama Léontine", type: "restaurant", emoji: "🍽️", fx: 0.7, fz: 0.68 },
  { name: "Maquis Le Kivu", type: "restaurant", emoji: "🍽️", fx: 0.66, fz: 0.53 },
  { name: "Cantine UCBC", type: "restaurant", emoji: "🍽️", fx: 0.4, fz: 0.93 },
  { name: "Maquis du Grand Marché", type: "restaurant", emoji: "🍽️", fx: 0.52, fz: 0.47 },
  // Kiosques / buvettes — nitro + collations rapides
  { name: "Buvette Kanzulinzuli", type: "kiosk", emoji: "🥤", fx: 0.22, fz: 0.75 },
  { name: "Kiosque du Stade", type: "kiosk", emoji: "🥤", fx: 0.58, fz: 0.32 },
  { name: "Buvette Rwampara", type: "kiosk", emoji: "🥤", fx: 0.13, fz: 0.44 },
  { name: "Marché des ingrédients", type: "market", emoji: "🧺", fx: 0.54, fz: 0.52 },
  { name: "Terrain communautaire Boikene", type: "leisure", emoji: "🎉", fx: 0.72, fz: 0.58 },
  { name: "Place du Boulevard", type: "leisure", emoji: "🎵", fx: 0.3, fz: 0.4 },
];

export function landmarkWorld(l: Landmark | Poi): [number, number] {
  return [l.fx * (HALF * 2) - HALF, l.fz * (HALF * 2) - HALF];
}
