import { NextRequest, NextResponse } from "next/server";

import { logApiError } from "@/lib/api-log";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/admin/auth/sign-in — Admin sign-in (API Contract 5.1).
 * Passes email/password to Supabase Auth email/password sign-in. The SSR
 * server client persists the established session as secure cookies; the API
 * never returns Supabase access/refresh tokens as JSON. Success returns the
 * exact `{ admin: { email } }` shape.
 */

function readCredentials(body: unknown): { ok: false } | { ok: true; email: string; password: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false };
  }
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== "string" || email.length === 0 || typeof password !== "string" || password.length === 0) {
    return { ok: false };
  }
  return { ok: true, email, password };
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType)) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Content-Type must be application/json." } },
      { status: 400 },
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch (err) {
    logApiError({ event: "request_body_parse_failed", request, code: "INVALID_REQUEST", error: err });
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Malformed request body." } },
      { status: 400 },
    );
  }

  let body: unknown;
  if (raw.trim().length === 0) {
    body = {};
  } else {
    try {
      body = JSON.parse(raw);
    } catch (err) {
      logApiError({ event: "request_body_parse_failed", request, code: "INVALID_REQUEST", error: err });
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: "Malformed JSON request body." } },
        { status: 400 },
      );
    }
  }

  const credentials = readCredentials(body);
  if (!credentials.ok) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Email and password are required." } },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: { code: "AUTHENTICATION_FAILED", message: "Invalid email or password." } },
        { status: 401 },
      );
    }

    return NextResponse.json({ admin: { email: data.user.email ?? credentials.email } }, { status: 200 });
  } catch (err) {
    logApiError({ event: "admin_sign_in_failed", request, code: "INTERNAL_ERROR", error: err });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
      { status: 500 },
    );
  }
}