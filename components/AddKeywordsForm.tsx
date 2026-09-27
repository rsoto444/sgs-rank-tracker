"use client";
import { useActionState } from "react";
import { addKeywords } from "@/app/(app)/actions";
import FormMessage from "./FormMessage";

export default function AddKeywordsForm({ canCheck }: { canCheck: boolean }) {
  const [message, action, pending] = useActionState(addKeywords, null);
  return (
    <form action={action} className="card space-y-3 p-4">
      <div>
        <label className="label" htmlFor="keywords">Add keywords - one per line</label>
        <textarea id="keywords" name="keywords" rows={4} className="input" placeholder={"appointment setting agency\nseo company provo"} />
      </div>
      {canCheck && (
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" name="check" defaultChecked /> Check their Google position right away
        </label>
      )}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Adding..." : "Add keywords"}</button>
        <FormMessage message={message} />
      </div>
    </form>
  );
}
