import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { HudState } from "../game/types";
import { CELL, GRID_LINES, HALF, WORLD } from "../game/constants";
import {
  calculateRoadRoute,
  formatDistance,
  getEnrichedMapPlaces,
  type MapPlace,
  type RoadRoute,
} from "../game/navigation";
import { getDistrictAt } from "../game/districts";

interface Props {
  hud: HudState;
  getLivePlayerState?: () => {
    playerX: number;
    playerZ: number;
    playerHeading: number;
    playerMode: "vehicle" | "walk";
    vehicleType: string;
    vehicleName: string;
    targetX: number;
    targetZ: number;
    targetLabel: string;
    hasActiveDestination: boolean;
    hasPackage: boolean;
    vehicleX: number;
    vehicleZ: number;
    currentDistrict: string;
    speedKmh: number;
  };
  onNavigate: (x: number, z: number, label: string) => void;
  onCancelNavigation: () => void;
  onClose: () => void;
}

const colorFor = (kind: string, type: string) => {
  if (type === "home") return "#ec4899"; // rose
  if (type === "restaurant") return "#22c55e"; // vert
  if (type === "shop" || type === "market" || type === "clothing") return "#f59e0b"; // ambre
  if (type === "fuel") return "#ef4444"; // rouge
  if (type === "pharmacy") return "#06b6d4"; // cyan
  if (type === "kiosk") return "#38bdf8"; // bleu ciel
  if (type === "leisure") return "#a855f7"; // violet
  if (kind.includes("Quartier")) return "#3b82f6"; // bleu
  return "#e2e8f0";
};

// Échelle SVG (0 à 1000 pour couvrir -HALF à +HALF)
const SVG_SIZE = 1000;
const MARGIN = 50;
const MAP_SPAN = SVG_SIZE - MARGIN * 2; // 900
const toMap = (val: number) => ((val + HALF) / WORLD) * MAP_SPAN + MARGIN;
const fromMap = (px: number) => ((px - MARGIN) / MAP_SPAN) * WORLD - HALF;

