import { useMemo, useRef, useState } from "react";
import { DISTRICTS, POIS, landmarkWorld, type PoiType } from "../game/districts";
import { CELL, GRID_LINES, HALF, WORLD } from "../game/constants";
import type { HudState } from "../game/types";

interface MapPlace {
  id: string;
  name: string;
  short: string;
  emoji: string;
  kind: string;
  x: number;
  z: number;
}

interface Props {
  hud: HudState;
  onNavigate: (x: number, z: number, label: string) => void;
  onCancelNavigation: () => void;
  onClose: () => void;
}

const poiActivities: Record<PoiType, string> = {
  shop: "Acheter un véhicule ou améliorer son équipement",
  restaurant: "Manger, discuter et récupérer de l'énergie",
  kiosk: "Acheter une boisson et recharger le nitro",
  home: "Dormir, cuisiner, décorer et recevoir des amis",
  market: "Acheter des ingrédients pour cuisiner",
  clothing: "Changer de tenue et acheter des accessoires",
  leisure: "Rencontrer des amis, danser et participer aux événements",
  pharmacy: "Acheter des soins médicaux et récupérer de la santé",
  fuel: "Faire le plein de carburant et entretenir le véhicule",
  admin: "Démarches administratives et services de la mairie",
};

const colorFor = (kind: string) => {
  if (kind === "shop" || kind === "clothing" || kind === "market") return "#fbbf24";
  if (kind === "restaurant") return "#4ade80";
  if (kind === "kiosk") return "#22d3ee";
  if (kind === "home") return "#f472b6";
  if (kind === "leisure") return "#c084fc";
  return "#e2e8f0";
};

