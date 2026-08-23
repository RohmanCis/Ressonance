"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Printer } from "lucide-react";
import { api, AuthGate, Button, Event, Shell, Status, Busy } from "./admin-ui";
import { QRCodeSVG } from "qrcode.react";

type PrintVariant = "qr" | "card";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const printOptions: { variant: PrintVariant; label: string }[] = [
  { variant: "qr", label: "Print QR only" },
  { variant: "card", label: "Print access card" },
];

// Print artifact: bare QR sheet. One A4 page; no vh/min-h-screen units.
function PrintQrOnly({ title, url }: { title: string; url: string }) {
  return (
    <div className="flex h-[260mm] flex-col items-center justify-center text-center">
      <h1 className="font-display text-4xl font-semibold tracking-tight">{title || "Event access"}</h1>
      <div className="mt-10 w-[145mm]">
        <QRCodeSVG value={url} bgColor="#FFFFFF" fgColor="#000000" className="h-auto w-full" />
      </div>
      <p className="mt-8 break-words text-lg">{url}</p>
    </div>
  );
}

// Print artifact: framed access card with guest instruction. One A4 page.
function PrintAccessCard({ title, url }: { title: string; url: string }) {
  return (
    <div className="flex h-[260mm] flex-col items-center justify-center">
      <section className="flex max-w-[170mm] flex-col items-center rounded-[6mm] border-2 border-black p-[12mm] text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title || "Event access"}</h1>
        <div className="mt-8 w-[145mm]">
          <QRCodeSVG value={url} bgColor="#FFFFFF" fgColor="#000000" className="h-auto w-full" />
        </div>
        <p className="mt-8 text-base">Scan to share your photos and voice notes.</p>
        <p className="mt-4 break-words text-sm">{url}</p>
      </section>
    </div>
  );
}

export function AdminAccess({ publicId }: { publicId: string }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [printVariant, setPrintVariant] = useState<PrintVariant | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    api<{ public_url: string }>(`/api/admin/events/${publicId}/access`).then((x) => setUrl(x.public_url)).catch((e) => setError(e.message));
    api<{ event: Event }>(`/api/admin/events/${publicId}`)
      .then((x) => setTitle(x.event.title))
      .catch(() => {});
  }, [publicId]);

  // Print flow: choose variant -> artifact renders in the print-only container ->
  // window.print() on next frame -> restore on afterprint.
  useEffect(() => {
    if (!printVariant) return;
    const done = () => setPrintVariant(null);
    window.addEventListener("afterprint", done);
    const raf = requestAnimationFrame(() => window.print());
    return () => {
      window.removeEventListener("afterprint", done);
      cancelAnimationFrame(raf);
    };
  }, [printVariant]);

  // Roving focus: keep the active menu item focused.
  useEffect(() => {
    if (menuOpen) itemRefs.current[activeItem]?.focus();
  }, [menuOpen, activeItem]);

  // Click-outside closes the print menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  function closeMenu(returnFocus = true) {
    setMenuOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function selectOption(variant: PrintVariant) {
    closeMenu();
    setPrintVariant(variant);
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveItem((i) => (i + 1) % printOptions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveItem((i) => (i - 1 + printOptions.length) % printOptions.length);
    } else if (e.key === "Tab") {
      setMenuOpen(false);
    }
  }

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
      <Shell>
        {/* ponytail: page-scoped print isolation (hide chrome, neutralize Shell <main> geometry); promote to a print stylesheet if more pages ship print artifacts. */}
        <style>{`@page { size: A4; margin: 12mm; }
@media print {
  header { display: none; }
  main { min-height: 0 !important; padding: 0 !important; }
  main > div { max-width: none !important; }
}`}</style>
        <div className="mx-auto max-w-4xl print:hidden">
          <Link
            href={`/admin/events/${publicId}`}
            className={`mb-6 inline-flex min-h-12 items-center gap-1.5 rounded-md text-sm font-medium text-text-muted transition duration-fast ease-out hover:text-text-primary ${focusRing}`}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to event
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-[0.04em] text-text-muted">Share access</p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text-primary">Share event access.</h1>
              <p className="mt-3 text-text-secondary">Guests can scan this access card or open the public link.</p>
            </div>
          </div>
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
            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_18rem]">
              <section className="rounded-2xl border border-border bg-bg-surface p-6">
                <h2 className="text-lg font-semibold text-text-primary">Public URL</h2>
                <label className="mt-4 block text-sm font-semibold text-text-primary" htmlFor="public-url">
                  Share link
                  <input id="public-url" readOnly value={url} className="mt-2 h-11 w-full rounded-md border border-border bg-bg-elevated px-3 font-mono text-xs text-text-primary" />
                </label>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
                  <div ref={menuRef} className="relative">
                    {/* Native button: admin-ui Button does not forward refs; classes mirror secondary Button. */}
                    <button
                      type="button"
                      ref={triggerRef}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-controls="print-menu"
                      disabled={printVariant !== null}
                      onClick={() => {
                        if (menuOpen) {
                          closeMenu(false);
                        } else {
                          setActiveItem(0);
                          setMenuOpen(true);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                          e.preventDefault();
                          setActiveItem(e.key === "ArrowDown" ? 0 : printOptions.length - 1);
                          setMenuOpen(true);
                        }
                      }}
                      className={`flex min-h-12 items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-4 py-2 text-sm font-semibold text-text-primary transition duration-fast hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-45 ${focusRing}`}
                    >
                      <Printer className="h-4 w-4" aria-hidden="true" />
                      Print
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {menuOpen && (
                      <div
                        role="menu"
                        id="print-menu"
                        aria-label="Print options"
                        onKeyDown={onMenuKeyDown}
                        className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-border bg-bg-elevated p-1"
                      >
                        {printOptions.map((option, i) => (
                          <button
                            key={option.variant}
                            type="button"
                            role="menuitem"
                            ref={(el) => {
                              itemRefs.current[i] = el;
                            }}
                            tabIndex={i === activeItem ? 0 : -1}
                            onClick={() => selectOption(option.variant)}
                            className={`flex min-h-12 w-full items-center rounded-md px-3 text-left text-sm font-medium text-text-primary transition duration-fast hover:bg-accent-soft ${focusRing}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {printVariant && (
                  <p role="status" className="mt-3 text-sm text-text-muted">
                    Preparing {printVariant === "qr" ? "QR code" : "access card"} for printing…
                  </p>
                )}
                {copied && <Status message="Link copied to your clipboard." />}
              </section>
              <section className="rounded-2xl border border-border bg-bg-surface p-6 text-center">
                <h2 className="text-lg font-semibold text-text-primary">QR access</h2>
                {/* QR keeps a white quiet zone (bgColor/includeMargin) for scannability on the dark surface. */}
                <div className="mx-auto mt-5 aspect-square w-full max-w-52 rounded-md border border-border bg-bg-elevated p-3">
                  <QRCodeSVG value={url} bgColor="#FFFFFF" fgColor="#000000" includeMargin aria-label="QR code for event access" className="h-full w-full" />
                </div>
                <p className="mt-4 text-xs text-text-muted">Scan with a phone camera to open the guest page, or share the public link.</p>
              </section>
            </div>
          )}
        </div>
        <div aria-hidden="true" className="hidden print:block print:overflow-hidden">
          {url && printVariant === "qr" && <PrintQrOnly title={title} url={url} />}
          {url && printVariant === "card" && <PrintAccessCard title={title} url={url} />}
        </div>
      </Shell>
    </AuthGate>
  );
}
