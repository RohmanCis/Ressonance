"use client";

import { FormEvent, useState } from "react";
import { api, Button, Shell, Status } from "./admin-ui";
import { AdminInput } from "./admin-input";
import { AdminPageShell } from "./admin-page-shell";

const errorText: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Kamu harus masuk dulu.",
  AUTHENTICATION_FAILED: "Email atau kata sandinya belum cocok.",
  RATE_LIMITED: "Terlalu banyak permintaan. Coba lagi nanti.",
  INTERNAL_ERROR: "Layanan nggak bisa menyelesaikan permintaan itu.",
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
      setError(errorText[(e as Error).message] ?? ((e as Error).message === "OFFLINE" ? "Kamu lagi offline. Cek koneksimu, lalu coba lagi." : "Gagal masuk. Cek detailnya, lalu coba lagi."));
      setBusy(false);
    }
  }

  return (
    <Shell title="Admin">
      {/* Asymmetric editorial split: wide copy column + offset form card on
          desktop; single stacked column on mobile (DESIGN.md §6 sign-in). */}
      <div className="mx-auto grid w-full max-w-5xl gap-12 pt-4 sm:pt-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <section className="relative">
          {/* Decorative geometry only — rotated diamond outline + ambient
              hairlines stay behind the copy (§2 ambient gold). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 right-4 hidden h-44 w-44 rotate-45 border border-accent/15 lg:block"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 right-4 hidden h-44 w-44 rotate-45 translate-x-6 translate-y-6 border border-accent/10 lg:block"
          />
          <AdminPageShell eyebrow="Akses admin" title="Kelola acaramu.">
            {/* Gold hairline + diamond divider, left-aligned for asymmetry —
                mirrors the guest landing divider (§5.1). */}
            <div aria-hidden="true" className="mt-6 flex items-center gap-3">
              <span className="h-1.5 w-1.5 rotate-45 bg-accent/80" />
              <span className="h-px w-16 bg-gradient-to-r from-accent/60 to-transparent" />
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-text-secondary">
              Buat acara, bagikan akses, dan lihat semua kiriman.
            </p>
          </AdminPageShell>
        </section>

        <div className="lg:mt-16">
          <div className="relative">
            {/* Editorial crop-marks on the card corners, decorative only. */}
            <span aria-hidden="true" className="pointer-events-none absolute -top-2 -left-2 h-4 w-4 border-t border-l border-accent/40" />
            <span aria-hidden="true" className="pointer-events-none absolute -bottom-2 -right-2 h-4 w-4 border-b border-r border-accent/40" />
            <form
              onSubmit={submit}
              className="rounded-2xl border border-accent/20 bg-bg-surface/85 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_40px_color-mix(in_srgb,var(--accent)_8%,transparent)] backdrop-blur-xl sm:p-8"
            >
              <AdminInput
                id="email"
                label="Email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <div className="mt-5">
                <AdminInput
                  id="password"
                  label="Kata sandi"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button disabled={busy} className="mt-8 w-full">
                {busy ? "Sebentar, ya…" : "Masuk"}
              </Button>
            </form>
          </div>
          {/* DESIGN.md §6: status region below the form; role="alert" + instant
              appearance (§4) preserved via Status. */}
          {error && <Status error message={error} />}
        </div>
      </div>
    </Shell>
  );
}
