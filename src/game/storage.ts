import { defaultUpgrades, type Upgrades } from "./types";
import {
  DEFAULT_LIFE,
  DEFAULT_PROFILE,
  type LifeState,
  type PlayerProfile,
} from "./life";

const HS_KEY = "beni_delivery_highscores";
const UP_KEY = "beni_delivery_upgrades";
const MONEY_KEY = "beni_delivery_money";
const PROFILE_KEY = "beni_life_profile";
const LIFE_KEY = "beni_life_home";
const PROGRESS_KEY = "beni_life_progress";

export interface HighScore {
  score: number;
  money: number;
  date: string;
}

export interface CareerProgress {
  highestLevel: number;
  missionsCompleted: number;
}

export function getHighScores(): HighScore[] {
  try {
    return JSON.parse(localStorage.getItem(HS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addHighScore(score: number, money: number): HighScore[] {
  const list = getHighScores();
  list.push({ score, money, date: new Date().toLocaleDateString() });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 5);
  localStorage.setItem(HS_KEY, JSON.stringify(top));
  return top;
}

export function loadUpgrades(): Upgrades {
  try {
    return { ...defaultUpgrades, ...JSON.parse(localStorage.getItem(UP_KEY) || "{}") };
  } catch {
    return { ...defaultUpgrades };
  }
}

export function saveUpgrades(u: Upgrades) {
  localStorage.setItem(UP_KEY, JSON.stringify(u));
}

export function loadMoney(): number {
  return Number(localStorage.getItem(MONEY_KEY) || "0");
}

export function saveMoney(m: number) {
  localStorage.setItem(MONEY_KEY, String(m));
}

const OWNED_KEY = "beni_delivery_owned";
const SELECTED_KEY = "beni_delivery_selected";

export function loadOwned(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(OWNED_KEY) || '["moto"]');
    return Array.isArray(arr) && arr.length ? arr : ["moto"];
  } catch {
    return ["moto"];
  }
}

export function saveOwned(o: string[]) {
  localStorage.setItem(OWNED_KEY, JSON.stringify(o));
}

export function loadSelected(): string {
  return localStorage.getItem(SELECTED_KEY) || "moto";
}

export function saveSelected(id: string) {
  localStorage.setItem(SELECTED_KEY, id);
}

export function loadProfile(): PlayerProfile {
  try {
    return {
      ...DEFAULT_PROFILE,
      ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}"),
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: PlayerProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadLife(): LifeState {
  try {
    const saved = JSON.parse(localStorage.getItem(LIFE_KEY) || "{}");
    return {
      ...DEFAULT_LIFE,
      ...saved,
      ingredients: { ...DEFAULT_LIFE.ingredients, ...(saved.ingredients || {}) },
      furniture: Array.isArray(saved.furniture)
        ? saved.furniture
        : [...DEFAULT_LIFE.furniture],
      preparedMeals: Array.isArray(saved.preparedMeals) ? saved.preparedMeals : [],
    };
  } catch {
    return {
      ...DEFAULT_LIFE,
      ingredients: { ...DEFAULT_LIFE.ingredients },
      furniture: [...DEFAULT_LIFE.furniture],
      preparedMeals: [],
    };
  }
}

export function saveLife(life: LifeState) {
  localStorage.setItem(LIFE_KEY, JSON.stringify(life));
}

export function loadProgress(): CareerProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return {
      highestLevel: Math.max(1, Math.min(5, Number(saved.highestLevel) || 1)),
      missionsCompleted: Math.max(0, Number(saved.missionsCompleted) || 0),
    };
  } catch {
    return { highestLevel: 1, missionsCompleted: 0 };
  }
}

export function saveProgress(progress: CareerProgress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}
