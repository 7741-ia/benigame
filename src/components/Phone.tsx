import { useEffect, useState } from "react";
import type { HudState } from "../game/types";
import type { PlayerProfile } from "../game/life";
import { multiplayer } from "../game/network";

interface Props {
  hud: HudState;
  profile: PlayerProfile;
  onClose: () => void;
  onMap: () => void;
  onProfile: () => void;
  onHome: () => void;
  onActivities: () => void;
}

export default function Phone({
  hud,
  profile,
  onClose,
  onMap,
  onProfile,
  onHome,
  onActivities,
}: Props) {
  const [networkStatus, setNetworkStatus] = useState(multiplayer.status);
  useEffect(() => multiplayer.subscribe(setNetworkStatus), []);
  const apps = [
    { label: "Carte", detail: hud.navActive ? hud.navLabel : "Choisir une destination", icon: "🗺️", action: onMap },
    { label: "Profil", detail: profile.nickname, icon: "👤", action: onProfile },
    { label: "Maison", detail: "Cuisine, repos, décoration", icon: "🏠", action: onHome },
    { label: "Activités", detail: "Quartiers, sorties, événements", icon: "🎉", action: onActivities },
  ];

  return (
    <div className="absolute inset-0 z-[65] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md">
      <div className="flex h-[min(760px,94vh)] w-full max-w-sm flex-col overflow-hidden rounded-[2.2rem] border-[6px] border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-sky-500 to-blue-700 px-5 py-4">
          <div>
            <div className="text-xs font-bold text-white/70">BENI LIFE</div>
            <div className="font-black">{profile.nickname}</div>
          </div>
          <button onClick={onClose} className="rounded-full bg-black/20 px-3 py-1 text-sm font-black">
            Fermer
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-white/10 bg-white/5 p-3 text-center text-xs">
          <div><b>${hud.money}</b><br /><span className="text-white/45">Portefeuille</span></div>
          <div><b>{100 - hud.fatigue}%</b><br /><span className="text-white/45">Énergie</span></div>
          <div><b>{100 - hud.hunger}%</b><br /><span className="text-white/45">Satiété</span></div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            {apps.map((app) => (
              <button
                key={app.label}
                onClick={app.action}
                className="rounded-2xl bg-white/7 p-4 text-left ring-1 ring-white/10 transition active:scale-95"
              >
                <div className="text-3xl">{app.icon}</div>
                <div className="mt-2 font-black">{app.label}</div>
                <div className="mt-0.5 text-[11px] leading-tight text-white/45">{app.detail}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="flex items-center justify-between">
              <div className="font-black">Amis et messages</div>
              <span className="rounded bg-amber-400/15 px-2 py-1 text-[10px] font-bold text-amber-300">
                {networkStatus === "unconfigured" ? "SERVEUR REQUIS" : networkStatus.toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/50">
              Aucun faux joueur n'est affiché. Les amis, demandes de discussion, blocages et signalements
              seront activés uniquement après connexion à un serveur WebSocket authentifié.
            </p>
          </div>

          <div className="mt-3 rounded-2xl bg-emerald-400/10 p-4 ring-1 ring-emerald-300/20">
            <div className="text-sm font-black text-emerald-300">Tournée actuelle</div>
            <div className="mt-1 text-xs text-white/60">
              {hud.freeRoam
                ? "Exploration libre. Tu peux reprendre des livraisons quand tu veux."
                : `${hud.deliveriesDone}/${hud.deliveriesNeeded} livraisons, niveau ${hud.level}.`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}