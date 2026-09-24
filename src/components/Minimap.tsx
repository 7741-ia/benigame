import { useEffect, useRef } from "react";
import type { HudState } from "../game/types";
import { GRID_LINES, CELL, HALF } from "../game/constants";
import { DISTRICTS, POIS, landmarkWorld } from "../game/districts";

export default function Minimap({ hud }: { hud: HudState }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvas.width;
    const world = hud.worldSize;
    const scale = size / (world + 20);
    const toPx = (w: number) => (w + HALF + 10) * scale;

    ctx.clearRect(0, 0, size, size);
    // bg — map-like earthy tone
    ctx.fillStyle = "#2a2318";
    ctx.fillRect(0, 0, size, size);
    // block fills (city look)
    ctx.fillStyle = "rgba(90,110,80,0.25)";
    for (let gx = 0; gx < GRID_LINES - 1; gx++) {
      for (let gz = 0; gz < GRID_LINES - 1; gz++) {
        const x = toPx(gx * CELL - HALF + CELL / 2);
        const z = toPx(gz * CELL - HALF + CELL / 2);
        const w = (CELL - 16) * scale;
        ctx.fillRect(x - w / 2, z - w / 2, w, w);
      }
    }

    // roads
    ctx.strokeStyle = "rgba(160,170,185,0.7)";
    ctx.lineWidth = 2.5;
    for (let i = 0; i < GRID_LINES; i++) {
      const c = toPx(i * CELL - HALF);
      ctx.beginPath();
      ctx.moveTo(c, 0);
      ctx.lineTo(c, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, c);
      ctx.lineTo(size, c);
      ctx.stroke();
    }

    // landmarks (real Beni districts) as small dots
    ctx.font = "7px sans-serif";
    ctx.textAlign = "center";
    for (const l of DISTRICTS) {
      const [wx, wz] = landmarkWorld(l);
      const lx = toPx(wx);
      const lz = toPx(wz);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.beginPath();
      ctx.arc(lx, lz, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // shops (amber), restaurants (green), kiosks (cyan) — find supplies on the map
    for (const p of POIS) {
      const [wx, wz] = landmarkWorld(p);
      const px = toPx(wx);
      const pz = toPx(wz);
      ctx.fillStyle =
        p.type === "restaurant"
          ? "#80ed99"
          : p.type === "home"
            ? "#f472b6"
            : p.type === "leisure"
              ? "#c084fc"
              : p.type === "kiosk"
                ? "#48cae4"
                : "#ffb703";
      ctx.fillRect(px - 3, pz - 3, 6, 6);
    }

    // target
    const tx = toPx(hud.targetX);
    const tz = toPx(hud.targetZ);
    const routePx = toPx(hud.playerX);
    const routePz = toPx(hud.playerZ);
    if (hud.navActive) {
      ctx.strokeStyle = "rgba(56,189,248,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(routePx, routePz);
      ctx.lineTo(tx, routePz);
      ctx.lineTo(tx, tz);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = hud.hasPackage ? "#34c759" : "#ffd93d";
    ctx.beginPath();
    ctx.arc(tx, tz, 5, 0, Math.PI * 2);
    ctx.fill();
    // pulse ring
    const pulse = 5 + (Math.sin(Date.now() * 0.006) + 1) * 4;
    ctx.strokeStyle = hud.hasPackage ? "rgba(52,199,89,0.6)" : "rgba(255,217,61,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tx, tz, pulse, 0, Math.PI * 2);
    ctx.stroke();

    // player (triangle pointing heading)
    const px = toPx(hud.playerX);
    const pz = toPx(hud.playerZ);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(hud.playerHeading);
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (hud.playerMode === "walk") {
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(toPx(hud.vehicleX) - 3, toPx(hud.vehicleZ) - 3, 6, 6);
    }
  });

  return (
    <div className="rounded-xl bg-black/50 p-1 backdrop-blur-md ring-1 ring-white/20 shadow-lg shadow-black/40">
      <div className="flex items-center justify-between px-1 pb-0.5 text-[8px] font-bold uppercase tracking-wider text-white/60">
        <span>🗺️ Beni</span>
        <span className={hud.hasPackage ? "text-emerald-300" : "text-amber-300"}>
          {hud.hasPackage ? "● Livraison" : "● Colis"}
        </span>
      </div>
      <canvas ref={ref} width={128} height={128} className="rounded-lg" />
      <div className="flex justify-between px-1 pt-0.5 text-[7px] font-bold text-white/55">
        <span className="text-amber-300">■ Boutique</span>
        <span className="text-green-300">■ Resto</span>
        <span className="text-cyan-300">■ Kiosque</span>
      </div>
    </div>
  );
}
