export function Stat({ label, value, delta, note }: { label: string; value: string; delta?: { text: string; good: boolean | null }; note?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold">{value}</div>
      {delta && (
        <div className={`tabular mt-0.5 text-xs ${delta.good === null ? "text-ink-3" : delta.good ? "text-good" : "text-bad"}`}>
          {delta.good === null ? "" : delta.good ? "▲ " : "▼ "}
          {delta.text}
        </div>
      )}
      {note && <div className="mt-0.5 text-xs text-ink-3">{note}</div>}
    </div>
  );
}

export function pctDelta(now: number, before: number, label = "vs previous period") {
  if (!before) return { text: now ? `new ${label}` : `no change ${label}`, good: null };
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${Math.abs(pct)}% ${label}`, good: pct === 0 ? null : pct > 0 };
}
