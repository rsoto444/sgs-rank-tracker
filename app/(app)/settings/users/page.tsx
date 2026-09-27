import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";
import PageTitle from "@/components/PageTitle";
import UserForm from "@/components/UserForm";
import ActionButton from "@/components/ActionButton";
import { removeUser } from "../../actions";

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, sites] = await Promise.all([
    sql<{ id: number; email: string; name: string; role: string; site_ids: number[] }[]>`
      SELECT u.id, u.email, u.name, u.role,
        coalesce(array_agg(a.site_id) FILTER (WHERE a.site_id IS NOT NULL), '{}') AS site_ids
      FROM users u LEFT JOIN site_access a ON a.user_id = u.id
      GROUP BY u.id ORDER BY u.role, u.email`,
    sql<{ id: number; name: string; domain: string; kind: string }[]>`SELECT id, name, domain, kind FROM sites ORDER BY name`,
  ]);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));

  return (
    <>
      <PageTitle title="Logins" sub="SGS team logins see every site. Client logins only see the sites you tick." />
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Create a login</h2>
        <UserForm sites={sites} />
      </section>

      <div className="mt-5 space-y-3">
        {users.map((u) => (
          <details key={u.id} className="card p-4">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-medium">{u.name || u.email}</span>
                <span className="ml-2 text-xs text-ink-3">{u.email}</span>
              </span>
              <span className="text-xs text-ink-2">
                {u.role === "admin"
                  ? "SGS team · all sites"
                  : u.site_ids.length
                    ? u.site_ids.map((id) => siteName.get(id)).join(", ")
                    : "No sites yet"}
              </span>
            </summary>
            <div className="mt-4 border-t border-line pt-4">
              <UserForm sites={sites} user={{ ...u, siteIds: u.site_ids }} />
              {u.id !== me.id && (
                <div className="mt-3">
                  <ActionButton action={removeUser.bind(null, u.id)} confirm={`Remove the login for ${u.email}?`} className="btn-ghost text-bad">
                    Remove login
                  </ActionButton>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