export default function CityMap({ hud, onNavigate, onCancelNavigation, onClose }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [filter, setFilter] = useState<"all" | "district" | "activity">("all");
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const places = useMemo<MapPlace[]>(() => {
    const districts = DISTRICTS.map((place, index) => {
      const [x, z] = landmarkWorld(place);
      return {
        id: `district-${index}`,
        name: place.name,
        short: place.short,
        emoji: place.emoji,
        kind: place.kind,
        x,
        z,
      };
    });
    const pois = POIS.map((place, index) => {
      const [x, z] = landmarkWorld(place);
      return {
        id: `poi-${index}`,
        name: place.name,
        short: place.name,
        emoji: place.emoji,
        kind: place.type,
        x,
        z,
      };
    });
    return [...districts, ...pois];
  }, []);

  const visiblePlaces = places.filter((place) => {
    if (filter === "all") return true;
    if (filter === "activity") return place.kind in poiActivities;
    return !(place.kind in poiActivities);
  });

  const toMap = (value: number) => ((value + HALF) / WORLD) * 900 + 50;
  const player = { x: toMap(hud.playerX), y: toMap(hud.playerZ) };
  const routeTarget = hud.navActive
    ? { x: toMap(hud.navX), y: toMap(hud.navZ) }
    : selected
      ? { x: toMap(selected.x), y: toMap(selected.z) }
      : null;

  const zoomBy = (delta: number) => setZoom((z) => Math.max(0.75, Math.min(3, z + delta)));

  return (
    <div className="absolute inset-0 z-[70] flex bg-slate-950/95 text-white backdrop-blur-xl">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-xl font-black">Carte de Beni</h2>
            <p className="text-xs text-white/55">Clique un lieu pour afficher l'itinéraire.</p>
          </div>
          <div className="flex gap-2">
            {hud.navActive && (
              <button onClick={onCancelNavigation} className="map-button text-red-300">Annuler</button>
            )}
            <button onClick={() => zoomBy(-0.25)} className="map-button">-</button>
            <button onClick={() => zoomBy(0.25)} className="map-button">+</button>
            <button onClick={onClose} className="map-button">Fermer</button>
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto px-4 py-2 text-xs">
          {(["all", "district", "activity"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-bold ${
                filter === value ? "bg-sky-400 text-slate-950" : "bg-white/10 text-white/70"
              }`}
            >
              {value === "all" ? "Tout" : value === "district" ? "Quartiers et rues" : "Activités"}
            </button>
          ))}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#211d17]">
          <svg
            viewBox="0 0 1000 1000"
            className="h-full w-full touch-none"
            onWheel={(event) => {
              event.preventDefault();
              zoomBy(event.deltaY < 0 ? 0.15 : -0.15);
            }}
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              setPan({
                x: drag.current.panX + (event.clientX - drag.current.x) / zoom,
                y: drag.current.panY + (event.clientY - drag.current.y) / zoom,
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <rect x="30" y="30" width="940" height="940" rx="32" fill="#30291d" />
              {Array.from({ length: GRID_LINES }).map((_, index) => {
                const p = toMap(index * CELL - HALF);
                return (
                  <g key={index} stroke="#737b86" strokeWidth="14" opacity="0.8">
                    <line x1={p} x2={p} y1="50" y2="950" />
                    <line x1="50" x2="950" y1={p} y2={p} />
                  </g>
                );
              })}

              {routeTarget && (
                <polyline
                  points={`${player.x},${player.y} ${routeTarget.x},${player.y} ${routeTarget.x},${routeTarget.y}`}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="8"
                  strokeDasharray="18 12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {visiblePlaces.map((place) => (
                <g
                  key={place.id}
                  transform={`translate(${toMap(place.x)} ${toMap(place.z)})`}
                  className="cursor-pointer"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected(place);
                  }}
                >
                  <circle
                    r={selected?.id === place.id ? 15 : 10}
                    fill={colorFor(place.kind)}
                    stroke="#0f172a"
                    strokeWidth="4"
                  />
                  <text y="-16" textAnchor="middle" fontSize="18">
                    {place.emoji}
                  </text>
                </g>
              ))}

              {hud.navActive && (
                <g transform={`translate(${toMap(hud.navX)} ${toMap(hud.navZ)})`}>
                  <circle r="20" fill="none" stroke="#38bdf8" strokeWidth="6" />
                  <circle r="7" fill="#38bdf8" />
                </g>
              )}

              <g transform={`translate(${player.x} ${player.y}) rotate(${(hud.playerHeading * 180) / Math.PI})`}>
                <path d="M 0 -15 L 11 12 L 0 7 L -11 12 Z" fill="#ef4444" stroke="white" strokeWidth="3" />
              </g>
              {hud.playerMode === "walk" && (
                <g transform={`translate(${toMap(hud.vehicleX)} ${toMap(hud.vehicleZ)})`}>
                  <rect x="-10" y="-10" width="20" height="20" rx="5" fill="#38bdf8" stroke="white" strokeWidth="3" />
                  <text y="-16" textAnchor="middle" fontSize="16">Moto garée</text>
                </g>
              )}
            </g>
          </svg>

          <div className="absolute bottom-3 left-3 flex gap-2 text-[10px] font-bold">
            <span className="rounded bg-amber-400 px-2 py-1 text-black">Commerces</span>
            <span className="rounded bg-green-400 px-2 py-1 text-black">Restaurants</span>
            <span className="rounded bg-fuchsia-400 px-2 py-1 text-black">Maison</span>
          </div>
        </div>
      </div>

      <aside className="hidden w-80 border-l border-white/10 bg-slate-900/90 p-4 md:block">
        {selected ? (
          <PlaceDetails
            place={selected}
            onNavigate={() => onNavigate(selected.x, selected.z, selected.name)}
          />
        ) : (
          <div className="pt-10 text-center text-sm text-white/50">

            Sélectionne un quartier, une avenue ou une activité.
            
          </div>
        )}
        {hud.navActive && (
          <button
            onClick={onCancelNavigation}
            className="mt-4 w-full rounded-xl bg-red-500/15 py-3 text-sm font-black text-red-300 ring-1 ring-red-400/30"
          >
            Annuler la destination
          </button>
        )}
      </aside>

      {selected && (
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-slate-900/95 p-3 shadow-2xl ring-1 ring-white/15 md:hidden">
          <PlaceDetails
            place={selected}
            compact
            onNavigate={() => onNavigate(selected.x, selected.z, selected.name)}
          />
        </div>
      )}
    </div>
  );
}

function PlaceDetails({
  place,
  onNavigate,
  compact = false,
}: {
  place: MapPlace;
  onNavigate: () => void;
  compact?: boolean;
}) {
  const activity = poiActivities[place.kind as PoiType];
  return (
    <div className={compact ? "flex items-center gap-3" : "space-y-4"}>
      <div className="text-3xl">{place.emoji}</div>
      <div className="min-w-0 flex-1">
        <h3 className="font-black">{place.name}</h3>
        <p className="text-xs text-white/55">{activity || `${place.kind} accessible dans le jeu`}</p>
      </div>
      <button
        onClick={onNavigate}
        className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-black text-slate-950 active:scale-95"
      >
        Itinéraire
      </button>
    </div>
  );
}