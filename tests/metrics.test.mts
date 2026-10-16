// Tests for the keyword volume and difficulty lookup, against a fake DataForSEO (no credits are spent).
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATAFORSEO_LOGIN = "me@example.com";
process.env.DATAFORSEO_PASSWORD = "SECRET-PASSWORD";
const { fetchKeywordMetrics, metricsKey, fetchKeywordIdeas, MAX_IDEA_SEEDS, MAX_IDEAS, wordsPattern, groupsPattern, containsFromEach } = await import("../lib/dataforseo.ts");
const { sortIdeas, nextSort } = await import("../lib/ideas-sort.ts");
const { sortKeywordRows, nextKeywordSort } = await import("../lib/keyword-sort.ts");

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
  assert.deepEqual(calls[0].body.filters, ["keyword_info.search_volume", ">", 0]); // no words given: volume filter only
  assert.deepEqual(calls[0].body.order_by, ["relevance,desc", "keyword_info.search_volume,desc"]);
  assert.equal(calls[0].body.limit, MAX_IDEAS);
  assert.equal(calls[0].body.closely_variants, true); // whole-phrase matching is the default
  assert.deepEqual(r.ideas.map((i) => i.keyword), ["lead follow up software", "speed to lead"]); // the seed itself is dropped
  assert.deepEqual(r.ideas[0], { keyword: "lead follow up software", searchVolume: 480, cpc: 1.2, competition: "LOW", difficulty: 41 });
  assert.equal(r.ideas[1].difficulty, null);
  assert.equal(r.cost, 0.0123);
});

