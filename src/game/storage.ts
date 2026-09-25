import { defaultUpgrades, type Upgrades } from "./types";
import {
  DEFAULT_LIFE,
  DEFAULT_PROFILE,
  type LifeState,
  type PlayerProfile,
} from "./life";

// ─────────────────────────────────────────────────────────────
//  Système de sauvegarde hybride :
//  - Cache mémoire + localStorage pour lecture synchrone immédiate (zéro délai de chargement)
//  - IndexedDB pour persistance robuste hors-ligne, multi-onglets et volumétries
// ─────────────────────────────────────────────────────────────

const DB_NAME = "BeniLifeDB";
const DB_VERSION = 2;
const STORE_NAME = "app_data";

const HS_KEY = "beni_delivery_highscores";
const UP_KEY = "beni_delivery_upgrades";
const MONEY_KEY = "beni_delivery_money";
const PROFILE_KEY = "beni_life_profile";
const LIFE_KEY = "beni_life_home";
const PROGRESS_KEY = "beni_life_progress";
const SETTINGS_KEY = "beni_life_settings";
const POS_KEY = "beni_life_player_pos";
const MISSIONS_KEY = "beni_life_missions";

export interface HighScore {
  score: number;
  money: number;
  date: string;
}

export interface CareerProgress {
  highestLevel: number;
  missionsCompleted: number;
}

export interface MissionRecord {
  id: number;
  level: number;
  missionNumber: number; // 1..20
  destination: string;
  district: string;
  reward: number;
  status: "Terminée";
  time: string; // heure ou date de la mission (ex: 14:30)
}

export interface PlayerSavedPosition {
  x: number;
  z: number;
  heading: number;
  mode: "walk" | "vehicle";
  vehicleId?: string;
}

export interface GameSettings {
  quality: "low" | "medium" | "high";
  volume: number; // 0..1 (master)
  muted: boolean;
  soundEnabled: boolean; // effets sonores (moteur, pas, klaxon...)
  musicEnabled: boolean; // musique d'ambiance locale
  ambientEnabled: boolean; // sons de ville, météo, marché, circulation
  sfxVolume: number;
  musicVolume: number;
  ambientVolume: number;
  cameraView: "exterieure" | "rapprochee" | "conduite";
  runByDefault: boolean;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: "high",
  volume: 0.7,
  muted: false,
  soundEnabled: true,
  musicEnabled: true,
  ambientEnabled: true,
  sfxVolume: 0.75,
  musicVolume: 0.45,
  ambientVolume: 0.6,
  cameraView: "exterieure",
  runByDefault: false,
  showFps: false,
};

// ── Gestionnaire IndexedDB transparent ──
let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn("IndexedDB non disponible, utilisation du stockage local");
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function setIDB(key: string, value: unknown): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
  } catch (err) {
    console.warn("Échec écriture IndexedDB:", err);
  }
}

// Initialise IndexedDB avec les données localStorage dès le démarrage
if (typeof window !== "undefined") {
  getDB().then(async (db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SETTINGS_KEY);
      req.onsuccess = () => {
        if (req.result && !localStorage.getItem(SETTINGS_KEY)) {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(req.result));
        }
      };
    } catch {
      /* ignore */
    }
  });
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
  list.push({ score, money, date: new Date().toLocaleDateString("fr-CD") });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 5);
  localStorage.setItem(HS_KEY, JSON.stringify(top));
  setIDB(HS_KEY, top);
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
  setIDB(UP_KEY, u);
}

export function loadMoney(): number {
  return Number(localStorage.getItem(MONEY_KEY) || "0");
}

export function saveMoney(m: number) {
  localStorage.setItem(MONEY_KEY, String(m));
  setIDB(MONEY_KEY, m);
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
  setIDB(OWNED_KEY, o);
}

export function loadSelected(): string {
  return localStorage.getItem(SELECTED_KEY) || "moto";
}

export function saveSelected(id: string) {
  localStorage.setItem(SELECTED_KEY, id);
  setIDB(SELECTED_KEY, id);
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
  setIDB(PROFILE_KEY, profile);
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
  setIDB(LIFE_KEY, life);
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
  setIDB(PROGRESS_KEY, progress);
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Partial<GameSettings>): GameSettings {
  const current = loadSettings();
  const next = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  setIDB(SETTINGS_KEY, next);
  return next;
}

export function loadPlayerPosition(): PlayerSavedPosition | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePlayerPosition(pos: PlayerSavedPosition) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
    setIDB(POS_KEY, pos);
  } catch {
    /* ignore */
  }
}

export function loadMissionHistory(): MissionRecord[] {
  try {
    const raw = localStorage.getItem(MISSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMissionHistory(records: MissionRecord[]): void {
  try {
    localStorage.setItem(MISSIONS_KEY, JSON.stringify(records));
    setIDB(MISSIONS_KEY, records);
  } catch {
    /* ignore */
  }
}

export function addMissionRecord(record: Omit<MissionRecord, "id">): MissionRecord {
  const list = loadMissionHistory();
  const newRecord: MissionRecord = {
    ...record,
    id: list.length + 1,
  };
  list.push(newRecord);
  saveMissionHistory(list);
  return newRecord;
}

export function clearAllSaves() {
  const keys = [HS_KEY, UP_KEY, MONEY_KEY, PROFILE_KEY, LIFE_KEY, PROGRESS_KEY, SETTINGS_KEY, POS_KEY, OWNED_KEY, SELECTED_KEY, MISSIONS_KEY];
  keys.forEach((k) => localStorage.removeItem(k));
  getDB().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
    } catch {
      /* ignore */
    }
  });
}
