// Edge-safe session helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sgs_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = { uid: number };

export async function signSession(uid: number) {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return typeof payload.uid === "number" ? { uid: payload.uid } : null;
  } catch {
    return null;
  }
}

/** secure follows the real connection, so local http testing still works. */
export function sessionCookieOptions(https: boolean) {
  return { httpOnly: true, secure: https, sameSite: "lax" as const, path: "/", maxAge: MAX_AGE };
}
