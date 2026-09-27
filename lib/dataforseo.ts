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
