import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Database, UserDoc } from "./db";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const SESSION_COOKIE = "octo_session";

/** scrypt with a random salt, encoded as scrypt$N$r$p$salt$hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: Database, userId: string, ttlDays: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  await db.sessions.insertOne({ _id: tokenHash(token), userId, createdAt: new Date(), expiresAt });
  return { token, expiresAt };
}

export async function deleteSession(db: Database, token: string | undefined): Promise<void> {
  if (token) await db.sessions.deleteOne({ _id: tokenHash(token) });
}

export async function userForToken(db: Database, token: string | undefined): Promise<UserDoc | null> {
  if (!token) return null;
  const session = await db.sessions.findOne({ _id: tokenHash(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  return db.users.findOne({ _id: session.userId });
}

export function newUserId(): string {
  return randomUUID();
}

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;

export function publicUser(u: UserDoc) {
  return { id: u._id, email: u.email, name: u.name };
}

declare module "fastify" {
  interface FastifyRequest {
    user?: UserDoc;
  }
}

/** Rejects requests without a valid session. Attach to every protected route. */
export function requireUser(db: Database) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await userForToken(db, request.cookies[SESSION_COOKIE]);
    if (!user) return reply.code(401).send({ error: "Sign in to continue." });
    request.user = user;
  };
}
