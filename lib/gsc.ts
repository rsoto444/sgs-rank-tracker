import { googleFetch } from "./google";

export type GscRow = { day: string; query: string; clicks: number; impressions: number; position: number };

/** Every query the property showed up for, per day, between two dates (inclusive). */
export async function fetchGscQueries(property: string, startDate: string, endDate: string): Promise<GscRow[]> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const out: GscRow[] = [];
  const pageSize = 25000;
  for (let startRow = 0; ; startRow += pageSize) {
    const body = await googleFetch(url, {
      startDate,
      endDate,
      dimensions: ["date", "query"],
      rowLimit: pageSize,
      startRow,
    });
    const rows: { keys: [string, string]; clicks: number; impressions: number; position: number }[] = body.rows ?? [];
    for (const r of rows) {
      out.push({ day: r.keys[0], query: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: r.position });
    }
    if (rows.length < pageSize) return out;
  }
}
