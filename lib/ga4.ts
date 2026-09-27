import { googleFetch } from "./google";

export type Ga4Daily = { day: string; users: number; sessions: number; pageviews: number };
export type Ga4Breakdown = { day: string; dimension: string; value: string; count: number };

const BREAKDOWNS = [
  { dimension: "page", ga: "pagePath", metric: "screenPageViews" },
  { dimension: "source", ga: "sessionSource", metric: "sessions" },
  { dimension: "device", ga: "deviceCategory", metric: "activeUsers" },
  { dimension: "country", ga: "country", metric: "activeUsers" },
];

const toDay = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

async function runReport(propertyId: string, body: object) {
  const id = propertyId.replace(/^properties\//, "");
  return googleFetch(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, body);
}

type Row = { dimensionValues: { value: string }[]; metricValues: { value: string }[] };

export async function fetchGa4(propertyId: string, startDate: string, endDate: string) {
  const dateRanges = [{ startDate, endDate }];
  const totals = await runReport(propertyId, {
    dateRanges,
    dimensions: [{ name: "date" }],
    metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
    limit: 1000,
  });
  const daily: Ga4Daily[] = ((totals.rows ?? []) as Row[]).map((r) => ({
    day: toDay(r.dimensionValues[0].value),
    users: Number(r.metricValues[0].value),
    sessions: Number(r.metricValues[1].value),
    pageviews: Number(r.metricValues[2].value),
  }));

  const breakdowns: Ga4Breakdown[] = [];
  for (const b of BREAKDOWNS) {
    const report = await runReport(propertyId, {
      dateRanges,
      dimensions: [{ name: "date" }, { name: b.ga }],
      metrics: [{ name: b.metric }],
      limit: 10000,
    });
    for (const r of (report.rows ?? []) as Row[]) {
      breakdowns.push({
        day: toDay(r.dimensionValues[0].value),
        dimension: b.dimension,
        value: r.dimensionValues[1].value || "(not set)",
        count: Number(r.metricValues[0].value),
      });
    }
  }
  return { daily, breakdowns };
}
