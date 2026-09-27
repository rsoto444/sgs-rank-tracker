import Link from "next/link";
import { getContext } from "@/lib/sites";
import { visitorReport, visitorSources, type VisitorSource } from "@/lib/queries";
import { nf } from "@/lib/format";
import NoSite from "@/components/NoSite";
import PageTitle from "@/components/PageTitle";
import LineChart from "@/components/LineChart";
import BarList from "@/components/BarList";
import { Stat, pctDelta } from "@/components/Stat";

const RANGES = [7, 28, 90];

function Toggle({ items, current }: { items: { href: string; label: string; value: string }[]; current: string }) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5 text-sm">
      {items.map((i) => (
        <Link
          key={i.value}
          href={i.href}
          className={`rounded-md px-3 py-1 ${i.value === current ? "bg-accent font-medium text-surface" : "text-ink-2 hover:text-ink"}`}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export default async function VisitorsPage({ searchParams }: { searchParams: Promise<{ range?: string; source?: string }> }) {
  const { user, site } = await getContext();
  if (!site) return <NoSite isAdmin={user.role === "admin"} />;
  const sp = await searchParams;
  const range = RANGES.includes(Number(sp.range)) ? Number(sp.range) : 28;
  const { available, preferred } = await visitorSources(site);
  const source: VisitorSource = available.includes(sp.source as VisitorSource) ? (sp.source as VisitorSource) : preferred;
  const r = await visitorReport(site.id, source, range);
  const href = (p: { range?: number; source?: string }) => `/visitors?range=${p.range ?? range}&source=${p.source ?? source}`;

  return (
    <>
      <PageTitle title="Visitors" sub={`${site.domain} · last ${range} days`}>
        {available.length > 1 && (
          <Toggle
            current={source}
            items={[
              { value: "snippet", label: "Tracking snippet", href: href({ source: "snippet" }) },
              { value: "ga4", label: "Google Analytics", href: href({ source: "ga4" }) },
            ]}
          />
        )}
        <Toggle current={String(range)} items={RANGES.map((d) => ({ value: String(d), label: `${d} days`, href: href({ range: d }) }))} />
      </PageTitle>

      {source === "snippet" && r.total.pageviews === 0 && r.previous.pageviews === 0 && (
        <p className="card mb-4 p-3 text-sm text-ink-2">
          No visits recorded yet.{" "}
          {user.role === "admin" ? (
            <Link className="text-accent underline" href={`/settings/sites/${site.id}`}>Add the tracking snippet to {site.domain}</Link>
          ) : (
            "Visits will show here once tracking is added to the site."
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Visitors" value={nf.format(r.total.visitors)} delta={pctDelta(r.total.visitors, r.previous.visitors)} note="Counted once per day" />
        <Stat label="Page views" value={nf.format(r.total.pageviews)} delta={pctDelta(r.total.pageviews, r.previous.pageviews)} />
        <Stat label="Pages per visitor" value={r.total.visitors ? (r.total.pageviews / r.total.visitors).toFixed(1) : "-"} />
      </div>

      <section className="card mt-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Visitors and page views per day</h2>
        <LineChart
          days={r.days}
          series={[
            { name: "Visitors", color: "var(--series-1)", points: r.visitors },
            { name: "Page views", color: "var(--series-2)", points: r.pageviews },
          ]}
        />
      </section>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <BarList title="Top pages" rows={r.pages} unit="page views" />
        <BarList title={source === "ga4" ? "Where they came from" : "Sites that sent visitors"} rows={r.sources} unit={source === "ga4" ? "sessions" : "visitors"} />
        <BarList title="Devices" rows={r.devices} unit="visitors" />
        <BarList title="Countries" rows={r.countries} unit="visitors" />
      </div>
    </>
  );
}
