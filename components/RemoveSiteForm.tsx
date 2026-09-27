"use client";
import { useActionState } from "react";
import { removeSite } from "@/app/(app)/actions";
import FormMessage from "./FormMessage";

export default function RemoveSiteForm({ id, domain }: { id: number; domain: string }) {
  const [message, action, pending] = useActionState(removeSite, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <p className="text-sm text-ink-2">
        This removes the site, its keywords and all its history for good. Type <strong>{domain}</strong> to confirm.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" name="confirm" autoComplete="off" />
        <button className="btn-ghost text-bad" disabled={pending}>{pending ? "Removing..." : "Remove site"}</button>
      </div>
      <FormMessage message={message} />
    </form>
  );
}
