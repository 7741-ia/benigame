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
  // Commune de Beu (Nord & Nord-Ouest)
  { name: "Quartier Biautu - Beu", short: "Biautu", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.18, fz: 0.18 },
  { name: "Quartier Lyakobo - Beu", short: "Lyakobo", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.28, fz: 0.18 },
  { name: "Quartier Benengule - Beu", short: "Benengule", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.38, fz: 0.18 },
  { name: "Quartier Malepe - Beu", short: "Malepe", emoji: "🏘️", kind: "Quartier Populaire · Beu", fx: 0.26, fz: 0.44 },
  { name: "Quartier Kalinda - Beu", short: "Kalinda", emoji: "🏘️", kind: "Quartier Populaire · Beu", fx: 0.22, fz: 0.52 },
  { name: "Quartier Butanuka - Beu", short: "Butanuka", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.16, fz: 0.32 },
  { name: "Quartier Rwangoma - Beu", short: "Rwangoma", emoji: "🏘️", kind: "Quartier · Beu", fx: 0.32, fz: 0.26 },

  // Commune de Bungulu (Nord-Est & Centre Administratif)
  { name: "Quartier Cité Belge - Bungulu", short: "Cité Belge", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.44, fz: 0.22 },
  { name: "Quartier Kanzulinzuli - Bungulu", short: "Kanzulinzuli", emoji: "🌾", kind: "Zone Périphérique · Bungulu", fx: 0.14, fz: 0.12 },
  { name: "Quartier Mabolio - Bungulu", short: "Mabolio", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.62, fz: 0.22 },
  { name: "Quartier Mambango - Bungulu", short: "Mambango", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.52, fz: 0.22 },
  { name: "Quartier Mukulya - Bungulu", short: "Mukulya", emoji: "🏘️", kind: "Quartier · Bungulu", fx: 0.68, fz: 0.32 },
  { name: "Quartier Résidentiel - Bungulu", short: "Résidentiel", emoji: "🏡", kind: "Quartier · Bungulu", fx: 0.48, fz: 0.34 },

  // Commune de Mulekera (Sud & Résidentiel Masiani)
  { name: "Quartier Masiani - Mulekera", short: "Masiani", emoji: "🏡", kind: "Quartier Résidentiel · Mulekera", fx: 0.3667, fz: 0.7000 },
  { name: "Quartier Matembo - Mulekera", short: "Matembo", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.26, fz: 0.74 },
  { name: "Quartier Bundji - Mulekera", short: "Bundji", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.44, fz: 0.82 },
  { name: "Quartier Butsili - Mulekera", short: "Butsili", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.56, fz: 0.82 },
  { name: "Quartier Matonge - Mulekera", short: "Matonge", emoji: "🏪", kind: "Centre Commercial · Mulekera", fx: 0.58, fz: 0.52 },
  { name: "Quartier Tamende - Mulekera", short: "Tamende", emoji: "🏘️", kind: "Quartier · Mulekera", fx: 0.64, fz: 0.74 },

  // Commune de Ruwenzori (Est & Périphérie Industrielle)
  { name: "Quartier Ngadi - Ruwenzori", short: "Ngadi", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.78, fz: 0.44 },
  { name: "Quartier Kasabinyole - Ruwenzori", short: "Kasabinyole", emoji: "🏘️", kind: "Quartier · Ruwenzori", fx: 0.86, fz: 0.44 },
  { name: "Quartier Boikene - Ruwenzori", short: "Boikene", emoji: "🌾", kind: "Zone Verte · Ruwenzori", fx: 0.82, fz: 0.62 },
  { name: "Quartier Paida - Ruwenzori", short: "Paida", emoji: "🌾", kind: "Zone Périphérique · Ruwenzori", fx: 0.88, fz: 0.72 },
];

// Grands axes routiers et avenues de Beni
const AVENUES: Landmark[] = [
  { name: "Boulevard Mbusa Nyamwisi", short: "Bd Nyamwisi", emoji: "🛣️", kind: "Grand Boulevard Central", fx: 0.50, fz: 0.50 },
  { name: "Avenue du Commerce", short: "Av. du Commerce", emoji: "🛣️", kind: "Avenue Commerciale", fx: 0.56, fz: 0.46 },
  { name: "Route Nationale 2 (RN2 / Butembo)", short: "RN2 Butembo", emoji: "🛣️", kind: "Route Nationale", fx: 0.50, fz: 0.88 },
  { name: "Route de l'Aéroport Mavivi", short: "Route Mavivi", emoji: "🛣️", kind: "Axe Périphérique", fx: 0.84, fz: 0.22 },
  { name: "Avenue de l'Hôpital Général", short: "Av. Hôpital", emoji: "🛣️", kind: "Avenue Urbaine", fx: 0.36, fz: 0.30 },
  { name: "Avenue de l'Université UCBC", short: "Av. UCBC", emoji: "🛣️", kind: "Avenue Campus", fx: 0.70, fz: 0.76 },
];

