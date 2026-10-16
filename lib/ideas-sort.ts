// Sorting for the keyword-ideas table. Pure, so it can be tested without a browser.
export type IdeaSortKey = "keyword" | "searchVolume" | "difficulty";
export type IdeaSort = { key: IdeaSortKey; dir: "asc" | "desc" } | null;

type Sortable = { keyword: string; searchVolume: number | null; difficulty: number | null };

/**
 * No sort = the order DataForSEO returned (most relevant first). With a sort, rows with no number for that
 * column always go last, whichever direction, so "no data" never crowds out real values.
 */
export function sortIdeas<T extends Sortable>(ideas: T[], sort: IdeaSort): T[] {
  if (!sort) return ideas;
  const sign = sort.dir === "asc" ? 1 : -1;
  return ideas
    .map((idea, i) => ({ idea, i }))
    .sort((a, b) => {
      if (sort.key === "keyword") return sign * a.idea.keyword.localeCompare(b.idea.keyword) || a.i - b.i;
      const x = a.idea[sort.key];
      const y = b.idea[sort.key];
      if (x === null && y === null) return a.i - b.i;
      if (x === null) return 1;
      if (y === null) return -1;
      return sign * (x - y) || a.i - b.i;
    })
    .map((r) => r.idea);
}

/** What a header click does: first click sorts (volume starts high to low, the others low to high), then it flips. */
export function nextSort(current: IdeaSort, key: IdeaSortKey): IdeaSort {
  if (current?.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "searchVolume" ? "desc" : "asc" };
}
