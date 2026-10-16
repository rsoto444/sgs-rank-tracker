// Tests for the keyword volume and difficulty lookup, against a fake DataForSEO (no credits are spent).
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATAFORSEO_LOGIN = "me@example.com";
process.env.DATAFORSEO_PASSWORD = "SECRET-PASSWORD";
const { fetchKeywordMetrics, metricsKey, fetchKeywordIdeas, MAX_IDEA_SEEDS, MAX_IDEAS } = await import("../lib/dataforseo.ts");

type Call = { path: string; headers: Record<string, string>; body: any };
function fakeApi(handler: (path: string, body: any) => { ok?: boolean; status?: number; json: any }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    const path = new URL(String(url)).pathname;
    const body = JSON.parse(init.body)[0];
    calls.push({ path, headers: init.headers, body });
    const r = handler(path, body);
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json } as any;
  }) as typeof fetch;
  return calls;
}
const okTask = (result: any[]) => ({ status_code: 20000, tasks: [{ status_code: 20000, status_message: "Ok.", result }] });
const VOL = "/v3/keywords_data/google_ads/search_volume/live";
const DIFF = "/v3/dataforseo_labs/google/bulk_keyword_difficulty/live";
const happy = (path: string, body: any) =>
  path === VOL
    ? { json: okTask(body.keywords.map((k: string) => ({ keyword: k, search_volume: 100, cpc: 2.5, competition: "LOW" }))) }
    : { json: okTask([{ items: body.keywords.map((k: string) => ({ keyword: k, keyword_difficulty: 33 })) }]) };
const us = (keyword: string) => ({ keyword, locationCode: 2840, languageCode: "en" });

