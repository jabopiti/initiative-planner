/** Stable, client-generated ids (§6) — UUID v4 via the Web Crypto API. */
export function newId(): string {
  return crypto.randomUUID();
}
