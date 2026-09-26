import { useCallback, useRef, useState } from "react";
import type { ContextualInteraction } from "../game/houseManager";

interface Props {
  onInput: (throttle: number, steer: number, brake: boolean, nitro?: boolean) => void;
  mode?: "vehicle" | "walk";
  onInteract?: () => void;
  onToggleVehicle?: () => void;
  onToggleRun?: () => void;
  onHorn?: () => void;
  onCycleCamera?: () => void;
  onGreetNpc?: () => void;
  canEnterVehicle?: boolean;
  canInteract?: boolean;
  running?: boolean;
  nearbyInteraction?: ContextualInteraction | null;
  nearNpc?: boolean;
  maxSpeed?: number;
  hasNitro?: boolean;
  nitroActive?: boolean;
  nitroCharge?: number;
  nitroMax?: number;
  onNitro?: (active: boolean) => void;
}

export default function TouchControls({
  onInput,
  mode = "vehicle",
  onInteract,
  onToggleVehicle,
  onToggleRun,
  onHorn,
  onCycleCamera,
  onGreetNpc,
  canEnterVehicle = false,
  canInteract = false,
  running = false,
  nearbyInteraction = null,
  nearNpc = false,
  hasNitro = false,
  nitroActive = false,
  nitroCharge = 0,
  nitroMax = 100,
  onNitro,
}: Props) {
  // État interne des touches actives pour un feedback visuel instantané
  const state = useRef({ up: false, down: false, left: false, right: false, brake: false });
  const [pressed, setPressed] = useState({
    up: false,
    down: false,
    left: false,
    right: false,
    brake: false,
    nitro: false,
  });

  const emit = useCallback(() => {
    const s = state.current;
    const throttle = (s.up ? 1 : 0) + (s.down ? -1 : 0);
    const steer = (s.right ? 1 : 0) + (s.left ? -1 : 0);
    onInput(throttle, steer, s.brake);
  }, [onInput]);

  const bind = (key: keyof typeof state.current) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      state.current[key] = true;
      setPressed((p) => ({ ...p, [key]: true }));
      emit();
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      state.current[key] = false;
      setPressed((p) => ({ ...p, [key]: false }));
      emit();
    },
    onPointerCancel: () => {
      state.current[key] = false;
      setPressed((p) => ({ ...p, [key]: false }));
      emit();
    },
    onPointerLeave: () => {
      if (state.current[key]) {
        state.current[key] = false;
        setPressed((p) => ({ ...p, [key]: false }));
        emit();
      }
    },
  });

  const nitroBind = () => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      setPressed((p) => ({ ...p, nitro: true }));
      onNitro?.(true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      setPressed((p) => ({ ...p, nitro: false }));
      onNitro?.(false);
    },
    onPointerCancel: () => {
      setPressed((p) => ({ ...p, nitro: false }));
      onNitro?.(false);
    },
    onPointerLeave: () => {
      setPressed((p) => ({ ...p, nitro: false }));
      onNitro?.(false);
    },
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none touch-none">
      {/* ============================================================== */}
      {/* 1. COMMANDES EN CONDUITE DE VÉHICULE (VOITURE, MOTO, TUKTUK)   */}
      {/* ============================================================== */}
      {mode === "vehicle" && (
        <>
          {/* --- BAS GAUCHE : DIRECTION GAUCHE / DROITE & OPTIONS SECONDAIRES --- */}
          <div className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] flex flex-col gap-2">
            {/* Outils secondaires discrets : Klaxon, Caméra, Sortir */}
            <div className="flex items-center gap-1.5 opacity-90">
              {onHorn && (
                <button
                  onClick={onHorn}
                  className="flex h-8 items-center gap-1 rounded-xl border border-white/15 bg-black/45 px-2 text-[10px] font-black text-amber-300 shadow-sm backdrop-blur-md transition-all active:scale-90 active:bg-amber-500 active:text-black"
                  title="Klaxonner"
                >
                  <span>📢</span>
                  <span className="hidden sm:inline">Klaxon</span>
                </button>
              )}

              {onCycleCamera && (
                <button
                  onClick={onCycleCamera}
                  className="flex h-8 items-center gap-1 rounded-xl border border-white/15 bg-black/45 px-2 text-[10px] font-black text-sky-300 shadow-sm backdrop-blur-md transition-all active:scale-90 active:bg-sky-500 active:text-black"
                  title="Changer de vue caméra"
                >
                  <span>🎥</span>
                  <span className="hidden sm:inline">Vue</span>
                </button>
              )}

              {onToggleVehicle && (
                <button
                  onClick={onToggleVehicle}
                  className="flex h-8 items-center gap-1 rounded-xl border border-rose-400/30 bg-black/45 px-2 text-[10px] font-black text-rose-300 shadow-sm backdrop-blur-md transition-all active:scale-90 active:bg-rose-600 active:text-white"
                  title="Descendre du véhicule"
                >
                  <span>🚶</span>
                  <span className="hidden sm:inline">Sortir</span>
                </button>
              )}
            </div>

            {/* BOUTONS DE DIRECTION PRINCIPAUX : [ ← GAUCHE ] [ DROITE → ] */}
            <div className="flex items-center gap-2.5">
              {/* Bouton Gauche ← */}
              <button
                {...bind("left")}
                aria-label="Tourner à gauche"
                className={`relative flex h-16 w-20 sm:h-18 sm:w-24 flex-col items-center justify-center rounded-2xl border transition-all duration-75 select-none touch-none shadow-lg ${
                  pressed.left
                    ? "scale-95 border-sky-300 bg-sky-500/85 text-white ring-4 ring-sky-400/40 shadow-sky-500/40"
                    : "border-white/20 bg-slate-900/60 backdrop-blur-md text-white active:bg-slate-800/80 shadow-black/50"
                }`}
              >
                <span className="text-2xl leading-none font-black drop-shadow">←</span>
                <span className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-white/80">
                  Gauche
                </span>
                <span className="absolute -inset-2 rounded-2xl pointer-events-none" />
              </button>

              {/* Bouton Droite → */}
              <button
                {...bind("right")}
                aria-label="Tourner à droite"
                className={`relative flex h-16 w-20 sm:h-18 sm:w-24 flex-col items-center justify-center rounded-2xl border transition-all duration-75 select-none touch-none shadow-lg ${
                  pressed.right
                    ? "scale-95 border-sky-300 bg-sky-500/85 text-white ring-4 ring-sky-400/40 shadow-sky-500/40"
                    : "border-white/20 bg-slate-900/60 backdrop-blur-md text-white active:bg-slate-800/80 shadow-black/50"
                }`}
              >
                <span className="text-2xl leading-none font-black drop-shadow">→</span>
                <span className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-white/80">
                  Droite
                </span>
                <span className="absolute -inset-2 rounded-2xl pointer-events-none" />
              </button>
            </div>
          </div>

          {/* --- BAS DROITE : ACCÉLÉRATEUR & FREIN / RECUL --- */}
          <div className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] flex flex-col items-end gap-2">
            {/* Bouton Turbo secondaire (si nitro disponible) */}
            {hasNitro && (
              <button
                {...nitroBind()}
                className={`flex h-8 items-center gap-1 rounded-xl border border-cyan-400/30 px-2.5 text-[10px] font-black shadow-md backdrop-blur-md transition-all ${
                  pressed.nitro || nitroActive
                    ? "scale-95 bg-cyan-400 text-slate-950 ring-2 ring-cyan-300 shadow-cyan-400/50"
                    : "bg-black/45 text-cyan-300 active:bg-cyan-500 active:text-slate-950"
                }`}
              >
                <span>⚡</span>
                <span className="tracking-wide">
                  Turbo {Math.round((nitroCharge / Math.max(1, nitroMax)) * 100)}%
                </span>
              </button>
            )}

            {/* Pédale d'accélération principale [ ▲ ACCÉLÉRER ] */}
            <button
              {...bind("up")}
              aria-label="Accélérer"
              className={`relative flex h-18 w-28 sm:h-20 sm:w-32 flex-col items-center justify-center rounded-2xl border transition-all duration-75 select-none touch-none shadow-xl ${
                pressed.up
                  ? "scale-95 border-emerald-300 bg-emerald-500 text-slate-950 ring-4 ring-emerald-300/50 shadow-emerald-500/50"
                  : "border-emerald-400/40 bg-gradient-to-b from-emerald-600/70 to-emerald-700/70 backdrop-blur-md text-emerald-50 active:bg-emerald-600 shadow-emerald-950/40"
              }`}
            >
              <span className="text-2xl leading-none font-black drop-shadow">▲</span>
              <span className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-100">
                Accélérer
              </span>
              <span className="absolute -inset-2 rounded-2xl pointer-events-none" />
            </button>

            {/* Rangée Frein & Recul */}
            <div className="flex items-center gap-2">
              {/* Frein [ ▼ FREIN ] */}
              <button
                {...bind("brake")}
                aria-label="Freiner"
                className={`relative flex h-14 w-14 sm:h-15 sm:w-16 flex-col items-center justify-center rounded-2xl border transition-all duration-75 select-none touch-none shadow-lg ${
                  pressed.brake
                    ? "scale-95 border-rose-300 bg-rose-600 text-white ring-4 ring-rose-400/50 shadow-rose-600/50"
                    : "border-rose-400/35 bg-rose-900/60 backdrop-blur-md text-rose-200 active:bg-rose-800 shadow-black/50"
                }`}
              >
                <span className="text-xl leading-none">✋</span>
                <span className="text-[8px] font-black uppercase tracking-tight text-rose-100">Frein</span>
              </button>

              {/* Recul [ RECUL ] */}
              <button
                {...bind("down")}
                aria-label="Marche arrière"
                className={`relative flex h-14 w-14 sm:h-15 sm:w-16 flex-col items-center justify-center rounded-2xl border transition-all duration-75 select-none touch-none shadow-lg ${
                  pressed.down
                    ? "scale-95 border-amber-300 bg-amber-500 text-slate-950 ring-4 ring-amber-300/50 shadow-amber-500/50"
                    : "border-amber-400/35 bg-amber-900/60 backdrop-blur-md text-amber-200 active:bg-amber-800 shadow-black/50"
                }`}
              >
                <span className="text-xl leading-none">▼</span>
                <span className="text-[8px] font-black uppercase tracking-tight text-amber-100">Recul</span>
              </button>
            </div>
          </div>

          {/* --- CENTRE BAS : ACTION CONTEXTUELLE DE LIVRAISON UNIQUEMENT SI PROCHE --- */}
          {(canInteract || nearbyInteraction) && onInteract && (
            <div className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30">
              <button
                onClick={onInteract}
                className="flex items-center gap-2 rounded-2xl border border-emerald-300/50 bg-gradient-to-r from-emerald-600/90 to-sky-600/90 px-4 py-2 text-xs font-black text-white shadow-xl shadow-emerald-500/30 ring-2 ring-emerald-300/40 backdrop-blur-md animate-pulse active:scale-95"
              >
                <span className="text-base">{nearbyInteraction?.icon || "📦"}</span>
                <span>{(nearbyInteraction?.actionText || "LIVRER").toUpperCase()}</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* 2. COMMANDES À PIED (PERSONNAGE MARCHÉ / COURSE / INTÉRIEURS)  */}
      {/* ============================================================== */}
      {mode === "walk" && (
        <>
          {/* --- BAS GAUCHE : D-PAD DE DÉPLACEMENT DU JOUEUR --- */}
          <div className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] flex flex-col items-center gap-1">
            {/* Haut (Avancer) */}
            <button
              {...bind("up")}
              aria-label="Avancer"
              className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 transition-all ${
                pressed.up
                  ? "scale-90 border-emerald-300 bg-emerald-500 text-slate-950 ring-4 ring-emerald-300/50"
                  : "border-white/30 bg-slate-900/85 text-white active:bg-slate-800"
              } shadow-lg`}
            >
              <span className="text-2xl font-black">▲</span>
            </button>

            {/* Gauche, Reculer, Droite */}
            <div className="flex items-center gap-1">
              <button
                {...bind("left")}
                aria-label="Tourner à gauche"
                className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 transition-all ${
                  pressed.left
                    ? "scale-90 border-sky-300 bg-sky-500 text-white ring-4 ring-sky-300/50"
                    : "border-white/30 bg-slate-900/85 text-white active:bg-slate-800"
                } shadow-lg`}
              >
                <span className="text-2xl font-black">◀</span>
              </button>

              <button
                {...bind("down")}
                aria-label="Reculer"
                className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 transition-all ${
                  pressed.down
                    ? "scale-90 border-amber-300 bg-amber-500 text-slate-950 ring-4 ring-amber-300/50"
                    : "border-white/30 bg-slate-900/85 text-white active:bg-slate-800"
                } shadow-lg`}
              >
                <span className="text-2xl font-black">▼</span>
              </button>

              <button
                {...bind("right")}
                aria-label="Tourner à droite"
                className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 transition-all ${
                  pressed.right
                    ? "scale-90 border-sky-300 bg-sky-500 text-white ring-4 ring-sky-300/50"
                    : "border-white/30 bg-slate-900/85 text-white active:bg-slate-800"
                } shadow-lg`}
              >
                <span className="text-2xl font-black">▶</span>
              </button>
            </div>
          </div>

          {/* --- CENTRE BAS : ACTIONS INTERACTIVES --- */}
          <div className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            {/* Monter dans un véhicule à proximité */}
            {canEnterVehicle && onToggleVehicle && (
              <button
                onClick={onToggleVehicle}
                className="flex items-center gap-2 rounded-2xl border-2 border-sky-300 bg-sky-600 px-5 py-3 text-xs font-black text-white shadow-xl ring-4 ring-sky-400/40 animate-bounce active:scale-95"
              >
                <span className="text-xl">🛵</span>
                <span className="tracking-wide">MONTER DANS LE VÉHICULE</span>
              </button>
            )}

            {/* Interaction contextuelle (TV, Lit, Frigo, Évier, Porte, etc.) */}
            {nearbyInteraction && onInteract && (
              <button
                onClick={onInteract}
                className="flex items-center gap-2 rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-600 to-sky-600 px-5 py-3 text-xs font-black text-white shadow-xl ring-4 ring-emerald-400/40 animate-pulse active:scale-95"
              >
                <span className="text-xl">{nearbyInteraction.icon}</span>
                <span className="tracking-wide">{nearbyInteraction.actionText.toUpperCase()}</span>
              </button>
            )}

            {!nearbyInteraction && canInteract && onInteract && (
              <button
                onClick={onInteract}
                className="flex items-center gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow-xl active:scale-95"
              >
                <span>✋</span>
                <span>INTERAGIR [E]</span>
              </button>
            )}
          </div>

          {/* --- BAS DROITE : COURSE, CAMÉRA & SOCIAL --- */}
          <div className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] flex flex-col items-end gap-2.5">
            {/* Saluer un passant */}
            {nearNpc && onGreetNpc && (
              <button
                onClick={onGreetNpc}
                className="flex h-11 items-center gap-1.5 rounded-xl border border-emerald-400/50 bg-slate-900/85 px-3 text-xs font-black text-emerald-300 shadow-md backdrop-blur-md active:scale-90"
              >
                <span className="text-base">👋</span>
                <span className="text-[10px] uppercase font-bold tracking-wider">Saluer</span>
              </button>
            )}

            {/* Caméra */}
            {onCycleCamera && (
              <button
                onClick={onCycleCamera}
                className="flex h-11 items-center gap-1.5 rounded-xl border border-sky-400/40 bg-slate-900/85 px-3 text-xs font-black text-sky-300 shadow-md backdrop-blur-md active:scale-90"
              >
                <span className="text-base">🎥</span>
                <span className="text-[10px] uppercase font-bold tracking-wider">Vue</span>
              </button>
            )}

            {/* Bascule Course / Marche */}
            {onToggleRun && (
              <button
                onClick={onToggleRun}
                className={`flex h-18 w-24 sm:h-20 sm:w-28 flex-col items-center justify-center rounded-2xl border-2 transition-all shadow-xl active:scale-95 ${
                  running
                    ? "border-amber-300 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 ring-4 ring-amber-300/60 shadow-amber-500/50"
                    : "border-white/30 bg-slate-900/85 text-white active:bg-slate-800"
                }`}
              >
                <span className="text-2xl">{running ? "🏃" : "🚶"}</span>
                <span className="mt-1 text-[10px] font-black uppercase tracking-wider">
                  {running ? "Course" : "Marche"}
                </span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
