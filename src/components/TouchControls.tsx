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
  speed?: number;
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
  speed = 0,
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
          {/* --- BAS GAUCHE : DIRECTION GAUCHE / DROITE & OPTIONS VÉHICULE --- */}
          <div className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] flex flex-col gap-2.5">
            {/* Barre d'outils secondaires : Klaxon, Caméra, Sortie */}
            <div className="flex items-center gap-2">
              {onHorn && (
                <button
                  onClick={onHorn}
                  className="flex h-11 items-center gap-1 rounded-xl border border-amber-400/40 bg-slate-900/80 px-2.5 text-xs font-black text-amber-300 shadow-md backdrop-blur-md transition-all active:scale-90 active:bg-amber-500 active:text-black"
                  title="Klaxonner"
                >
                  <span className="text-base">📢</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider">Klaxon</span>
                </button>
              )}

              {onCycleCamera && (
                <button
                  onClick={onCycleCamera}
                  className="flex h-11 items-center gap-1 rounded-xl border border-sky-400/40 bg-slate-900/80 px-2.5 text-xs font-black text-sky-300 shadow-md backdrop-blur-md transition-all active:scale-90 active:bg-sky-500 active:text-black"
                  title="Changer de vue caméra"
                >
                  <span className="text-base">🎥</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider">Vue</span>
                </button>
              )}

              {onToggleVehicle && (
                <button
                  onClick={onToggleVehicle}
                  className="flex h-11 items-center gap-1 rounded-xl border border-rose-400/40 bg-slate-900/80 px-2.5 text-xs font-black text-rose-300 shadow-md backdrop-blur-md transition-all active:scale-90 active:bg-rose-600 active:text-white"
                  title="Descendre du véhicule"
                >
                  <span className="text-base">🚶</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider">Sortir</span>
                </button>
              )}
            </div>

            {/* BOUTONS DE DIRECTION PRINCIPAUX : ← GAUCHE | DROITE → */}
            <div className="flex items-center gap-3">
              {/* Bouton Gauche ← */}
              <button
                {...bind("left")}
                aria-label="Tourner à gauche"
                className={`relative flex h-20 w-24 sm:h-22 sm:w-28 flex-col items-center justify-center rounded-2xl border-2 transition-all duration-75 select-none touch-none shadow-xl ${
                  pressed.left
                    ? "scale-90 border-sky-300 bg-sky-500/90 text-white ring-4 ring-sky-400/50 shadow-sky-500/50"
                    : "border-white/30 bg-slate-900/85 text-white active:bg-slate-800 shadow-black/60"
                }`}
              >
                <span className="text-3xl leading-none font-black drop-shadow-md">←</span>
                <span className="mt-0.5 text-[10px] font-black uppercase tracking-wider opacity-85">
                  Gauche
                </span>
                {/* Hitbox élargie invisible */}
                <span className="absolute -inset-2 rounded-2xl pointer-events-none" />
              </button>

              {/* Bouton Droite → */}
              <button
                {...bind("right")}
                aria-label="Tourner à droite"
                className={`relative flex h-20 w-24 sm:h-22 sm:w-28 flex-col items-center justify-center rounded-2xl border-2 transition-all duration-75 select-none touch-none shadow-xl ${
                  pressed.right
                    ? "scale-90 border-sky-300 bg-sky-500/90 text-white ring-4 ring-sky-400/50 shadow-sky-500/50"
                    : "border-white/30 bg-slate-900/85 text-white active:bg-slate-800 shadow-black/60"
                }`}
              >
                <span className="text-3xl leading-none font-black drop-shadow-md">→</span>
                <span className="mt-0.5 text-[10px] font-black uppercase tracking-wider opacity-85">
                  Droite
                </span>
                {/* Hitbox élargie invisible */}
                <span className="absolute -inset-2 rounded-2xl pointer-events-none" />
              </button>
            </div>
          </div>

          {/* --- BAS DROITE : ACCÉLÉRATEUR & FREIN / MARCHE ARRIÈRE --- */}
          <div className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] flex flex-col items-end gap-2.5">
            {/* Bouton Nitro (si débloqué) */}
            {hasNitro && (
              <button
                {...nitroBind()}
                className={`flex h-11 items-center gap-1.5 rounded-xl border border-cyan-300/40 px-3 text-xs font-black shadow-lg backdrop-blur-md transition-all ${
                  pressed.nitro || nitroActive
                    ? "scale-90 bg-cyan-400 text-slate-950 ring-4 ring-cyan-300 shadow-cyan-400/60"
                    : "bg-slate-900/85 text-cyan-300 active:bg-cyan-500 active:text-slate-950"
                }`}
              >
                <span className="text-base">⚡</span>
                <span className="text-[10px] uppercase font-black tracking-wider">
                  Turbo ({Math.round((nitroCharge / Math.max(1, nitroMax)) * 100)}%)
                </span>
              </button>
            )}

            {/* Pédale d'accélération (large bouton vert) */}
            <button
              {...bind("up")}
              aria-label="Accélérer"
              className={`relative flex h-22 w-28 sm:h-24 sm:w-32 flex-col items-center justify-center rounded-2xl border-2 transition-all duration-75 select-none touch-none shadow-2xl ${
                pressed.up
                  ? "scale-90 border-emerald-200 bg-emerald-500 text-slate-950 ring-4 ring-emerald-300/70 shadow-emerald-500/70"
                  : "border-emerald-400/50 bg-gradient-to-b from-emerald-600/90 to-emerald-700/90 text-white active:bg-emerald-600 shadow-emerald-950/60"
              }`}
            >
              <span className="text-3xl leading-none font-black drop-shadow-md">▲</span>
              <span className="mt-1 text-[11px] font-black uppercase tracking-wider text-emerald-100">
                Accélérer
              </span>
              {/* Hitbox élargie */}
              <span className="absolute -inset-2 rounded-2xl pointer-events-none" />
            </button>

            {/* Rangée de freinage : Frein à main & Marche arrière */}
            <div className="flex items-center gap-2.5">
              {/* Frein à main / Arrêt d'urgence */}
              <button
                {...bind("brake")}
                aria-label="Freiner"
                className={`relative flex h-16 w-16 sm:h-18 sm:w-18 flex-col items-center justify-center rounded-2xl border-2 transition-all duration-75 select-none touch-none shadow-xl ${
                  pressed.brake
                    ? "scale-90 border-red-300 bg-red-600 text-white ring-4 ring-red-400/60 shadow-red-600/60"
                    : "border-red-400/40 bg-slate-900/85 text-red-300 active:bg-red-800 shadow-black/60"
                }`}
              >
                <span className="text-2xl leading-none">✋</span>
                <span className="text-[9px] font-bold uppercase tracking-tight">Frein</span>
              </button>

              {/* Marche arrière / Recul */}
              <button
                {...bind("down")}
                aria-label="Marche arrière"
                className={`relative flex h-16 w-18 sm:h-18 sm:w-20 flex-col items-center justify-center rounded-2xl border-2 transition-all duration-75 select-none touch-none shadow-xl ${
                  pressed.down
                    ? "scale-90 border-amber-300 bg-amber-500 text-slate-950 ring-4 ring-amber-300/60 shadow-amber-500/60"
                    : "border-white/30 bg-slate-900/85 text-amber-300 active:bg-slate-800 shadow-black/60"
                }`}
              >
                <span className="text-2xl leading-none">▼</span>
                <span className="text-[9px] font-bold uppercase tracking-tight">Recul</span>
              </button>
            </div>
          </div>

          {/* --- CENTRE BAS : VITESSE COMPACTE & ACTION CONTEXTUELLE DE LIVRAISON --- */}
          <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
            {/* Bouton d'action ou de livraison si disponible */}
            {(canInteract || nearbyInteraction) && onInteract && (
              <button
                onClick={onInteract}
                className="pointer-events-auto flex items-center gap-2 rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-600 to-sky-600 px-5 py-2.5 text-xs font-black text-white shadow-xl shadow-emerald-500/40 ring-4 ring-emerald-300/40 animate-pulse active:scale-95"
              >
                <span className="text-base">{nearbyInteraction?.icon || "📦"}</span>
                <span>{(nearbyInteraction?.actionText || "LIVRER").toUpperCase()}</span>
              </button>
            )}

            {/* Compteur de vitesse digital compact */}
            <div className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/60 px-3.5 py-1 backdrop-blur-md shadow-lg">
              <span className="text-xl font-black text-white leading-none tracking-tight">
                {Math.round(speed)}
              </span>
              <span className="text-[10px] font-bold uppercase text-white/60">km/h</span>
            </div>
          </div>
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
