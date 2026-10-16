"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { removeKeyword } from "@/app/(app)/actions";
import { difficultyLabel, nf } from "@/lib/format";
import { nextKeywordSort, sortKeywordRows, type KeywordSort, type KeywordSortKey, type SortableKeywordRow } from "@/lib/keyword-sort";
import { Change, PositionBadge } from "./Position";

export type KeywordTableRow = SortableKeywordRow & {
  id: number;
  url: string | null;
  metrics_at: string | null;
};

function Header({ label, sortKey, sort, onSort, title, className = "" }: { label: string; sortKey: KeywordSortKey; sort: KeywordSort; onSort: (k: KeywordSortKey) => void; title?: string; className?: string }) {
  const active = sort?.key === sortKey;
  return (
    <th className={`py-2.5 font-medium ${className}`} title={title} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => onSort(sortKey)}>
        {label}
        <span className={active ? "text-ink" : "text-ink-3"}>{active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function DeleteButton({ row, onGone, onBack }: { row: KeywordTableRow; onGone: () => void; onBack: () => void }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1 text-xs text-bad"
      disabled={pending}
      title={`Stop tracking "${row.keyword}"`}
      aria-label={`Stop tracking ${row.keyword}`}
      onClick={() => {
        if (!window.confirm(`Stop tracking "${row.keyword}"? Its ranking history will be removed too.`)) return;
        onGone(); // the row disappears right away; it comes back if the delete fails
        start(async () => {
          try { await removeKeyword(row.id); } catch { onBack(); }
        });
      }}
    >
      <Trash2 size={14} />
    </button>
  );
}

/** The main Keywords table: click a column to sort, and admins can stop tracking a keyword from its row. */
export default function KeywordsTable({ rows, isAdmin }: { rows: KeywordTableRow[]; isAdmin: boolean }) {
  const [sort, setSort] = useState<KeywordSort>(null);
  const [gone, setGone] = useState<Set<number>>(new Set());
  const onSort = (k: KeywordSortKey) => setSort((s) => nextKeywordSort(s, k));
  const visible = sortKeywordRows(rows.filter((r) => !gone.has(r.id)), sort);
  const cols = isAdmin ? 10 : 9;
  const mark = (id: number, on: boolean) => setGone((g) => { const n = new Set(g); on ? n.add(id) : n.delete(id); return n; });

  return (
    <div className="card overflow-x-auto">
      <table className="tabular w-full min-w-[860px] text-sm">
        <thead className="border-b border-line text-left text-xs text-ink-2">
          <tr>
            <Header label="Keyword" sortKey="keyword" sort={sort} onSort={onSort} className="px-4" />
            <Header label="Position" sortKey="position" sort={sort} onSort={onSort} className="px-3" title="Where you rank on Google; best first" />
            <Header label="7-day change" sortKey="change" sort={sort} onSort={onSort} className="px-3" title="Change over the last 7 days; biggest improvement first" />
            <Header label="Best" sortKey="best" sort={sort} onSort={onSort} className="px-3" />
            <Header label="Searches / mo" sortKey="searchVolume" sort={sort} onSort={onSort} className="px-3 text-right" title="Average Google searches per month (DataForSEO, US)" />
            <Header label="Difficulty" sortKey="difficulty" sort={sort} onSort={onSort} className="px-3" title="How hard it is to rank for, 0 (easy) to 100 (hard)" />
            <Header label="Clicks" sortKey="clicks" sort={sort} onSort={onSort} className="px-3 text-right" title="Search Console, last 28 days" />
            <Header label="Impressions" sortKey="impressions" sort={sort} onSort={onSort} className="px-3 text-right" title="Search Console, last 28 days" />
            <Header label="Search Console avg" sortKey="gscPosition" sort={sort} onSort={onSort} className="px-3 text-right" title="Search Console average position, last 28 days" />
            {isAdmin && <th className="px-3 py-2.5" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {visible.length === 0 && (
            <tr><td colSpan={cols} className="px-4 py-6 text-center text-ink-3">No keywords tracked yet.</td></tr>
          )}
          {visible.map((k) => (
            <tr key={k.id} className="hover:bg-bg">
              <td className="max-w-[18rem] px-4 py-2.5">
                <Link href={`/keywords/${k.id}`} className="font-medium hover:underline">{k.keyword}</Link>
                {k.url && <div className="truncate text-xs text-ink-3">{k.url.replace(/^https?:\/\/(www\.)?/, "")}</div>}
              </td>
              <td className="px-3 py-2.5">
                {k.checked_on ? <PositionBadge position={k.position} /> : <span className="text-ink-3">Not checked yet</span>}
              </td>
              <td className="px-3 py-2.5"><Change value={k.change} /></td>
              <td className="px-3 py-2.5 text-ink-2">{k.best ? `#${k.best}` : "-"}</td>
              <td className="px-3 py-2.5 text-right">
                {k.search_volume === null
                  ? <span className="text-ink-3" title={k.metrics_at ? "Looked up: Google reports no search volume for this phrase" : "Not looked up yet"}>{k.metrics_at ? "no data" : "-"}</span>
                  : nf.format(k.search_volume)}
              </td>
              <td className="px-3 py-2.5 text-ink-2">
                {k.difficulty === null
                  ? <span className="text-ink-3" title={k.metrics_at ? "Looked up: DataForSEO has no difficulty for this phrase" : "Not looked up yet"}>{k.metrics_at ? "no data" : "-"}</span>
                  : `${k.difficulty} · ${difficultyLabel(k.difficulty)}`}
              </td>
              <td className="px-3 py-2.5 text-right">{k.clicks === null ? "-" : nf.format(k.clicks)}</td>
              <td className="px-3 py-2.5 text-right">{k.impressions === null ? "-" : nf.format(k.impressions)}</td>
              <td className="px-3 py-2.5 text-right">{k.gsc_position === null ? "-" : k.gsc_position.toFixed(1)}</td>
              {isAdmin && (
                <td className="px-3 py-2.5 text-right">
                  <DeleteButton row={k} onGone={() => mark(k.id, true)} onBack={() => mark(k.id, false)} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
