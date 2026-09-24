export default function Speedometer({ speed, max }: { speed: number; max: number }) {
  const pct = Math.max(0, Math.min(1, speed / max));
  const startAngle = 135;
  const sweep = 270;
  const angle = startAngle + pct * sweep;
  const r = 46;
  const cx = 55;
  const cy = 55;
  // arc path helper
  const arc = (frac: number) => {
    const a0 = (startAngle * Math.PI) / 180;
    const a1 = ((startAngle + frac * sweep) * Math.PI) / 180;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = frac * sweep > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  const needleX = cx + (r - 8) * Math.cos((angle * Math.PI) / 180);
  const needleY = cy + (r - 8) * Math.sin((angle * Math.PI) / 180);

  return (
    <div className="relative">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <path d={arc(1)} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" strokeLinecap="round" />
        <path
          d={arc(pct || 0.001)}
          fill="none"
          stroke={pct > 0.8 ? "#ef4444" : pct > 0.5 ? "#f59e0b" : "#22d3ee"}
          strokeWidth="8"
          strokeLinecap="round"
        />
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill="#fff" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
        <span className="text-2xl font-black leading-none">{speed}</span>
        <span className="text-[9px] font-bold opacity-60">km/h</span>
      </div>
    </div>
  );
}
