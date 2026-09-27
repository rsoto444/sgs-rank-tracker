// Runs before every build: creates tables, adds the two agency sites,
// and creates the first admin login from ADMIN_EMAIL / ADMIN_PASSWORD.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("setup: DATABASE_URL not set, skipping database setup");
  process.exit(0);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));

const agencySites = [
  { name: "Soto Growth Systems", domain: "sotogrowthsystems.com" },
  { name: "Provo SEO Pros", domain: "provoseopros.com" },
];
for (const s of agencySites) {
  await sql`
    INSERT INTO sites (name, domain, kind, gsc_property, tracking_key)
    VALUES (${s.name}, ${s.domain}, 'agency', ${"sc-domain:" + s.domain}, ${randomBytes(9).toString("base64url")})
    ON CONFLICT (domain) DO NOTHING`;
}

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (email && password) {
  const hash = await bcrypt.hash(password, 10);
  const rows = await sql`
    INSERT INTO users (email, name, password_hash, role)
    VALUES (${email}, 'Admin', ${hash}, 'admin')
    ON CONFLICT (email) DO NOTHING RETURNING id`;
  if (rows.length) console.log(`setup: created admin login ${email}`);
} else {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`;
  if (n === 0) console.log("setup: no admin yet - set ADMIN_EMAIL and ADMIN_PASSWORD");
}

await sql.end();
console.log("setup: database ready");
