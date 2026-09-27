import { nf } from "@/lib/format";

export default function BarList({ title, rows, unit }: { title: string; rows: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-ink-3">{unit}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">No data yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="relative flex items-center justify-between gap-3 rounded px-2 py-1 text-sm" title={`${r.label}: ${nf.format(r.value)} ${unit}`}>
              <span
                className="absolute inset-y-0 left-0 rounded"
                style={{ width: `${(r.value / max) * 100}%`, background: "color-mix(in srgb, var(--series-1) 16%, transparent)" }}
                aria-hidden
              />
              <span className="relative truncate">{r.label}</span>
              <span className="tabular relative text-ink-2">{nf.format(r.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
