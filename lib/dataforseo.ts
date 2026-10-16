// DataForSEO SERP API: where a domain sits in Google's top 100 for one keyword.
// Two ways to ask:
// - Live mode: answer in seconds. Used for "Check positions now".
// - Standard Queue: about 5 minutes, roughly a third of the price. Used for the daily checks.
// Docs: https://docs.dataforseo.com/v3/serp/google/organic/overview/

const API = process.env.DATAFORSEO_API_URL ?? "https://api.dataforseo.com";
const BASE = "/v3/serp/google/organic";
// Our tasks are tagged so we never collect tasks another tool posted on the same account.
const TAG_PREFIX = "sgsrt:";

export function dataForSeoConnected() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

type SerpItem = { type: string; rank_group: number; domain?: string; url?: string };
type Task = { id: string; status_code: number; status_message: string; data?: { tag?: string }; result?: { items?: SerpItem[] }[] | null };

export type RankResult = { position: number | null; url: string | null };

async function call(path: string, body?: unknown) {
  const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
  const json = await res.json();
  if (json.status_code !== 20000) throw new Error(`DataForSEO: ${json.status_message}`);
  return json.tasks as Task[];
}

function matchesDomain(itemDomain: string | undefined, domain: string) {
  if (!itemDomain) return false;
  const d = itemDomain.toLowerCase().replace(/^www\./, "");
  return d === domain || d.endsWith("." + domain);
}

function findRank(task: Task, domain: string): RankResult {
  const items = task.result?.[0]?.items ?? [];
  const hit = items.find((i) => i.type === "organic" && matchesDomain(i.domain, domain));
  return hit ? { position: hit.rank_group, url: hit.url ?? null } : { position: null, url: null };
}

const request = (keyword: string, locationCode: number, languageCode: string) => ({
  keyword,
  location_code: locationCode,
  language_code: languageCode,
  depth: 100,
});

/** Live mode: one keyword, answer now. */
export async function checkRankLive(keyword: string, domain: string, locationCode: number, languageCode: string) {
  const [task] = await call(`${BASE}/live/regular`, [request(keyword, locationCode, languageCode)]);
  if (task?.status_code !== 20000) throw new Error(`DataForSEO: ${task?.status_message ?? "no task returned"}`);
  return findRank(task, domain);
}

export type QueuedCheck = { keywordId: number; day: string; keyword: string; locationCode: number; languageCode: string };

/** Standard Queue: send up to 100 keywords per call. Returns the task id for each keyword. */
export async function postRankTasks(checks: QueuedCheck[]) {
  const posted: { taskId: string; keywordId: number; day: string }[] = [];
  const errors: string[] = [];
  for (let i = 0; i < checks.length; i += 100) {
    const batch = checks.slice(i, i + 100);
    const tasks = await call(
      `${BASE}/task_post`,
      batch.map((c) => ({ ...request(c.keyword, c.locationCode, c.languageCode), tag: `${TAG_PREFIX}${c.keywordId}:${c.day}` })),
    );
    tasks.forEach((t, j) => {
      if (t.status_code === 20100) posted.push({ taskId: t.id, keywordId: batch[j].keywordId, day: batch[j].day });
      else errors.push(`${batch[j].keyword}: ${t.status_message}`);
    });
  }
  return { posted, errors };
}

/** Ids of our finished Standard Queue tasks that haven't been collected yet. */
export async function readyRankTaskIds() {
  const tasks = await call(`${BASE}/tasks_ready`);
  const ready = (tasks[0]?.result ?? []) as unknown as { id: string; tag?: string }[];
  return ready.filter((r) => r.tag?.startsWith(TAG_PREFIX)).map((r) => r.id);
}

export async function getRankTask(taskId: string, domain: string) {
  const [task] = await call(`${BASE}/task_get/regular/${taskId}`);
  if (task?.status_code !== 20000) throw new Error(`DataForSEO: ${task?.status_message ?? "task not found"}`);
  return findRank(task, domain);
}

// ---------- keyword research: monthly searches and difficulty ----------
// Volume: POST keywords_data/google_ads/search_volume/live. Difficulty: POST
// dataforseo_labs/google/bulk_keyword_difficulty/live. Both take up to 1000 keywords per request and are
// charged per request, so a whole site costs a few cents. Keywords are lowercased by DataForSEO; ones over
// 80 characters or 10 words are not accepted and are skipped (they simply get no numbers).
// Docs: https://docs.dataforseo.com/v3/keywords_data/google_ads/search_volume/live/
//       https://docs.dataforseo.com/v3/dataforseo_labs/google/bulk_keyword_difficulty/live/

