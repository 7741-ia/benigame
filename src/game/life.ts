export type Gender = "femme" | "homme" | "personnalise";

export interface PlayerProfile {
  nickname: string;
  gender: Gender;
  skinColor: string;
  shirtColor: string;
  hair: string;
  workOutfit: string;
  leisureOutfit: string;
  privacy: "friends" | "private" | "public";
}

export interface LifeState {
  ingredients: Record<string, number>;
  furniture: string[];
  recipesCooked: number;
  partiesHosted: number;
  preparedMeals: string[];
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  ingredients: Record<string, number>;
  energy: number;
}

export const DEFAULT_PROFILE: PlayerProfile = {
  nickname: "Livreur de Beni",
  gender: "personnalise",
  skinColor: "#5b3a24",
  shirtColor: "#2196f3",
  hair: "Court",
  workOutfit: "Tenue bleue",
  leisureOutfit: "Chemise locale",
  privacy: "friends",
};

export const DEFAULT_LIFE: LifeState = {
  ingredients: { manioc: 1, haricots: 1, huile: 1 },
  furniture: ["Lit simple", "Table de cuisine"],
  recipesCooked: 0,
  partiesHosted: 0,
  preparedMeals: [],
};

export const RECIPES: Recipe[] = [
  {
    id: "pondu",
    name: "Pondu et riz",
    description: "Feuilles de manioc, riz et huile.",
    ingredients: { manioc: 1, riz: 1, huile: 1 },
    energy: 55,
  },
  {
    id: "haricots",
    name: "Haricots et bananes plantains",
    description: "Un repas nourrissant et populaire.",
    ingredients: { haricots: 1, plantain: 1, huile: 1 },
    energy: 48,
  },
  {
    id: "foufou",
    name: "Foufou et légumes",
    description: "Foufou, légumes et épices.",
    ingredients: { farine: 1, legumes: 1, epices: 1 },
    energy: 50,
  },
  {
    id: "poisson",
    name: "Poisson braisé",
    description: "Poisson, plantain et épices.",
    ingredients: { poisson: 1, plantain: 1, epices: 1 },
    energy: 60,
  },
];

export const MARKET_ITEMS = [
  "manioc",
  "riz",
  "huile",
  "haricots",
  "plantain",
  "farine",
  "legumes",
  "epices",
  "poisson",
] as const;