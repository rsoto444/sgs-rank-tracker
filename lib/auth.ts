import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export type User = { id: number; email: string; name: string; role: "admin" | "client" };

export const getUser = cache(async (): Promise<User | null> => {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [user] = await sql<User[]>`SELECT id, email, name, role FROM users WHERE id = ${session.uid}`;
  return user ?? null;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