// Lieux emblématiques de Beni
const LANDMARKS: Landmark[] = [
  { name: "Grand Marché Central de Beni", short: "Grand Marché", emoji: "🏪", kind: "Marché Central", fx: 0.6333, fz: 0.5000 },
  { name: "Hôtel de Ville / Mairie de Beni", short: "Mairie de Beni", emoji: "🏛️", kind: "Administration", fx: 0.4333, fz: 0.5000 },
  { name: "Commissariat Central de Police", short: "Commissariat", emoji: "🚓", kind: "Sécurité", fx: 0.5000, fz: 0.4333 },
  { name: "Station Service Cobil & Total", short: "Station Cobil", emoji: "⛽", kind: "Station-Service", fx: 0.7000, fz: 0.3667 },
  { name: "Hôpital Général de Référence de Beni", short: "Hôpital Général", emoji: "🏥", kind: "Santé", fx: 0.3667, fz: 0.3000 },
  { name: "Stade du 15 Octobre", short: "Stade 15 Oct.", emoji: "🏟️", kind: "Stade Municipal", fx: 0.7667, fz: 0.5000 },
  { name: "Cathédrale Saint-Gustave de Beni", short: "Cathédrale", emoji: "⛪", kind: "Lieu de Culte", fx: 0.6333, fz: 0.7000 },
  { name: "Université Chrétienne Bilingue (UCBC)", short: "UCBC", emoji: "🎓", kind: "Campus Universitaire", fx: 0.7000, fz: 0.7667 },
  { name: "Institut de Beni (École Secondaire)", short: "Institut Beni", emoji: "🏫", kind: "Éducation", fx: 0.3000, fz: 0.3000 },
  { name: "Gare Routière des Agences", short: "Gare Routière", emoji: "🚏", kind: "Transport & Fret", fx: 0.7667, fz: 0.3000 },
  { name: "Parc Botanique & Collines Vertes", short: "Parc Botanique", emoji: "🌳", kind: "Espace Vert", fx: 0.1667, fz: 0.5667 },
  { name: "Poste Frontière & Aéroport Mavivi", short: "Mavivi", emoji: "✈️", kind: "Zone Périphérique", fx: 0.88, fz: 0.18 },
];

export const DISTRICTS: Landmark[] = [...NEIGHBOURHOODS, ...AVENUES, ...LANDMARKS];

// ── Points d'intérêt interactifs (visites, intérieurs, commerces, repos) ──
export const POIS: Poi[] = [
  // Bâtiments avec intérieurs 3D complets
  { name: "Maison du joueur - Masiani", type: "home", emoji: "🏠", fx: 0.3667, fz: 0.7000, hasInterior: true },
  { name: "Boutique Alimentation Kivu Express", type: "shop", emoji: "🏪", fx: 0.5667, fz: 0.4333, hasInterior: true },
  { name: "Restaurant Chez Mama Léontine", type: "restaurant", emoji: "🍽️", fx: 0.6333, fz: 0.5667, hasInterior: true },
  { name: "Pharmacie & Dispensaire de l'Espoir", type: "pharmacy", emoji: "💊", fx: 0.3667, fz: 0.3000, hasInterior: true },
  { name: "Station Cobil Express", type: "fuel", emoji: "⛽", fx: 0.7000, fz: 0.3667, hasInterior: false },

  // Boutiques & Ateliers
  { name: "Atelier Moto & Pièces Bungulu", type: "shop", emoji: "🔧", fx: 0.30, fz: 0.36 },
  { name: "Mode & Tissus Wax Beni Centre", type: "clothing", emoji: "👕", fx: 0.52, fz: 0.48 },
  { name: "Dépôt Vivres & Café Ruwenzori", type: "shop", emoji: "🏪", fx: 0.80, fz: 0.34 },
  { name: "Quincaillerie Moderne du Boulevard", type: "shop", emoji: "🔨", fx: 0.48, fz: 0.54 },

  // Restaurants & Cafés
  { name: "Maquis Le Kivu Gourmand", type: "restaurant", emoji: "🍽️", fx: 0.60, fz: 0.48 },
  { name: "Cantine Universitaire UCBC", type: "restaurant", emoji: "🍽️", fx: 0.72, fz: 0.78 },
  { name: "Terrasse du Rond-Point Nyamwisi", type: "restaurant", emoji: "☕", fx: 0.46, fz: 0.50 },

  // Kiosques de rue & Épiceries rapides
  { name: "Kiosque Télécom Airtel / M-Pesa Malepe", type: "kiosk", emoji: "📱", fx: 0.28, fz: 0.46 },
  { name: "Buvette Fraîcheur du Stade 15 Octobre", type: "kiosk", emoji: "🥤", fx: 0.74, fz: 0.52 },
  { name: "Étal Fruits & Légumes du Grand Marché", type: "market", emoji: "🧺", fx: 0.64, fz: 0.52 },
  { name: "Terrain Communautaire & Loisirs Boikene", type: "leisure", emoji: "⚽", fx: 0.82, fz: 0.60 },
  { name: "Kiosque Masiani Express", type: "kiosk", emoji: "🥤", fx: 0.38, fz: 0.68 },
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
