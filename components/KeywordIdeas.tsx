"use client";
import { useActionState, useMemo, useState, useTransition } from "react";
import { findKeywordIdeas, moreKeywordIdeas, trackQuery, type IdeasState } from "@/app/(app)/actions";
import { difficultyLabel, nf } from "@/lib/format";
import { nextSort, sortIdeas, type IdeaSort, type IdeaSortKey } from "@/lib/ideas-sort";
import type { KeywordIdea } from "@/lib/dataforseo";

function TrackButton({ keyword }: { keyword: string }) {
  const [pending, start] = useTransition();
  const [added, setAdded] = useState(false);
  if (added) return <span className="text-xs text-ink-3">Tracking</span>;
  return (
    <button
      type="button"
      className="btn-ghost shrink-0 py-1 text-xs"
      disabled={pending}
      onClick={() => start(async () => { await trackQuery(keyword); setAdded(true); })}
    >
      {pending ? "Adding..." : "Track"}
    </button>
  );
}

function SortHeader({ label, sortKey, sort, onSort, className = "" }: { label: string; sortKey: IdeaSortKey; sort: IdeaSort; onSort: (k: IdeaSortKey) => void; className?: string }) {
  const active = sort?.key === sortKey;
  return (
    <th className={`py-2 font-medium ${className}`} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => onSort(sortKey)} title={`Sort by ${label.toLowerCase()}`}>
        {label}
        <span className={active ? "text-ink" : "text-ink-3"}>{active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

/** Related keywords that have real search volume. Start from phrases you already track and add the good ones. */
export default function KeywordIdeas() {
  const [state, action, pending] = useActionState<IdeasState, FormData>(findKeywordIdeas, null);

  // "Show more" results are kept here and cleared whenever a new search comes back (runId changes).
  const [more, setMore] = useState<{ runId: number | undefined; ideas: KeywordIdea[]; cost: number; fetched: number; total: number; done: boolean; error: string }>({ runId: undefined, ideas: [], cost: 0, fetched: 0, total: 0, done: false, error: "" });
  const [loadingMore, startMore] = useTransition();
  const [sort, setSort] = useState<IdeaSort>(null);

  const current = more.runId === state?.runId ? more : { runId: state?.runId, ideas: [] as KeywordIdea[], cost: 0, fetched: state?.returned ?? 0, total: state?.total ?? 0, done: false, error: "" };
  const fetched = current.runId === more.runId && more.runId !== undefined ? more.fetched : (state?.returned ?? 0);
  const total = current.runId === more.runId && more.runId !== undefined ? more.total || (state?.total ?? 0) : (state?.total ?? 0);

  const seen = new Set<string>();
  const all: KeywordIdea[] = [];
  for (const i of [...(state?.ideas ?? []), ...current.ideas]) {
    if (seen.has(i.keyword)) continue;
    seen.add(i.keyword);
    all.push(i);
  }
  const rows = useMemo(() => sortIdeas(all, sort), [all, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalCost = (state?.cost ?? 0) + current.cost;
  // There is more when the last batch was full and DataForSEO says more exist than we have fetched.
  const hasMore = !!state?.ideas && !current.done && fetched >= 40 && (total === 0 || fetched < total);

  const showMore = () => {
    if (!state?.input) return;
    startMore(async () => {
      const r = await moreKeywordIdeas(state.input!, fetched);
      setMore({
        runId: state.runId,
        ideas: [...(current.runId === more.runId ? more.ideas : []), ...(r.ideas ?? [])],
        cost: (current.runId === more.runId ? more.cost : 0) + (r.cost ?? 0),
        fetched: fetched + (r.returned ?? 0),
        total: r.total || total,
        done: !r.error && (r.returned ?? 0) < 40,
        error: r.error ?? "",
      });
    });
  };

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Find keywords with search volume</h2>
      <p className="mb-3 text-xs text-ink-3">
        Type up to 10 topic phrases, one per line, like what a customer would search for. Use topics, not your brand name. DataForSEO suggests related phrases people actually search for. One lookup costs a few cents.
      </p>
      <form action={action} className="space-y-3">
        {/* The page resets forms after a search; the values come back in the result so what you typed stays put. */}
        <div key={state?.runId ?? 0} className="space-y-3">
          <textarea name="seeds" rows={4} className="input" defaultValue={state?.input?.seeds ?? ""} placeholder={"lead follow up\nsales process for contractors\nhome service business coaching"} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="include">Must include one of these words (optional)</label>
              <input id="include" name="include" className="input" defaultValue={state?.input?.include ?? ""} placeholder="contractor, hvac, roofing, plumbing" />
            </div>
            <div>
              <label className="label" htmlFor="also">...and also one of these (optional)</label>
              <input id="also" name="also" className="input" defaultValue={state?.input?.also ?? ""} placeholder="coaching, consulting, marketing, leads, crm" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="phrase" defaultChecked={state?.input ? state.input.phrase : true} /> Only phrases that contain my words (turn off for wider, looser ideas)
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" disabled={pending}>{pending ? "Looking..." : "Find ideas"}</button>
          {state?.error && <span className="text-sm text-bad">{state.error}</span>}
          {state?.ideas && (
            <span className="text-xs text-ink-3">
              {all.length} new idea{all.length === 1 ? "" : "s"}{totalCost ? ` · cost $${totalCost.toFixed(4)}` : ""}
            </span>
          )}
        </div>
      </form>
      {state?.ideas && (
        <p className="mt-2 text-xs text-ink-3">
          {state.usedBroad && "No phrases matched exactly, so these are broader ideas. "}
          DataForSEO returned {fetched} idea{fetched === 1 ? "" : "s"} with search volume{total > fetched ? ` (${total.toLocaleString()} exist)` : ""}
          {state.mustInclude && state.mustInclude.length > 0 ? `, filtered to those containing ${state.mustInclude.join(" or ")}` : ""}
          {state.alsoInclude && state.alsoInclude.length > 0 ? `${state.mustInclude && state.mustInclude.length > 0 ? " and also" : ", filtered to those containing"} ${state.alsoInclude.join(" or ")}` : ""}
          {state.alreadyTracked ? `; ${state.alreadyTracked} already tracked` : ""}.
        </p>
      )}
      {state?.ideas && all.length === 0 && (
        <p className="mt-3 text-sm text-ink-3">
          {(state.returned ?? 0) === 0
            ? "DataForSEO had no related phrases with search volume for those starting phrases. Try a shorter topic, like \"lead follow up\", or a single word."
            : "DataForSEO returned ideas, but none were new after your filters. Loosen the must-include words, or turn off the whole-phrase option."}
        </p>
      )}
      {all.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="tabular w-full min-w-[480px] text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-2">
              <tr>
                <SortHeader label="Idea" sortKey="keyword" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} className="pr-3" />
                <SortHeader label="Searches / mo" sortKey="searchVolume" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} className="px-3 text-right" />
                <SortHeader label="Difficulty" sortKey="difficulty" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} className="px-3" />
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((i) => (
                <tr key={i.keyword}>
                  <td className="py-2 pr-3">{i.keyword}</td>
                  <td className="px-3 py-2 text-right">{i.searchVolume === null ? "-" : nf.format(i.searchVolume)}</td>
                  <td className="px-3 py-2 text-ink-2">{i.difficulty === null ? "-" : `${i.difficulty} · ${difficultyLabel(i.difficulty)}`}</td>
                  <td className="px-3 py-2 text-right"><TrackButton keyword={i.keyword} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-center gap-3">
            {hasMore && (
              <button type="button" className="btn-ghost" disabled={loadingMore} onClick={showMore}>
                {loadingMore ? "Loading..." : "Show more"}
              </button>
            )}
            {current.done && <span className="text-xs text-ink-3">That's all DataForSEO returned for this search.</span>}
            {current.error && <span className="text-sm text-bad">{current.error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
