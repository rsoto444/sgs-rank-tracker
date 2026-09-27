import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import type { Site } from "@/lib/sites";
import PageTitle from "@/components/PageTitle";
import SiteForm from "@/components/SiteForm";
import CopyBox from "@/components/CopyBox";
import RemoveSiteForm from "@/components/RemoveSiteForm";

export default async function SiteSettings({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const [site] = await sql<Site[]>`SELECT * FROM sites WHERE id = ${id}`;
  if (!site) notFound();
  const isNew = (await searchParams).new === "1";

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const snippet = `<script defer src="${origin}/t.js" data-site="${site.tracking_key}"></script>`;
  const logins = await sql<{ email: string; name: string }[]>`
    SELECT u.email, u.name FROM users u JOIN site_access a ON a.user_id = u.id WHERE a.site_id = ${id} ORDER BY u.email`;

  return (
    <>
      <PageTitle title={site.name} sub={site.domain} />
      {isNew && <p className="card mb-5 p-3 text-sm text-good">Site added. Next: paste the tracking snippet below into the site, then add keywords.</p>}

      <section className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Tracking snippet</h2>
        <p className="mb-3 text-sm text-ink-2">
          Paste this into the site&apos;s &lt;head&gt; on every page. On WordPress, a header-scripts plugin does it. It counts visits
          without cookies, so no cookie banner is needed for it.
        </p>
        <CopyBox text={snippet} />
      </section>

      <section className="card mt-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Site settings</h2>
        <SiteForm site={site} />
      </section>

      {site.kind === "client" && (
        <section className="card mt-5 p-4">
          <h2 className="mb-2 text-sm font-semibold">Client logins for this site</h2>
          {logins.length === 0 ? (
            <p className="text-sm text-ink-3">Nobody yet. Add one on the Logins page.</p>
          ) : (
            <ul className="text-sm">{logins.map((l) => <li key={l.email}>{l.name || l.email} · {l.email}</li>)}</ul>
          )}
        </section>
      )}

      <section className="card mt-5 p-4">
        <h2 className="mb-2 text-sm font-semibold">Remove this site</h2>
        <RemoveSiteForm id={site.id} domain={site.domain} />
      </section>
    </>
  );
}
