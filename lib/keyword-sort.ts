// Sorting for the main Keywords table. Pure, so it can be tested without a browser.
export type KeywordSortKey =
  | "keyword" | "position" | "change" | "best" | "searchVolume" | "difficulty" | "clicks" | "impressions" | "gscPosition";
export type KeywordSort = { key: KeywordSortKey; dir: "asc" | "desc" } | null;

export type SortableKeywordRow = {
  keyword: string;
  position: number | null;
  checked_on: string | null;
  // Positive = moved up the page over the last 7 days.
  change: number | null;
  best: number | null;
  search_volume: number | null;
  difficulty: number | null;
  clicks: number | null;
  impressions: number | null;
  gsc_position: number | null;
};

function value(row: SortableKeywordRow, key: Exclude<KeywordSortKey, "keyword">): number | null {
  switch (key) {
    // Not checked yet and "not in the top 100" both have no position to sort by, so they go last.
    case "position": return row.checked_on ? row.position : null;
    case "change": return row.change;
    case "best": return row.best || null;
    case "searchVolume": return row.search_volume;
    case "difficulty": return row.difficulty;
    case "clicks": return row.clicks;
    case "impressions": return row.impressions;
    case "gscPosition": return row.gsc_position;
  }
}

/**
 * No sort = the order the server gave (best position first). With a sort, rows with no number for that column
 * always go last, whichever direction, so "no data" never crowds out real values. Ties keep their order.
 */
export function sortKeywordRows<T extends SortableKeywordRow>(rows: T[], sort: KeywordSort): T[] {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      if (sort.key === "keyword") return sign * a.row.keyword.localeCompare(b.row.keyword) || a.i - b.i;
      const x = value(a.row, sort.key);
      const y = value(b.row, sort.key);
      if (x === null && y === null) return a.i - b.i;
      if (x === null) return 1;
      if (y === null) return -1;
      return sign * (x - y) || a.i - b.i;
    })
    .map((r) => r.row);
}

// The direction a column starts in: for a position or difficulty, lower is the interesting end; for volume,
// clicks, impressions and improvement, higher is.
const HIGH_FIRST: KeywordSortKey[] = ["change", "searchVolume", "clicks", "impressions"];

export function nextKeywordSort(current: KeywordSort, key: KeywordSortKey): KeywordSort {
  if (current?.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: HIGH_FIRST.includes(key) ? "desc" : "asc" };
}
