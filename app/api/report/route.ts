import { timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";
import { cleanDomain, daysAgo } from "@/lib/format";
import { gscTotals, keywordRows, untrackedQueries, visitorReport, visitorSources, change } from "@/lib/queries";
import type { Site } from "@/lib/sites";

export const dynamic = "force-dynamic";

// Read-only report for one site, for scripts and assistants that can't use the login.
// GET /api/report?site=provoseopros.com&days=28 with header "Authorization: Bearer <REPORT_API_KEY>".
// Returns the same numbers the dashboard shows. Changes nothing.

function authorized(req: Request) {
  const key = process.env.REPORT_API_KEY ?? "";
  if (key.length < 24) return false; // off until a long key is set in Vercel
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${key}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const domain = cleanDomain(url.searchParams.get("site") ?? "");
  if (!domain) {
    const sites = await sql<{ name: string; domain: string; kind: string }[]>`SELECT name, domain, kind FROM sites ORDER BY kind = 'client', name`;
    return Response.json({ sites });
  }

  const [site] = await sql<Site[]>`SELECT * FROM sites WHERE domain = ${domain}`;
  if (!site) return new Response("unknown site", { status: 404 });

  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 28, 1), 90);
  const [rows, suggestions, gscNow, gscBefore, sources] = await Promise.all([
    keywordRows(site.id),
    untrackedQueries(site.id),
    gscTotals(site.id, daysAgo(days), daysAgo(0)),
    gscTotals(site.id, daysAgo(days * 2), daysAgo(days)),
    visitorSources(site),
  ]);
  const visitors = await visitorReport(site.id, sources.preferred, days);

  return Response.json({
    site: { name: site.name, domain: site.domain, kind: site.kind, gscConnected: !!site.gsc_property, ga4Connected: !!site.ga4_property_id },
    generatedAt: new Date().toISOString(),
    days,
    keywords: rows.map((r) => ({
      keyword: r.keyword,
      position: r.position,
      url: r.url,
      checkedOn: r.checked_on,
      changeVs7DaysAgo: change(r),
      best: r.best,
      gsc28d: { clicks: r.clicks, impressions: r.impressions, position: r.gsc_position },
    })),
    searchConsole: { current: gscNow, previous: gscBefore, untrackedQueries: suggestions },
    visitors: { source: sources.preferred, ...visitors },
  });
}
