import Link from "next/link";
import { getContext } from "@/lib/sites";
import { change, keywordRows, untrackedQueries } from "@/lib/queries";
import { fmtDate, nf } from "@/lib/format";
import { dataForSeoConnected } from "@/lib/dataforseo";
import NoSite from "@/components/NoSite";
import PageTitle from "@/components/PageTitle";
import AddKeywordsForm from "@/components/AddKeywordsForm";
import KeywordIdeas from "@/components/KeywordIdeas";
import ActionButton from "@/components/ActionButton";
import KeywordsTable from "@/components/KeywordsTable";
import { checkRanksNow, refreshGoogleNow, refreshMetricsNow, trackQuery } from "../actions";

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
        {isAdmin && connected && (
          <ActionButton action={refreshMetricsNow} pendingText="Looking up...">Refresh volume and difficulty</ActionButton>
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

      <KeywordsTable rows={rows.map((k) => ({ ...k, change: change(k) }))} isAdmin={isAdmin} />

      {isAdmin && connected && (
        <div className="mt-5">
          <KeywordIdeas />
        </div>
      )}

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
