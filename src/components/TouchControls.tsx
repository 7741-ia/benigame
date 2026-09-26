import { useCallback, useRef } from "react";
import type { ContextualInteraction } from "../game/houseManager";

interface Props {
  onInput: (throttle: number, steer: number, brake: boolean) => void;
  mode?: "vehicle" | "walk";
  onInteract?: () => void;
  onToggleVehicle?: () => void;
  onToggleRun?: () => void;
  canEnterVehicle?: boolean;
  canInteract?: boolean;
  running?: boolean;
  nearbyInteraction?: ContextualInteraction | null;
}

export default function TouchControls({
  onInput,
  mode = "vehicle",
  onInteract,
  onToggleVehicle,
  onToggleRun,
  canEnterVehicle = false,
  canInteract = false,
  running = false,
  nearbyInteraction = null,
}: Props) {
  const state = useRef({ up: false, down: false, left: false, right: false, brake: false });

  const emit = useCallback(() => {
    const s = state.current;
    const throttle = (s.up ? 1 : 0) + (s.down ? -1 : 0);
    const steer = (s.right ? 1 : 0) + (s.left ? -1 : 0);
    onInput(throttle, steer, s.brake);
  }, [onInput]);

  const bind = (key: keyof typeof state.current) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      state.current[key] = true;
      emit();
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      state.current[key] = false;
      emit();
    },
    onPointerCancel: () => {
      state.current[key] = false;
      emit();
    },
    onPointerLeave: () => {
      if (state.current[key]) {
        state.current[key] = false;
        emit();
      }
    },
  });

  const btn =
    "select-none touch-none flex items-center justify-center rounded-2xl backdrop-blur-md border border-white/20 text-white font-bold active:scale-95 transition-all shadow-lg shadow-black/40";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 md:hidden">
      {/* Direction gauche / droite — en bas à gauche avec safe-area landscape */}
      <div className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] flex items-end gap-2.5">
        <button {...bind("left")} className={`${btn} h-16 w-16 bg-slate-900/60 text-2xl active:bg-slate-700/80`}>
          ◀
        </button>
        <button {...bind("right")} className={`${btn} h-16 w-16 bg-slate-900/60 text-2xl active:bg-slate-700/80`}>
          ▶
        </button>
      </div>

      {/* Boutons d'actions rapides et interaction contextuelle intelligente */}
      <div className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 flex items-center gap-2">
        {mode === "walk" && (
          <button
            onClick={onToggleRun}
            className={`${btn} px-3.5 h-12 text-xs font-semibold ${
              running ? "bg-amber-500/80 text-white ring-2 ring-amber-300" : "bg-slate-800/80 text-slate-200"
            }`}
          >
            {running ? "🏃 Course" : "🚶 Marche"}
          </button>
        )}

        {(canEnterVehicle || mode === "vehicle") && (
          <button
            onClick={onToggleVehicle}
            className={`${btn} px-3.5 h-12 text-xs font-semibold bg-sky-600/80 text-white`}
          >
            {mode === "vehicle" ? "🚶 Descendre" : "🛵 Monter"}
          </button>
        )}

        {/* Bouton contextuel unique intelligent : TV, lit, porte, douche, frigo, etc. */}
        {nearbyInteraction ? (
          <button
            onClick={onInteract}
            className={`${btn} px-4 h-12 text-xs font-black bg-gradient-to-r from-emerald-600 to-sky-600 text-white ring-2 ring-emerald-300/60 animate-pulse shadow-lg shadow-emerald-500/30`}
          >
            <span className="mr-1.5 text-base">{nearbyInteraction.icon}</span>
            <span>{nearbyInteraction.actionText.toUpperCase()}</span>
          </button>
        ) : canInteract ? (
          <button
            onClick={onInteract}
            className={`${btn} px-4 h-12 text-xs font-bold bg-emerald-600/90 text-white animate-pulse shadow-emerald-500/30`}
          >
            ✋ Action [E]
          </button>
        ) : null}
      </div>

      {/* Accélération, Recul / Frein — en bas à droite avec safe-area landscape */}
      <div className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] flex flex-col items-center gap-2.5">
        <button {...bind("up")} className={`${btn} h-18 w-18 bg-emerald-600/75 text-3xl active:bg-emerald-500`}>
          ▲
        </button>
        <div className="flex gap-2">
          <button
            {...bind("brake")}
            className={`${btn} h-14 w-14 ${mode === "walk" ? "bg-amber-600/70" : "bg-red-600/75"} text-xl`}
            title={mode === "walk" ? "Courir" : "Freiner"}
          >
            {mode === "walk" ? "⚡" : "✋"}
          </button>
          <button {...bind("down")} className={`${btn} h-14 w-14 bg-slate-800/80 text-2xl active:bg-slate-700`}>
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}
