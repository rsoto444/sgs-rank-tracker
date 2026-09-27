"use server";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { ACTIVE_SITE_COOKIE, canAccess, getContext, type Site } from "@/lib/sites";
import { syncAll, syncGa4, syncGsc, syncRanks } from "@/lib/sync";
import { cleanDomain } from "@/lib/format";

export async function setActiveSite(siteId: number) {
  const user = await requireUser();
  if (!(await canAccess(user, siteId))) return;
  (await cookies()).set(ACTIVE_SITE_COOKIE, String(siteId), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

async function activeSiteForAdmin() {
  await requireAdmin();
  const { site } = await getContext();
  if (!site) throw new Error("No site selected");
  return site;
}

// ---------- keywords ----------

export async function addKeywords(_: string | null, form: FormData) {
  const site = await activeSiteForAdmin();
  const list = String(form.get("keywords") ?? "")
    .split(/\r?\n|,/)
    .map((k) => k.trim().toLowerCase().replace(/\s+/g, " "))
    .filter((k) => k.length > 0 && k.length <= 200);
  const unique = [...new Set(list)];
  if (!unique.length) return "Type at least one keyword.";
  const added = await sql<{ id: number }[]>`
    INSERT INTO keywords ${sql(unique.map((keyword) => ({ site_id: site.id, keyword })))}
    ON CONFLICT DO NOTHING RETURNING id`;
  if (form.get("check") === "on" && added.length) {
    await syncRanks(site, { onlyKeywordIds: added.map((a) => a.id) });
  }
  revalidatePath("/keywords");
  const skipped = unique.length - added.length;
  return `Added ${added.length} keyword${added.length === 1 ? "" : "s"}${skipped ? ` (${skipped} already tracked)` : ""}.`;
}

export async function trackQuery(query: string) {
  const site = await activeSiteForAdmin();
  await sql`INSERT INTO keywords (site_id, keyword) VALUES (${site.id}, ${query.trim().toLowerCase()}) ON CONFLICT DO NOTHING`;
  revalidatePath("/keywords");
}

export async function removeKeyword(keywordId: number) {
  const site = await activeSiteForAdmin();
  await sql`DELETE FROM keywords WHERE id = ${keywordId} AND site_id = ${site.id}`;
  revalidatePath("/keywords");
  redirect("/keywords");
}

export async function checkRanksNow() {
  const site = await activeSiteForAdmin();
  await syncRanks(site);
  revalidatePath("/", "layout");
}

export async function refreshGoogleNow() {
  const site = await activeSiteForAdmin();
  await Promise.all([syncGsc(site), syncGa4(site)]);
  revalidatePath("/", "layout");
}

export async function refreshEverythingNow() {
  await requireAdmin();
  await syncAll();
  revalidatePath("/", "layout");
}

// ---------- sites ----------

export async function saveSite(_: string | null, form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id")) || null;
  const name = String(form.get("name") ?? "").trim();
  const domain = cleanDomain(String(form.get("domain") ?? ""));
  const kind = form.get("kind") === "agency" ? "agency" : "client";
  const gsc = String(form.get("gsc_property") ?? "").trim() || null;
  const ga4 = String(form.get("ga4_property_id") ?? "").trim().replace(/^properties\//, "") || null;
  const location = Number(form.get("location_code")) || 2840;
  const language = String(form.get("language_code") ?? "en").trim() || "en";

  if (!name) return "Give the site a name.";
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return "That doesn't look like a domain. Example: example.com";
  if (ga4 && !/^\d+$/.test(ga4)) return "The GA4 property ID is only numbers, like 412345678.";

  try {
    if (id) {
      await sql`
        UPDATE sites SET name = ${name}, domain = ${domain}, kind = ${kind}, gsc_property = ${gsc},
          ga4_property_id = ${ga4}, location_code = ${location}, language_code = ${language}
        WHERE id = ${id}`;
    } else {
      const [site] = await sql<Site[]>`
        INSERT INTO sites (name, domain, kind, gsc_property, ga4_property_id, location_code, language_code, tracking_key)
        VALUES (${name}, ${domain}, ${kind}, ${gsc ?? "sc-domain:" + domain}, ${ga4}, ${location}, ${language},
                ${randomBytes(9).toString("base64url")})
        RETURNING *`;
      await setActiveSite(site.id);
      revalidatePath("/", "layout");
      redirect(`/settings/sites/${site.id}?new=1`);
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return "That domain is already added.";
    throw e;
  }
  revalidatePath("/", "layout");
  return "Saved.";
}

export async function removeSite(_: string | null, form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const confirm = cleanDomain(String(form.get("confirm") ?? ""));
  const [site] = await sql<Site[]>`SELECT * FROM sites WHERE id = ${id}`;
  if (!site) return "Site not found.";
  if (confirm !== site.domain) return `Type ${site.domain} to confirm.`;
  await sql`DELETE FROM sites WHERE id = ${id}`;
  revalidatePath("/", "layout");
  redirect("/settings/sites");
}

// ---------- users ----------

export async function saveUser(_: string | null, form: FormData) {
  const admin = await requireAdmin();
  const id = Number(form.get("id")) || null;
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const role = form.get("role") === "admin" ? "admin" : "client";
  const password = String(form.get("password") ?? "");
  const siteIds = form.getAll("sites").map(Number).filter(Boolean);

  if (!id && !/^\S+@\S+\.\S+$/.test(email)) return "Enter a valid email.";
  if (!id && password.length < 10) return "Temporary password needs at least 10 characters.";
  if (id && password && password.length < 10) return "New password needs at least 10 characters.";
  if (id === admin.id && role !== "admin") return "You can't remove your own admin access.";

  let userId = id;
  try {
    if (id) {
      await sql`UPDATE users SET name = ${name}, role = ${role} WHERE id = ${id}`;
      if (password) await sql`UPDATE users SET password_hash = ${await bcrypt.hash(password, 10)} WHERE id = ${id}`;
    } else {
      const [u] = await sql<{ id: number }[]>`
        INSERT INTO users (email, name, role, password_hash)
        VALUES (${email}, ${name}, ${role}, ${await bcrypt.hash(password, 10)}) RETURNING id`;
      userId = u.id;
    }
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return "Someone already has that email.";
    throw e;
  }
  await sql`DELETE FROM site_access WHERE user_id = ${userId}`;
  if (siteIds.length) {
    await sql`INSERT INTO site_access ${sql(siteIds.map((site_id) => ({ user_id: userId!, site_id })))}`;
  }
  revalidatePath("/settings/users");
  return id ? "Saved." : `Login created for ${email}. Send them the app link, their email and the temporary password.`;
}

export async function removeUser(userId: number) {
  const admin = await requireAdmin();
  if (userId === admin.id) return;
  await sql`DELETE FROM users WHERE id = ${userId}`;
  revalidatePath("/settings/users");
}

export async function changePassword(_: string | null, form: FormData) {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const [row] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE id = ${user.id}`;
  if (!(await bcrypt.compare(current, row.password_hash))) return "Your current password is wrong.";
  if (next.length < 10) return "New password needs at least 10 characters.";
  await sql`UPDATE users SET password_hash = ${await bcrypt.hash(next, 10)} WHERE id = ${user.id}`;
  return "Password changed.";
}
