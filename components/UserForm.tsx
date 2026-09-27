"use client";
import { useActionState } from "react";
import { saveUser } from "@/app/(app)/actions";
import FormMessage from "./FormMessage";

type Props = {
  sites: { id: number; name: string; domain: string; kind: string }[];
  user?: { id: number; email: string; name: string; role: string; siteIds: number[] };
};

export default function UserForm({ sites, user }: Props) {
  const [message, action, pending] = useActionState(saveUser, null);
  const clientSites = sites.filter((s) => s.kind === "client");
  return (
    <form action={action} className="space-y-3">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Email</label>
          <input className="input" name="email" type="email" defaultValue={user?.email} disabled={!!user} required={!user} />
        </div>
        <div>
          <label className="label">Name</label>
          <input className="input" name="name" defaultValue={user?.name} />
        </div>
        <div>
          <label className="label">Access</label>
          <select className="input" name="role" defaultValue={user?.role ?? "client"}>
            <option value="client">Client - only the sites ticked below</option>
            <option value="admin">SGS team - every site, can change settings</option>
          </select>
        </div>
        <div>
          <label className="label">{user ? "New password (leave blank to keep)" : "Temporary password"}</label>
          <input className="input" name="password" type="text" autoComplete="new-password" minLength={10} required={!user} />
        </div>
      </div>
      {clientSites.length > 0 && (
        <fieldset>
          <legend className="label">Client sites they can see</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {clientSites.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sites" value={s.id} defaultChecked={user?.siteIds.includes(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Saving..." : user ? "Save" : "Create login"}</button>
        <FormMessage message={message} />
      </div>
    </form>
  );
}
