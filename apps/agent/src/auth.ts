import { timingSafeEqual } from "node:crypto";

/** True only when ADMIN_TOKEN is configured and the Authorization header carries exactly that bearer token. */
export function isAdmin(authorization: string | undefined, adminToken: string | undefined): boolean {
  if (!adminToken || !authorization) return false;
  const match = /^Bearer (.+)$/.exec(authorization);
  if (!match || !match[1]) return false;
  const given = Buffer.from(match[1]);
  const wanted = Buffer.from(adminToken);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
