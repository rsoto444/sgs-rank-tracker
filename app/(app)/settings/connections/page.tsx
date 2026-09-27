import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import { dataForSeoConnected } from "@/lib/dataforseo";
import { serviceAccount } from "@/lib/google";
import PageTitle from "@/components/PageTitle";
import ActionButton from "@/components/ActionButton";
import CopyBox from "@/components/CopyBox";
import { refreshEverythingNow } from "../../actions";

function Status({ ok }: { ok: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "text-good" : "text-ink-3"}`} style={{ background: "var(--bg)" }}>
      {ok ? "✓ Connected" : "○ Not connected"}
    </span>
  );
}

const SOURCE_NAMES: Record<string, string> = { dataforseo: "Rank checks", gsc: "Search Console", ga4: "Google Analytics" };

export default async function ConnectionsPage() {
  await requireAdmin();
  const dfs = dataForSeoConnected();
  const sa = serviceAccount();
  const logs = await sql<{ name: string; source: string; ran_at: Date; ok: boolean; message: string }[]>`
    SELECT s.name, l.source, l.ran_at, l.ok, l.message FROM sync_log l JOIN sites s ON s.id = l.site_id
    ORDER BY s.name, l.source`;

  return (
    <>
      <PageTitle title="Connections" sub="Where the numbers come from. Everything refreshes by itself once a day.">
        <ActionButton action={refreshEverythingNow} pendingText="Refreshing every site...">Refresh everything now</ActionButton>
      </PageTitle>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">DataForSEO - daily Google positions</h2>
            <Status ok={dfs} />
          </div>
          <p className="text-sm text-ink-2">
            {dfs
              ? "Every tracked keyword gets checked once a day on the cheaper Standard Queue. Results land within an hour of the morning run. The Check positions now button uses Live mode: instant, but about 3 times the price."
              : "Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in Vercel, under Settings then Environment Variables, then redeploy."}
          </p>
        </section>

        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Google - Search Console and GA4</h2>
            <Status ok={!!sa} />
          </div>
          {sa ? (
            <>
              <p className="mb-2 text-sm text-ink-2">
                For each site, add this email as a user: in Search Console (Settings, Users and permissions, Restricted is enough) and in GA4
                (Admin, Property access management, Viewer).
              </p>
              <CopyBox text={sa.client_email} />
            </>
          ) : (
            <p className="text-sm text-ink-2">Add GOOGLE_SERVICE_ACCOUNT_JSON in Vercel, then redeploy.</p>
          )}
        </section>
      </div>

      <section className="card mt-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Last refresh per site</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing has refreshed yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {logs.map((l) => (
              <li key={l.name + l.source} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                <span>
                  <span className="font-medium">{l.name}</span> <span className="text-ink-3">· {SOURCE_NAMES[l.source]}</span>
                </span>
                <span className={l.ok ? "text-ink-2" : "text-bad"}>
                  {l.ok ? "✓" : "✕"} {l.message} ·{" "}
                  {l.ran_at.toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
