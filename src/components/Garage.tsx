import type { Upgrades } from "../game/types";
import { UPGRADE_COST } from "../game/types";
import { VEHICLES } from "../game/vehicles";

interface Props {
  wallet: number;
  upgrades: Upgrades;
  owned: string[];
  selected: string;
  onBuy: (key: keyof Upgrades) => void;
  onBuyVehicle: (id: string) => void;
  onSelectVehicle: (id: string) => void;
  onBack: () => void;
}

const TRACKS: { key: keyof Upgrades; icon: string; name: string; desc: string; color: string }[] = [
  { key: "engine", icon: "⚙️", name: "Moteur", desc: "Vitesse max & accélération", color: "from-red-400 to-orange-500" },
  { key: "handling", icon: "🎯", name: "Maniabilité", desc: "Virages plus serrés", color: "from-sky-400 to-blue-500" },
  { key: "tires", icon: "🛞", name: "Pneus", desc: "Meilleure adhérence", color: "from-emerald-400 to-green-500" },
  { key: "boost", icon: "🔥", name: "Turbo", desc: "Réserve de puissance", color: "from-fuchsia-400 to-purple-500" },
];

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

export default function Garage({
  wallet,
  upgrades,
  owned,
  selected,
  onBuy,
  onBuyVehicle,
  onSelectVehicle,
  onBack,
}: Props) {
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-gradient-to-b from-slate-900 via-slate-900/95 to-black p-4">
      <div className="mx-auto max-w-md pb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-black">🔧 Garage</h2>
          <div className="flex items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1.5 font-black text-amber-300 ring-1 ring-amber-400/30">
            💰 ${wallet}
          </div>
        </div>

        {/* ===== VEHICLES ===== */}
        <h3 className="mt-4 text-sm font-black uppercase tracking-wider text-sky-300">🚚 Moyens de déplacement</h3>
        <div className="mt-2 space-y-2">
          {VEHICLES.map((v) => {
            const isOwned = owned.includes(v.id);
            const isSel = selected === v.id;
            const canBuy = !isOwned && wallet >= v.price;
            return (
              <div
                key={v.id}
                className={`rounded-2xl p-3 ring-1 transition-colors ${
                  isSel ? "bg-sky-500/15 ring-sky-400/50" : "bg-white/5 ring-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
                    style={{ background: `#${v.color.toString(16).padStart(6, "0")}33` }}
                  >
                    {v.emoji}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-black">
                      {v.name}
                      {isSel && <span className="rounded bg-sky-400 px-1.5 text-[10px] text-black">ACTIF</span>}
                    </div>
                    <div className="text-xs text-white/50">{v.desc}</div>
                  </div>
                  {isOwned ? (
                    <button
                      disabled={isSel}
                      onClick={() => onSelectVehicle(v.id)}
                      className={`min-w-[80px] rounded-xl px-3 py-2 text-sm font-black active:scale-95 ${
                        isSel ? "bg-white/10 text-white/40" : "bg-gradient-to-r from-sky-400 to-blue-500 text-black"
                      }`}
                    >
                      {isSel ? "✔" : "Choisir"}
                    </button>
                  ) : (
                    <button
                      disabled={!canBuy}
                      onClick={() => onBuyVehicle(v.id)}
                      className={`min-w-[80px] rounded-xl px-3 py-2 text-sm font-black active:scale-95 ${
                        canBuy
                          ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-black"
                          : "bg-white/10 text-white/40"
                      }`}
                    >
                      ${v.price}
                    </button>
                  )}
                </div>
                {/* stats */}
                <div className="mt-2 space-y-1 text-[10px] text-white/50">
                  <div className="flex items-center gap-2">
                    <span className="w-14">Vitesse</span>
                    <Bar value={v.maxSpeed} max={60} color="from-red-400 to-orange-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-14">Accél.</span>
                    <Bar value={v.accel} max={80} color="from-amber-400 to-yellow-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-14">Virage</span>
                    <Bar value={v.turn} max={3.4} color="from-sky-400 to-blue-500" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ===== UPGRADES ===== */}
        <h3 className="mt-5 text-sm font-black uppercase tracking-wider text-amber-300">⬆️ Améliorations</h3>
        <div className="mt-2 space-y-3">
          {TRACKS.map((t) => {
            const level = upgrades[t.key];
            const maxed = level >= 5;
            const cost = maxed ? 0 : UPGRADE_COST[level];
            const canBuy = !maxed && wallet >= cost;
            return (
              <div key={t.key} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${t.color} text-2xl`}>
                    {t.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-black">{t.name}</div>
                    <div className="text-xs text-white/50">{t.desc}</div>
                  </div>
                  <button
                    disabled={!canBuy}
                    onClick={() => onBuy(t.key)}
                    className={`min-w-[76px] rounded-xl px-3 py-2 text-sm font-black active:scale-95 ${
                      maxed
                        ? "bg-emerald-500/20 text-emerald-300"
                        : canBuy
                          ? "bg-gradient-to-r from-amber-400 to-yellow-500 text-black"
                          : "bg-white/10 text-white/40"
                    }`}
                  >
                    {maxed ? "MAX" : `$${cost}`}
                  </button>
                </div>
                <div className="mt-3 flex gap-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2 flex-1 rounded-full ${i < level ? `bg-gradient-to-r ${t.color}` : "bg-white/10"}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onBack}
          className="mt-5 w-full rounded-2xl bg-gradient-to-r from-emerald-400 to-green-600 py-4 text-lg font-black active:scale-95"
        >
          ✔ Terminé
        </button>
      </div>
    </div>
  );
}
