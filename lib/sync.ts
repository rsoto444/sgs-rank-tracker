import "server-only";
import { sql } from "./db";
import type { Site } from "./sites";
import { checkRank, dataForSeoConnected } from "./dataforseo";
import { googleConnected } from "./google";
import { fetchGscQueries } from "./gsc";
import { fetchGa4 } from "./ga4";
import { daysAgo, isoDay } from "./format";

type Source = "dataforseo" | "gsc" | "ga4";

async function log(siteId: number, source: Source, ok: boolean, message: string) {
  await sql`
    INSERT INTO sync_log (site_id, source, ok, message) VALUES (${siteId}, ${source}, ${ok}, ${message})
    ON CONFLICT (site_id, source) DO UPDATE SET ran_at = now(), ok = EXCLUDED.ok, message = EXCLUDED.message`;
}

async function inChunks<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/** Checks today's Google position for every keyword on the site that hasn't been checked today. */
export async function syncRanks(site: Site, opts: { onlyKeywordIds?: number[] } = {}) {
  if (!dataForSeoConnected()) return;
  const today = isoDay(new Date());
  const keywords = await sql<{ id: number; keyword: string }[]>`
    SELECT k.id, k.keyword FROM keywords k
    WHERE k.site_id = ${site.id}
      AND NOT EXISTS (SELECT 1 FROM rank_checks r WHERE r.keyword_id = k.id AND r.checked_on = ${today})
      ${opts.onlyKeywordIds ? sql`AND k.id = ANY(${opts.onlyKeywordIds})` : sql``}`;
  if (!keywords.length) return;

  let done = 0;
  const errors: string[] = [];
  const queue = [...keywords];
  const worker = async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
      try {
        const r = await checkRank(k.keyword, site.domain, site.location_code, site.language_code);
        await sql`
          INSERT INTO rank_checks (keyword_id, checked_on, position, url)
          VALUES (${k.id}, ${today}, ${r.position}, ${r.url})
          ON CONFLICT (keyword_id, checked_on) DO UPDATE SET position = EXCLUDED.position, url = EXCLUDED.url`;
        done++;
      } catch (e) {
        errors.push(`${k.keyword}: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  await log(
    site.id,
    "dataforseo",
    errors.length === 0,
    errors.length ? `${done} checked, ${errors.length} failed. First error: ${errors[0]}` : `${done} keywords checked`,
  );
}

/** Pulls the last 30 days of Search Console queries (re-pulling fills in Google's 2-3 day delay). */
export async function syncGsc(site: Site) {
  if (!googleConnected() || !site.gsc_property) return;
  try {
    const rows = await fetchGscQueries(site.gsc_property, isoDay(daysAgo(30)), isoDay(daysAgo(0)));
    await inChunks(rows, 1000, (chunk) =>
      sql`
        INSERT INTO gsc_queries ${sql(chunk.map((r) => ({ site_id: site.id, ...r })))}
        ON CONFLICT (site_id, day, query) DO UPDATE
        SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, position = EXCLUDED.position`,
    );
    await log(site.id, "gsc", true, `${rows.length} query rows pulled`);
  } catch (e) {
    await log(site.id, "gsc", false, (e as Error).message);
  }
}

export async function syncGa4(site: Site) {
  if (!googleConnected() || !site.ga4_property_id) return;
  try {
    const { daily, breakdowns } = await fetchGa4(site.ga4_property_id, isoDay(daysAgo(30)), isoDay(daysAgo(0)));
    await inChunks(daily, 1000, (chunk) =>
      sql`
        INSERT INTO ga4_daily ${sql(chunk.map((r) => ({ site_id: site.id, ...r })))}
        ON CONFLICT (site_id, day) DO UPDATE
        SET users = EXCLUDED.users, sessions = EXCLUDED.sessions, pageviews = EXCLUDED.pageviews`,
    );
    await inChunks(breakdowns, 1000, (chunk) =>
      sql`
        INSERT INTO ga4_breakdown ${sql(chunk.map((r) => ({ site_id: site.id, ...r })))}
        ON CONFLICT (site_id, day, dimension, value) DO UPDATE SET count = EXCLUDED.count`,
    );
    await log(site.id, "ga4", true, `${daily.length} days pulled`);
  } catch (e) {
    await log(site.id, "ga4", false, (e as Error).message);
  }
}

export async function syncSite(site: Site) {
  await Promise.all([syncRanks(site), syncGsc(site), syncGa4(site)]);
}

export async function syncAll() {
  const sites = await sql<Site[]>`SELECT * FROM sites ORDER BY id`;
  for (const site of sites) await syncSite(site);
  return sites.length;
}
