// DataForSEO SERP API: checks where a domain sits in Google's top 100 for one keyword.
// Docs: https://docs.dataforseo.com/v3/serp/google/organic/live/regular/

const API = process.env.DATAFORSEO_API_URL ?? "https://api.dataforseo.com";

export function dataForSeoConnected() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

type SerpItem = { type: string; rank_group: number; domain?: string; url?: string };

export type RankResult = { position: number | null; url: string | null };

function matchesDomain(itemDomain: string | undefined, domain: string) {
  if (!itemDomain) return false;
  const d = itemDomain.toLowerCase().replace(/^www\./, "");
  return d === domain || d.endsWith("." + domain);
}

export async function checkRank(
  keyword: string,
  domain: string,
  locationCode: number,
  languageCode: string,
): Promise<RankResult> {
  const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
  const res = await fetch(`${API}/v3/serp/google/organic/live/regular`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ keyword, location_code: locationCode, language_code: languageCode, depth: 100 }]),
  });
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
  const body = await res.json();
  if (body.status_code !== 20000) throw new Error(`DataForSEO: ${body.status_message}`);
  const task = body.tasks?.[0];
  if (task?.status_code !== 20000) throw new Error(`DataForSEO: ${task?.status_message ?? "no task returned"}`);

  const items: SerpItem[] = task.result?.[0]?.items ?? [];
  const hit = items.find((i) => i.type === "organic" && matchesDomain(i.domain, domain));
  return hit ? { position: hit.rank_group, url: hit.url ?? null } : { position: null, url: null };
}
