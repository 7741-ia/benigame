import { useEffect, useRef, useState, useCallback } from "react";
import { Game } from "./game/Game";
import { audio } from "./game/audio";
import type { HudState, Upgrades } from "./game/types";
import { UPGRADE_COST } from "./game/types";
import {
  getHighScores,
  addHighScore,
  loadUpgrades,
  saveUpgrades,
  loadMoney,
  saveMoney,
  loadOwned,
  saveOwned,
  loadSelected,
  saveSelected,
  loadProfile,
  saveProfile,
  loadLife,
  saveLife,
  loadProgress,
  saveProgress,
  type CareerProgress,
  type HighScore,
} from "./game/storage";
import { getVehicle } from "./game/vehicles";
import { POIS, landmarkWorld, type PoiType } from "./game/districts";
import type { LifeState, PlayerProfile, Recipe } from "./game/life";
import Minimap from "./components/Minimap";
import TouchControls from "./components/TouchControls";
import Garage from "./components/Garage";
import Speedometer from "./components/Speedometer";
import CityMap from "./components/CityMap";
import Phone from "./components/Phone";
import ProfilePanel from "./components/ProfilePanel";
import HomePanel from "./components/HomePanel";

const defaultHud: HudState = {
  phase: "menu",
  money: 0,
  score: 0,
  level: 1,
  speed: 0,
  maxSpeed: 122,
  timeLeft: 0,
  timeTotal: 1,
  hasPackage: false,
  deliveriesDone: 0,
  deliveriesNeeded: 4,
  playerX: 0,
  playerZ: 0,
  playerHeading: 0,
  targetX: 0,
  targetZ: 0,
  worldSize: 336,
  lastReward: 0,
  combo: 1,
  targetLabel: "",
  vehicleId: "moto",
  fineAmount: 0,
  jailTime: 0,
  nitroCharge: 0,
  nitroActive: false,
  nitroMax: 100,
  currentMissionIndex: 0,
  fatigue: 0,
  nearPoi: null,
  finePerHit: 50,
  difficulty: 1,
  playerMode: "vehicle",
  freeRoam: false,
  navActive: false,
  navLabel: "",
  navX: 0,
  navZ: 0,
  hunger: 10,
  nearNpc: false,
  canEnterVehicle: false,
  vehicleX: 0,
  vehicleZ: 0,
  cruiseOn: false,
  cruiseTarget: 0,
  cameraView: "exterieure",
  clock: "08:00",
  weather: "sunny",
  quality: "high",
  deliveryStage: "drive",
  deliveryPrompt: "",
  homeRoom: "outside",
};

interface Toast {
  id: number;
  text: string;
  sub: string;
  x: number;
  y: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState>(defaultHud);
  const [wallet, setWallet] = useState<number>(loadMoney());
  const [upgrades, setUpgrades] = useState<Upgrades>(loadUpgrades());
  const [owned, setOwned] = useState<string[]>(loadOwned());
  const [selected, setSelected] = useState<string>(loadSelected());
  const [highScores, setHighScores] = useState<HighScore[]>(getHighScores());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [muted, setMuted] = useState(false);
  const [lastResult, setLastResult] = useState({ score: 0, money: 0 });
  const [profile, setProfile] = useState<PlayerProfile>(loadProfile());
  const [life, setLife] = useState<LifeState>(loadLife());
  const [career, setCareer] = useState<CareerProgress>(loadProgress());
  const [mapOpen, setMapOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [lifePanel, setLifePanel] = useState<"home" | "market" | "activities" | null>(null);
  const toastId = useRef(0);

  // PWA install prompt detection
  useEffect(() => {
    if (!canvasRef.current) return;
    const pushMessage = (text: string, sub = "") => {
      const id = toastId.current++;
      setToasts((items) => [
        ...items,
        {
          id,
          text,
          sub,
          x: window.innerWidth / 2,
          y: window.innerHeight * 0.45,
        },
      ]);
      setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 1500);
    };
    const game = new Game(canvasRef.current, {
      onHud: (h) => {
        setHud(h);
        setWallet((current) => {
          if (current === h.money) return current;
          saveMoney(h.money);
          return h.money;
        });
      },
      onDelivery: (reward, combo, x, y) => {
        const id = toastId.current++;
        const negative = reward < 0;
        setToasts((t) => [
          ...t,
          {
            id,
            text: negative ? `-$${Math.abs(reward)}` : `+$${reward}`,
            sub: negative ? "🚨 AMENDE !" : combo > 1 ? `COMBO x${combo}!` : "Livré !",
            x,
            y,
          },
        ]);
        setTimeout(() => setToasts((t) => t.filter((tt) => tt.id !== id)), 1300);
        if (reward >= 0) {
          setCareer((current) => {
            const next = { ...current, missionsCompleted: current.missionsCompleted + 1 };
            saveProgress(next);
            return next;
          });
          setTimeout(() => {
            const money = gameRef.current?.getMoney();
            if (money !== undefined) {
              setWallet(money);
              saveMoney(money);
            }
          }, 0);
        }
      },
      onLevelComplete: (level) => {
        setCareer((current) => {
          const next = { ...current, highestLevel: Math.max(current.highestLevel, Math.min(5, level + 1)) };
          saveProgress(next);
          return next;
        });
      },
      onGameOver: (score, money) => {
        setLastResult({ score, money });
        setWallet(money);
        saveMoney(money);
        setHighScores(addHighScore(score, money));
      },
      onVictory: (score, money) => {
        setLastResult({ score, money });
        setWallet(money);
        saveMoney(money);
        setHighScores(addHighScore(score, money));
      },
      onPoiUsed: (kind: PoiType, label: string) => {
        if (kind === "home") setLifePanel("home");
        if (kind === "market") setLifePanel("market");
        if (kind === "leisure") setLifePanel("activities");
        if (kind === "clothing") setProfileOpen(true);
        if (kind === "restaurant") pushMessage("Repas servi", label);
        if (kind === "kiosk") pushMessage("Nitro rechargé", label);
      },
      onArrived: (label) => {
        pushMessage("Destination atteinte", label);
        if (label.toLowerCase().includes("maison")) {
          gameRef.current?.pause();
          setLifePanel("home");
        }
      },
      onNpcGreet: (message) => pushMessage(message, "Le passant te répond."),
    });
    game.setVehicle(loadSelected());
    game.setAppearance(profile);
    if (window.location.search.includes("debug")) (window as unknown as { __beniGame?: Game }).__beniGame = game;
    gameRef.current = game;
    return () => game.dispose();
  }, []);

