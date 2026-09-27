import Link from "next/link";
import { getContext } from "@/lib/sites";
import { change, keywordRows, untrackedQueries } from "@/lib/queries";
import { fmtDate, nf } from "@/lib/format";
import { dataForSeoConnected } from "@/lib/dataforseo";
import NoSite from "@/components/NoSite";
import PageTitle from "@/components/PageTitle";
import AddKeywordsForm from "@/components/AddKeywordsForm";
import ActionButton from "@/components/ActionButton";
import { Change, PositionBadge } from "@/components/Position";
import { checkRanksNow, refreshGoogleNow, trackQuery } from "../actions";

export default async function KeywordsPage() {
  const { user, site } = await getContext();
  if (!site) return <NoSite isAdmin={user.role === "admin"} />;
  const isAdmin = user.role === "admin";
  const [rows, suggestions] = await Promise.all([keywordRows(site.id), untrackedQueries(site.id)]);
  const lastCheck = rows.map((r) => r.checked_on).filter(Boolean).sort().at(-1);
  const connected = dataForSeoConnected();

  return (
    <>
      <PageTitle
        title="Keywords"
        sub={`${rows.length} tracked on ${site.domain}${lastCheck ? ` · last checked ${fmtDate(lastCheck)}` : ""}`}
      >
        {isAdmin && connected && (
          <ActionButton action={checkRanksNow} pendingText="Checking Google...">Check positions now</ActionButton>
        )}
        {isAdmin && (site.gsc_property || site.ga4_property_id) && (
          <ActionButton action={refreshGoogleNow} pendingText="Refreshing...">Refresh Google data</ActionButton>
        )}
      </PageTitle>

      {isAdmin && !connected && (
        <p className="card mb-4 p-3 text-sm text-ink-2">
          Daily position checks are off until DataForSEO is connected.{" "}
          <Link className="text-accent underline" href="/settings/connections">Connect it</Link>
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="tabular w-full min-w-[720px] text-sm">
          <thead className="border-b border-line text-left text-xs text-ink-2">
            <tr>
              <th className="px-4 py-2.5 font-medium">Keyword</th>
              <th className="px-3 py-2.5 font-medium">Position</th>
              <th className="px-3 py-2.5 font-medium" title="Change over the last 7 days">7-day change</th>
              <th className="px-3 py-2.5 font-medium">Best</th>
              <th className="px-3 py-2.5 text-right font-medium" title="Search Console, last 28 days">Clicks</th>
              <th className="px-3 py-2.5 text-right font-medium" title="Search Console, last 28 days">Impressions</th>
              <th className="px-3 py-2.5 text-right font-medium" title="Search Console average position, last 28 days">Search Console avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-3">No keywords tracked yet.</td></tr>
            )}
            {rows.map((k) => (
              <tr key={k.id} className="hover:bg-bg">
                <td className="max-w-[18rem] px-4 py-2.5">
                  <Link href={`/keywords/${k.id}`} className="font-medium hover:underline">{k.keyword}</Link>
                  {k.url && <div className="truncate text-xs text-ink-3">{k.url.replace(/^https?:\/\/(www\.)?/, "")}</div>}
                </td>
                <td className="px-3 py-2.5">
                  {k.checked_on ? <PositionBadge position={k.position} /> : <span className="text-ink-3">Not checked yet</span>}
                </td>
                <td className="px-3 py-2.5"><Change value={change(k)} /></td>
                <td className="px-3 py-2.5 text-ink-2">{k.best ? `#${k.best}` : "-"}</td>
                <td className="px-3 py-2.5 text-right">{k.clicks === null ? "-" : nf.format(k.clicks)}</td>
                <td className="px-3 py-2.5 text-right">{k.impressions === null ? "-" : nf.format(k.impressions)}</td>
                <td className="px-3 py-2.5 text-right">{k.gsc_position === null ? "-" : k.gsc_position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {isAdmin && <AddKeywordsForm canCheck={connected} />}
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Searches you already show up for</h2>
          <p className="mb-3 text-xs text-ink-3">From Search Console, last 28 days, not tracked yet</p>
          {suggestions.length === 0 ? (
            <p className="text-sm text-ink-3">
              {site.gsc_property ? "Nothing new yet." : "Add a Search Console property to this site to see these."}
            </p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {suggestions.map((q) => (
                <li key={q.query} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{q.query}</span>
                    <span className="tabular text-xs text-ink-3">
                      {nf.format(q.impressions)} impressions · {nf.format(q.clicks)} clicks · avg {q.position.toFixed(1)}
                    </span>
                  </span>
                  {isAdmin && (
                    <ActionButton action={trackQuery.bind(null, q.query)} pendingText="Adding..." className="btn-ghost shrink-0 py-1 text-xs">
                      Track
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
