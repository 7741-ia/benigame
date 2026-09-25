export type GamePhase = "menu" | "playing" | "paused" | "delivered" | "levelup" | "gameover" | "victory" | "garage" | "jail";

import type { PoiType } from "./districts";

export interface HudState {
  phase: GamePhase;
  money: number;
  score: number;
  level: number;
  speed: number; // km/h display
  maxSpeed: number;
  timeLeft: number;
  timeTotal: number;
  hasPackage: boolean;
  deliveriesDone: number;
  deliveriesNeeded: number;
  // world coords for minimap
  playerX: number;
  playerZ: number;
  playerHeading: number;
  targetX: number;
  targetZ: number;
  worldSize: number;
  lastReward: number;
  combo: number;
  targetLabel: string;
  vehicleId: string;
  fineAmount: number;
  jailTime: number;
  nitroCharge: number;
  nitroActive: boolean;
  nitroMax: number;
  currentMissionIndex: number;
  fatigue: number;
  nearPoi: { name: string; type: PoiType; emoji: string } | null;
  finePerHit: number;
  difficulty: number;
  playerMode: "vehicle" | "walk";
  freeRoam: boolean;
  navActive: boolean;
  navLabel: string;
  navX: number;
  navZ: number;
  hunger: number;
  nearNpc: boolean;
  canEnterVehicle: boolean;
  vehicleX: number;
  vehicleZ: number;
  // conduite & immersion
  cruiseOn: boolean;
  cruiseTarget: number; // km/h
  cameraView: "exterieure" | "rapprochee" | "conduite";
  clock: string; // heure du jeu HH:MM
  weather: "sunny" | "cloudy" | "rain" | "fog";
  quality: "low" | "medium" | "high";
  deliveryStage: "drive" | "arrived" | "handover";
  deliveryPrompt: string;
  homeRoom: "outside" | "bedroom" | "bathroom" | "living" | "dining" | "kitchen";
  running?: boolean;
  buildingName?: string;
  interiorRoom?: string;
  currentDistrict?: string;
}

export interface Upgrades {
  engine: number; // 0..5
  handling: number;
  boost: number;
  tires: number;
}

export const UPGRADE_COST = [120, 240, 400, 650, 1000];

export const defaultUpgrades: Upgrades = {
  engine: 0,
  handling: 0,
  boost: 0,
  tires: 0,
};