export default function CityMap({
  hud,
  getLivePlayerState,
  onNavigate,
  onCancelNavigation,
  onClose,
}: Props) {
  // ── ÉTAT JOUEUR EN TEMPS RÉEL (60 FPS) ──
  const [liveState, setLiveState] = useState(() => {
    const live = getLivePlayerState?.();
    return {
      x: live?.playerX ?? hud.playerX,
      z: live?.playerZ ?? hud.playerZ,
      heading: live?.playerHeading ?? hud.playerHeading,
      mode: live?.playerMode ?? hud.playerMode,
      vehicleType: live?.vehicleType ?? "moto",
      vehicleName: live?.vehicleName ?? "Moto",
      targetX: live?.targetX ?? hud.targetX,
      targetZ: live?.targetZ ?? hud.targetZ,
      targetLabel: live?.targetLabel ?? hud.targetLabel,
      hasActiveDestination: live?.hasActiveDestination ?? hud.navActive,
      district: live?.currentDistrict ?? getDistrictAt(hud.playerX, hud.playerZ),
      speedKmh: live?.speedKmh ?? hud.speed,
    };
  });

  // ── MODES : SUIVI DU JOUEUR vs EXPLORATION LIBRE ──
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(1.4);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [filter, setFilter] = useState<"all" | "districts" | "shops" | "services">("all");

  const places = useMemo(() => getEnrichedMapPlaces(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Synchronisation 60 FPS ultra-fluide avec le monde 3D
  useEffect(() => {
    let animId: number;
    const loop = () => {
      const live = getLivePlayerState?.();
      if (live) {
        setLiveState({
          x: live.playerX,
          z: live.playerZ,
          heading: live.playerHeading,
          mode: live.playerMode,
          vehicleType: live.vehicleType,
          vehicleName: live.vehicleName,
          targetX: live.targetX,
          targetZ: live.targetZ,
          targetLabel: live.targetLabel,
          hasActiveDestination: live.hasActiveDestination,
          district: live.currentDistrict,
          speedKmh: live.speedKmh,
        });
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [getLivePlayerState]);

  // En Mode Suivi, la carte recentre continuellement sur le joueur
  useEffect(() => {
    if (!followMode) return;
    const targetMapX = toMap(liveState.x);
    const targetMapY = toMap(liveState.z);
    // Centre le point joueur dans le viewport SVG (500, 500)
    const targetPanX = 500 - targetMapX * zoom;
    const targetPanY = 500 - targetMapY * zoom;
    setPan({ x: targetPanX, y: targetPanY });
  }, [followMode, liveState.x, liveState.z, zoom]);

  // Recentre manuellement sur le joueur
  const recenterOnPlayer = useCallback(() => {
    const targetMapX = toMap(liveState.x);
    const targetMapY = toMap(liveState.z);
    setPan({
      x: 500 - targetMapX * zoom,
      y: 500 - targetMapY * zoom,
    });
    setFollowMode(true);
  }, [liveState.x, liveState.z, zoom]);

  // ── CALCUL D'ITINÉRAIRE ROUTIER EN TEMPS RÉEL ──
  const activeRoute = useMemo<RoadRoute | null>(() => {
    if (!liveState.hasActiveDestination) {
      if (!selectedPlace) return null;
      return calculateRoadRoute(
        liveState.x,
        liveState.z,
        selectedPlace.x,
        selectedPlace.z,
        selectedPlace.name
      );
    }
    return calculateRoadRoute(
      liveState.x,
      liveState.z,
      liveState.targetX,
      liveState.targetZ,
      liveState.targetLabel
    );
  }, [
    liveState.x,
    liveState.z,
    liveState.targetX,
    liveState.targetZ,
    liveState.targetLabel,
    liveState.hasActiveDestination,
    selectedPlace,
  ]);

  // ── GESTION TACTILE & SOURIS (DRAG, PINCH TO ZOOM, MOLETTE) ──
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    isDragging: boolean;
  }>({ startX: 0, startY: 0, startPanX: 0, startPanY: 0, isDragging: false });

  const touchesRef = useRef<{ dist: number; startZoom: number } | null>(null);

  // Zoom contrôlé avec paliers
  const zoomTier = zoom < 1.15 ? 1 : zoom < 1.9 ? 2 : zoom < 3.0 ? 3 : 4;
  const zoomTierLabel =
    zoomTier === 1
      ? "Vue globale"
      : zoomTier === 2
        ? "Quartiers & Avenues"
        : zoomTier === 3
          ? "Rues & Commerces"
          : "Détails précis";

  const setZoomClamped = (newZoom: number) => {
    const clamped = Math.max(0.75, Math.min(4.5, newZoom));
    setZoom(clamped);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.18 : 0.85;
    setZoomClamped(zoom * factor);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      isDragging: true,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 5 && followMode) {
      setFollowMode(false); // Bascule en Mode Exploration dès que l'utilisateur déplace la carte
    }
    setPan({
      x: dragRef.current.startPanX + dx,
      y: dragRef.current.startPanY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragRef.current.isDragging = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // Pinch-to-zoom sur smartphone
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchesRef.current = { dist, startZoom: zoom };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchesRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / touchesRef.current.dist;
      setZoomClamped(touchesRef.current.startZoom * ratio);
    }
  };

  const handleTouchEnd = () => {
    touchesRef.current = null;
  };

  // ── FILTRAGE DES LIEUX SELON L'ONGLET & LE NIVEAU DE ZOOM ──
  const visiblePlaces = useMemo(() => {
    return places.filter((p) => {
      // Filtre catégorie
      if (filter === "districts" && p.type !== "district" && p.type !== "avenue") return false;
      if (filter === "shops" && p.type !== "shop" && p.type !== "restaurant" && p.type !== "market" && p.type !== "clothing") return false;
      if (filter === "services" && p.type !== "fuel" && p.type !== "pharmacy" && p.type !== "home" && p.type !== "kiosk") return false;

      // Filtre densité de zoom pour ne pas surcharger la vue éloignée
      if (zoomTier === 1 && p.minZoomTier > 1) return false;
      if (zoomTier === 2 && p.minZoomTier > 2) return false;
      return true;
    });
  }, [places, filter, zoomTier]);

  // Rotation mathématiquement exacte du joueur (en degrés, 0° = vers le haut / Nord)
  const playerAngleDeg = ((Math.PI - liveState.heading) * 180) / Math.PI;
  const playerScreenX = toMap(liveState.x);
  const playerScreenY = toMap(liveState.z);

  // Icône du véhicule
  const vehicleEmoji =
    liveState.mode === "walk"
      ? "🚶"
      : liveState.vehicleType === "moto" || liveState.vehicleType === "scooter"
        ? "🛵"
        : liveState.vehicleType === "van"
          ? "🚐"
          : liveState.vehicleType === "tuktuk"
            ? "🛺"
            : "🚗";

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[70] flex flex-col bg-slate-950 text-white select-none overflow-hidden"
    >
      {/* ── BARRE SUPÉRIEURE : TITRE, STATUT GPS, RECHERCHE & COMMANDES ── */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-900/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-xl ring-1 ring-sky-400/40">
            🗺️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black tracking-wide">Carte de Beni</h2>
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-300 ring-1 ring-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                GPS EN DIRECT
              </span>
            </div>
            <p className="text-xs text-white/60">
              Quartier actuel : <span className="font-bold text-sky-300">{liveState.district}</span>
              {liveState.speedKmh > 0 && ` • ${liveState.speedKmh} km/h`}
            </p>
          </div>
        </div>

        {/* Boutons d'action rapides */}
        <div className="flex items-center gap-2">
          {/* Bouton Revenir au Joueur */}
          <button
            onClick={recenterOnPlayer}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition active:scale-95 ${
              followMode
                ? "bg-sky-400 text-slate-950 shadow-md shadow-sky-400/20"
                : "bg-white/10 text-white hover:bg-white/15 ring-1 ring-white/20 animate-pulse"
            }`}
            title="Recentrer automatiquement la carte sur la position actuelle du joueur"
          >
            <span>📍</span>
            <span>{followMode ? "Suivi actif" : "Revenir au joueur"}</span>
          </button>

          {/* Zoom In / Out */}
          <div className="flex items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <button
              onClick={() => setZoomClamped(zoom - 0.35)}
              className="px-2.5 py-1 text-sm font-black hover:bg-white/10 active:scale-90"
              title="Dézoomer"
            >
              −
            </button>
            <span className="px-1 text-[10px] font-bold text-white/60">{zoom.toFixed(1)}x</span>
            <button
              onClick={() => setZoomClamped(zoom + 0.35)}
              className="px-2.5 py-1 text-sm font-black hover:bg-white/10 active:scale-90"
              title="Zoomer"
            >
              +
            </button>
          </div>

          {/* Bouton Fermer */}
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded-xl bg-red-500/20 px-3 py-1.5 text-xs font-black text-red-200 ring-1 ring-red-500/40 hover:bg-red-500/30 transition active:scale-95"
            title="Revenir au jeu"
          >
            <span>✕</span>
            <span className="hidden sm:inline">Fermer la carte</span>
          </button>
        </div>
      </header>

      {/* ── BANDEAU INFOS ITINÉRAIRE EN COURS (SI DESTINATION ACTIVE) ── */}
      {activeRoute && (
        <div className="flex items-center justify-between border-b border-sky-400/20 bg-sky-950/70 px-4 py-2 text-xs backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="text-xl animate-bounce">📍</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white">{activeRoute.targetLabel}</span>
                <span className="rounded bg-sky-400/20 px-1.5 py-0.2 text-[10px] font-bold text-sky-300">
                  {activeRoute.targetDistrict}
                </span>
              </div>
              <p className="text-[11px] text-sky-200/80">
                Itinéraire routier : <span className="font-extrabold text-amber-300">{formatDistance(activeRoute.distanceMeters)}</span> restant
              </p>
            </div>
          </div>
          {liveState.hasActiveDestination && (
            <button
              onClick={onCancelNavigation}
              className="rounded-lg bg-red-500/20 px-2.5 py-1 text-[11px] font-black text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/30"
            >
              Annuler guidage
            </button>
          )}
        </div>
      )}

      {/* ── FILTRES PAR CATÉGORIES & NIVEAU DE ZOOM ── */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 bg-slate-900/60 px-4 py-1.5 text-xs">
        <div className="flex gap-1.5 overflow-x-auto">
          {(
            [
              { id: "all", label: "Tout afficher" },
              { id: "districts", label: "Quartiers & Avenues" },
              { id: "shops", label: "Commerces & Restos" },
              { id: "services", label: "Services & Maison" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                filter === t.id
                  ? "bg-sky-400 text-slate-950 shadow"
                  : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-semibold text-white/50">
          <span>🔍 {zoomTierLabel}</span>
        </div>
      </div>

      {/* ── ZONE DE CARTE SVG INTERACTIVE & FLUIDE ── */}
      <div
        className="relative flex-1 cursor-grab active:cursor-grabbing bg-[#1e1b15] overflow-hidden touch-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 1000 1000"
          className="h-full w-full pointer-events-auto"
        >
          <defs>
            {/* Lueur et effet tracé GPS */}
            <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            {/* Dégradé route */}
            <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>

          {/* Groupe transformé par PAN et ZOOM */}
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {/* Fond de terrain tropical de Beni */}
            <rect x="30" y="30" width="940" height="940" rx="24" fill="#242018" />

            {/* Îlots urbains & végétation */}
            {Array.from({ length: GRID_LINES - 1 }).map((_, gx) =>
              Array.from({ length: GRID_LINES - 1 }).map((_, gz) => {
                const x = toMap(gx * CELL - HALF + CELL / 2);
                const z = toMap(gz * CELL - HALF + CELL / 2);
                const w = ((CELL - 16) / WORLD) * MAP_SPAN;
                return (
                  <rect
                    key={`${gx}-${gz}`}
                    x={x - w / 2}
                    y={z - w / 2}
                    width={w}
                    height={w}
                    rx="4"
                    fill="#363124"
                    stroke="#1a1813"
                    strokeWidth="1"
                    opacity="0.85"
                  />
                );
              })
            )}

            {/* Réseau des avenues & routes asphaltées de Beni */}
            {Array.from({ length: GRID_LINES }).map((_, index) => {
              const p = toMap(index * CELL - HALF);
              return (
                <g key={`road-${index}`}>
                  {/* Chaussée asphaltée */}
                  <line x1={p} x2={p} y1={MARGIN} y2={SVG_SIZE - MARGIN} stroke="#596370" strokeWidth="11" strokeLinecap="square" />
                  <line x1={MARGIN} x2={SVG_SIZE - MARGIN} y1={p} y2={p} stroke="#596370" strokeWidth="11" strokeLinecap="square" />
                  {/* Ligne médiane de voirie */}
                  <line x1={p} x2={p} y1={MARGIN} y2={SVG_SIZE - MARGIN} stroke="#8592a3" strokeWidth="1.2" strokeDasharray="8 6" opacity="0.6" />
                  <line x1={MARGIN} x2={SVG_SIZE - MARGIN} y1={p} y2={p} stroke="#8592a3" strokeWidth="1.2" strokeDasharray="8 6" opacity="0.6" />
                </g>
              );
            })}

            {/* ── ITINÉRAIRE ROUTIER EN TEMPS RÉEL (Suit strictement les rues) ── */}
            {activeRoute && activeRoute.points.length >= 2 && (
              <g filter="url(#routeGlow)">
                {/* Halo d'itinéraire */}
                <polyline
                  points={activeRoute.points.map((pt) => `${toMap(pt.x)},${toMap(pt.z)}`).join(" ")}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth="10"
                  strokeOpacity="0.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Tracé principal contrasté */}
                <polyline
                  points={activeRoute.points.map((pt) => `${toMap(pt.x)},${toMap(pt.z)}`).join(" ")}
                  fill="none"
                  stroke="url(#routeGrad)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Animation de chevrons le long de la route */}
                <polyline
                  points={activeRoute.points.map((pt) => `${toMap(pt.x)},${toMap(pt.z)}`).join(" ")}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeDasharray="10 14"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.9"
                />
              </g>
            )}

            {/* ── LIEUX & POINTS D'INTÉRÊT INTERACTIFS ── */}
            {visiblePlaces.map((place) => {
              const mx = toMap(place.x);
              const mz = toMap(place.z);
              const isSelected = selectedPlace?.id === place.id;
              const isTarget =
                liveState.hasActiveDestination &&
                Math.hypot(place.x - liveState.targetX, place.z - liveState.targetZ) < 15;

              return (
                <g
                  key={place.id}
                  transform={`translate(${mx} ${mz})`}
                  className="cursor-pointer transition-transform hover:scale-125"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPlace(place);
                  }}
                >
                  {/* Cercle de sélection / cible */}
                  {(isSelected || isTarget) && (
                    <circle
                      r={isSelected ? 18 : 14}
                      fill="none"
                      stroke={isTarget ? "#38bdf8" : "#f59e0b"}
                      strokeWidth="3.5"
                      className="animate-pulse"
                    />
                  )}

                  {/* Pastille de repère */}
                  <circle
                    r={isSelected ? 12 : 9}
                    fill={colorFor(place.kind, place.type)}
                    stroke="#0f172a"
                    strokeWidth="2.5"
                  />

                  {/* Émoji représentatif */}
                  <text y="-14" textAnchor="middle" fontSize={zoomTier >= 3 ? "14" : "11"}>
                    {place.emoji}
                  </text>

                  {/* Libellé du lieu (selon niveau de zoom) */}
                  {zoomTier >= 2 && (
                    <text
                      y="18"
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#ffffff"
                      stroke="#0f172a"
                      strokeWidth="2.5"
                      paintOrder="stroke"
                    >
                      {place.short}
                    </text>
                  )}
                </g>
              );
            })}

            {/* ── MARQUEUR DESTINATION ACTIVÉE ── */}
            {liveState.hasActiveDestination && (
              <g transform={`translate(${toMap(liveState.targetX)} ${toMap(liveState.targetZ)})`}>
                <circle r="22" fill="none" stroke="#38bdf8" strokeWidth="4" opacity="0.6" className="animate-ping" />
                <circle r="14" fill="#0284c7" stroke="#ffffff" strokeWidth="2.5" />
                <text y="-22" textAnchor="middle" fontSize="16">📍</text>
                <text
                  y="22"
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="black"
                  fill="#38bdf8"
                  stroke="#0f172a"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  DESTINATION
                </text>
              </g>
            )}

            {/* ── MOTO / VÉHICULE DU JOUEUR GARÉ (EN MODE PIÉTON) ── */}
            {liveState.mode === "walk" && (
              <g transform={`translate(${toMap(liveState.vehicleX)} ${toMap(liveState.vehicleZ)})`}>
                <rect x="-10" y="-10" width="20" height="20" rx="6" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
                <text y="4" textAnchor="middle" fontSize="11">🛵</text>
                <text y="-14" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#38bdf8" stroke="#0f172a" strokeWidth="2" paintOrder="stroke">
                  Véhicule garé
                </text>
              </g>
            )}

            {/* ── MARQUEUR DU JOUEUR EN TEMPS RÉEL (TOURNANT STRICTEMENT SELON LE HEADING) ── */}
            <g transform={`translate(${playerScreenX} ${playerScreenY})`}>
              {/* Onde de détection radar */}
              <circle r="22" fill="#ef4444" fillOpacity="0.15" className="animate-ping" />
              <circle r="15" fill="#ef4444" fillOpacity="0.25" />

              {/* Balise rotative orientée selon l'angle réel */}
              <g transform={`rotate(${playerAngleDeg})`}>
                {/* Faisceau / Flèche de direction indiquant où regarde / roule le joueur */}
                <path
                  d="M 0 -24 L 9 -8 L 0 -13 L -9 -8 Z"
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                {/* Icône véhicule / piéton */}
                <circle r="10" fill="#dc2626" stroke="#ffffff" strokeWidth="2" />
                <text y="3.5" textAnchor="middle" fontSize="10">
                  {vehicleEmoji}
                </text>
              </g>

              {/* Étiquette joueur */}
              <text
                y="20"
                textAnchor="middle"
                fontSize="9"
                fontWeight="black"
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="2.5"
                paintOrder="stroke"
              >
                Moi ({liveState.mode === "walk" ? "À pied" : liveState.vehicleName})
              </text>
            </g>
          </g>
        </svg>

        {/* ── MINI LÉGENDE RAPIDE AU BAS DE L'ÉCRAN ── */}
        <div className="pointer-events-none absolute bottom-3 left-3 hidden sm:flex items-center gap-2 rounded-xl bg-slate-950/80 px-3 py-1.5 text-[10px] font-bold text-white/80 ring-1 ring-white/10 backdrop-blur-md">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-500" /> Maison</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Boutiques</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Restaurants</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Carburant</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Itinéraire</span>
        </div>

        {/* ── BOUTONS FLOTTANTS : REVENIR AU JOUEUR & ZOOM ── */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          {!followMode && (
            <button
              onClick={recenterOnPlayer}
              className="flex items-center gap-2 rounded-2xl bg-sky-400 px-4 py-2.5 text-xs font-black text-slate-950 shadow-2xl ring-2 ring-sky-300 active:scale-95 animate-bounce"
            >
              <span>📍</span>
              <span>Revenir au joueur</span>
            </button>
          )}

          <div className="flex flex-col rounded-2xl bg-slate-900/90 ring-1 ring-white/20 shadow-xl overflow-hidden backdrop-blur-md">
            <button
              onClick={() => setZoomClamped(zoom + 0.5)}
              className="flex h-10 w-10 items-center justify-center font-black text-lg hover:bg-white/10 active:bg-white/20"
              title="Zoomer"
            >
              +
            </button>
            <div className="h-[1px] bg-white/10" />
            <button
              onClick={() => setZoomClamped(zoom - 0.5)}
              className="flex h-10 w-10 items-center justify-center font-black text-lg hover:bg-white/10 active:bg-white/20"
              title="Dézoomer"
            >
              −
            </button>
          </div>
        </div>
      </div>

      {/* ── PANNEAU LATÉRAL DE DÉTAIL DU LIEU SÉLECTIONNÉ (DESKTOP) ── */}
      {selectedPlace && (
        <aside className="hidden md:block absolute right-4 top-16 z-10 w-80 rounded-2xl bg-slate-900/95 p-4 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl">
          <PlaceCard
            place={selectedPlace}
            playerX={liveState.x}
            playerZ={liveState.z}
            isCurrentTarget={
              liveState.hasActiveDestination &&
              Math.hypot(selectedPlace.x - liveState.targetX, selectedPlace.z - liveState.targetZ) < 15
            }
            onGo={() => {
              onNavigate(selectedPlace.x, selectedPlace.z, selectedPlace.name);
            }}
            onCancel={onCancelNavigation}
            onClose={() => setSelectedPlace(null)}
          />
        </aside>
      )}

      {/* ── FICHE MODALE DU LIEU SÉLECTIONNÉ (MOBILE) ── */}
      {selectedPlace && (
        <div className="md:hidden absolute inset-x-3 bottom-3 z-20 rounded-2xl bg-slate-900/95 p-3.5 shadow-2xl ring-1 ring-white/20 backdrop-blur-xl">
          <PlaceCard
            place={selectedPlace}
            playerX={liveState.x}
            playerZ={liveState.z}
            isCurrentTarget={
              liveState.hasActiveDestination &&
              Math.hypot(selectedPlace.x - liveState.targetX, selectedPlace.z - liveState.targetZ) < 15
            }
            compact
            onGo={() => {
              onNavigate(selectedPlace.x, selectedPlace.z, selectedPlace.name);
            }}
            onCancel={onCancelNavigation}
            onClose={() => setSelectedPlace(null)}
          />
        </div>
      )}
    </div>
  );
}

// ── COMPOSANT FICHE D'INFORMATIONS DU LIEU SÉLECTIONNÉ ──
function PlaceCard({
  place,
  playerX,
  playerZ,
  isCurrentTarget,
  compact = false,
  onGo,
  onCancel,
  onClose,
}: {
  place: MapPlace;
  playerX: number;
  playerZ: number;
  isCurrentTarget: boolean;
  compact?: boolean;
  onGo: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const directDistance = Math.round(Math.hypot(playerX - place.x, playerZ - place.z));
  const roadRoute = useMemo(
    () => calculateRoadRoute(playerX, playerZ, place.x, place.z, place.name),
    [playerX, playerZ, place.x, place.z, place.name]
  );

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-3xl">
            {place.emoji}
          </div>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-400">
              {place.district}
            </div>
            <h3 className="text-base font-black text-white">{place.name}</h3>
            <p className="text-[11px] text-white/50">{place.kind}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-white/10 p-1.5 text-xs text-white/70 hover:bg-white/20 active:scale-90"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10 text-center">
        <div>
          <span className="text-[10px] font-semibold text-white/50">Distance route</span>
          <div className="text-sm font-black text-amber-300">{formatDistance(roadRoute.distanceMeters)}</div>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-white/50">À vol d'oiseau</span>
          <div className="text-sm font-bold text-white/80">{formatDistance(directDistance)}</div>
        </div>
      </div>

      <div className="flex gap-2">
        {isCurrentTarget ? (
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl bg-red-500/20 py-2.5 text-xs font-black text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/30 transition active:scale-95"
          >
            ✕ Annuler destination
          </button>
        ) : (
          <button
            onClick={onGo}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-sky-400 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-sky-400/25 hover:bg-sky-300 transition active:scale-95"
          >
            <span>📍</span>
            <span>Y ALLER</span>
          </button>
        )}
      </div>
    </div>
  );
}
