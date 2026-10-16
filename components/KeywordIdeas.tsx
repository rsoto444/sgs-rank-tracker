"use client";
import { useActionState, useState, useTransition } from "react";
import { findKeywordIdeas, trackQuery, type IdeasState } from "@/app/(app)/actions";
import { difficultyLabel, nf } from "@/lib/format";

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

/** Related keywords that have real search volume. Start from phrases you already track and add the good ones. */
export default function KeywordIdeas({ defaultSeeds }: { defaultSeeds: string[] }) {
  const [state, action, pending] = useActionState<IdeasState, FormData>(findKeywordIdeas, null);
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Find keywords with search volume</h2>
      <p className="mb-3 text-xs text-ink-3">
        Type up to 10 starting phrases, one per line. DataForSEO suggests related phrases people actually search for. One lookup costs a few cents.
      </p>
      <form action={action} className="space-y-3">
        <textarea name="seeds" rows={4} className="input" defaultValue={defaultSeeds.join("\n")} placeholder={"lead follow up\nsales process"} />
        <div className="flex items-center gap-3">
          <button className="btn" disabled={pending}>{pending ? "Looking..." : "Find ideas"}</button>
          {state?.error && <span className="text-sm text-bad">{state.error}</span>}
          {state?.ideas && (
            <span className="text-xs text-ink-3">
              {state.ideas.length} new idea{state.ideas.length === 1 ? "" : "s"}{state.cost ? ` · cost $${state.cost.toFixed(4)}` : ""}
            </span>
          )}
        </div>
      </form>
      {state?.ideas && state.ideas.length === 0 && (
        <p className="mt-3 text-sm text-ink-3">Nothing new with search volume for those starting phrases. Try broader ones, like a single topic word.</p>
      )}
      {state?.ideas && state.ideas.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="tabular w-full min-w-[480px] text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-2">
              <tr>
                <th className="py-2 pr-3 font-medium">Idea</th>
                <th className="px-3 py-2 text-right font-medium">Searches / mo</th>
                <th className="px-3 py-2 font-medium">Difficulty</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {state.ideas.map((i) => (
                <tr key={i.keyword}>
                  <td className="py-2 pr-3">{i.keyword}</td>
                  <td className="px-3 py-2 text-right">{i.searchVolume === null ? "-" : nf.format(i.searchVolume)}</td>
                  <td className="px-3 py-2 text-ink-2">{i.difficulty === null ? "-" : `${i.difficulty} · ${difficultyLabel(i.difficulty)}`}</td>
                  <td className="px-3 py-2 text-right"><TrackButton keyword={i.keyword} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