test("sends one volume and one difficulty request for the whole list, with Basic auth, lowercased", async () => {
  const calls = fakeApi(happy);
  const r = await fetchKeywordMetrics([us("Lead Follow Up"), us("speed to lead")]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.path).sort(), [DIFF, VOL].sort());
  assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from("me@example.com:SECRET-PASSWORD").toString("base64")}`);
  assert.deepEqual(calls[0].body.keywords, ["lead follow up", "speed to lead"]);
  assert.equal(calls[0].body.location_code, 2840);
  assert.deepEqual(r.byKey.get(metricsKey("Lead Follow Up", 2840, "en")), { searchVolume: 100, cpc: 2.5, competition: "LOW", difficulty: 33 });
  assert.equal(r.failedKeys.size, 0);
  assert.deepEqual(r.errors, []);
});

test("makes no request for an empty list", async () => {
  const calls = fakeApi(happy);
  const r = await fetchKeywordMetrics([]);
  assert.equal(calls.length, 0);
  assert.equal(r.byKey.size, 0);
});

test("asks separately for each market, and de-duplicates repeated keywords", async () => {
  const calls = fakeApi(happy);
  await fetchKeywordMetrics([us("a"), us("A"), { keyword: "b", locationCode: 2124, languageCode: "en" }]);
  assert.equal(calls.length, 4);
  const us1 = calls.filter((c) => c.body.location_code === 2840 && c.path === VOL)[0];
  assert.deepEqual(us1.body.keywords, ["a"]);
  assert.equal(calls.filter((c) => c.body.location_code === 2124).length, 2);
});

test("splits a long list into batches of 1000", async () => {
  const calls = fakeApi(happy);
  const items = Array.from({ length: 1001 }, (_, i) => us(`keyword number ${i}`));
  const r = await fetchKeywordMetrics(items);
  assert.equal(calls.length, 4);
  assert.equal(r.byKey.size, 1001);
});

test("a keyword Google has no data for still counts as looked up, with empty numbers", async () => {
  fakeApi((path, body) =>
    path === VOL
      ? { json: okTask([{ keyword: body.keywords[0], search_volume: null, cpc: null, competition: null }]) }
      : { json: okTask([{ items: [{ keyword: body.keywords[0], keyword_difficulty: null }] }]) });
  const r = await fetchKeywordMetrics([us("obscure long tail phrase")]);
  assert.deepEqual(r.byKey.get(metricsKey("obscure long tail phrase", 2840, "en")), { searchVolume: null, cpc: null, competition: null, difficulty: null });
  assert.equal(r.failedKeys.size, 0);
});

test("keeps the difficulty when the volume request fails, and reports the failure", async () => {
  fakeApi((path, body) => (path === VOL ? { ok: false, status: 500, json: {} } : happy(path, body)));
  const r = await fetchKeywordMetrics([us("alpha")]);
  assert.equal(r.byKey.get(metricsKey("alpha", 2840, "en"))?.difficulty, 33);
  assert.equal(r.byKey.get(metricsKey("alpha", 2840, "en"))?.searchVolume, null);
  assert.equal(r.failedKeys.size, 0);
  assert.match(r.errors[0], /volume/);
});

test("marks keywords as failed (to retry later) when both requests fail", async () => {
  fakeApi(() => ({ ok: false, status: 500, json: {} }));
  const r = await fetchKeywordMetrics([us("alpha"), us("beta")]);
  assert.equal(r.failedKeys.size, 2);
  assert.ok(r.failedKeys.has(metricsKey("alpha", 2840, "en")));
  assert.equal(r.byKey.size, 0);
  assert.equal(r.errors.length, 2);
});

test("treats a task-level error as a failure", async () => {
  fakeApi(() => ({ json: { status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid Field", result: null }] } }));
  const r = await fetchKeywordMetrics([us("alpha")]);
  assert.equal(r.failedKeys.size, 1);
  assert.match(r.errors[0], /Invalid Field/);
});

test("skips keywords DataForSEO would reject (over 80 characters or 10 words) without failing them", async () => {
  const calls = fakeApi(happy);
  const long = "w".repeat(81);
  const wordy = "one two three four five six seven eight nine ten eleven";
  const r = await fetchKeywordMetrics([us(long), us(wordy), us("fine keyword")]);
  assert.deepEqual(calls[0].body.keywords, ["fine keyword"]);
  assert.equal(r.failedKeys.size, 0);
  assert.equal(r.byKey.has(metricsKey(long, 2840, "en")), false);
});

test("never puts the credentials in an error message", async () => {
  fakeApi(() => ({ ok: false, status: 401, json: {} }));
  const r = await fetchKeywordMetrics([us("alpha")]);
  assert.ok(r.errors.every((e) => !e.includes("SECRET-PASSWORD") && !e.includes("me@example.com")));
});

test("counts how many keywords came back with a volume and with a difficulty", async () => {
  fakeApi((path, body) =>
    path === VOL
      ? { json: okTask([{ keyword: "a", search_volume: 90, cpc: 1, competition: "LOW" }, { keyword: "b", search_volume: null, cpc: null, competition: null }, { keyword: "c", search_volume: null, cpc: null, competition: null }]) }
      : { json: okTask([{ items: [{ keyword: "a", keyword_difficulty: null }, { keyword: "b", keyword_difficulty: null }, { keyword: "c", keyword_difficulty: null }] }]) });
  const r = await fetchKeywordMetrics([us("a"), us("b"), us("c")]);
  assert.equal(r.withVolume, 1);
  assert.equal(r.withDifficulty, 0);
  assert.equal(r.byKey.size, 3);
});

const IDEAS = "/v3/dataforseo_labs/google/keyword_ideas/live";
const ideasTask = (items: any[], cost = 0.0103, total = items.length) => ({ status_code: 20000, tasks: [{ status_code: 20000, status_message: "Ok.", cost, result: [{ total_count: total, items }] }] });
const idea = (keyword: string, volume: number | null, diff: number | null) => ({ keyword, keyword_info: { search_volume: volume, cpc: 1.2, competition_level: "LOW" }, keyword_properties: { keyword_difficulty: diff } });

test("asks for related keywords that have volume, most relevant first, and reports the real cost", async () => {
  const calls = fakeApi(() => ({ json: ideasTask([idea("lead follow up software", 480, 41), idea("lead follow up", 590, 38), idea("speed to lead", 210, null)], 0.0123) }));
  const r = await fetchKeywordIdeas(["Lead Follow Up", "lead follow up"], 2840, "en");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, IDEAS);
  assert.deepEqual(calls[0].body.keywords, ["lead follow up"]);
  assert.deepEqual(calls[0].body.filters, ["keyword_info.search_volume", ">", 0]);
  assert.deepEqual(calls[0].body.order_by, ["relevance,desc", "keyword_info.search_volume,desc"]);
  assert.equal(calls[0].body.limit, MAX_IDEAS);
  assert.deepEqual(r.ideas.map((i) => i.keyword), ["lead follow up software", "speed to lead"]); // the seed itself is dropped
  assert.deepEqual(r.ideas[0], { keyword: "lead follow up software", searchVolume: 480, cpc: 1.2, competition: "LOW", difficulty: 41 });
  assert.equal(r.ideas[1].difficulty, null);
  assert.equal(r.cost, 0.0123);
});

test("caps the seeds and the number of ideas, and makes no request with no usable seed", async () => {
  const calls = fakeApi(() => ({ json: ideasTask([]) }));
  await fetchKeywordIdeas(Array.from({ length: 25 }, (_, i) => `seed ${i}`), 2840, "en", 5000);
  assert.equal(calls[0].body.keywords.length, MAX_IDEA_SEEDS);
  assert.equal(calls[0].body.limit, MAX_IDEAS);
  const none = fakeApi(() => ({ json: ideasTask([]) }));
  const r = await fetchKeywordIdeas(["", "w ".repeat(11)], 2840, "en");
  assert.equal(none.length, 0);
  assert.deepEqual(r.ideas, []);
});

test("an ideas request that fails throws, without the credentials in the message", async () => {
  fakeApi(() => ({ ok: false, status: 401, json: {} }));
  await assert.rejects(() => fetchKeywordIdeas(["a"], 2840, "en"), (e: Error) => !e.message.includes("SECRET-PASSWORD"));
});
