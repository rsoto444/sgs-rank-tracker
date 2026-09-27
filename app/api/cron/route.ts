import { syncAll } from "@/lib/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Runs once a day (see vercel.json). Vercel sends CRON_SECRET as a Bearer token.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const sites = await syncAll();
  return Response.json({ ok: true, sites });
}
