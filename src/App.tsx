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
import type { PoiType } from "./game/districts";
import type { LifeState, PlayerProfile } from "./game/life";
import type { Weather } from "./game/environment";
import Minimap from "./components/Minimap";
import TouchControls from "./components/TouchControls";
import Garage from "./components/Garage";
import Speedometer from "./components/Speedometer";
import CityMap from "./components/CityMap";
import Phone from "./components/Phone";
import ProfilePanel from "./components/ProfilePanel";
import HomePanel from "./components/HomePanel";
import TvRemote from "./components/TvRemote";
import { PWAInstallButton, OfflineIndicator } from "./components/PWAInstallButton";

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
  deliveriesNeeded: 20,
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
  const [districtToast, setDistrictToast] = useState<string | null>(null);
  const prevDistrictRef = useRef<string>("");

  useEffect(() => {
    const dist = hud.currentDistrict;
    if (dist && dist !== prevDistrictRef.current && hud.phase === "playing") {
      if (prevDistrictRef.current !== "") {
        setDistrictToast(dist);
        const timer = setTimeout(() => {
          setDistrictToast(null);
        }, 3500);
        prevDistrictRef.current = dist;
        return () => clearTimeout(timer);
      }
      prevDistrictRef.current = dist;
    }
  }, [hud.currentDistrict, hud.phase]);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [lifePanel, setLifePanel] = useState<"market" | "activities" | null>(null);
  const [tvRemoteOpen, setTvRemoteOpen] = useState(false);
  const [cruiseOpen, setCruiseOpen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerHeight > window.innerWidth && window.innerWidth < 900;
  });
  const [isTouchDevice, setIsTouchDevice] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches ||
      window.innerWidth <= 1024
    );
  });
  const [dismissPortraitWarning, setDismissPortraitWarning] = useState(false);
  const toastId = useRef(0);

  useEffect(() => {
    const handleOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
      setIsPortrait(portrait);
      setIsTouchDevice(
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia("(pointer: coarse)").matches ||
        window.innerWidth <= 1024
      );
    };

    try {
      if (screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock("landscape").catch(() => {});
      }
    } catch {
      /* ignore */
    }

    window.addEventListener("resize", handleOrientation);
    window.addEventListener("orientationchange", handleOrientation);
    return () => {
      window.removeEventListener("resize", handleOrientation);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, []);

  const requestLandscapeFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if (screen.orientation && (screen.orientation as any).lock) {
        await (screen.orientation as any).lock("landscape");
      }
    } catch {
      /* ignore */
    }
    setDismissPortraitWarning(true);
  };

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
          const next = { ...current, highestLevel: Math.max(current.highestLevel, Math.min(3, level + 1)) };
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
        if (kind === "home") {
          pushMessage("Bienvenue chez toi !", "Explore ta vraie maison 3D à pied");
        }
        if (kind === "market") setLifePanel("market");
        if (kind === "leisure") setLifePanel("activities");
        if (kind === "clothing") setProfileOpen(true);
        if (kind === "restaurant") pushMessage("Repas servi", label);
        if (kind === "kiosk") pushMessage("Nitro rechargé", label);
      },
      onArrived: (label) => {
        pushMessage("Destination atteinte", label);
        if (label.toLowerCase().includes("maison")) {
          pushMessage("Arrivé à la maison !", "Descends de ton véhicule et entre visiter en 3D");
        }
      },
      onNpcGreet: (message) => pushMessage(message, "Le passant te répond."),
      onCookMeal: (mealName) => {
        pushMessage("Cuisson terminée !", `Délicieux ${mealName} préparé sur la cuisinière 3D`);
      },
      onEatMeal: (mealName) => {
        pushMessage("Bon appétit !", `Tu as dégusté ${mealName} à la table de la salle à manger`);
      },
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

  const startAtHome3D = useCallback(() => {
    audio.resume();
    audio.click();
    gameRef.current?.start(career.highestLevel, upgrades, wallet);
    gameRef.current?.visitHome3D();
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

  const cycleWeather = useCallback(() => {
    const list: Weather[] = ["sunny", "cloudy", "rain", "fog"];
    const currIdx = list.indexOf(hud.weather);
    const nextW = list[(currIdx + 1) % list.length];
    audio.click();
    gameRef.current?.setWeather(nextW);
  }, [hud.weather]);

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
    audio.openPhone();
    gameRef.current?.pause();
    setPhoneOpen(true);
  }, []);

  const closePhone = useCallback(() => {
    audio.closePhone();
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
    setPhoneOpen(false);
    setMapOpen(false);
    if (hud.phase === "levelup") gameRef.current?.exploreFreeRoam();
    if (hud.phase === "paused") gameRef.current?.resume();
    gameRef.current?.visitHome3D();
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
      <OfflineIndicator />

      {/* ================= IN-GAME HUD ================= */}
      {(phase === "playing" || phase === "paused") && (
        <>
          {isTouchDevice && (
            <TouchControls
              onInput={handleTouch}
              mode={hud.playerMode}
              canEnterVehicle={hud.canEnterVehicle}
              canInteract={!!hud.nearPoi || !!hud.buildingName || !!hud.nearbyInteraction}
              nearbyInteraction={hud.nearbyInteraction}
              running={hud.running}
              nearNpc={hud.nearNpc}
              maxSpeed={hud.maxSpeed}
              hasNitro={hud.nitroMax > 0}
              nitroActive={hud.nitroActive}
              nitroCharge={hud.nitroCharge}
              nitroMax={hud.nitroMax}
              onNitro={(active) => gameRef.current?.setNitro(active)}
              onToggleVehicle={() => gameRef.current?.toggleVehicleMode()}
              onToggleRun={() => gameRef.current?.toggleRun()}
              onHorn={() => gameRef.current?.honk()}
              onCycleCamera={() => gameRef.current?.cycleCamera()}
              onGreetNpc={() => gameRef.current?.greetNearbyNpc()}
              onInteract={() => {
                if (hud.nearbyInteraction?.id === "tv") {
                  setTvRemoteOpen(true);
                }
                gameRef.current?.interact();
              }}
            />
          )}

          {/* ================= BARRE SUPÉRIEURE ÉPURÉE ET MODERNE ================= */}
          <div className="pointer-events-none absolute top-2 inset-x-2 z-20 flex items-start justify-between gap-1.5 select-none">
            {/* GAUCHE : Profil, argent, niveau & jauges compactes */}
            <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl border border-white/15 bg-slate-900/80 px-2.5 py-1.5 backdrop-blur-md shadow-lg">
              <div className="flex items-center gap-1.5 text-xs font-black">
                <span className="flex items-center gap-1 text-amber-300">
                  <span>💰</span>
                  <span>${hud.money}</span>
                </span>
                <span className="h-3 w-px bg-white/20" />
                <span className="flex items-center gap-1 text-[11px] text-sky-300">
                  <span>🏙️</span>
                  <span>Niv. {hud.level}</span>
                </span>
                {hud.combo > 1 && (
                  <>
                    <span className="h-3 w-px bg-white/20" />
                    <span className="text-[10px] text-orange-400">🔥 x{hud.combo}</span>
                  </>
                )}
              </div>

              {/* Jauges compactes : Énergie & Satiété */}
              <div className="flex items-center gap-2 text-[10px] font-bold text-white/70">
                <div className="flex items-center gap-1" title="Énergie">
                  <span>⚡</span>
                  <div className="h-1.5 w-10 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/15">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        hud.fatigue > 70
                          ? "bg-red-500"
                          : hud.fatigue > 40
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                      }`}
                      style={{ width: `${Math.max(0, 100 - hud.fatigue)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1" title="Satiété">
                  <span>🍲</span>
                  <div className="h-1.5 w-10 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/15">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        hud.hunger > 70 ? "bg-orange-500" : "bg-sky-400"
                      }`}
                      style={{ width: `${Math.max(0, 100 - hud.hunger)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[9px]">
                  <span className="text-white/50">{hud.clock}</span>
                  <span className="text-white/20">·</span>
                  <button
                    onClick={cycleWeather}
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 font-black border transition-all cursor-pointer hover:scale-105 active:scale-95 ${
                      hud.weather === "rain"
                        ? "border-sky-400/40 bg-sky-950/70 text-sky-300 ring-1 ring-sky-400/30 animate-pulse"
                        : hud.weather === "cloudy"
                          ? "border-slate-400/30 bg-slate-800/80 text-slate-200"
                          : hud.weather === "fog"
                            ? "border-indigo-400/30 bg-indigo-950/70 text-indigo-200"
                            : "border-amber-400/30 bg-amber-950/60 text-amber-300"
                    }`}
                    title={
                      hud.weather === "rain"
                        ? "🌧️ Pluie : Gouttes denses, éclaboussures et chaussée glissante (-28% vit., -45% grip). Cliquer pour changer la météo."
                        : hud.weather === "cloudy"
                          ? "☁️ Nuageux : Ombres au sol et asphalte lourd (-12% vit., -18% grip). Cliquer pour changer la météo."
                          : hud.weather === "fog"
                            ? "🌫️ Brume : Nappes de brouillard volumétrique au sol (-16% vit.). Cliquer pour changer la météo."
                            : "☀️ Ensoleillé : Sol sec, motricité maximale (100% grip). Cliquer pour changer la météo."
                    }
                  >
                    <span>
                      {hud.weather === "rain"
                        ? "🌧️"
                        : hud.weather === "cloudy"
                          ? "☁️"
                          : hud.weather === "fog"
                            ? "🌫️"
                            : "☀️"}
                    </span>
                    <span className="hidden sm:inline">
                      {hud.weather === "rain"
                        ? "Pluie (-28%)"
                        : hud.weather === "cloudy"
                          ? "Couvert (-12%)"
                          : hud.weather === "fog"
                            ? "Brume (-16%)"
                            : "Soleil"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Minuteur si mission en cours */}
              {!hud.freeRoam && hud.timeLeft > 0 && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-[10px] font-bold">
                    <span className="text-white/60">Temps</span>
                    <span className={timePct < 0.25 ? "text-red-400 animate-pulse" : "text-sky-300"}>
                      ⏱ {hud.timeLeft.toFixed(0)}s
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/15">
                    <div
                      className={`h-full transition-all duration-100 ${
                        timePct < 0.25 ? "bg-red-500" : "bg-sky-400"
                      }`}
                      style={{ width: `${timePct * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* CENTRE : Mission actuelle compacte & navigation sans masquer la route */}
            <div className="pointer-events-auto flex flex-col items-center">
              <div className="flex items-center gap-2 rounded-2xl border border-sky-400/30 bg-slate-900/85 px-3 py-1.5 backdrop-blur-md shadow-xl">
                <div
                  className="text-base"
                  style={{ transform: `rotate(${arrowDeg}deg)`, transition: "transform 0.1s linear" }}
                >
                  ⬆️
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-sky-300">
                    <span>
                      {hud.navActive ? "📍 NAVIGATION" : hud.freeRoam ? "🚗 EXPLORATION" : hud.hasPackage ? "📦 LIVRAISON" : "📦 RÉCUPÉRATION"}
                    </span>
                    {!hud.freeRoam && (
                      <span className="text-white/50">
                        ({hud.deliveriesDone}/{hud.deliveriesNeeded})
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-black text-amber-200 truncate max-w-[130px] sm:max-w-[200px]">
                    {hud.targetLabel || "En route"}
                  </div>
                </div>
                <div className="rounded-lg bg-white/10 px-1.5 py-0.5 text-[10px] font-black text-white/80 tabular-nums">
                  {Math.round(distToTarget)}m
                </div>
              </div>

              {/* Petite barre de progression de mission */}
              {!hud.freeRoam && (
                <div className="mt-1 h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-sky-400 transition-all duration-300"
                    style={{ width: `${progressPct * 100}%` }}
                  />
                </div>
              )}

              {/* Consigne d'étape de livraison (discrète sous la carte mission) */}
              {hud.deliveryPrompt && (
                <div className="mt-1 flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-950/85 px-2.5 py-1 text-[11px] font-black text-emerald-200 shadow-lg backdrop-blur-md animate-pulse">
                  <span>{hud.deliveryStage === "handover" ? "🤝" : "📍"}</span>
                  <span>{hud.deliveryPrompt}</span>
                  {hud.deliveryStage === "handover" && (
                    <button
                      onClick={() => gameRef.current?.deliverPackage()}
                      className="ml-1 rounded-lg bg-emerald-400 px-2 py-0.5 text-[10px] font-black text-slate-950 active:scale-95"
                    >
                      Remettre [E]
                    </button>
                  )}
                </div>
              )}

              {/* Indicateur de pièce 3D dans la maison */}
              {hud.interiorRoom && (
                <div className="mt-1 flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-950/85 px-2.5 py-1 text-[11px] font-black text-amber-200 shadow-lg backdrop-blur-md">
                  <span>🏡</span>
                  <span>Maison — {hud.interiorRoom}</span>
                </div>
              )}
            </div>

            {/* DROITE : Raccourcis système & Minimap compacte */}
            <div className="pointer-events-auto flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => gameRef.current?.visitHome3D()}
                  className="flex h-7 w-7 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-950/70 text-xs backdrop-blur-md shadow-md active:scale-90"
                  title="Aller à ma maison 3D (À pied)"
                >
                  🏡
                </button>
                <button
                  onClick={openMap}
                  className="flex h-7 w-7 items-center justify-center rounded-xl border border-sky-400/30 bg-black/45 text-xs backdrop-blur-md shadow-md active:scale-90"
                  title="Carte de la ville"
                >
                  🗺️
                </button>
                <button
                  onClick={openPhone}
                  className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/20 bg-black/45 text-xs backdrop-blur-md shadow-md active:scale-90"
                  title="Smartphone"
                >
                  📱
                </button>
                <button
                  onClick={toggleMute}
                  className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/20 bg-black/45 text-xs backdrop-blur-md shadow-md active:scale-90"
                  title={muted ? "Activer le son" : "Couper le son"}
                >
                  {muted ? "🔇" : "🔊"}
                </button>
                <button
                  onClick={() => gameRef.current?.pause()}
                  className="flex h-7 w-7 items-center justify-center rounded-xl border border-white/20 bg-black/45 text-xs backdrop-blur-md shadow-md active:scale-90"
                  title="Pause"
                >
                  ⏸
                </button>
              </div>
              <Minimap
                hud={hud}
                getLivePlayerState={() => gameRef.current?.getPlayerMapState()}
                onOpenMap={openMap}
              />
            </div>
          </div>

          {/* ================= VITESSE & RÉGULATEUR COMPACT (COIN DROIT) ================= */}
          {hud.playerMode === "vehicle" && (
            <div className="pointer-events-auto absolute right-2.5 top-[9.5rem] z-20 flex flex-col items-end select-none">
              <button
                onClick={() => setCruiseOpen((o) => !o)}
                className="flex flex-col items-end rounded-2xl border border-white/20 bg-slate-900/70 px-3 py-1.5 backdrop-blur-md shadow-lg hover:bg-slate-800/80 active:scale-95 transition-all text-right"
                title="Cliquer pour régler le régulateur de vitesse"
              >
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/50">Vitesse</div>
                <div className="text-xl font-black tabular-nums text-white leading-none">
                  {Math.round(hud.speed)}{" "}
                  <span className="text-[10px] font-bold text-white/60">km/h</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[9px] font-bold">
                  <span className="text-white/50 uppercase tracking-wider">Régul.</span>
                  <span
                    className={`rounded px-1 py-0.2 font-black ${
                      hud.cruiseOn
                        ? "bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/50"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {hud.cruiseOn ? `${hud.cruiseTarget} km/h` : "OFF"}
                  </span>
                </div>
                {hud.weather !== "sunny" && (
                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[8px] font-black tracking-tight ${
                      hud.weather === "rain"
                        ? "text-sky-300 animate-pulse"
                        : hud.weather === "cloudy"
                          ? "text-slate-300"
                          : "text-indigo-300"
                    }`}
                  >
                    <span>{hud.weather === "rain" ? "🌧️ Glissant" : hud.weather === "cloudy" ? "☁️ Sol lourd" : "🌫️ Brume"}</span>
                    <span className="opacity-75">
                      {hud.weather === "rain" ? "(-28%)" : hud.weather === "cloudy" ? "(-12%)" : "(-16%)"}
                    </span>
                  </div>
                )}
              </button>

              {/* Popover compact du régulateur (ouvert uniquement au clic) */}
              {cruiseOpen && (
                <div className="mt-2 w-44 rounded-2xl border border-white/20 bg-slate-900/95 p-3 text-white shadow-2xl backdrop-blur-md space-y-2">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="text-xs font-bold">⚙️ Régulateur</span>
                    <button
                      onClick={() => setCruiseOpen(false)}
                      className="rounded-lg bg-white/10 px-1.5 py-0.5 text-[10px] hover:bg-white/20"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/60">Cible :</span>
                    <span className="font-black text-emerald-300">{hud.cruiseTarget} km/h</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => gameRef.current?.adjustCruise(-5)}
                      className="flex-1 rounded-xl bg-white/10 py-1 text-xs font-black active:scale-90"
                    >
                      − 5
                    </button>
                    <button
                      onClick={() => gameRef.current?.adjustCruise(5)}
                      className="flex-1 rounded-xl bg-white/10 py-1 text-xs font-black active:scale-90"
                    >
                      + 5
                    </button>
                  </div>
                  <button
                    onClick={() => gameRef.current?.toggleCruise()}
                    className={`w-full rounded-xl py-2 text-xs font-black transition active:scale-95 ${
                      hud.cruiseOn
                        ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                        : "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30"
                    }`}
                  >
                    {hud.cruiseOn ? "Désactiver" : "Activer"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ================= INTERACTIONS LIEUX & COMMERCES (PIÉTON SEULEMENT) ================= */}
          {hud.playerMode === "walk" && (hud.nearbyInteraction || hud.nearPoi) && (
            <div className="pointer-events-auto absolute bottom-20 left-1/2 z-30 -translate-x-1/2 select-none">
              {hud.nearbyInteraction ? (
                <button
                  onClick={() => {
                    if (hud.nearbyInteraction?.id === "tv") {
                      setTvRemoteOpen(true);
                    }
                    gameRef.current?.interact();
                  }}
                  className="flex items-center gap-2.5 rounded-2xl border border-white/25 bg-gradient-to-r from-emerald-600 to-sky-600 px-4 py-2 text-xs font-black text-white shadow-xl shadow-black/50 backdrop-blur-md active:scale-95 animate-pulse"
                >
                  <span className="text-xl">{hud.nearbyInteraction.icon}</span>
                  <span>{hud.nearbyInteraction.prompt}</span>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-sky-200">
                    {hud.nearbyInteraction.actionText.toUpperCase()} [E]
                  </span>
                </button>
              ) : hud.nearPoi ? (
                <button
                  onClick={() => {
                    audio.click();
                    gameRef.current?.interact();
                  }}
                  className="flex items-center gap-2 rounded-2xl border border-white/25 bg-gradient-to-r from-amber-400 to-yellow-500 px-4 py-2 text-xs font-black text-black shadow-xl shadow-black/50 backdrop-blur-md active:scale-95"
                >
                  <span className="text-lg">{hud.nearPoi.emoji}</span>
                  <span>
                    {hud.nearPoi.type === "shop"
                      ? "Boutique — véhicules & équipement"
                      : hud.nearPoi.type === "restaurant"
                        ? "Manger ici ($8)"
                        : hud.nearPoi.type === "kiosk"
                          ? "Buvette ($5)"
                          : hud.nearPoi.type === "home"
                            ? "Entrer à la maison"
                            : hud.nearPoi.type === "market"
                              ? "Acheter des ingrédients"
                              : "Activités"}
                  </span>
                  <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-bold">E</span>
                </button>
              ) : null}
            </div>
          )}

          {/* Bottom-right speedometer (desktop PC only) */}
          {hud.playerMode === "vehicle" && !isTouchDevice && (
            <div className="pointer-events-none absolute bottom-3 right-3 z-10">
              <Speedometer speed={hud.speed} max={hud.maxSpeed} weather={hud.weather} />
            </div>
          )}

          {/* Actions clavier / bureau (Desktop PC uniquement, gérées par TouchControls sur mobile) */}
          {!isTouchDevice && (
            <div className="pointer-events-auto absolute bottom-12 left-1/2 z-30 flex -translate-x-1/2 gap-2">
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
          )}
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

            <div className="mt-3 flex justify-center">
              <PWAInstallButton />
            </div>

            <div className="mt-4 space-y-3">
              <button
                onClick={play}
                className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-green-600 py-4 text-xl font-black shadow-lg shadow-emerald-900/50 transition-transform active:scale-95"
              >
                ▶ JOUER
              </button>
              <button
                onClick={startAtHome3D}
                className="w-full rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 py-3.5 text-base font-black text-white shadow-xl shadow-emerald-950/50 transition-transform active:scale-95 flex items-center justify-center gap-2"
              >
                <span className="text-xl">🏡</span>
                <span>VISITER MA VRAIE MAISON 3D</span>
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
            <h2 className="text-3xl font-black text-emerald-300">NIVEAU {hud.level} TERMINÉ !</h2>
            <p className="text-sm text-white/80">
              Félicitations ! Tu as complété les 20 livraisons du Niveau {hud.level}.
            </p>
            {hud.level < 3 ? (
              <div className="rounded-xl bg-sky-500/20 py-1.5 px-3 text-xs font-bold text-sky-300 ring-1 ring-sky-400/30">
                🚀 NIVEAU {hud.level + 1} DÉBLOQUÉ (0 / 20 missions)
              </div>
            ) : (
              <div className="rounded-xl bg-amber-500/20 py-1.5 px-3 text-xs font-bold text-amber-300 ring-1 ring-amber-400/30">
                🏆 TOUS LES NIVEAUX COMPLÉTÉS (60 / 60 missions) !
              </div>
            )}
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
          onSetWeather={(w) => gameRef.current?.setWeather(w)}
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
          wallet={hud.money}
          mode={lifePanel}
          onClose={closeLifePanel}
          onMap={() => {
            setLifePanel(null);
            setMapOpen(true);
          }}
          onBuyIngredient={buyIngredient}
          onParty={hostParty}
        />
      )}

      {/* ================= TÉLÉCOMMANDE TV ================= */}
      {tvRemoteOpen && (
        <TvRemote
          tvState={hud.tvState}
          onTogglePower={() => gameRef.current?.tvTogglePower()}
          onNextChannel={() => gameRef.current?.tvNextChannel()}
          onPrevChannel={() => gameRef.current?.tvPrevChannel()}
          onVolumeChange={(v) => gameRef.current?.tvSetVolume(v)}
          onClose={() => setTvRemoteOpen(false)}
        />
      )}

      {/* ================= AVERTISSEMENT MODE PAYSAGE ================= */}
      {isPortrait && !dismissPortraitWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-md text-white select-none">
          <div className="max-w-sm w-full rounded-3xl bg-slate-900/95 p-6 text-center ring-1 ring-sky-400/40 shadow-2xl space-y-4">
            <div className="text-5xl animate-bounce">📱 🔄</div>
            <h3 className="text-xl font-black tracking-wide text-sky-400">Mode Paysage Recommandé</h3>
            <p className="text-sm text-white/80 leading-relaxed">
              Pour une ergonomie de conduite optimale et un meilleur confort visuel dans la ville de Beni, basculez votre téléphone en mode paysage.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={requestLandscapeFullscreen}
                className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-500 py-3 text-sm font-black text-slate-950 shadow-lg active:scale-95 transition-all"
              >
                Plein Écran Paysage
              </button>
              <button
                onClick={() => setDismissPortraitWarning(true)}
                className="w-full rounded-2xl bg-white/10 py-2.5 text-xs font-semibold text-white/70 hover:bg-white/15 active:scale-95"
              >
                Continuer en portrait
              </button>
            </div>
          </div>
        </div>
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
