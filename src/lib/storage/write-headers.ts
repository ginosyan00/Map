/**
 * Client-side write auth headers for mutating API calls.
 * Uses NEXT_PUBLIC_REPLACEMENTS_WRITE_SECRET (same value as server REPLACEMENTS_WRITE_SECRET).
 */
export function getClientWriteHeaders(): HeadersInit {
  const secret = process.env.NEXT_PUBLIC_REPLACEMENTS_WRITE_SECRET?.trim();
  if (!secret) return {};
  return {
    Authorization: `Bearer ${secret}`,
    "x-api-key": secret,
  };
}
