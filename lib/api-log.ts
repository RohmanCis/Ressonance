import { randomUUID } from "node:crypto";

/**
 * Structured server-side error logging (TECHNICAL_DESIGN.md:219 —
 * "Errors must be logged with correlation IDs, without cookies, raw media,
 * or secrets").
 *
 * Emits ONE line of JSON via console.error: timestamp, level, event,
 * correlationId (x-request-id > x-vercel-id > generated UUID), method,
 * pathname-only path, response error code, message, stack (Errors only), and
 * optional safe context scalars. NEVER logs headers, cookies, bodies, tokens,
 * or media. `request` is optional: callers without one (lib-level cleanup
 * paths) omit method/path and still get a correlationId.
 */

export function correlationIdFrom(headers: Headers): string {
  return headers.get("x-request-id") ?? headers.get("x-vercel-id") ?? randomUUID();
}

export interface ApiLogEntry {
  /** Stable snake_case event name, e.g. "session_create_failed". */
  event: string;
  request?: Request;
  /** Response error code, e.g. "INTERNAL_ERROR". */
  code?: string;
  error: unknown;
  /** Extra safe scalars (e.g. storageKey). Never headers/cookies/body. */
  context?: Record<string, unknown>;
}

export function logApiError(entry: ApiLogEntry): void {
  const err = entry.error instanceof Error ? entry.error : undefined;
  const line: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: "error",
    event: entry.event,
    correlationId: entry.request
      ? correlationIdFrom(entry.request.headers)
      : randomUUID(),
  };
  if (entry.request) {
    line.method = entry.request.method;
    line.path = new URL(entry.request.url).pathname;
  }
  if (entry.code) line.code = entry.code;
  line.message = err ? err.message : String(entry.error);
  if (err?.stack) line.stack = err.stack;
  if (entry.context) Object.assign(line, entry.context);

  console.error(JSON.stringify(line));
}
