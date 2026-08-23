"use client";

import { useEffect, useState } from "react";
import { api, AuthGate, Button, Shell, Status, Busy } from "./admin-ui";
import { AdminPageShell } from "./admin-page-shell";
import { QRCodeSVG } from "qrcode.react";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function AdminAccess({ publicId }: { publicId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ public_url: string }>(`/api/admin/events/${publicId}/access`).then((x) => setUrl(x.public_url)).catch((e) => setError(e.message));
  }, [publicId]);

  // Copied status auto-clears after 2s (DESIGN.md §4: API-driven state, instant).
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("COPY_FAILED");
    }
  }

  return (
    <AuthGate>
      <Shell eyebrow="Event desk">
        {/* ponytail: page-scoped print isolation (hide chrome, neutralize Shell geometry); promote to a print stylesheet if more pages ship print artifacts. */}
        <style>{`@page { margin: 0; }
@media print {
  header { display: none; }
  main { min-height: 0 !important; padding: 0 !important; }
  main > div { max-width: none !important; }
}`}</style>
        <div className="mx-auto max-w-md print:hidden">
          <AdminPageShell eyebrow="Share access" title="Share event access.">
            <p className="mt-3 text-sm text-text-secondary leading-relaxed">Guests can scan this access card or open the public link.</p>
            {error ? (
              <Status
                error
                message={error === "OFFLINE" ? "Access details are unavailable offline." : "This access card is unavailable."}
                action={<Button secondary onClick={() => window.location.reload()}>Retry</Button>}
              />
            ) : !url ? (
              <div className="mt-8">
                <Busy label="Loading access details" />
              </div>
            ) : (
              <div className="mt-8 rounded-2xl border border-border bg-bg-surface/85 p-5 backdrop-blur-xl">
                {/* Row 1: QR centered, max 160px */}
                <div className="mx-auto w-40">
                  <QRCodeSVG value={url} bgColor="#FFFFFF" fgColor="#000000" includeMargin aria-label="QR code for event access" className="h-full w-full" />
                </div>
                <p className="mt-4 text-center text-xs text-text-muted">Scan with a phone camera to open the guest page, or share the public link.</p>
                {/* Row 2: URL underline display */}
                <input
                  id="public-url"
                  readOnly
                  value={url}
                  aria-label="Public URL"
                  className="mt-5 w-full truncate border-0 border-b border-border bg-transparent rounded-none pb-1 font-mono text-xs text-text-muted pointer-events-none select-all focus:border-accent focus:outline-none"
                />
                {/* Row 3: actions */}
                <div className="mt-5 flex gap-3">
                  <button type="button" onClick={copy} className={`gold-foil-btn h-12 flex-1 rounded-xl px-4 text-sm font-semibold transition duration-fast active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}>
                    Copy link
                  </button>
                  <button type="button" onClick={() => window.print()} className={`flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-bg-surface px-4 text-sm font-semibold text-text-primary transition duration-fast hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}>
                    Print QR
                  </button>
                </div>
                {copied && (
                  <p role="status" className="mt-3 text-center text-xs text-text-muted">
                    Link copied to your clipboard.
                  </p>
                )}
              </div>
            )}
          </AdminPageShell>
        </div>
        {/* Print-only: bare QR, one A4 page, no title/URL/chrome */}
        <div aria-hidden="true" className="hidden print:flex print:min-h-screen print:w-full print:items-center print:justify-center print:overflow-hidden">
          {url && <QRCodeSVG value={url} bgColor="#FFFFFF" fgColor="#000000" className="h-[80mm] w-[80mm]" />}
        </div>
      </Shell>
    </AuthGate>
  );
}
