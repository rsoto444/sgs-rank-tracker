import Link from "next/link";

export default function NoSite({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="card p-6 text-sm">
      <h1 className="mb-1 text-lg font-semibold">No site to show yet</h1>
      {isAdmin ? (
        <p className="text-ink-2">
          Add your first site on the <Link className="text-accent underline" href="/settings/sites">Sites</Link> page.
        </p>
      ) : (
        <p className="text-ink-2">Your account hasn't been linked to a site yet. Ask your SGS contact to add you.</p>
      )}
    </div>
  );
}
