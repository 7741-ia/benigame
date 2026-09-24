export interface Vehicle {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  maxSpeed: number; // world units/s
  accel: number;
  turn: number;
  color: number;
  price: number; // 0 = owned by default
  bodyType: "moto" | "scooter" | "tuktuk" | "van" | "sport";
}

export const VEHICLES: Vehicle[] = [
  {
    id: "moto",
    name: "Moto Boda",
    emoji: "🛵",
    desc: "La moto-taxi classique de Beni. Équilibrée.",
    maxSpeed: 42,
    accel: 55,
    turn: 2.6,
    color: 0xff3b30,
    price: 0,
    bodyType: "moto",
  },
  {
    id: "scooter",
    name: "Scooter Agile",
    emoji: "🛴",
    desc: "Léger et maniable, parfait pour les ruelles.",
    maxSpeed: 40,
    accel: 62,
    turn: 3.2,
    color: 0x00bbf9,
    price: 350,
    bodyType: "scooter",
  },
  {
    id: "tuktuk",
    name: "Tuk-Tuk",
    emoji: "🛺",
    desc: "Lent mais robuste, résiste mieux aux chocs.",
    maxSpeed: 36,
    accel: 45,
    turn: 2.2,
    color: 0xffd93d,
    price: 600,
    bodyType: "tuktuk",
  },
  {
    id: "van",
    name: "Camionnette",
    emoji: "🚐",
    desc: "Grosse livraison. Puissante en ligne droite.",
    maxSpeed: 46,
    accel: 50,
    turn: 2.0,
    color: 0x38b000,
    price: 1000,
    bodyType: "van",
  },
  {
    id: "sport",
    name: "Moto Sport",
    emoji: "🏍️",
    desc: "La plus rapide de Beni. Pour les pros !",
    maxSpeed: 58,
    accel: 78,
    turn: 3.0,
    color: 0x9b5de5,
    price: 1600,
    bodyType: "sport",
  },
];

export function getVehicle(id: string): Vehicle {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
}
