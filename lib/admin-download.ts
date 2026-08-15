/**
 * Pure mapping helpers for the admin media download flow.
 * The download endpoint 302-redirects to a short-lived signed URL (Supabase Storage);
 * failures arrive as a JSON error envelope ({ error: { code } }). Keep this module
 * side-effect free so the response -> outcome mapping stays unit-testable.
 */

export type DownloadOutcome = "ok" | "error";

/** Classify the final fetch response (after the 302 redirect is followed). */
export function describeDownloadResponse(status: number): DownloadOutcome {
  return status >= 200 && status < 300 ? "ok" : "error";
}

/**
 * Map a server error code to a safe user-facing message.
 * Never surfaces raw envelope text; unknown/missing codes fall back to the default.
 */
export function downloadErrorMessage(code?: string): string {
  switch (code) {
    case "AUTHENTICATION_REQUIRED":
    case "AUTHENTICATION_FAILED":
      return "Your session may have expired. Sign in again.";
    case "FORBIDDEN":
    case "NOT_FOUND":
      return "This media is no longer available.";
    default:
      // MEDIA_ACCESS_FAILED, INTERNAL_ERROR, unknown codes, network errors
      return "Download failed. Try again.";
  }
}

/** Extract the error code from a parsed response body, defaulting safely. */
export function downloadErrorCode(status: number, body: unknown): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  if (typeof code === "string" && code !== "") return code;
  return status === 401 ? "AUTHENTICATION_REQUIRED" : "INTERNAL_ERROR";
}

/** Safely read a failed download response: non-JSON/garbage body -> INTERNAL_ERROR. */
export async function downloadErrorCodeFromResponse(response: Response): Promise<string> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return downloadErrorCode(response.status, body);
}
