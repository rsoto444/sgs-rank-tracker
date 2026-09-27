"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveSite } from "@/app/(app)/actions";

type Option = { id: number; name: string; domain: string; kind: "agency" | "client" };

export default function SiteSwitcher({ sites, activeId, isAdmin }: { sites: Option[]; activeId: number | null; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const agency = sites.filter((s) => s.kind === "agency");
  const clients = sites.filter((s) => s.kind === "client");

  function onChange(value: string) {
    if (value === "new") return router.push("/settings/sites#add");
    start(async () => {
      await setActiveSite(Number(value));
      router.refresh();
    });
  }

  const option = (s: Option) => (
    <option key={s.id} value={s.id}>
      {s.name} - {s.domain}
    </option>
  );

  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="sr-only">Active site</span>
      <select
        className="input max-w-[min(22rem,70vw)] truncate py-1.5 font-medium"
        value={activeId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        aria-busy={pending}
      >
        {agency.length > 0 && <optgroup label="Agency">{agency.map(option)}</optgroup>}
        {clients.length > 0 && <optgroup label="Clients">{clients.map(option)}</optgroup>}
        {isAdmin && <option value="new">+ Add a client site</option>}
      </select>
    </label>
  );
}
