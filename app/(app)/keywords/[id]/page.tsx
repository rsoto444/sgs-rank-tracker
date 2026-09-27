import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { getContext } from "@/lib/sites";
import { daysAgo, fmtDate, isoDay } from "@/lib/format";
import LineChart from "@/components/LineChart";
import PageTitle from "@/components/PageTitle";
import ActionButton from "@/components/ActionButton";
import { PositionBadge } from "@/components/Position";
import { removeKeyword } from "../../actions";

export default async function KeywordPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, site } = await getContext();
  const id = Number((await params).id);
  if (!site || !id) notFound();
  const [keyword] = await sql<{ id: number; keyword: string }[]>`
    SELECT id, keyword FROM keywords WHERE id = ${id} AND site_id = ${site.id}`;
  if (!keyword) notFound();

  const range = 90;
  const start = isoDay(daysAgo(range - 1));
  const [checks, gsc] = await Promise.all([
    sql<{ day: string; position: number | null; url: string | null }[]>`
      SELECT checked_on::text AS day, position, url FROM rank_checks
      WHERE keyword_id = ${id} AND checked_on >= ${start} ORDER BY checked_on`,
    sql<{ day: string; position: number }[]>`
      SELECT day::text, (sum(position * impressions) / nullif(sum(impressions), 0))::float8 AS position
      FROM gsc_queries WHERE site_id = ${site.id} AND lower(query) = lower(${keyword.keyword}) AND day >= ${start}
      GROUP BY day ORDER BY day`,
  ]);

  const days = Array.from({ length: range }, (_, i) => isoDay(daysAgo(range - 1 - i)));
  const byDay = new Map(checks.map((c) => [c.day, c.position]));
  const gscByDay = new Map(gsc.map((g) => [g.day, g.position ? Math.round(g.position * 10) / 10 : null]));
  const latest = checks.at(-1);

  return (
    <>
      <PageTitle title={keyword.keyword} sub={`${site.domain} · last 90 days`}>
        <Link href="/keywords" className="btn-ghost">Back to keywords</Link>
        {user.role === "admin" && (
          <ActionButton
            action={removeKeyword.bind(null, id)}
            confirm={`Stop tracking "${keyword.keyword}"? Its ranking history will be removed too.`}
            pendingText="Removing..."
          >
            Stop tracking
          </ActionButton>
        )}
      </PageTitle>

      <div className="card mb-5 p-4 text-sm">
        {latest ? (
          <p>
            <PositionBadge position={latest.position} /> on {fmtDate(latest.day)}
            {latest.url && (
              <>
                {" "}with{" "}
                <a className="text-accent underline" href={latest.url} target="_blank" rel="noreferrer">
                  {latest.url.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </>
            )}
          </p>
        ) : (
          <p className="text-ink-3">No position check yet.</p>
        )}
      </div>

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Google position over time</h2>
        <p className="mb-3 text-xs text-ink-3">Higher on the chart is better. Gaps mean not in the top 100 that day.</p>
        <LineChart
          invert
          days={days}
          series={[
            { name: "Daily check", color: "var(--series-1)", points: days.map((d) => byDay.get(d) ?? null) },
            { name: "Search Console avg", color: "var(--series-2)", points: days.map((d) => gscByDay.get(d) ?? null) },
          ]}
          unit="position"
        />
      </section>
    </>
  );
}
