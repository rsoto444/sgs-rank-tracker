import "server-only";
import { sql } from "./db";
import type { Site } from "./sites";
import { daysAgo, isoDay } from "./format";

export type KeywordRow = {
  id: number;
  keyword: string;
  position: number | null;
  url: string | null;
  checked_on: string | null;
  prev_position: number | null;
  best: number | null;
  clicks: number | null;
  impressions: number | null;
  gsc_position: number | null;
};

export async function keywordRows(siteId: number) {
  return sql<KeywordRow[]>`
    SELECT k.id, k.keyword, l.position, l.url, l.checked_on::text, p.position AS prev_position, b.best,
           g.clicks, g.impressions, g.gsc_position
    FROM keywords k
    LEFT JOIN LATERAL (
      SELECT position, url, checked_on FROM rank_checks WHERE keyword_id = k.id ORDER BY checked_on DESC LIMIT 1
    ) l ON true
    LEFT JOIN LATERAL (
      SELECT position FROM rank_checks
      WHERE keyword_id = k.id AND checked_on <= l.checked_on - 7 ORDER BY checked_on DESC LIMIT 1
    ) p ON true
    LEFT JOIN LATERAL (SELECT min(position) AS best FROM rank_checks WHERE keyword_id = k.id) b ON true
    LEFT JOIN LATERAL (
      SELECT sum(clicks)::int AS clicks, sum(impressions)::int AS impressions,
             (sum(position * impressions) / nullif(sum(impressions), 0))::float8 AS gsc_position
      FROM gsc_queries WHERE site_id = k.site_id AND lower(query) = lower(k.keyword) AND day >= current_date - 28
    ) g ON true
    WHERE k.site_id = ${siteId}
    ORDER BY l.position NULLS LAST, g.impressions DESC NULLS LAST, k.keyword`;
}

/** Positive = moved up the page. */
export function change(row: Pick<KeywordRow, "position" | "prev_position">) {
  if (row.position === null || row.prev_position === null) return null;
  return row.prev_position - row.position;
}

export async function untrackedQueries(siteId: number) {
  return sql<{ query: string; clicks: number; impressions: number; position: number }[]>`
    SELECT query, sum(clicks)::int AS clicks, sum(impressions)::int AS impressions,
           (sum(position * impressions) / nullif(sum(impressions), 0))::float8 AS position
    FROM gsc_queries
    WHERE site_id = ${siteId} AND day >= current_date - 28
      AND lower(query) NOT IN (SELECT lower(keyword) FROM keywords WHERE site_id = ${siteId})
    GROUP BY query ORDER BY impressions DESC LIMIT 15`;
}

export async function gscTotals(siteId: number, from: Date, to: Date) {
  const [row] = await sql<{ clicks: number; impressions: number }[]>`
    SELECT coalesce(sum(clicks), 0)::int AS clicks, coalesce(sum(impressions), 0)::int AS impressions
    FROM gsc_queries WHERE site_id = ${siteId} AND day >= ${isoDay(from)} AND day < ${isoDay(to)}`;
  return row;
}

// ---------- visitors ----------

export type VisitorSource = "snippet" | "ga4";

export async function visitorSources(site: Site) {
  const [{ has }] = await sql<{ has: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pageviews WHERE site_id = ${site.id}) AS has`;
  const [{ hasGa4 }] = await sql<{ hasGa4: boolean }[]>`SELECT EXISTS (SELECT 1 FROM ga4_daily WHERE site_id = ${site.id}) AS "hasGa4"`;
  const available: VisitorSource[] = ["snippet"];
  if (site.ga4_property_id) available.push("ga4");
  const preferred: VisitorSource = has ? "snippet" : hasGa4 ? "ga4" : "snippet";
  return { available, preferred };
}

type Daily = { day: string; visitors: number; pageviews: number };
type Ranked = { label: string; value: number }[];

export type VisitorReport = {
  days: string[];
  visitors: number[];
  pageviews: number[];
  total: { visitors: number; pageviews: number };
  previous: { visitors: number; pageviews: number };
  pages: Ranked;
  sources: Ranked;
  devices: Ranked;
  countries: Ranked;
};

function fill(range: number, rows: Daily[], lag = 0) {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days: string[] = [];
  for (let i = range - 1 + lag; i >= lag; i--) days.push(isoDay(daysAgo(i)));
  return {
    days,
    visitors: days.map((d) => byDay.get(d)?.visitors ?? 0),
    pageviews: days.map((d) => byDay.get(d)?.pageviews ?? 0),
  };
}

const sum = (rows: Daily[]) => ({
  visitors: rows.reduce((a, r) => a + r.visitors, 0),
  pageviews: rows.reduce((a, r) => a + r.pageviews, 0),
});

export async function visitorReport(siteId: number, source: VisitorSource, range: number): Promise<VisitorReport> {
  if (source === "ga4") {
    // GA4 finishes a day's numbers the next day, so its window ends yesterday.
    const start = isoDay(daysAgo(range));
    const prevStart = isoDay(daysAgo(range * 2));
    const end = isoDay(daysAgo(0));
    const rows = await sql<Daily[]>`
      SELECT day::text, users AS visitors, pageviews FROM ga4_daily
      WHERE site_id = ${siteId} AND day >= ${prevStart} AND day < ${end} ORDER BY day`;
    const current = rows.filter((r) => r.day >= start);
    const top = (dimension: string) => sql<Ranked>`
      SELECT value AS label, sum(count)::int AS value FROM ga4_breakdown
      WHERE site_id = ${siteId} AND dimension = ${dimension} AND day >= ${start} AND day < ${end}
      GROUP BY value ORDER BY 2 DESC LIMIT 10`;
    const [pages, sources, devices, countries] = await Promise.all([top("page"), top("source"), top("device"), top("country")]);
    return {
      ...fill(range, current, 1),
      total: sum(current),
      previous: sum(rows.filter((r) => r.day < start)),
      pages,
      sources,
      devices,
      countries,
    };
  }

  const start = isoDay(daysAgo(range - 1));
  const prevStart = isoDay(daysAgo(range * 2 - 1));
  const rows = await sql<Daily[]>`
    SELECT (ts AT TIME ZONE 'UTC')::date::text AS day, count(DISTINCT visitor_hash)::int AS visitors, count(*)::int AS pageviews
    FROM pageviews WHERE site_id = ${siteId} AND ts >= ${prevStart}
    GROUP BY 1 ORDER BY 1`;
  const current = rows.filter((r) => r.day >= start);
  const top = (column: string, fallback: string, metric: "views" | "visitors") => sql<Ranked>`
    SELECT coalesce(${sql(column)}, ${fallback}) AS label,
           ${metric === "views" ? sql`count(*)` : sql`count(DISTINCT visitor_hash)`}::int AS value
    FROM pageviews WHERE site_id = ${siteId} AND ts >= ${start}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10`;
  const [pages, sources, devices, countries] = await Promise.all([
    top("path", "/", "views"),
    top("referrer_host", "Direct or unknown", "visitors"),
    top("device", "Unknown", "visitors"),
    top("country", "Unknown", "visitors"),
  ]);
  return {
    ...fill(range, current),
    total: sum(current),
    previous: sum(rows.filter((r) => r.day < start)),
    pages,
    sources,
    devices,
    countries,
  };
}
