"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type Series = { name: string; color: string; points: (number | null)[] };

type Props = {
  days: string[];
  series: Series[];
  /** Rankings: position 1 sits at the top. */
  invert?: boolean;
  height?: number;
  /** "position" shows #4, "count" shows 1,234. */
  unit?: "position" | "count";
};

const PAD = { top: 12, right: 12, bottom: 24, left: 40 };

function niceMax(v: number) {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const shortDate = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function LineChart({ days, series, invert = false, height = 220, unit = "count" }: Props) {
  const format = (v: number) =>
    unit === "position" ? `#${Number.isInteger(v) ? v : v.toFixed(1)}` : v.toLocaleString("en-US");
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real on-screen width so text stays the same size on every screen.
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const values = series.flatMap((s) => s.points.filter((p): p is number => p !== null));
  const hasData = values.length > 0;

  const { yMin, yMax } = useMemo(() => {
    if (invert) return { yMin: 1, yMax: Math.max(10, niceMax(Math.max(...values, 1))) };
    return { yMin: 0, yMax: niceMax(Math.max(...values, 1)) };
  }, [invert, values]);

  const x = (i: number) => PAD.left + (days.length <= 1 ? 0 : (i / (days.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => {
    const t = (v - yMin) / (yMax - yMin);
    return invert ? PAD.top + t * (H - PAD.top - PAD.bottom) : H - PAD.bottom - t * (H - PAD.top - PAD.bottom);
  };
  const ticks = invert ? [1, Math.round(yMax / 2), yMax] : [0, yMax / 2, yMax];

  function path(points: (number | null)[]) {
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      if (p === null) return void (pen = false);
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  function onMove(e: React.PointerEvent) {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  }

  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(W / 110))));

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-2">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          className="block touch-none select-none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={series.map((s) => s.name).join(" and ") + " by day"}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--ink-3)" className="tabular">
                {format(t)}
              </text>
            </g>
          ))}
          {days.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--ink-3)">
                {shortDate(d)}
              </text>
            ) : null,
          )}
          {hasData &&
            series.map((s) => (
              <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
          {hasData &&
            series.map((s) =>
              s.points.map((p, i) =>
                p !== null && (s.points[i - 1] ?? null) === null && (s.points[i + 1] ?? null) === null ? (
                  <circle key={s.name + i} cx={x(i)} cy={y(p)} r={3} fill={s.color} />
                ) : null,
              ),
            )}
          {hover !== null && hasData && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ink-3)" strokeWidth={1} />
              {series.map((s) =>
                s.points[hover] !== null ? (
                  <circle key={s.name} cx={x(hover)} cy={y(s.points[hover]!)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                ) : null,
              )}
            </g>
          )}
        </svg>
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">No data for this period yet.</div>
        )}
        {hover !== null && hasData && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: x(hover) > W * 0.6 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <div className="mb-1 text-ink-3">{shortDate(days[hover])}</div>
            {series.map((s) => (
              <div key={s.name} className="flex items-center gap-2 whitespace-nowrap">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                <span className="tabular font-semibold">{s.points[hover] === null ? "-" : format(s.points[hover]!)}</span>
                <span className="text-ink-2">{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <details className="mt-2 text-xs text-ink-2">
        <summary className="cursor-pointer">Show as table</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="tabular w-full">
            <thead>
              <tr className="text-left text-ink-3">
                <th className="py-1 font-medium">Day</th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 text-right font-medium">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d} className="border-t border-line">
                  <td className="py-1">{shortDate(d)}</td>
                  {series.map((s) => (
                    <td key={s.name} className="py-1 text-right">{s.points[i] === null ? "-" : format(s.points[i]!)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