const VOLUME_PATH = "/v3/keywords_data/google_ads/search_volume/live";
const DIFFICULTY_PATH = "/v3/dataforseo_labs/google/bulk_keyword_difficulty/live";
const METRICS_BATCH = 1000;

export type KeywordMetricsInput = { keyword: string; locationCode: number; languageCode: string };
export type KeywordMetrics = { searchVolume: number | null; cpc: number | null; competition: string | null; difficulty: number | null };

export const metricsKey = (keyword: string, locationCode: number, languageCode: string) =>
  `${locationCode}|${languageCode}|${keyword.trim().toLowerCase()}`;

async function callTask(path: string, body: unknown) {
  const [task] = await call(path, body);
  if (task?.status_code !== 20000) throw new Error(`DataForSEO: ${task?.status_message ?? "no task returned"}`);
  return task;
}

/**
 * Looks up monthly searches, cost per click and difficulty for keywords, grouped by market (location and
 * language). Returns the numbers by metricsKey(). `failedKeys` are keywords whose lookups BOTH failed, so
 * the caller can retry them later instead of recording an empty result.
 */
export async function fetchKeywordMetrics(items: KeywordMetricsInput[]) {
  const byKey = new Map<string, KeywordMetrics>();
  const failedKeys = new Set<string>();
  const errors: string[] = [];

  const markets = new Map<string, KeywordMetricsInput[]>();
  for (const it of items) {
    const m = `${it.locationCode}|${it.languageCode}`;
    markets.set(m, [...(markets.get(m) ?? []), it]);
  }

  for (const group of markets.values()) {
    const { locationCode, languageCode } = group[0];
    const words = [...new Set(group.map((g) => g.keyword.trim().toLowerCase()))].filter((w) => w && w.length <= 80 && w.split(" ").length <= 10);
    for (let i = 0; i < words.length; i += METRICS_BATCH) {
      const chunk = words.slice(i, i + METRICS_BATCH);
      const body = [{ keywords: chunk, location_code: locationCode, language_code: languageCode }];
      const [vol, diff] = await Promise.allSettled([callTask(VOLUME_PATH, body), callTask(DIFFICULTY_PATH, body)]);

      const entry = (w: string) => {
        const k = metricsKey(w, locationCode, languageCode);
        let e = byKey.get(k);
        if (!e) byKey.set(k, (e = { searchVolume: null, cpc: null, competition: null, difficulty: null }));
        return e;
      };
      if (vol.status === "fulfilled") {
        for (const r of (vol.value.result ?? []) as { keyword?: string; search_volume?: number | null; cpc?: number | null; competition?: string | null }[]) {
          if (!r.keyword) continue;
          const e = entry(r.keyword);
          e.searchVolume = typeof r.search_volume === "number" ? r.search_volume : null;
          e.cpc = typeof r.cpc === "number" ? r.cpc : null;
          e.competition = r.competition ? String(r.competition) : null;
        }
      } else errors.push(`volume: ${(vol.reason as Error).message}`);
      if (diff.status === "fulfilled") {
        const block = (diff.value.result?.[0] ?? {}) as { items?: { keyword?: string; keyword_difficulty?: number | null }[] };
        for (const r of block.items ?? []) {
          if (!r.keyword) continue;
          entry(r.keyword).difficulty = typeof r.keyword_difficulty === "number" ? r.keyword_difficulty : null;
        }
      } else errors.push(`difficulty: ${(diff.reason as Error).message}`);

      // A keyword Google has no data for still counts as looked up (so it is not asked for every day);
      // only a chunk where both requests failed is retried.
      for (const w of chunk) {
        if (vol.status === "fulfilled" || diff.status === "fulfilled") entry(w);
        else failedKeys.add(metricsKey(w, locationCode, languageCode));
      }
    }
  }
  // How many keywords came back with a number, so a log can say "0 with difficulty" instead of leaving a
  // blank column unexplained. Rarely searched phrases often have no data in either source.
  let withVolume = 0;
  let withDifficulty = 0;
  for (const m of byKey.values()) {
    if (m.searchVolume !== null) withVolume++;
    if (m.difficulty !== null) withDifficulty++;
  }
  return { byKey, failedKeys, errors, withVolume, withDifficulty };
}
