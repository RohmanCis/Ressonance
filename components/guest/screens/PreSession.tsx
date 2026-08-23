import { FormEvent } from "react";
import type { PendingPhoto } from "@/lib/pending-photos";

type EventData = { title: string; status: "ACTIVE" | "CLOSED" };
type ViewState =
  | "loading"
  | "ready"
  | "closed"
  | "not-found"
  | "starting"
  | "invalid"
  | "rate-limited"
  | "offline"
  | "unexpected";

const recoverable: ViewState[] = ["invalid", "rate-limited", "offline", "unexpected"];

export function PreSession({
  event,
  name,
  state,
  message,
  carryOverPrompt,
  expiredPending,
  onNameChange,
  onStart,
  onDeclineCarryOver,
}: {
  event: EventData | null;
  name: string;
  state: ViewState;
  message: string;
  carryOverPrompt: boolean;
  expiredPending: PendingPhoto[];
  onNameChange: (value: string) => void;
  onStart: (e: FormEvent<HTMLFormElement>) => void;
  onDeclineCarryOver: () => void;
}) {
  if (state === "loading") {
    return (
      <Shell>
        <Card>
          <Skeleton />
          <p role="status" className="sr-only">Memuat acara.</p>
        </Card>
      </Shell>
    );
  }

  if (state === "not-found") {
    return (
      <Shell>
        <Card>
          <Status title="Acara nggak tersedia" message="Acara ini nggak ditemukan." />
        </Card>
      </Shell>
    );
  }

  if (!event) {
    return (
      <Shell>
        <Card>
          <Status
            title="Acara nggak tersedia"
            message={message}
            retry={() => window.location.reload()}
          />
        </Card>
      </Shell>
    );
  }

  const blocked = state === "closed";
  const failed = recoverable.includes(state);

  return (
    <Shell>
      <Card>
        {/* HEADER SECTION */}
        <header className="text-center">
          <p className="font-script text-3xl sm:text-4xl text-accent tracking-wide drop-shadow-[0_2px_10px_color-mix(in_srgb,var(--accent)_30%,transparent)]">
            Kamu diundang
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl font-normal leading-tight tracking-tight text-text-primary">
            {event.title}
          </h1>

          {/* Golden Divider */}
          <div aria-hidden="true" className="flex items-center justify-center gap-3 my-4">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-accent/60" />
            <span className="h-1.5 w-1.5 rotate-45 bg-accent/80" />
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-accent/60" />
          </div>

          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
            Abadikan kenangan hari ini dengan foto berbingkai analog dan tinggalkan pesan suara untuk kami kenang.
          </p>
        </header>

        {/* STATUS ALERTS */}
        {blocked && (
          <Status
            title="Acara sudah selesai"
            message="Acara ini telah selesai. Pengiriman foto dan pesan suara baru sudah ditutup."
          />
        )}
        {failed && (
          <Status
            title={state === "invalid" ? "Periksa Nama Anda" : "Gagal Memulai Sesi"}
            message={message}
          />
        )}

        {/* CARRY-OVER PROMPT */}
        {carryOverPrompt && expiredPending.length > 0 && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-border bg-bg-elevated/80 p-4 backdrop-blur-sm"
          >
            <h2 className="font-display text-lg font-semibold text-text-primary">
              Foto Belum Tersimpan dari Sesi Sebelumnya
            </h2>
            <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
              Anda memiliki {expiredPending.length} foto yang belum sempat terkirim. Klik mulai untuk memasukkannya ke sesi baru.
            </p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {expiredPending.map((p) => (
                <img
                  key={p.id}
                  src={p.previewUrl}
                  alt="Unsaved draft"
                  className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onDeclineCarryOver}
              className="mt-3 inline-flex min-h-12 items-center text-xs text-text-muted underline underline-offset-4 hover:text-text-primary transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Hapus draf foto sebelumnya
            </button>
          </div>
        )}

        {/* FORM SECTION */}
        <form onSubmit={onStart} className="mt-8 space-y-5" aria-busy={state === "starting"}>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <label htmlFor="guest-name" className="text-xs font-medium text-text-secondary">
                Nama Anda
              </label>
              <span className="font-script text-sm text-text-muted">opsional</span>
            </div>
            <input
              id="guest-name"
              name="guest_name"
              placeholder="Contoh: Rohman (Meja 04)"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={blocked || state === "starting"}
              className="h-12 w-full rounded-xl border border-border/80 bg-bg-elevated/60 px-4 text-sm text-text-primary placeholder:text-text-muted/50 transition focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-describedby="name-help"
            />
            <p id="name-help" className="text-[11px] text-text-muted pt-0.5">
              Nama ini akan disematkan pada setiap foto dan rekaman Anda.
            </p>
          </div>

          <div className="pt-2 space-y-3">
            <button
              type="submit"
              disabled={blocked || state === "starting"}
              className="gold-foil-btn h-12 w-full rounded-xl text-sm font-semibold transition duration-fast hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state === "starting"
                ? "Mempersiapkan Sesi…"
                : carryOverPrompt
                  ? "Mulai & Bawa Foto Draf"
                  : "Mulai Pengalaman"}
            </button>
            <p className="text-[10px] text-center text-text-muted font-mono tracking-wider uppercase">
              Sesi 30 Menit &bull; Tanpa Unduh Aplikasi &bull; Private Keepsake
            </p>
          </div>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-bg-base px-4 py-8 text-text-primary sm:px-6">
      
      {/* 1. AMBIENT GLOW LAYER 1 (Top-Right Amber Orb) */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-accent/20 blur-[100px] animate-ambient-1" 
      />

      {/* 2. AMBIENT GLOW LAYER 2 (Bottom-Left Warm Bronze Orb) */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -bottom-24 -left-24 h-[420px] w-[420px] rounded-full bg-accent/15 blur-[110px] animate-ambient-2" 
      />

      {/* 3. FILM GRAIN OVERLAY */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 film-grain" 
      />

      {/* 4. CONTENT WRAPPER */}
      <div className="relative z-10 w-full flex justify-center">
        {children}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full max-w-[28rem] rounded-2xl border border-accent/20 bg-bg-surface/85 p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_40px_color-mix(in_srgb,var(--accent)_8%,transparent)] backdrop-blur-xl">
      {children}
    </div>
  );
}

function Status({
  title,
  message,
  retry,
}: {
  title: string;
  message: string;
  retry?: () => void;
}) {
  return (
    <section
      role="alert"
      className="mt-6 rounded-xl border border-border bg-bg-elevated/90 p-4 text-center"
    >
      <h2 className="font-display text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">{message}</p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 h-12 rounded-lg bg-accent px-5 text-xs font-semibold text-on-accent transition duration-fast hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Coba Lagi
        </button>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4 text-center py-4" aria-hidden="true">
      <div className="h-6 w-32 mx-auto animate-pulse rounded bg-bg-elevated" />
      <div className="h-10 w-3/4 mx-auto animate-pulse rounded bg-bg-elevated" />
      <div className="h-4 w-1/2 mx-auto animate-pulse rounded bg-bg-elevated" />
      <div className="mt-8 h-12 w-full animate-pulse rounded-xl bg-bg-elevated" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-bg-elevated" />
    </div>
  );
}