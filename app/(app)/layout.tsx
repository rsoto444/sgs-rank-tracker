import Link from "next/link";
import { LogOut } from "lucide-react";
import { getContext } from "@/lib/sites";
import SiteSwitcher from "@/components/SiteSwitcher";
import Nav from "@/components/Nav";
import { logout } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, sites, site } = await getContext();
  const isAdmin = user.role === "admin";
  const links = [
    { href: "/", label: "Overview" },
    { href: "/keywords", label: "Keywords" },
    { href: "/visitors", label: "Visitors" },
    ...(isAdmin
      ? [
          { href: "/settings/sites", label: "Sites" },
          { href: "/settings/users", label: "Logins" },
          { href: "/settings/connections", label: "Connections" },
        ]
      : []),
    { href: "/account", label: "Account" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
              <rect width="32" height="32" rx="7" fill="var(--accent)" />
              <path d="M7 22l6-6 4 4 8-9" stroke="var(--surface)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">SGS Rank Tracker</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {sites.length > 0 && <SiteSwitcher sites={sites} activeId={site?.id ?? null} isAdmin={isAdmin} />}
            <form action={logout}>
              <button className="rounded-lg p-2 text-ink-2 hover:bg-bg hover:text-ink" title="Sign out" aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          <Nav links={links} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
