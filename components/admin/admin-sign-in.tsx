"use client";

import { FormEvent, useState } from "react";
import { api, Button, Shell, Status } from "./admin-ui";

const errorText: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Sign-in is required.",
  AUTHENTICATION_FAILED: "Those credentials were not accepted.",
  RATE_LIMITED: "Too many requests. Try again later.",
  INTERNAL_ERROR: "The service could not complete that request.",
};

export function AdminSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      // UI_UX §5.5: after successful sign-in, land on the event index.
      window.location.href = "/admin";
    } catch (e) {
      setError(errorText[(e as Error).message] ?? ((e as Error).message === "OFFLINE" ? "You appear offline. Check your connection, then retry." : "Sign-in failed. Check your details and retry."));
      setBusy(false);
    }
  }

  return (
    <Shell title="Admin" eyebrow="Admin sign-in">
      <div className="mx-auto max-w-md pt-8">
        <p className="mb-3 text-xs font-medium tracking-[0.04em] text-text-muted">Admin access</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text-primary">Open your event desk.</h1>
        <p className="mt-3 text-text-secondary">Sign in to create an event, share its access card, and review every submission.</p>
        <form onSubmit={submit} className="mt-8 rounded-[10px] border border-border bg-bg-surface p-6">
          <label className="block text-xs font-medium text-text-secondary" htmlFor="email">
            Email
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-bg-base px-3 text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <label className="mt-4 block text-xs font-medium text-text-secondary" htmlFor="password">
            Password
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 h-11 w-full rounded-md border border-border bg-bg-base px-3 text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <Button disabled={busy} className="mt-6 w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        {/* DESIGN.md §6: status region below the form; role="alert" + instant
            appearance (§4) preserved via Status. */}
        {error && <Status error message={error} />}
      </div>
    </Shell>
  );
}
