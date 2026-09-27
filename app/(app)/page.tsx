import Link from "next/link";
import { getContext } from "@/lib/sites";
import { change, gscTotals, keywordRows, visitorReport, visitorSources } from "@/lib/queries";
import { daysAgo, nf } from "@/lib/format";
import { dataForSeoConnected } from "@/lib/dataforseo";
import { googleConnected } from "@/lib/google";
import { Stat, pctDelta } from "@/components/Stat";
import LineChart from "@/components/LineChart";
import NoSite from "@/components/NoSite";
import PageTitle from "@/components/PageTitle";
import { Change, PositionBadge } from "@/components/Position";

export default async function Overview() {
  const { user, site } = await getContext();
  if (!site) return <NoSite isAdmin={user.role === "admin"} />;

  const { preferred } = await visitorSources(site);
  const [keywords, visitors, gscNow, gscBefore] = await Promise.all([
    keywordRows(site.id),
    visitorReport(site.id, preferred, 28),
    gscTotals(site.id, daysAgo(28), daysAgo(0)),
    gscTotals(site.id, daysAgo(56), daysAgo(28)),
  ]);

  const ranked = keywords.filter((k) => k.position !== null);
  const avg = ranked.length ? ranked.reduce((a, k) => a + k.position!, 0) / ranked.length : null;
  const top3 = ranked.filter((k) => k.position! <= 3).length;
  const top10 = ranked.filter((k) => k.position! <= 10).length;
  const movers = keywords
    .map((k) => ({ ...k, delta: change(k) }))
    .filter((k) => k.delta)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 6);

  const todo = [
    !dataForSeoConnected() && { text: "Connect DataForSEO so keyword positions get checked every day", href: "/settings/connections" },
    keywords.length === 0 && { text: "Add the keywords you want to track for this site", href: "/keywords" },
    !googleConnected() && { text: "Connect Google for Search Console and GA4 data", href: "/settings/connections" },
    visitors.total.pageviews === 0 && { text: "Add the tracking snippet to this site to count visitors", href: `/settings/sites/${site.id}` },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <>
      <PageTitle title={site.name} sub={`${site.domain} · last 28 days`} />

      {user.role === "admin" && todo.length > 0 && (
        <div className="card mb-5 p-4">
          <h2 className="mb-2 text-sm font-semibold">Finish setting up this site</h2>
          <ul className="space-y-1 text-sm">
            {todo.map((t) => (
              <li key={t.text}>
                <Link className="text-accent underline" href={t.href}>{t.text}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Keywords in top 10" value={`${top10} of ${keywords.length}`} note={`${top3} in the top 3`} />
        <Stat label="Average position" value={avg === null ? "-" : avg.toFixed(1)} note="Tracked keywords that rank" />
        <Stat
          label={preferred === "ga4" ? "Visitors (GA4)" : "Visitors"}
          value={nf.format(visitors.total.visitors)}
          delta={pctDelta(visitors.total.visitors, visitors.previous.visitors)}
        />
        <Stat label="Google clicks" value={nf.format(gscNow.clicks)} delta={pctDelta(gscNow.clicks, gscBefore.clicks)} note="From Search Console" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Visitors per day</h2>
          <LineChart days={visitors.days} series={[{ name: "Visitors", color: "var(--series-1)", points: visitors.visitors }]} />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Biggest moves this week</h2>
          {movers.length === 0 ? (
            <p className="text-sm text-ink-3">Moves show up after a week of daily checks.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {movers.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/keywords/${k.id}`} className="truncate hover:underline">{k.keyword}</Link>
                  <span className="flex shrink-0 gap-3">
                    <PositionBadge position={k.position} />
                    <Change value={k.delta} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
