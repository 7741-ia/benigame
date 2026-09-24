import { useCallback, useRef } from "react";

interface Props {
  onInput: (throttle: number, steer: number, brake: boolean) => void;
  mode?: "vehicle" | "walk";
}

export default function TouchControls({ onInput, mode = "vehicle" }: Props) {
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
    "select-none touch-none flex items-center justify-center rounded-full backdrop-blur-md border border-white/25 text-white font-bold active:scale-90 transition-transform shadow-lg shadow-black/30";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 md:hidden">
      {/* Steering — bottom left */}
      <div className="pointer-events-auto absolute bottom-6 left-5 flex items-end gap-3">
        <button {...bind("left")} className={`${btn} h-20 w-20 bg-white/15 text-3xl`}>
          ◀
        </button>
        <button {...bind("right")} className={`${btn} h-20 w-20 bg-white/15 text-3xl`}>
          ▶
        </button>
      </div>

      {/* Throttle — bottom right */}
      <div className="pointer-events-auto absolute bottom-6 right-5 flex flex-col items-center gap-3">
        <button {...bind("up")} className={`${btn} h-24 w-24 bg-emerald-500/70 text-4xl`}>
          ▲
        </button>
        <div className="flex gap-3">
          <button {...bind("brake")} className={`${btn} h-16 w-16 bg-red-500/70 text-2xl`}>
            {mode === "walk" ? "🏃" : "✋"}
          </button>
          <button {...bind("down")} className={`${btn} h-16 w-16 bg-amber-500/70 text-3xl`}>
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}
