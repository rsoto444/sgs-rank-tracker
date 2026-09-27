"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${
              active ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
