import { useState } from "react";
import type { HudState } from "../game/types";
import type { PlayerProfile } from "../game/life";
import { loadMissionHistory, loadSettings } from "../game/storage";
import { audio } from "../game/audio";

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
  const [tab, setTab] = useState<"home" | "missions" | "audio">("home");
  const [missions] = useState(() => loadMissionHistory());
  const [settings, setSettings] = useState(() => loadSettings());

  const apps = [
    {
      label: "Missions",
      detail: `${hud.deliveriesDone} / 20 - Niv. ${hud.level}`,
      icon: "📋",
      action: () => {
        audio.click();
        setTab("missions");
      },
    },
    {
      label: "Carte",
      detail: hud.navActive ? hud.navLabel : "Choisir une destination",
      icon: "🗺️",
      action: onMap,
    },
    {
      label: "Audio",
      detail: "Musique, bruitages & ambiance",
      icon: "🔊",
      action: () => {
        audio.click();
        setTab("audio");
      },
    },
    {
      label: "Profil",
      detail: profile.nickname,
      icon: "👤",
      action: onProfile,
    },
    {
      label: "Maison",
      detail: "Cuisine, repos, décoration",
      icon: "🏠",
      action: onHome,
    },
    {
      label: "Activités",
      detail: "Quartiers, sorties, événements",
      icon: "🎉",
      action: onActivities,
    },
  ];

  const toggleSound = () => {
    const next = !settings.soundEnabled;
    audio.setSoundEnabled(next);
    setSettings((s) => ({ ...s, soundEnabled: next }));
  };

  const toggleMusic = () => {
    const next = !settings.musicEnabled;
    audio.setMusicEnabled(next);
    setSettings((s) => ({ ...s, musicEnabled: next }));
  };

  const toggleAmbient = () => {
    const next = !settings.ambientEnabled;
    audio.setAmbientEnabled(next);
    setSettings((s) => ({ ...s, ambientEnabled: next }));
  };

  const changeMasterVolume = (val: number) => {
    audio.setVolume(val);
    setSettings((s) => ({ ...s, volume: val }));
  };

  const changeMusicVolume = (val: number) => {
    audio.setMusicVolume(val);
    setSettings((s) => ({ ...s, musicVolume: val }));
  };

  const changeSfxVolume = (val: number) => {
    audio.setSfxVolume(val);
    setSettings((s) => ({ ...s, sfxVolume: val }));
  };

  const changeAmbientVolume = (val: number) => {
    audio.setAmbientVolume(val);
    setSettings((s) => ({ ...s, ambientVolume: val }));
  };

  const deliveriesRemaining = Math.max(0, 20 - hud.deliveriesDone);
  const currentDistrict = hud.currentDistrict || "Beni Centre";
  const nextDestination = hud.targetLabel || (hud.hasPackage ? "Remise au client" : "Récupération du colis");

  return (
    <div className="absolute inset-0 z-[65] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md">
      <div className="flex h-[min(780px,95vh)] w-full max-w-sm flex-col overflow-hidden rounded-[2.4rem] border-[6px] border-slate-800 bg-slate-950 shadow-2xl ring-1 ring-white/10">
        {/* Barre d'état smartphone */}
        <div className="flex items-center justify-between bg-gradient-to-r from-sky-600 to-blue-800 px-5 py-3.5 text-white">
          <div className="flex items-center gap-2">
            {tab !== "home" && (
              <button
                onClick={() => {
                  audio.click();
                  setTab("home");
                }}
                className="flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-bold hover:bg-black/40 transition"
              >
                ← Retour
              </button>
            )}
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-200">BENI PHONE</div>
              <div className="text-sm font-black leading-tight">
                {tab === "home" ? profile.nickname : tab === "missions" ? "Journal des missions" : "Audio & Sons"}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              audio.closePhone();
              onClose();
            }}
            className="rounded-full bg-black/25 px-3 py-1 text-xs font-black hover:bg-black/40 active:scale-95 transition"
          >
            Fermer
          </button>
        </div>

        {/* Mini stats rapides */}
        <div className="grid grid-cols-3 gap-2 border-b border-white/10 bg-white/5 p-2.5 text-center text-xs">
          <div>
            <b>${hud.money}</b>
            <br />
            <span className="text-[11px] text-white/45">Portefeuille</span>
          </div>
          <div>
            <b>{100 - hud.fatigue}%</b>
            <br />
            <span className="text-[11px] text-white/45">Énergie</span>
          </div>
          <div>
            <b>{100 - hud.hunger}%</b>
            <br />
            <span className="text-[11px] text-white/45">Satiété</span>
          </div>
        </div>

        {/* ================= CONTENU ACCUEIL ================= */}
        {tab === "home" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              {apps.map((app) => (
                <button
                  key={app.label}
                  onClick={app.action}
                  className="rounded-2xl bg-white/7 p-3.5 text-left ring-1 ring-white/10 transition active:scale-95 hover:bg-white/10"
                >
                  <div className="text-3xl">{app.icon}</div>
                  <div className="mt-2 font-black text-sm text-white">{app.label}</div>
                  <div className="mt-0.5 text-[11px] leading-tight text-white/50">{app.detail}</div>
                </button>
              ))}
            </div>

            {/* Carte de progression rapide */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500/15 to-blue-500/10 p-3.5 ring-1 ring-emerald-400/25">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-wider text-emerald-300">Tournée en cours</div>
                <span className="rounded bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  Niveau {hud.level} / 3
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="text-lg font-black text-white">
                  {hud.deliveriesDone} / 20 <span className="text-xs font-normal text-white/60">livraisons</span>
                </div>
                <div className="text-xs font-bold text-emerald-400">
                  {Math.round((hud.deliveriesDone / 20) * 100)}%
                </div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-300"
                  style={{ width: `${Math.min(100, (hud.deliveriesDone / 20) * 100)}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 p-3.5 ring-1 ring-white/10 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white/80">Quartier actuel :</span>
                <span className="font-black text-sky-300 text-right">{currentDistrict}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-bold text-white/80">Mode de jeu :</span>
                <span className="rounded bg-sky-400/15 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                  100% Hors-Ligne local
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ================= CONTENU MISSION LOG ================= */}
        {tab === "missions" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
            {/* Titre Mission Log */}
            <div className="rounded-2xl bg-gradient-to-br from-indigo-900/60 to-slate-900 p-4 ring-1 ring-indigo-400/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-300">
                    MISSION LOG
                  </div>
                  <div className="text-xl font-black text-white">Niveau actuel : {hud.level}</div>
                </div>
                <div className="rounded-xl bg-indigo-500/20 px-3 py-1.5 text-center ring-1 ring-indigo-400/30">
                  <div className="text-base font-black text-indigo-200">
                    {hud.deliveriesDone} / 20
                  </div>
                  <div className="text-[10px] font-bold text-indigo-300/70">Progression</div>
                </div>
              </div>

              {/* Barre de progression */}
              <div className="mt-3">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/40">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 transition-all duration-300"
                    style={{ width: `${Math.min(100, (hud.deliveriesDone / 20) * 100)}%` }}
                  />
                </div>
                {hud.deliveriesDone >= 20 && (
                  <div className="mt-2 rounded-lg bg-emerald-500/20 py-1 text-center text-xs font-black text-emerald-300 ring-1 ring-emerald-400/40">
                    ✨ NIVEAU {hud.level} TERMINÉ !
                  </div>
                )}
              </div>
            </div>

            {/* OBJECTIFS ACTUELS */}
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-sky-400">
                OBJECTIFS ACTUELS
              </div>
              <div className="space-y-1.5 text-xs text-white/80">
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/60">Livraisons terminées :</span>
                  <span className="font-bold text-emerald-400">{hud.deliveriesDone}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/60">Livraisons restantes :</span>
                  <span className="font-bold text-amber-400">{deliveriesRemaining}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-white/60">Quartier actuel :</span>
                  <span className="font-bold text-sky-300 text-right">{currentDistrict}</span>
                </div>
                <div className="flex justify-between pt-0.5">
                  <span className="text-white/60">Prochaine destination :</span>
                  <span className="font-bold text-amber-300 text-right">{nextDestination}</span>
                </div>
              </div>
            </div>

            {/* OBJECTIFS RESTANTS (Liste détaillée des 20 missions du niveau) */}
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                  OBJECTIFS DU NIVEAU {hud.level}
                </div>
                <span className="text-[11px] font-bold text-white/40">20 missions au total</span>
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {Array.from({ length: 20 }).map((_, idx) => {
                  const missionNum = idx + 1;
                  const isDone = missionNum <= hud.deliveriesDone;
                  const isNext = missionNum === hud.deliveriesDone + 1;
                  return (
                    <div
                      key={missionNum}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs transition ${
                        isDone
                          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20"
                          : isNext
                          ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 font-bold"
                          : "bg-white/5 text-white/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{isDone ? "✓" : "○"}</span>
                        <span>Livraison {missionNum}</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider">
                        {isDone ? "Terminée" : isNext ? "En cours" : "À venir"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* LIVRAISONS TERMINÉES (Vraies données de l'historique de jeu) */}
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  LIVRAISONS TERMINÉES ({missions.length})
                </div>
                <span className="text-[10px] text-white/40 font-semibold">Historique local</span>
              </div>

              {missions.length === 0 ? (
                <div className="rounded-xl bg-white/5 p-4 text-center text-xs text-white/50">
                  Aucune livraison terminée enregistrée pour l'instant. Prends ton véhicule et commence ta tournée !
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {[...missions].reverse().map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl bg-slate-900/80 p-3 ring-1 ring-white/10 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-black text-sky-300">
                          Mission #{m.id} · Niv. {m.level}
                        </div>
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-300">
                          ✓ {m.status}
                        </span>
                      </div>
                      <div className="text-white font-bold">{m.destination}</div>
                      <div className="flex items-center justify-between text-[11px] text-white/50 pt-1 border-t border-white/5">
                        <span>📍 {m.district}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-bold">+${m.reward}</span>
                          {m.time && <span>🕒 {m.time}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= CONTENU RÉGLAGES AUDIO ================= */}
        {tab === "audio" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-violet-900/60 to-slate-900 p-4 ring-1 ring-violet-400/30">
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-violet-300">
                SYSTÈME AUDIO
              </div>
              <div className="text-lg font-black text-white">Bruits & Musique de Beni</div>
              <p className="mt-1 text-xs text-white/60">
                100% hors-ligne via Web Audio API. Ajuste les volumes et active ou coupe chaque canal selon tes préférences.
              </p>
            </div>

            {/* Canal 1 : Effets Sonores (SFX) */}
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-sm">Effets sonores (SFX)</div>
                  <div className="text-[11px] text-white/50">Moteur, pas, klaxon, interactions</div>
                </div>
                <button
                  onClick={toggleSound}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition active:scale-95 ${
                    settings.soundEnabled
                      ? "bg-emerald-500 text-white"
                      : "bg-white/10 text-white/40"
                  }`}
                >
                  {settings.soundEnabled ? "ACTIF" : "COUPE"}
                </button>
              </div>
              {settings.soundEnabled && (
                <div>
                  <div className="flex justify-between text-[11px] text-white/60 mb-1">
                    <span>Volume des effets</span>
                    <span>{Math.round(settings.sfxVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.sfxVolume}
                    onChange={(e) => changeSfxVolume(parseFloat(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </div>
              )}
            </div>

            {/* Canal 2 : Ambiance Urbaine */}
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-sm">Sons d'ambiance</div>
                  <div className="text-[11px] text-white/50">Circulation, oiseaux, vent, marché</div>
                </div>
                <button
                  onClick={toggleAmbient}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition active:scale-95 ${
                    settings.ambientEnabled
                      ? "bg-sky-500 text-white"
                      : "bg-white/10 text-white/40"
                  }`}
                >
                  {settings.ambientEnabled ? "ACTIF" : "COUPE"}
                </button>
              </div>
              {settings.ambientEnabled && (
                <div>
                  <div className="flex justify-between text-[11px] text-white/60 mb-1">
                    <span>Volume d'ambiance</span>
                    <span>{Math.round(settings.ambientVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.ambientVolume}
                    onChange={(e) => changeAmbientVolume(parseFloat(e.target.value))}
                    className="w-full accent-sky-400"
                  />
                </div>
              )}
            </div>

            {/* Canal 3 : Musique d'ambiance locale */}
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-sm">Musique d'ambiance</div>
                  <div className="text-[11px] text-white/50">Marimba & kalimba afro-lounge</div>
                </div>
                <button
                  onClick={toggleMusic}
                  className={`rounded-xl px-3 py-1.5 text-xs font-black transition active:scale-95 ${
                    settings.musicEnabled
                      ? "bg-amber-500 text-black font-extrabold"
                      : "bg-white/10 text-white/40"
                  }`}
                >
                  {settings.musicEnabled ? "ACTIVE" : "COUPEE"}
                </button>
              </div>
              {settings.musicEnabled && (
                <div>
                  <div className="flex justify-between text-[11px] text-white/60 mb-1">
                    <span>Volume musique</span>
                    <span>{Math.round(settings.musicVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.musicVolume}
                    onChange={(e) => changeMusicVolume(parseFloat(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                </div>
              )}
            </div>

            {/* Volume Général (Master) */}
            <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 space-y-2">
              <div className="flex justify-between text-xs font-bold text-white">
                <span>Volume général (Master)</span>
                <span>{Math.round(settings.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.volume}
                onChange={(e) => changeMasterVolume(parseFloat(e.target.value))}
                className="w-full accent-indigo-400"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
