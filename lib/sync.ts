import "server-only";
import { sql } from "./db";
import type { Site } from "./sites";
import { checkRankLive, dataForSeoConnected, getRankTask, postRankTasks, readyRankTaskIds } from "./dataforseo";
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

async function saveRank(keywordId: number, day: string, position: number | null, url: string | null) {
  await sql`
    INSERT INTO rank_checks (keyword_id, checked_on, position, url)
    VALUES (${keywordId}, ${day}, ${position}, ${url})
    ON CONFLICT (keyword_id, checked_on) DO UPDATE SET position = EXCLUDED.position, url = EXCLUDED.url`;
}

/** Live mode, answer in seconds (the "Check positions now" button). Skips keywords already checked today. */
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
        const r = await checkRankLive(k.keyword, site.domain, site.location_code, site.language_code);
        await saveRank(k.id, today, r.position, r.url);
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

/** Daily checks, Standard Queue: sends every keyword not yet checked or sent today. */
export async function queueDailyRanks() {
  if (!dataForSeoConnected()) return;
  const today = isoDay(new Date());
  const rows = await sql<{ id: number; keyword: string; site_id: number; location_code: number; language_code: string }[]>`
    SELECT k.id, k.keyword, s.id AS site_id, s.location_code, s.language_code
    FROM keywords k JOIN sites s ON s.id = k.site_id
    WHERE NOT EXISTS (SELECT 1 FROM rank_checks r WHERE r.keyword_id = k.id AND r.checked_on = ${today})
      AND NOT EXISTS (SELECT 1 FROM rank_tasks t WHERE t.keyword_id = k.id AND t.checked_on = ${today})`;
  if (!rows.length) return;
  try {
    const { posted, errors } = await postRankTasks(
      rows.map((r) => ({ keywordId: r.id, day: today, keyword: r.keyword, locationCode: r.location_code, languageCode: r.language_code })),
    );
    if (posted.length) {
      await sql`INSERT INTO rank_tasks ${sql(posted.map((p) => ({ task_id: p.taskId, keyword_id: p.keywordId, checked_on: p.day })))}
        ON CONFLICT DO NOTHING`;
    }
    for (const siteId of new Set(rows.map((r) => r.site_id))) {
      const mine = rows.filter((r) => r.site_id === siteId);
      const failed = errors.filter((e) => mine.some((m) => e.startsWith(m.keyword + ":")));
      await log(siteId, "dataforseo", failed.length === 0,
        failed.length ? `${failed.length} of ${mine.length} could not be sent. First error: ${failed[0]}` : `${mine.length} keywords sent for today's check`);
    }
  } catch (e) {
    for (const siteId of new Set(rows.map((r) => r.site_id))) await log(siteId, "dataforseo", false, (e as Error).message);
  }
}

/** Picks up finished Standard Queue checks and saves them. */
export async function collectDailyRanks() {
  if (!dataForSeoConnected()) return;
  await sql`DELETE FROM rank_tasks WHERE posted_at < now() - interval '3 days'`;
  const pending = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM rank_tasks`;
  if (pending[0].n === 0) return;

  const ready = new Set(await readyRankTaskIds());
  const tasks = await sql<{ task_id: string; keyword_id: number; checked_on: string; site_id: number; domain: string }[]>`
    SELECT t.task_id, t.keyword_id, t.checked_on::text, s.id AS site_id, s.domain
    FROM rank_tasks t JOIN keywords k ON k.id = t.keyword_id JOIN sites s ON s.id = k.site_id`;
  const bySite = new Map<number, { done: number; errors: string[] }>();
  for (const t of tasks.filter((t) => ready.has(t.task_id))) {
    const stat = bySite.get(t.site_id) ?? { done: 0, errors: [] };
    bySite.set(t.site_id, stat);
    try {
      const r = await getRankTask(t.task_id, t.domain);
      await saveRank(t.keyword_id, t.checked_on, r.position, r.url);
      await sql`DELETE FROM rank_tasks WHERE task_id = ${t.task_id}`;
      stat.done++;
    } catch (e) {
      stat.errors.push((e as Error).message);
    }
  }
  for (const [siteId, stat] of bySite) {
    await log(siteId, "dataforseo", stat.errors.length === 0,
      stat.errors.length ? `${stat.done} saved, ${stat.errors.length} failed. First error: ${stat.errors[0]}` : `${stat.done} keywords checked`);
  }
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

/** The daily job: collect finished rank checks, send today's, refresh Google data. */
export async function syncAll() {
  await collectDailyRanks();
  await queueDailyRanks();
  const sites = await sql<Site[]>`SELECT * FROM sites ORDER BY id`;
  for (const site of sites) await Promise.all([syncGsc(site), syncGa4(site)]);
  return sites.length;
}
