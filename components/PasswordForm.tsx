"use client";
import { useActionState } from "react";
import { changePassword } from "@/app/(app)/actions";
import FormMessage from "./FormMessage";

export default function PasswordForm() {
  const [message, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="max-w-sm space-y-3">
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input className="input" id="current" name="current" type="password" required autoComplete="current-password" />
      </div>
      <div>
        <label className="label" htmlFor="next">New password (10+ characters)</label>
        <input className="input" id="next" name="next" type="password" required minLength={10} autoComplete="new-password" />
      </div>
      <button className="btn" disabled={pending}>{pending ? "Saving..." : "Change password"}</button>
      <FormMessage message={message} />
    </form>
  );
}
