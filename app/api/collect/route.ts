import { createHash } from "node:crypto";
import { sql } from "@/lib/db";
import { cleanDomain, isoDay } from "@/lib/format";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview/i;

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith("." + domain);
}

export async function POST(req: Request) {
  const done = new Response(null, { status: 202, headers: cors });
  const ua = req.headers.get("user-agent") ?? "";
  if (BOT.test(ua)) return done;

  let data: { k?: string; p?: string; r?: string; w?: number };
  try {
    data = JSON.parse(await req.text());
  } catch {
    return new Response("bad request", { status: 400, headers: cors });
  }
  if (!data.k || typeof data.p !== "string") return new Response("bad request", { status: 400, headers: cors });

  const [site] = await sql<{ id: number; domain: string }[]>`SELECT id, domain FROM sites WHERE tracking_key = ${data.k}`;
  if (!site) return new Response("unknown site", { status: 404, headers: cors });

  // Only count views sent from the site itself.
  const origin = req.headers.get("origin");
  if (origin) {
    let host = "";
    try { host = cleanDomain(new URL(origin).host); } catch {}
    if (!hostMatches(host, site.domain)) return new Response("wrong origin", { status: 403, headers: cors });
  }

  let referrerHost: string | null = null;
  try {
    if (data.r) {
      const h = cleanDomain(new URL(data.r).host);
      if (!hostMatches(h, site.domain)) referrerHost = h;
    }
  } catch {}

  const w = Number(data.w) || 0;
  const device = w === 0 ? null : w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  const country = req.headers.get("x-vercel-ip-country");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  // No cookies: an anonymous visitor ID that resets every day.
  const visitorHash = createHash("sha256")
    .update(`${process.env.AUTH_SECRET}|${isoDay(new Date())}|${site.id}|${ip}|${ua}`)
    .digest("hex")
    .slice(0, 16);

  await sql`
    INSERT INTO pageviews (site_id, path, referrer_host, device, country, visitor_hash)
    VALUES (${site.id}, ${data.p.slice(0, 500)}, ${referrerHost}, ${device}, ${country}, ${visitorHash})`;
  return done;
}