test("caps the seeds and the number of ideas, and makes no request with no usable seed", async () => {
  const calls = fakeApi(() => ({ json: ideasTask([idea("some idea", 10, 1)]) }));
  await fetchKeywordIdeas(Array.from({ length: 25 }, (_, i) => `seed ${i}`), 2840, "en");
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

test("loose matching can be switched on, and a must-include filter keeps only the relevant ideas", async () => {
  const calls = fakeApi(() => ({ json: ideasTask([idea("yarrow growth habit", 10, null), idea("hvac lead follow up", 90, 12), idea("lead follow up for roofing", 50, 9), idea("metric system disadvantages", 50, 4)]) }));
  const loose = await fetchKeywordIdeas(["lead follow up"], 2840, "en", { phraseMatch: false });
  assert.equal(calls[0].body.closely_variants, false);
  assert.equal(loose.ideas.length, 4);
  const filtered = await fetchKeywordIdeas(["lead follow up"], 2840, "en", { mustInclude: ["HVAC", " roofing "] });
  // DataForSEO is asked to filter by the words itself, and we still check the results on our side.
  assert.deepEqual(calls[1].body.filters, [["keyword_info.search_volume", ">", 0], "and", ["keyword", "regex", "(hvac|roofing)"]]);
  assert.equal(calls[1].body.limit, MAX_IDEAS);
  assert.deepEqual(filtered.ideas.map((i) => i.keyword), ["hvac lead follow up", "lead follow up for roofing"]);
});

test("never shows more than the ideas cap, even after filtering a big response", async () => {
  fakeApi(() => ({ json: ideasTask(Array.from({ length: 100 }, (_, i) => idea(`roofing idea ${i}`, 10 + i, 5))) }));
  const r = await fetchKeywordIdeas(["roofing"], 2840, "en", { mustInclude: ["roofing"] });
  assert.equal(r.ideas.length, MAX_IDEAS);
});

test("if DataForSEO rejects the word filter, falls back to asking for 100 and filtering here", async () => {
  const calls = fakeApi((_p, body) =>
    Array.isArray(body.filters[0]) // the nested filter form
      ? { json: { status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid Field: filters", result: null }] } }
      : { json: ideasTask([idea("roofing lead follow up", 70, 8), idea("leadership follow up", 20, 2)], 0.02, 2) });
  const r = await fetchKeywordIdeas(["lead follow up"], 2840, "en", { mustInclude: ["roofing"] });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.limit, 100);
  assert.deepEqual(calls[1].body.filters, ["keyword_info.search_volume", ">", 0]);
  assert.deepEqual(r.ideas.map((i) => i.keyword), ["roofing lead follow up"]); // the leadership one is filtered here
});

test("builds a safe word pattern: only letters, digits, spaces and hyphens survive", () => {
  assert.equal(wordsPattern(["HVAC", "home service", "a|b", "x.*y", "(", ""]), "(hvac|home service|ab|xy)");
  assert.equal(wordsPattern(["", "  "]), null);
});

test("when whole-phrase matching finds nothing, retries once with broader matching, says so, and adds up the cost", async () => {
  const calls = fakeApi((_p, body) =>
    body.closely_variants ? { json: ideasTask([], 0.012, 0) } : { json: ideasTask([idea("lead management software", 880, 30)], 0.016, 5000) });
  const r = await fetchKeywordIdeas(["lead follow up"], 2840, "en");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.closely_variants, true);
  assert.equal(calls[1].body.closely_variants, false);
  assert.equal(r.usedBroad, true);
  assert.equal(r.cost, 0.028);
  assert.equal(r.returned, 1);
  assert.equal(r.total, 5000);
  assert.deepEqual(r.ideas.map((i) => i.keyword), ["lead management software"]);
});

test("does not retry when whole-phrase matching found something, or when loose matching was asked for and found nothing", async () => {
  const found = fakeApi(() => ({ json: ideasTask([idea("hvac lead follow up", 90, 12)]) }));
  const a = await fetchKeywordIdeas(["lead follow up"], 2840, "en");
  assert.equal(found.length, 1);
  assert.equal(a.usedBroad, false);
  const empty = fakeApi(() => ({ json: ideasTask([], 0.01, 0) }));
  const b = await fetchKeywordIdeas(["lead follow up"], 2840, "en", { phraseMatch: false });
  assert.equal(empty.length, 1);
  assert.equal(b.ideas.length, 0);
  assert.equal(b.returned, 0);
});

test("reports what DataForSEO returned even when our must-include filter removes everything", async () => {
  fakeApi(() => ({ json: ideasTask([idea("unrelated thing", 30, 5), idea("another unrelated", 20, 4)], 0.01, 2) }));
  const r = await fetchKeywordIdeas(["x"], 2840, "en", { mustInclude: ["roofing"] });
  assert.equal(r.ideas.length, 0);
  assert.equal(r.returned, 2);
});

test("two word lists make one pattern needing a word from each, in either order", () => {
  assert.equal(groupsPattern(["hvac", "roofing"], ["coaching", "marketing"]), "((hvac|roofing).*(coaching|marketing)|(coaching|marketing).*(hvac|roofing))");
  assert.equal(groupsPattern(["hvac"], []), "(hvac)");
  assert.equal(groupsPattern([], ["coaching"]), "(coaching)");
  assert.equal(groupsPattern([], []), null);
  assert.equal(containsFromEach("hvac marketing tips", [["hvac"], ["marketing"]]), true);
  assert.equal(containsFromEach("coaching for roofers", [["roofing", "roofers"], ["coaching"]]), true);
  assert.equal(containsFromEach("licensed roofing contractor", [["roofing"], ["coaching", "marketing"]]), false);
  assert.equal(containsFromEach("anything", [[], []]), true);
});

test("sends the two-list pattern to DataForSEO and keeps only phrases with a word from each list", async () => {
  const calls = fakeApi(() => ({ json: ideasTask([idea("hvac marketing ideas", 140, 20), idea("licensed roofing contractor", 590, 7), idea("coaching for contractors", 50, 4), idea("contractor leads", 300, 15)], 0.0168, 1200) }));
  const r = await fetchKeywordIdeas(["contractor business"], 2840, "en", { mustInclude: ["hvac", "contractor", "roofing"], alsoInclude: ["coaching", "marketing", "leads"] });
  assert.deepEqual(calls[0].body.filters[2], ["keyword", "regex", "((hvac|contractor|roofing).*(coaching|marketing|leads)|(coaching|marketing|leads).*(hvac|contractor|roofing))"]);
  assert.equal(calls[0].body.limit, MAX_IDEAS);
  assert.deepEqual(r.ideas.map((i) => i.keyword), ["hvac marketing ideas", "coaching for contractors", "contractor leads"]); // the consumer search is dropped
});

test("works with only the second list", async () => {
  const calls = fakeApi(() => ({ json: ideasTask([idea("sales coaching", 90, 10)]) }));
  await fetchKeywordIdeas(["x"], 2840, "en", { alsoInclude: ["coaching"] });
  assert.deepEqual(calls[0].body.filters[2], ["keyword", "regex", "(coaching)"]);
});

test("show more: asks for the next batch with an offset, and only the first page gets the broader retry", async () => {
  const calls = fakeApi(() => ({ json: ideasTask([], 0.01, 500) }));
  const first = await fetchKeywordIdeas(["lead follow up"], 2840, "en");
  assert.equal(calls.length, 2); // empty first page: whole-phrase, then the broader retry
  assert.equal("offset" in calls[0].body, false);
  const more = await fetchKeywordIdeas(["lead follow up"], 2840, "en", { offset: 40 });
  assert.equal(calls.length, 3); // an empty LATER page just means there is nothing more: no retry
  assert.equal(calls[2].body.offset, 40);
  assert.equal(more.usedBroad, false);
  assert.equal(first.usedBroad, true);
});

test("show more passes the same filters with the offset, and reports the raw count fetched", async () => {
  const calls = fakeApi(() => ({ json: ideasTask([idea("hvac marketing tips", 60, 9), idea("not relevant", 40, 3)], 0.0168, 202) }));
  const r = await fetchKeywordIdeas(["hvac"], 2840, "en", { offset: 40, mustInclude: ["hvac"], alsoInclude: ["marketing"] });
  assert.equal(calls[0].body.offset, 40);
  assert.deepEqual(calls[0].body.filters[2], ["keyword", "regex", "((hvac).*(marketing)|(marketing).*(hvac))"]);
  assert.equal(r.returned, 2); // 2 came back from DataForSEO, even though only 1 passes our own check
  assert.equal(r.ideas.length, 1);
  assert.equal(r.total, 202);
});

test("sorting: by phrase, by volume (high first to start), by difficulty, with missing numbers always last", () => {
  const rows = [
    { keyword: "b", searchVolume: 50, difficulty: null },
    { keyword: "a", searchVolume: 1000, difficulty: 30 },
    { keyword: "c", searchVolume: null, difficulty: 5 },
    { keyword: "d", searchVolume: 50, difficulty: 5 },
  ];
  assert.deepEqual(sortIdeas(rows, null).map((r) => r.keyword), ["b", "a", "c", "d"]); // as returned
  assert.deepEqual(sortIdeas(rows, { key: "keyword", dir: "asc" }).map((r) => r.keyword), ["a", "b", "c", "d"]);
  assert.deepEqual(sortIdeas(rows, { key: "keyword", dir: "desc" }).map((r) => r.keyword), ["d", "c", "b", "a"]);
  assert.deepEqual(sortIdeas(rows, { key: "searchVolume", dir: "desc" }).map((r) => r.keyword), ["a", "b", "d", "c"]); // ties keep their order, null last
  assert.deepEqual(sortIdeas(rows, { key: "searchVolume", dir: "asc" }).map((r) => r.keyword), ["b", "d", "a", "c"]); // null still last
  assert.deepEqual(sortIdeas(rows, { key: "difficulty", dir: "asc" }).map((r) => r.keyword), ["c", "d", "a", "b"]);
  assert.deepEqual(sortIdeas(rows, { key: "difficulty", dir: "desc" }).map((r) => r.keyword), ["a", "c", "d", "b"]);
  assert.deepEqual(rows.map((r) => r.keyword), ["b", "a", "c", "d"]); // the input is not changed
});

test("clicking a header: volume starts high to low, others low to high, then each click flips", () => {
  assert.deepEqual(nextSort(null, "searchVolume"), { key: "searchVolume", dir: "desc" });
  assert.deepEqual(nextSort(null, "keyword"), { key: "keyword", dir: "asc" });
  assert.deepEqual(nextSort({ key: "keyword", dir: "asc" }, "keyword"), { key: "keyword", dir: "desc" });
  assert.deepEqual(nextSort({ key: "keyword", dir: "desc" }, "difficulty"), { key: "difficulty", dir: "asc" });
});

const kw = (keyword: string, o: Record<string, any> = {}) => ({
  keyword, position: null, checked_on: "2026-10-16", change: null, best: null, search_volume: null, difficulty: null, clicks: null, impressions: null, gsc_position: null, ...o,
});

test("main table sorting: position puts the best rank first, and unranked and unchecked go last", () => {
  const rows = [
    kw("not in top 100", { position: null, checked_on: "2026-10-16" }),
    kw("ranks 12", { position: 12 }),
    kw("never checked", { position: null, checked_on: null }),
    kw("ranks 3", { position: 3 }),
  ];
  assert.deepEqual(sortKeywordRows(rows, { key: "position", dir: "asc" }).map((r) => r.keyword), ["ranks 3", "ranks 12", "not in top 100", "never checked"]);
  assert.deepEqual(sortKeywordRows(rows, { key: "position", dir: "desc" }).map((r) => r.keyword), ["ranks 12", "ranks 3", "not in top 100", "never checked"]);
});

test("main table sorting: every column, with missing numbers always last and ties keeping their order", () => {
  const rows = [
    kw("a", { change: -2, best: 9, search_volume: 50, difficulty: 30, clicks: 4, impressions: 40, gsc_position: 8.5 }),
    kw("b", { change: 5, best: 2, search_volume: 500, difficulty: 10, clicks: 20, impressions: 90, gsc_position: 2.1 }),
    kw("c", { change: null, best: null, search_volume: null, difficulty: null, clicks: null, impressions: null, gsc_position: null }),
    kw("d", { change: 0, best: 2, search_volume: 500, difficulty: 55, clicks: 0, impressions: 5, gsc_position: 40 }),
  ];
  const order = (key: any, dir: "asc" | "desc") => sortKeywordRows(rows, { key, dir }).map((r) => r.keyword).join("");
  assert.equal(order("keyword", "asc"), "abcd");
  assert.equal(order("keyword", "desc"), "dcba");
  assert.equal(order("change", "desc"), "bdac");
  assert.equal(order("best", "asc"), "bdac"); // b and d tie at 2: original order
  assert.equal(order("searchVolume", "desc"), "bdac");
  assert.equal(order("searchVolume", "asc"), "abdc"); // b and d tie at 500 and keep their order; missing still last
  assert.equal(order("difficulty", "asc"), "badc");
  assert.equal(order("clicks", "desc"), "badc");
  assert.equal(order("impressions", "desc"), "badc");
  assert.equal(order("gscPosition", "asc"), "badc");
  assert.deepEqual(sortKeywordRows(rows, null).map((r) => r.keyword), ["a", "b", "c", "d"]); // no sort: server order
  assert.deepEqual(rows.map((r) => r.keyword), ["a", "b", "c", "d"]); // input not changed
});

test("main table header clicks: high-is-good columns start high to low, the rest low to high, then flip", () => {
  assert.deepEqual(nextKeywordSort(null, "searchVolume"), { key: "searchVolume", dir: "desc" });
  assert.deepEqual(nextKeywordSort(null, "change"), { key: "change", dir: "desc" });
  assert.deepEqual(nextKeywordSort(null, "clicks"), { key: "clicks", dir: "desc" });
  assert.deepEqual(nextKeywordSort(null, "position"), { key: "position", dir: "asc" });
  assert.deepEqual(nextKeywordSort(null, "difficulty"), { key: "difficulty", dir: "asc" });
  assert.deepEqual(nextKeywordSort({ key: "position", dir: "asc" }, "position"), { key: "position", dir: "desc" });
});
