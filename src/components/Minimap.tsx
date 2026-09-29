import { useState, useEffect, useRef } from "react";
import type { HudState } from "../game/types";
import { GRID_LINES, CELL, HALF, WORLD } from "../game/constants";
import { POIS, landmarkWorld } from "../game/districts";
import { calculateRoadRoute, formatDistance } from "../game/navigation";

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
  onOpenMap?: () => void;
}

export default function Minimap({ hud, getLivePlayerState, onOpenMap }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [orientHeading, setOrientHeading] = useState<boolean>(true); // Mode suivi rotation véhicule

  const size = expanded ? 180 : 120;

  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const live = getLivePlayerState?.();
      const px = live?.playerX ?? hud.playerX;
      const pz = live?.playerZ ?? hud.playerZ;
      const heading = live?.playerHeading ?? hud.playerHeading;
      const targetX = live?.targetX ?? hud.targetX;
      const targetZ = live?.targetZ ?? hud.targetZ;
      const hasDest = live?.hasActiveDestination ?? hud.navActive;
      const mode = live?.playerMode ?? hud.playerMode;
      const vehicleType = live?.vehicleType ?? "moto";

      ctx.clearRect(0, 0, size, size);

      // Fond circulaire ou carré arrondi
      ctx.save();
      ctx.fillStyle = "#1e1b15";
      ctx.fillRect(0, 0, size, size);

      // Si mode orienté véhicule (Heading-up) :
      // On centre sur le joueur et on tourne la carte pour que l'avant du véhicule soit toujours vers le HAUT
      ctx.translate(size / 2, size / 2);
      if (orientHeading) {
        // En 3D, heading = PI -> Nord (haut). Pour orienter l'avant vers le haut :
        ctx.rotate(heading - Math.PI);
      }

      // Échelle locale de la minimap (affiche environ 240m autour du joueur en mode normal)
      const viewRange = expanded ? 320 : 210;
      const scale = size / viewRange;

      // Fonction conversion coordonnées monde 3D -> canvas relatif au joueur
      const toRelX = (wx: number) => (wx - px) * scale;
      const toRelZ = (wz: number) => (wz - pz) * scale;

      // ── ÎLOTS URBAINS ──
      ctx.fillStyle = "rgba(70, 60, 45, 0.4)";
      for (let gx = 0; gx < GRID_LINES - 1; gx++) {
        for (let gz = 0; gz < GRID_LINES - 1; gz++) {
          const bx = gx * CELL - HALF + CELL / 2;
          const bz = gz * CELL - HALF + CELL / 2;
          const rx = toRelX(bx);
          const rz = toRelZ(bz);
          const bw = (CELL - 16) * scale;
          if (Math.abs(rx) < size && Math.abs(rz) < size) {
            ctx.fillRect(rx - bw / 2, rz - bw / 2, bw, bw);
          }
        }
      }

      // ── RÉSEAU ROUTIER (Avenues de Beni) ──
      ctx.strokeStyle = "#4b5563";
      ctx.lineWidth = 14 * scale;
      ctx.lineCap = "square";
      for (let i = 0; i < GRID_LINES; i++) {
        const rc = i * CELL - HALF;
        // Routes verticales (axe Z)
        const rx = toRelX(rc);
        if (Math.abs(rx) < size) {
          ctx.beginPath();
          ctx.moveTo(rx, toRelZ(-HALF));
          ctx.lineTo(rx, toRelZ(HALF));
          ctx.stroke();
        }
        // Routes horizontales (axe X)
        const rz = toRelZ(rc);
        if (Math.abs(rz) < size) {
          ctx.beginPath();
          ctx.moveTo(toRelX(-HALF), rz);
          ctx.lineTo(toRelX(HALF), rz);
          ctx.stroke();
        }
      }

      // Lignes de séparation de voies
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 1.2 * scale;
      ctx.setLineDash([4 * scale, 4 * scale]);
      for (let i = 0; i < GRID_LINES; i++) {
        const rc = i * CELL - HALF;
        const rx = toRelX(rc);
        if (Math.abs(rx) < size) {
          ctx.beginPath();
          ctx.moveTo(rx, toRelZ(-HALF));
          ctx.lineTo(rx, toRelZ(HALF));
          ctx.stroke();
        }
        const rz = toRelZ(rc);
        if (Math.abs(rz) < size) {
          ctx.beginPath();
          ctx.moveTo(toRelX(-HALF), rz);
          ctx.lineTo(toRelX(HALF), rz);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // ── ITINÉRAIRE ROUTIER EN TEMPS RÉEL (Suit les rues et carrefours) ──
      if (hasDest) {
        const route = calculateRoadRoute(px, pz, targetX, targetZ);
        if (route.points.length >= 2) {
          // Halo de route
          ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
          ctx.lineWidth = 8 * scale;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(toRelX(route.points[0].x), toRelZ(route.points[0].z));
          for (let i = 1; i < route.points.length; i++) {
            ctx.lineTo(toRelX(route.points[i].x), toRelZ(route.points[i].z));
          }
          ctx.stroke();

          // Ligne GPS guidage
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 3.5 * scale;
          ctx.stroke();
        }
      }

      // ── POINTS D'INTÉRÊT PROCHES ──
      for (const p of POIS) {
        const [wx, wz] = landmarkWorld(p);
        const rx = toRelX(wx);
        const rz = toRelZ(wz);
        if (Math.abs(rx) < size && Math.abs(rz) < size) {
          ctx.fillStyle =
            p.type === "restaurant"
              ? "#22c55e"
              : p.type === "home"
                ? "#ec4899"
                : p.type === "fuel"
                  ? "#ef4444"
                  : "#f59e0b";
          ctx.beginPath();
          ctx.arc(rx, rz, 4 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── BALISE DESTINATION AVEC PULSE ──
      if (hasDest) {
        const dx = toRelX(targetX);
        const dz = toRelZ(targetZ);
        const pulse = 6 + (Math.sin(Date.now() * 0.007) + 1) * 3;
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dx, dz, pulse * scale, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#0284c7";
        ctx.beginPath();
        ctx.arc(dx, dz, 5 * scale, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── MARQUEUR JOUEUR AU CENTRE DE LA MINIMAP ──
      ctx.restore(); // retour au repère écran (0..size)

      ctx.save();
      ctx.translate(size / 2, size / 2);
      // Si mode fixe Nord : la flèche tourne selon le heading.
      // Si mode orienté véhicule : la flèche pointe TOUJOURS vers le haut (0, -1).
      if (!orientHeading) {
        const angle = Math.PI - heading;
        ctx.rotate(angle);
      }

      // Halo radar
      ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();

      // Flèche de direction
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(6, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // Boussole "N" en haut à gauche
      ctx.save();
      const compAngle = orientHeading ? heading - Math.PI : 0;
      ctx.translate(16, 16);
      ctx.rotate(compAngle);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(3, 4);
      ctx.lineTo(-3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("N", 0, -10);
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [hud, getLivePlayerState, expanded, orientHeading, size]);

  // Distance restante calculée en direct
  const live = getLivePlayerState?.();
  const px = live?.playerX ?? hud.playerX;
  const pz = live?.playerZ ?? hud.playerZ;
  const targetX = live?.targetX ?? hud.targetX;
  const targetZ = live?.targetZ ?? hud.targetZ;
  const hasDest = live?.hasActiveDestination ?? hud.navActive;
  const targetLabel = live?.targetLabel ?? hud.targetLabel;
  const distance = hasDest ? Math.round(Math.hypot(targetX - px, targetZ - pz)) : 0;

  return (
    <div className="relative rounded-2xl bg-slate-900/90 p-1 backdrop-blur-md ring-1 ring-white/20 shadow-2xl select-none">
      {/* En-tête minimap avec raccourcis */}
      <div className="flex items-center justify-between px-1.5 pb-1 text-[9px] font-black uppercase tracking-wider text-white/70">
        <button
          onClick={onOpenMap}
          className="flex items-center gap-1 text-sky-400 hover:text-sky-300 transition"
          title="Ouvrir la grande carte interactive"
        >
          <span>🗺️</span>
          <span>Map</span>
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOrientHeading(!orientHeading)}
            className={`rounded px-1 text-[8px] font-bold transition ${
              orientHeading ? "bg-sky-400 text-slate-950" : "bg-white/10 text-white/60"
            }`}
            title={orientHeading ? "Mode conduite : suit le cap du véhicule" : "Mode fixe : Nord en haut"}
          >
            {orientHeading ? "Cap" : "Nord"}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-white/50 hover:text-white"
            title="Agrandir / Réduire la minimap"
          >
            {expanded ? "↙" : "↗"}
          </button>
        </div>
      </div>

      {/* Canvas haute performance */}
      <div
        onClick={onOpenMap}
        className="cursor-pointer overflow-hidden rounded-xl ring-1 ring-black/40"
        title="Cliquer pour ouvrir la grande carte"
      >
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="block"
          style={{ width: size, height: size }}
        />
      </div>

      {/* Bandeau destination & distance en direct */}
      {hasDest && (
        <div className="mt-1 flex items-center justify-between rounded-lg bg-sky-950/80 px-2 py-0.5 text-[9px] font-extrabold text-sky-300 ring-1 ring-sky-400/30">
          <span className="truncate max-w-[85px]">{targetLabel}</span>
          <span className="text-amber-300">{formatDistance(distance)}</span>
        </div>
      )}
    </div>
  );
}
