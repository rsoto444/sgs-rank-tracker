export function PositionBadge({ position }: { position: number | null }) {
  if (position === null) return <span className="text-ink-3">Not in top 100</span>;
  const tone = position <= 3 ? "text-good font-semibold" : position <= 10 ? "font-semibold" : "";
  return <span className={`tabular ${tone}`}>#{position}</span>;
}

export function Change({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="text-ink-3">-</span>;
  return (
    <span className={`tabular ${value > 0 ? "text-good" : "text-bad"}`}>
      {value > 0 ? "▲" : "▼"} {Math.abs(value)}
    </span>
  );
}