  const phase = hud.phase;

  const play = useCallback(() => {
    audio.resume();
    audio.click();
    gameRef.current?.start(career.highestLevel, upgrades, wallet);
  }, [career.highestLevel, upgrades, wallet]);

  const openGarage = useCallback(() => {
    audio.click();
    gameRef.current?.toGarage();
  }, []);

  const backToMenu = useCallback(() => {
    audio.click();
    const m = gameRef.current?.getMoney() ?? wallet;
    setWallet(m);
    saveMoney(m);
    gameRef.current?.goMenu();
  }, [wallet]);

  // Ferme la boutique : retour à la tournée si on y est entré en cours de partie
  const closeShop = useCallback(() => {
    audio.click();
    const m = gameRef.current?.getMoney() ?? wallet;
    setWallet(m);
    saveMoney(m);
    gameRef.current?.closeShop();
  }, [wallet]);

  const nextLevel = useCallback(() => {
    audio.click();
    gameRef.current?.nextLevel();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      audio.setMuted(!m);
      return !m;
    });
  }, []);

  const buyUpgrade = useCallback(
    (key: keyof Upgrades) => {
      setUpgrades((prev) => {
        const level = prev[key];
        if (level >= 5) return prev;
        const cost = UPGRADE_COST[level];
        if (wallet < cost) return prev;
        const nextWallet = wallet - cost;
        setWallet(nextWallet);
        saveMoney(nextWallet);
        const next = { ...prev, [key]: level + 1 };
        saveUpgrades(next);
        gameRef.current?.setUpgrades(next);
        audio.upgrade();
        return next;
      });
    },
    [wallet]
  );

  const buyVehicle = useCallback(
    (id: string) => {
      const v = getVehicle(id);
      if (owned.includes(id) || wallet < v.price) return;
      const nextWallet = wallet - v.price;
      setWallet(nextWallet);
      saveMoney(nextWallet);
      const nextOwned = [...owned, id];
      setOwned(nextOwned);
      saveOwned(nextOwned);
      setSelected(id);
      saveSelected(id);
      gameRef.current?.setVehicle(id);
      audio.upgrade();
    },
    [owned, wallet]
  );

  const selectVehicle = useCallback((id: string) => {
    setSelected(id);
    saveSelected(id);
    gameRef.current?.setVehicle(id);
    audio.click();
  }, []);

  const handleTouch = useCallback((t: number, s: number, b: boolean) => {
    gameRef.current?.setTouchInput(t, s, b);
  }, []);

  const openMap = useCallback(() => {
    gameRef.current?.pause();
    setMapOpen(true);
    setPhoneOpen(false);
  }, []);

  const closeMap = useCallback(() => {
    setMapOpen(false);
    if (gameRef.current?.phase === "paused") gameRef.current.resume();
  }, []);

  const openPhone = useCallback(() => {
    gameRef.current?.pause();
    setPhoneOpen(true);
  }, []);

  const closePhone = useCallback(() => {
    setPhoneOpen(false);
    if (gameRef.current?.phase === "paused") gameRef.current.resume();
  }, []);

  const syncWallet = useCallback(() => {
    const current = gameRef.current?.getMoney() ?? wallet;
    setWallet(current);
    saveMoney(current);
    return current;
  }, [wallet]);

  const navigateTo = useCallback(
    (x: number, z: number, label: string) => {
      if (hud.phase === "levelup") gameRef.current?.exploreFreeRoam();
      if (hud.phase === "paused") gameRef.current?.resume();
      gameRef.current?.setNavigation(x, z, label);
      setMapOpen(false);
      setPhoneOpen(false);
      audio.click();
    },
    [hud.phase]
  );

  const goHome = useCallback(() => {
    const home = POIS.find((poi) => poi.type === "home");
    if (!home) return;
    if (hud.phase === "levelup") gameRef.current?.exploreFreeRoam();
    if (hud.phase === "paused") gameRef.current?.resume();
    const [x, z] = landmarkWorld(home);
    gameRef.current?.setNavigation(x, z, home.name);
    setPhoneOpen(false);
    setMapOpen(false);
  }, [hud.phase]);

  const closeLifePanel = useCallback(() => {
    setLifePanel(null);
    if (gameRef.current?.phase === "paused") gameRef.current.resume();
    syncWallet();
  }, [syncWallet]);

  const updateProfile = useCallback((next: PlayerProfile) => {
    setProfile(next);
    saveProfile(next);
    gameRef.current?.setAppearance(next);
    setProfileOpen(false);
    if (gameRef.current?.phase === "paused") gameRef.current.resume();
  }, []);

  const spend = useCallback(
    (amount: number) => {
      const ok = gameRef.current?.spendMoney(amount) ?? false;
      if (ok) syncWallet();
      return ok;
    },
    [syncWallet]
  );

  const cookRecipe = useCallback((recipe: Recipe) => {
    setLife((current) => {
      const canCook = Object.entries(recipe.ingredients).every(
        ([key, amount]) => (current.ingredients[key] || 0) >= amount
      );
      if (!canCook) return current;
      const ingredients = { ...current.ingredients };
      Object.entries(recipe.ingredients).forEach(([key, amount]) => {
        ingredients[key] = Math.max(0, (ingredients[key] || 0) - amount);
      });
      const next = { ...current, ingredients, recipesCooked: current.recipesCooked + 1 };
      next.preparedMeals = [...current.preparedMeals, recipe.id];
      saveLife(next);
      return next;
    });
  }, []);

  const eatRecipe = useCallback((recipe: Recipe) => {
    setLife((current) => {
      const index = current.preparedMeals.indexOf(recipe.id);
      if (index < 0) return current;
      const preparedMeals = [...current.preparedMeals];
      preparedMeals.splice(index, 1);
      const next = { ...current, preparedMeals };
      saveLife(next);
      gameRef.current?.eatHomeMeal(recipe.energy);
      return next;
    });
  }, []);

  const buyIngredient = useCallback(
    (ingredient: string) => {
      if (!spend(2)) return;
      setLife((current) => {
        const next = {
          ...current,
          ingredients: {
            ...current.ingredients,
            [ingredient]: (current.ingredients[ingredient] || 0) + 1,
          },
        };
        saveLife(next);
        return next;
      });
    },
    [spend]
  );

  const buyFurniture = useCallback(
    (item: string, price: number) => {
      if (!spend(price)) return;
      setLife((current) => {
        if (current.furniture.includes(item)) return current;
        const next = { ...current, furniture: [...current.furniture, item] };
        saveLife(next);
        return next;
      });
    },
    [spend]
  );

  const hostParty = useCallback(() => {
    if (!spend(15)) return;
    setLife((current) => {
      const next = { ...current, partiesHosted: current.partiesHosted + 1 };
      saveLife(next);
      return next;
    });
    audio.levelup();
  }, [spend]);

  const timePct = Math.max(0, Math.min(1, hud.timeLeft / hud.timeTotal));
  const progressPct = Math.min(1, hud.deliveriesDone / hud.deliveriesNeeded);
  // bearing arrow toward target (relative to bike heading)
  const dxT = hud.targetX - hud.playerX;
  const dzT = hud.targetZ - hud.playerZ;
  const distToTarget = Math.hypot(dxT, dzT);
  const worldAngle = Math.atan2(dxT, dzT);
  const arrowDeg = ((worldAngle - hud.playerHeading) * 180) / Math.PI;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900 font-sans text-white select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ================= IN-GAME HUD ================= */}
      {(phase === "playing" || phase === "paused") && (
        <>
          <TouchControls onInput={handleTouch} mode={hud.playerMode} />

          {/* Top-left: stats + timer + progress */}
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatChip icon="💰" value={`$${hud.money}`} color="from-amber-400 to-yellow-500" />
              <StatChip icon="⭐" value={hud.score.toLocaleString()} color="from-violet-400 to-fuchsia-500" />
              <StatChip icon="🏙️" value={`Niv. ${hud.level}`} color="from-sky-400 to-blue-500" />
              {hud.combo > 1 && <StatChip icon="🔥" value={`x${hud.combo}`} color="from-orange-400 to-red-500" />}
            </div>
            {/* Timer */}
            {!hud.freeRoam && <div className="w-44 max-w-[55vw]">
              <div className="mb-0.5 flex items-center gap-1 text-xs font-bold">
                <span>⏱</span>
                <span className={timePct < 0.25 ? "text-red-400" : ""}>{hud.timeLeft.toFixed(1)}s</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20">
                <div
                  className={`h-full rounded-full transition-all duration-100 ${
                    timePct < 0.25
                      ? "bg-gradient-to-r from-red-500 to-orange-500"
                      : "bg-gradient-to-r from-cyan-400 to-sky-500"
                  }`}
                  style={{ width: `${timePct * 100}%` }}
                />
              </div>
            </div>}
            {/* Progress */}
            {!hud.freeRoam && <div className="w-44 max-w-[55vw]">
              <div className="mb-0.5 flex justify-between text-[10px] font-semibold text-white/80">
                <span>Livraisons</span>
                <span>
                  {hud.deliveriesDone}/{hud.deliveriesNeeded}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-300"
                  style={{ width: `${progressPct * 100}%` }}
                />
              </div>
            </div>}
          </div>

          {/* Top-center: destination banner */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-black/55 px-3 py-1.5 text-center backdrop-blur-md ring-1 ring-white/20">
            <div
              className="text-xl"
              style={{ transform: `rotate(${arrowDeg}deg)`, transition: "transform 0.1s linear" }}
            >
              ⬆️
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/60">
                {hud.navActive ? "Navigation" : hud.freeRoam ? "Mode libre" : hud.hasPackage ? "Livrer à" : "Récupérer à"}
              </div>
              <div className="text-sm font-black leading-tight text-amber-200">{hud.targetLabel || "…"}</div>
            </div>
            <div className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/70">
              {Math.round(distToTarget)}m
            </div>
          </div>

          {/* Top-right: MINIMAP + controls */}
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={openMap}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-sky-400/25 text-lg backdrop-blur-md ring-1 ring-sky-300/30 active:scale-90"
                aria-label="Ouvrir la carte"
              >
                🗺️
              </button>
              <button
                onClick={openPhone}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg backdrop-blur-md ring-1 ring-white/20 active:scale-90"
                aria-label="Ouvrir le téléphone"
              >
                📱
              </button>
              <button
                onClick={toggleMute}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg backdrop-blur-md ring-1 ring-white/20 active:scale-90"
              >
                {muted ? "🔇" : "🔊"}
              </button>
              <button
                onClick={() => gameRef.current?.pause()}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg backdrop-blur-md ring-1 ring-white/20 active:scale-90"
              >
                ⏸
              </button>
            </div>
            <Minimap hud={hud} />
          </div>

          {/* Nitro bar — above speed meter on mobile, bottom-center on desktop */}
          {hud.playerMode === "vehicle" && <div className="pointer-events-none absolute left-1/2 bottom-[3.25rem] z-10 -translate-x-1/2 w-48 max-w-[60vw] md:bottom-3">
            <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold">
              <span className={hud.nitroActive ? "text-cyan-300" : "text-white/60"}>
                {hud.nitroActive ? "💨 NITRO!" : "⚡ Nitro"}
              </span>
              <span>{Math.round(hud.nitroCharge)}/{hud.nitroMax}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20">
              <div
                className={`h-full rounded-full transition-all duration-100 ${
                  hud.nitroActive ? "bg-gradient-to-r from-cyan-300 to-blue-400" : "bg-gradient-to-r from-blue-500 to-cyan-400"
                }`}
                style={{ width: `${(hud.nitroCharge / hud.nitroMax) * 100}%` }}
              />
            </div>
          </div>}

          {/* Fatigue — se repose au restaurant */}
          <div className="pointer-events-none absolute left-3 top-36 z-10 w-32">
            <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold">
              <span className={hud.fatigue > 70 ? "text-red-400" : "text-white/60"}>
                {hud.fatigue > 70 ? "😫 Fatigué !" : "🙂 Énergie"}
              </span>
              <span>{100 - hud.fatigue}%</span>
            </div>
            <div className="mt-2 mb-0.5 flex items-center justify-between text-[10px] font-bold">
              <span className={hud.hunger > 70 ? "text-orange-300" : "text-white/60"}>
                {hud.hunger > 70 ? "Faim" : "Satiété"}
              </span>
              <span>{100 - hud.hunger}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500"
                style={{ width: `${100 - hud.hunger}%` }}
              />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  hud.fatigue > 70
                    ? "bg-gradient-to-r from-red-500 to-orange-400"
                    : "bg-gradient-to-r from-lime-400 to-green-500"
                }`}
                style={{ width: `${100 - hud.fatigue}%` }}
              />
            </div>
          </div>

          {/* Commerces à proximité : boutique / restaurant / kiosque */}
          {hud.nearPoi && (
            <div className="pointer-events-auto absolute bottom-[12.5rem] left-1/2 z-30 -translate-x-1/2 md:bottom-[5.5rem]">
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  audio.click();
                  gameRef.current?.interact();
                }}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 px-5 py-3 text-sm font-black text-black shadow-xl shadow-amber-900/40 active:scale-95"
              >
                <span className="text-xl">{hud.nearPoi.emoji}</span>
                <span>
                  {hud.nearPoi.type === "shop"
                    ? "Boutique — véhicules & équipement"
                    : hud.nearPoi.type === "restaurant"
                      ? `Manger ici ($8, repose +15s)`
                      : hud.nearPoi.type === "kiosk"
                        ? `Buvette — nitro plein ($5)`
                        : hud.nearPoi.type === "home"
                          ? "Entrer à la maison"
                          : hud.nearPoi.type === "market"
                            ? "Acheter des ingrédients"
                            : hud.nearPoi.type === "clothing"
                              ? "Boutique de vêtements"
                              : "Activités et rencontres"}
                </span>
                <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">E</span>
              </button>
            </div>
          )}

          {/* Étape de livraison : se garer, descendre, remettre le colis */}
          {hud.deliveryPrompt && (
            <div className="pointer-events-auto absolute left-1/2 top-24 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-emerald-600/90 px-4 py-2 text-sm font-black shadow-xl ring-1 ring-white/20 md:top-20">
              <span>{hud.deliveryStage === "handover" ? "🤝" : "📍"}</span>
              <span>{hud.deliveryPrompt}</span>
              {hud.deliveryStage === "handover" && (
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    gameRef.current?.deliverPackage();
                  }}
                  className="ml-1 rounded-lg bg-white px-3 py-1 text-xs font-black text-emerald-800 active:scale-95"
                >
                  Remettre (E)
                </button>
              )}
            </div>
          )}

          {/* Heure, météo et vue caméra */}
          <div className="pointer-events-none absolute left-3 top-[13.5rem] z-10 flex items-center gap-1.5 md:top-52">
            <div className="rounded-lg bg-black/45 px-2 py-1 text-[11px] font-bold backdrop-blur-md ring-1 ring-white/15">
              🕒 {hud.clock}
            </div>
            <div className="rounded-lg bg-black/45 px-2 py-1 text-[11px] font-bold backdrop-blur-md ring-1 ring-white/15">
              {hud.weather === "rain" ? "🌧️ Pluie" : hud.weather === "cloudy" ? "⛅ Nuageux" : "☀️ Soleil"}
            </div>
            <button
              onClick={() => gameRef.current?.cycleCamera()}
              className="pointer-events-auto rounded-lg bg-black/45 px-2 py-1 text-[11px] font-bold backdrop-blur-md ring-1 ring-white/15 active:scale-95"
            >
              🎥 {hud.cameraView === "exterieure" ? "Extérieure" : hud.cameraView === "rapprochee" ? "Rapprochée" : "Conduite"}
            </button>
          </div>

          {/* Régulateur de vitesse */}
          {hud.playerMode === "vehicle" && (
            <div className="pointer-events-auto absolute right-3 bottom-[13.5rem] z-20 flex w-44 flex-col items-stretch gap-1 rounded-2xl bg-black/55 p-2 backdrop-blur-md ring-1 ring-white/15 md:bottom-36">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-white/60">Vitesse actuelle :</span>
                <span className="font-black tabular-nums">{hud.speed} km/h</span>
              </div>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-white/60">Régulateur :</span>
                <span className={`font-black tabular-nums ${hud.cruiseOn ? "text-emerald-300" : "text-white/40"}`}>
                  {hud.cruiseOn ? `${hud.cruiseTarget} km/h` : "désactivé"}
                </span>
              </div>
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  gameRef.current?.toggleCruise();
                }}
                className={`mt-1 w-full rounded-xl px-3 py-2 text-[11px] font-black transition active:scale-95 ${
                  hud.cruiseOn ? "bg-emerald-400 text-slate-950" : "bg-white/15 text-white"
                }`}
              >
                {hud.cruiseOn ? "Désactiver le régulateur" : "Activer le régulateur"}
              </button>
              <div className="flex items-center justify-between gap-1">
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    gameRef.current?.adjustCruise(-5);
                  }}
                  className="h-9 flex-1 rounded-lg bg-white/15 text-base font-black active:scale-90"
                  aria-label="Réduire la vitesse cible"
                >
                  − 5
                </button>
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    gameRef.current?.adjustCruise(5);
                  }}
                  className="h-9 flex-1 rounded-lg bg-white/15 text-base font-black active:scale-90"
                  aria-label="Augmenter la vitesse cible"
                >
                  + 5
                </button>
              </div>
              <div className="text-center text-[9px] text-white/45">Clavier : K · [ ] · frein/recul = arrêt</div>
            </div>
          )}

          {/* Bottom-right speedometer (desktop) */}
          {hud.playerMode === "vehicle" && <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden md:block">
            <Speedometer speed={hud.speed} max={hud.maxSpeed} />
          </div>}
          {/* mobile compact speed */}
          {hud.playerMode === "vehicle" && <div className="pointer-events-none absolute left-1/2 bottom-3 z-10 -translate-x-1/2 md:hidden">
            <div className="rounded-lg bg-black/50 px-3 py-1 text-center backdrop-blur-md ring-1 ring-white/20">
              <span className="text-xl font-black leading-none">{hud.speed}</span>
              <span className="ml-1 text-[9px] opacity-70">km/h</span>
            </div>
          </div>}
          {/* Nitro button - bottom center on mobile */}
          {hud.playerMode === "vehicle" && <button
            onPointerDown={(e) => {
              e.preventDefault();
              gameRef.current?.setNitro(true);
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              gameRef.current?.setNitro(false);
            }}
            onPointerLeave={() => gameRef.current?.setNitro(false)}
            onPointerCancel={() => gameRef.current?.setNitro(false)}
            className="pointer-events-auto absolute bottom-[5.5rem] left-1/2 z-10 -translate-x-1/2 md:hidden h-14 w-14 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 text-2xl font-black active:scale-90 shadow-lg shadow-cyan-500/50 touch-none select-none"
          >
            ⚡
          </button>}

          {/* Vehicle / walking actions */}
          <div className="pointer-events-auto absolute bottom-[9.5rem] left-1/2 z-30 flex -translate-x-1/2 gap-2 md:bottom-12">
            {(hud.playerMode === "vehicle" ? hud.speed < 6 : hud.canEnterVehicle) && (
              <button
                onClick={() => gameRef.current?.toggleVehicleMode()}
                className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-black shadow-lg active:scale-95"
              >
                {hud.playerMode === "vehicle" ? "Descendre" : "Monter"} <span className="opacity-60">F</span>
              </button>
            )}
            {hud.playerMode === "walk" && hud.nearNpc && (
              <>
                <button
                  onClick={() => gameRef.current?.greetNearbyNpc()}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black shadow-lg active:scale-95"
                >
                  Saluer
                </button>
                <button
                  onClick={() => gameRef.current?.askNearbyNpcDirection()}
                  className="rounded-xl bg-white/85 px-4 py-2 text-xs font-black text-slate-900 shadow-lg active:scale-95"
                >
                  Demander le chemin
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Delivery toasts */}
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-none absolute z-30 -translate-x-1/2 animate-[floatUp_1.3s_ease-out_forwards] text-center"
          style={{ left: t.x, top: t.y }}
        >
          <div
            className={`text-3xl font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
              t.text.startsWith("-") ? "text-red-400" : "text-emerald-300"
            }`}
          >
            {t.text}
          </div>
          <div
            className={`text-sm font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
              t.text.startsWith("-") ? "text-red-300" : "text-yellow-300"
            }`}
          >
            {t.sub}
          </div>
        </div>
      ))}

      {/* ================= START MENU ================= */}
      {phase === "menu" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-black/40 via-black/20 to-black/60 p-4">
          <div className="w-full max-w-md text-center">
            <div className="mb-1 text-6xl">🛵</div>
            <h1 className="bg-gradient-to-r from-amber-300 via-yellow-200 to-orange-400 bg-clip-text text-5xl font-black tracking-tight text-transparent drop-shadow-lg">
              BENI LIFE
            </h1>
            <p className="mt-1 text-sm font-medium text-white/80">
              Livraison et vie urbaine dans les rues de Beni, RDC
            </p>

            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold ring-1 ring-white/15">
              <span className="text-lg">{getVehicle(selected).emoji}</span>
              <span>{getVehicle(selected).name}</span>
            </div>
            <div className="mt-2 text-xs text-white/45">
              Progression : niveau {career.highestLevel} · {career.missionsCompleted} livraisons terminées
            </div>

            <div className="mt-5 space-y-3">
              <button
                onClick={play}
                className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-green-600 py-4 text-xl font-black shadow-lg shadow-emerald-900/50 transition-transform active:scale-95"
              >
                ▶ JOUER
              </button>
              <div className="flex gap-3">
                <button
                  onClick={openGarage}
                  className="flex-1 rounded-2xl bg-white/15 py-3 font-bold backdrop-blur-md ring-1 ring-white/20 transition-transform active:scale-95"
                >
                  🔧 Garage
                </button>
                <div className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-amber-500/20 py-3 font-bold ring-1 ring-amber-400/30">
                  💰 ${wallet}
                </div>
              </div>
              <button
                onClick={() => setProfileOpen(true)}
                className="w-full rounded-2xl bg-white/10 py-3 font-bold ring-1 ring-white/15 active:scale-95"
              >
                Personnaliser {profile.nickname}
              </button>
            </div>

            {highScores.length > 0 && (
              <div className="mt-6 rounded-2xl bg-black/40 p-4 text-left backdrop-blur-md ring-1 ring-white/10">
                <div className="mb-2 text-center text-sm font-black uppercase tracking-wider text-amber-300">
                  🏆 Meilleurs scores
                </div>
                {highScores.map((h, i) => (
                  <div key={i} className="flex justify-between border-b border-white/5 py-1 text-sm last:border-0">
                    <span className="font-bold">
                      {["🥇", "🥈", "🥉", "4.", "5."][i]} {h.score.toLocaleString()} pts
                    </span>
                    <span className="text-white/50">{h.date}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 text-xs text-white/50">
              Clavier: <b>WASD</b>/Flèches · <b>Espace</b> frein · <b>K</b> régulateur · <b>C</b> caméra · <b>F</b> monter/descendre · <b>E</b> interagir · <b>P</b> pause
            </div>
            <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-white/60">
              <span className="mr-1">Graphismes :</span>
              {(["low", "medium", "high"] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    audio.click();
                    gameRef.current?.setQuality(q);
                  }}
                  className={`rounded-lg px-2.5 py-1 font-bold active:scale-95 ${
                    hud.quality === q ? "bg-sky-400 text-slate-950" : "bg-white/10 text-white/80"
                  }`}
                >
                  {q === "low" ? "Faible" : q === "medium" ? "Moyen" : "Élevé"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= GARAGE ================= */}
      {phase === "garage" && (
        <Garage
          wallet={wallet}
          upgrades={upgrades}
          owned={owned}
          selected={selected}
          onBuy={buyUpgrade}
          onBuyVehicle={buyVehicle}
          onSelectVehicle={selectVehicle}
          onBack={closeShop}
        />
      )}

      {/* ================= PAUSE ================= */}
      {phase === "paused" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs space-y-3 text-center">
            <h2 className="text-4xl font-black">⏸ PAUSE</h2>
            <button
              onClick={() => gameRef.current?.resume()}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-green-600 py-4 text-lg font-black active:scale-95"
            >
              ▶ Reprendre
            </button>
            <div className="rounded-2xl bg-white/10 p-2 ring-1 ring-white/15">
              <div className="mb-1 text-[11px] font-bold text-white/60">Qualité graphique</div>
              <div className="grid grid-cols-3 gap-1">
                {(["low", "medium", "high"] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      audio.click();
                      gameRef.current?.setQuality(q);
                    }}
                    className={`rounded-xl py-2 text-xs font-black active:scale-95 ${
                      hud.quality === q ? "bg-sky-400 text-slate-950" : "bg-white/10"
                    }`}
                  >
                    {q === "low" ? "Faible" : q === "medium" ? "Moyen" : "Élevé"}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={backToMenu}
              className="w-full rounded-2xl bg-white/15 py-3 font-bold ring-1 ring-white/20 active:scale-95"
            >
              🏠 Menu principal
            </button>
          </div>
        </div>
      )}

      {/* ================= APRÈS UNE LIVRAISON : LIBRE CHOIX ================= */}
      {phase === "delivered" && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4 md:items-center">
          <div className="w-full max-w-md space-y-3 rounded-3xl bg-slate-900/95 p-5 text-center ring-1 ring-emerald-400/30 shadow-2xl">
            <div className="text-4xl">✅</div>
            <h2 className="text-2xl font-black text-emerald-300">Livraison réussie !</h2>
            <p className="text-sm text-white/70">
              {hud.deliveriesDone}/{hud.deliveriesNeeded} livraisons aujourd'hui · Portefeuille : ${hud.money}
            </p>
            <p className="text-xs text-white/50">Aucun compte à rebours tant que tu n'acceptes pas une nouvelle course.</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <button onClick={() => gameRef.current?.continueDeliveries()} className="rounded-xl bg-emerald-500 py-3 font-black active:scale-95">Continuer les livraisons</button>
              <button onClick={() => gameRef.current?.dismissDeliveryChoice()} className="rounded-xl bg-sky-500 py-3 font-black active:scale-95">Explorer</button>
              <button onClick={() => { gameRef.current?.dismissDeliveryChoice(); goHome(); }} className="rounded-xl bg-fuchsia-500 py-3 font-black active:scale-95">Rentrer chez soi</button>
              <button onClick={() => { gameRef.current?.dismissDeliveryChoice(); openMap(); }} className="rounded-xl bg-amber-500 py-3 font-black text-black active:scale-95">Changer de quartier</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= LEVEL COMPLETE ================= */}
      {phase === "levelup" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-4 rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 p-6 text-center ring-1 ring-white/10">
            <div className="text-5xl">🎉</div>
            <h2 className="text-3xl font-black text-emerald-300">Journée terminée !</h2>
            <p className="text-sm text-white/70">Que souhaites-tu faire maintenant ?</p>
            <div className="flex justify-around text-center">
              <div>
                <div className="text-2xl font-black text-amber-300">${hud.money}</div>
                <div className="text-xs text-white/60">Argent</div>
              </div>
              <div>
                <div className="text-2xl font-black text-violet-300">{hud.score.toLocaleString()}</div>
                <div className="text-xs text-white/60">Score</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <button onClick={() => gameRef.current?.exploreFreeRoam()} className="rounded-xl bg-emerald-500 py-3 font-black active:scale-95">Explorer librement</button>
              <button onClick={openMap} className="rounded-xl bg-sky-500 py-3 font-black active:scale-95">Visiter un quartier</button>
              <button onClick={goHome} className="rounded-xl bg-fuchsia-500 py-3 font-black active:scale-95">Rentrer chez soi</button>
              <button onClick={() => { setLifePanel("activities"); }} className="rounded-xl bg-violet-500 py-3 font-black active:scale-95">Retrouver des amis</button>
              <button onClick={openMap} className="rounded-xl bg-amber-500 py-3 font-black text-black active:scale-95">Restaurant ou shopping</button>
              <button onClick={nextLevel} className="rounded-xl bg-blue-600 py-3 font-black active:scale-95">Nouvelle journée de livraisons</button>
            </div>
            {hud.level >= 5 && (
              <button onClick={() => gameRef.current?.finishCareer()} className="w-full rounded-xl bg-white/10 py-3 text-sm font-bold ring-1 ring-white/15">
                Terminer la carrière et voir le trophée
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================= GAME OVER ================= */}
      {phase === "gameover" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 p-6 text-center ring-1 ring-white/10">
            <div className="text-6xl">⏰</div>
            <h2 className="text-3xl font-black text-red-400">Temps écoulé !</h2>
            <div className="flex justify-around">
              <div>
                <div className="text-2xl font-black text-violet-300">{lastResult.score.toLocaleString()}</div>
                <div className="text-xs text-white/60">Score final</div>
              </div>
              <div>
                <div className="text-2xl font-black text-amber-300">${lastResult.money}</div>
                <div className="text-xs text-white/60">Porte-monnaie</div>
              </div>
            </div>
            <button
              onClick={play}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-green-600 py-4 text-lg font-black active:scale-95"
            >
              🔄 Recommencer
            </button>
            <div className="flex gap-3">
              <button
                onClick={openGarage}
                className="flex-1 rounded-2xl bg-white/15 py-3 font-bold ring-1 ring-white/20 active:scale-95"
              >
                🔧 Garage
              </button>
              <button
                onClick={backToMenu}
                className="flex-1 rounded-2xl bg-white/15 py-3 font-bold ring-1 ring-white/20 active:scale-95"
              >
                🏠 Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= VICTORY ================= */}
      {phase === "victory" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-amber-900/40 to-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 p-6 text-center ring-1 ring-amber-400/30">
            <div className="text-6xl">🏆</div>
            <h2 className="bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-3xl font-black text-transparent">
              CHAMPION DE BENI !
            </h2>
            <p className="text-sm text-white/70">Tu as terminé toutes les tournées de livraison !</p>
            <div className="flex justify-around">
              <div>
                <div className="text-2xl font-black text-violet-300">{lastResult.score.toLocaleString()}</div>
                <div className="text-xs text-white/60">Score final</div>
              </div>
              <div>
                <div className="text-2xl font-black text-amber-300">${lastResult.money}</div>
                <div className="text-xs text-white/60">Fortune</div>
              </div>
            </div>
            <button
              onClick={play}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-green-600 py-4 text-lg font-black active:scale-95"
            >
              🔄 Rejouer
            </button>
            <button
              onClick={backToMenu}
              className="w-full rounded-2xl bg-white/15 py-3 font-bold ring-1 ring-white/20 active:scale-95"
            >
              🏠 Menu
            </button>
          </div>
        </div>
      )}

      {/* ================= VIRTUAL PHONE / INTERACTIVE MAP ================= */}
      {phoneOpen && (
        <Phone
          hud={hud}
          profile={profile}
          onClose={closePhone}
          onMap={() => {
            setPhoneOpen(false);
            setMapOpen(true);
          }}
          onProfile={() => {
            setPhoneOpen(false);
            setProfileOpen(true);
          }}
          onHome={goHome}
          onActivities={() => {
            setPhoneOpen(false);
            setLifePanel("activities");
          }}
        />
      )}

      {mapOpen && (
        <CityMap
          hud={hud}
          onNavigate={navigateTo}
          onCancelNavigation={() => gameRef.current?.cancelNavigation()}
          onClose={closeMap}
        />
      )}

      {profileOpen && (
        <ProfilePanel
          profile={profile}
          onSave={updateProfile}
          onClose={() => {
            setProfileOpen(false);
            if (gameRef.current?.phase === "paused") gameRef.current.resume();
          }}
        />
      )}

      {lifePanel && (
        <HomePanel
          life={life}
          profile={profile}
          wallet={hud.money}
          mode={lifePanel}
          onClose={closeLifePanel}
          onMap={() => {
            setLifePanel(null);
            setMapOpen(true);
          }}
          onRest={() => gameRef.current?.restAtHome()}
          onSleep={() => gameRef.current?.sleepAtHome()}
          onWash={() => gameRef.current?.washAtHome()}
          onSit={() => gameRef.current?.sitAtHome()}
          onCook={cookRecipe}
          onEat={eatRecipe}
          onBuyIngredient={buyIngredient}
          onBuyFurniture={buyFurniture}
          onParty={hostParty}
        />
      )}

      {/* ================= JAIL ================= */}
      {phase === "jail" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-4 rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 p-6 text-center ring-1 ring-red-400/40">
            <div className="text-6xl">🚔</div>
            <h2 className="text-3xl font-black text-red-400">PRISON !</h2>
            <p className="text-sm text-white/70">
              Tu as écrasé un piéton ! Amende: ${hud.fineAmount}
            </p>
            <p className="text-xs text-white/50">
              Libération automatique dans: {Math.ceil(hud.jailTime)}s
            </p>
            <button
              onClick={() => {
                audio.click();
                gameRef.current?.payFineAndRelease();
              }}
              disabled={hud.money < hud.finePerHit}
              className={`w-full rounded-2xl py-4 text-lg font-black active:scale-95 ${
                hud.money >= hud.finePerHit
                  ? "bg-gradient-to-r from-amber-400 to-yellow-600"
                  : "bg-white/10 text-white/40"
              }`}
            >
              {hud.money >= hud.finePerHit
                ? `Payer l'amende et sortir ($${hud.finePerHit})`
                : "Pas assez d'argent — attends"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ icon, value, color }: { icon: string; value: string; color: string }) {
  return (
    <div
      className={`flex items-center gap-1 rounded-full bg-gradient-to-r ${color} px-2.5 py-1 text-sm font-black text-black shadow-md`}
    >
      <span>{icon}</span>
      <span>{value}</span>
    </div>
  );
}
