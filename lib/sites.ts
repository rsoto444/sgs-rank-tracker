import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { sql } from "./db";
import { requireUser, type User } from "./auth";

export const ACTIVE_SITE_COOKIE = "sgs_site";

export type Site = {
  id: number;
  name: string;
  domain: string;
  kind: "agency" | "client";
  gsc_property: string | null;
  ga4_property_id: string | null;
  tracking_key: string;
  location_code: number;
  language_code: string;
};

export async function sitesFor(user: User): Promise<Site[]> {
  if (user.role === "admin") {
    return sql<Site[]>`SELECT * FROM sites ORDER BY kind = 'client', name`;
  }
  return sql<Site[]>`
    SELECT s.* FROM sites s JOIN site_access a ON a.site_id = s.id
    WHERE a.user_id = ${user.id} ORDER BY s.kind = 'client', s.name`;
}

export async function canAccess(user: User, siteId: number) {
  const sites = await sitesFor(user);
  return sites.some((s) => s.id === siteId);
}

/** The signed-in user, every site they can see, and the one picked in the dropdown. */
export const getContext = cache(async () => {
  const user = await requireUser();
  const sites = await sitesFor(user);
  const wanted = Number((await cookies()).get(ACTIVE_SITE_COOKIE)?.value);
  const site = sites.find((s) => s.id === wanted) ?? sites[0] ?? null;
  return { user, sites, site };
});
