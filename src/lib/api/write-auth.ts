import { NextResponse } from "next/server";

/**
 * Shared write secret for mutating APIs (replacements PUT, model upload).
 * Client sends the same value via NEXT_PUBLIC_REPLACEMENTS_WRITE_SECRET.
 */
export function getWriteSecret(): string | null {
  const secret = process.env.REPLACEMENTS_WRITE_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

export function extractClientWriteKey(request: Request): string | null {
  const headerKey = request.headers.get("x-api-key")?.trim();
  if (headerKey) return headerKey;

  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim() || null;
}

/**
 * When REPLACEMENTS_WRITE_SECRET is unset, writes are allowed (local POC).
 * When set, the request must present a matching key.
 */
export function assertWriteAuthorized(request: Request): NextResponse | null {
  const expected = getWriteSecret();
  if (!expected) return null;

  const provided = extractClientWriteKey(request);
  if (provided === expected) return null;

  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}
