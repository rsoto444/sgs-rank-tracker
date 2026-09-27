import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import PageTitle from "@/components/PageTitle";
import SiteForm from "@/components/SiteForm";

export default async function SitesPage() {
  await requireAdmin();
  const sites = await sql<{ id: number; name: string; domain: string; kind: string; keywords: number; logins: number }[]>`
    SELECT s.id, s.name, s.domain, s.kind,
      (SELECT count(*)::int FROM keywords k WHERE k.site_id = s.id) AS keywords,
      (SELECT count(*)::int FROM site_access a WHERE a.site_id = s.id) AS logins
    FROM sites s ORDER BY s.kind = 'client', s.name`;

  const group = (kind: string, title: string) => {
    const list = sites.filter((s) => s.kind === kind);
    return (
      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold">{title}</h2>
        {list.length === 0 ? (
          <p className="text-sm text-ink-3">None yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {list.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block font-medium">{s.name}</span>
                  <span className="text-xs text-ink-3">
                    {s.domain} · {s.keywords} keywords{kind === "client" ? ` · ${s.logins} client logins` : ""}
                  </span>
                </span>
                <Link href={`/settings/sites/${s.id}`} className="btn-ghost shrink-0 py-1 text-xs">Settings</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <>
      <PageTitle title="Sites" sub="Every site in the dropdown" />
      <div className="grid gap-5 md:grid-cols-2">
        {group("agency", "Agency sites")}
        {group("client", "Client sites")}
      </div>
      <section id="add" className="card mt-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Add a site</h2>
        <SiteForm />
      </section>
    </>
  );
}
