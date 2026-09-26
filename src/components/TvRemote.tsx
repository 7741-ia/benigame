import { CHANNELS, type TvState } from "../game/interactiveTv";

interface Props {
  tvState?: TvState;
  onTogglePower: () => void;
  onNextChannel: () => void;
  onPrevChannel: () => void;
  onVolumeChange: (vol: number) => void;
  onClose: () => void;
}

export default function TvRemote({
  tvState,
  onTogglePower,
  onNextChannel,
  onPrevChannel,
  onVolumeChange,
  onClose,
}: Props) {
  const isOn = tvState?.isOn ?? false;
  const channel = tvState?.channel ?? 0;
  const currentCh = CHANNELS[channel] || CHANNELS[0];
  const volume = tvState?.volume ?? 75;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-3xl bg-slate-900/95 p-5 text-white ring-1 ring-white/20 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📺</span>
            <h3 className="font-black text-sm tracking-wide">Télécommande TV</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white/70 hover:bg-white/20"
          >
            ✕
          </button>
        </div>

        {/* Écran miniature / statut */}
        <div
          className={`mt-4 rounded-2xl p-4 text-center transition-all ${
            isOn
              ? "bg-gradient-to-b from-sky-950 to-slate-950 ring-2 ring-sky-400/50 shadow-inner"
              : "bg-black/60 ring-1 ring-white/10 opacity-70"
          }`}
        >
          <div className="text-xs uppercase font-extrabold tracking-wider text-sky-400">
            {isOn ? "Écran Allumé" : "Écran Éteint"}
          </div>
          <div className="mt-2 text-3xl">{isOn ? currentCh.icon : "⬛"}</div>
          <div className="mt-1 font-black text-sm text-white">
            {isOn ? currentCh.name : "Appuie sur Power pour allumer"}
          </div>
          {isOn && (
            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-white/60">
              <span>Vol : {volume}%</span>
              <div className="h-1.5 w-20 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${volume}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Boutons de la télécommande */}
        <div className="mt-5 space-y-3">
          {/* Bouton Power */}
          <div className="flex justify-center">
            <button
              onClick={onTogglePower}
              className={`flex items-center gap-2 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-wider transition-all active:scale-95 ${
                isOn
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/30"
                  : "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 animate-pulse"
              }`}
            >
              <span>⏻</span>
              <span>{isOn ? "Éteindre" : "Allumer"}</span>
            </button>
          </div>

          {isOn && (
            <>
              {/* Zapping Chaînes */}
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-[10px] uppercase font-bold text-white/50 text-center mb-2">
                  Chaînes ({channel + 1}/{CHANNELS.length})
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={onPrevChannel}
                    className="flex-1 rounded-xl bg-white/10 py-2.5 font-black text-sm active:scale-95 hover:bg-white/15"
                  >
                    ◀ Précédente
                  </button>
                  <button
                    onClick={onNextChannel}
                    className="flex-1 rounded-xl bg-sky-500 py-2.5 font-black text-sm text-slate-950 active:scale-95 hover:bg-sky-400"
                  >
                    Suivante ▶
                  </button>
                </div>
              </div>

              {/* Réglage Volume */}
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-[10px] uppercase font-bold text-white/50 text-center mb-2">Volume</div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => onVolumeChange(Math.max(0, volume - 10))}
                    className="h-10 w-12 rounded-xl bg-white/10 font-black text-base active:scale-95"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={volume}
                    onChange={(e) => onVolumeChange(Number(e.target.value))}
                    className="flex-1 accent-sky-400"
                  />
                  <button
                    onClick={() => onVolumeChange(Math.min(100, volume + 10))}
                    className="h-10 w-12 rounded-xl bg-white/10 font-black text-base active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white/70 hover:bg-white/15"
        >
          Reprendre le jeu
        </button>
      </div>
    </div>
  );
}
