import { FormEvent } from "react";
import { Sparkles } from "lucide-react";
import type { PendingPhoto } from "@/lib/pending-photos";
import { AmbientBackdrop } from "@/components/guest/ambient-backdrop";

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

const recoverable: ViewState[] = [
  "invalid",
  "rate-limited",
  "offline",
  "unexpected",
];

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
          <p role="status" className="sr-only">
            Memuat acara.
          </p>
        </Card>
      </Shell>
    );
  }

  if (state === "not-found") {
    return (
      <Shell>
        <Card>
          <Status
            title="Acaranya nggak ketemu"
            message="Coba cek lagi QR atau link yang kamu buka."
          />
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
            Ada cerita buat kamu
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl font-medium leading-tight tracking-tight text-text-primary">
            {event.title}
          </h1>

          {/* Golden Divider */}
          <div
            aria-hidden="true"
            className="flex items-center justify-center gap-3 my-4"
          >
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-accent/60" />
            <span className="h-1.5 w-1.5 rotate-45 bg-accent/80" />
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-accent/60" />
          </div>
        </header>

        {/* STATUS ALERTS */}
        {blocked && (
          <Status
            variant="neutral"
            title="Acara ini sudah selesai"
            message="Acaranya sudah selesai, jadi foto dan pesan baru nggak bisa dikirim lagi."
          />
        )}
        {failed && (
          <Status
            variant="error"
            title={state === "invalid" ? "Cek nama kamu" : "Gagal memulai sesi"}
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
              Ada foto yang belum sempat terkirim
            </h2>
            <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
              Ada {expiredPending.length} foto yang masih tersimpan di sini.
              Bawa ke sesi baru biar tetap bisa dikirim.
            </p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {expiredPending.map((p) => (
                <img
                  key={p.id}
                  src={p.previewUrl}
                  alt="Draf yang belum terkirim"
                  className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onDeclineCarryOver}
              className="mt-3 inline-flex min-h-12 items-center text-xs text-text-muted underline underline-offset-4 hover:text-text-primary transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Hapus foto sebelumnya
            </button>
          </div>
        )}

        {/* FORM SECTION */}
        <form
          onSubmit={onStart}
          className="mt-8 space-y-6"
          aria-busy={state === "starting"}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="guest-name"
                className="block text-xs font-medium text-text-secondary"
              >
                Namamu
              </label>
              <span className="text-[11px] text-text-muted font-normal">
                Opsional
              </span>
            </div>
            <input
              id="guest-name"
              name="guest_name"
              type="text"
              autoComplete="nickname"
              autoCapitalize="words"
              spellCheck={false}
              maxLength={100}
              placeholder="Contoh: Andi"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={blocked || state === "starting"}
              className="h-12 w-full rounded-none border-0 border-b border-border bg-transparent px-0 pb-2 text-base text-text-primary placeholder:text-sm placeholder:text-text-muted transition-colors duration-fast focus:border-accent focus:outline-none"
              aria-describedby="name-help"
            />
            <p id="name-help" className="text-xs text-text-secondary leading-relaxed pt-1">
              Jepret momennya, pilih Frame favorit, lalu tinggalin pesan.
            </p>
          </div>

          <div className="pt-2 space-y-3">
            <button
              type="submit"
              disabled={blocked || state === "starting"}
              className="gold-foil-btn h-12 w-full rounded-xl text-sm font-semibold transition duration-fast hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state === "starting"
                ? "Sebentar ya…"
                : carryOverPrompt
                  ? "Mulai & Bawa Foto Draf"
                  : "Mulai yuk"}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent/80" aria-hidden="true" />
              <span>Langsung dari browser • Tanpa unduh aplikasi</span>
            </div>
          </div>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-start sm:justify-center overflow-y-auto bg-bg-base px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-text-primary sm:px-6">
      {/* Ambient orbs + grain (DESIGN.md §2) */}
      <AmbientBackdrop />

      {/* CONTENT WRAPPER */}
      <div className="relative z-10 w-full flex justify-center my-auto">
        {children}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full max-w-[30rem] rounded-2xl border border-accent/20 bg-bg-surface/85 p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_40px_color-mix(in_srgb,var(--accent)_8%,transparent)] backdrop-blur-xl">
      {children}
    </div>
  );
}

function Status({
  title,
  message,
  retry,
  variant = "error",
}: {
  title: string;
  message: string;
  retry?: () => void;
  variant?: "error" | "neutral";
}) {
  return (
    <section
      role="alert"
      className="mt-6 rounded-xl border border-border bg-bg-elevated/90 p-4 text-center"
    >
      <h2
        className={`font-display text-lg font-semibold ${
          variant === "error" ? "text-error" : "text-text-primary"
        }`}
      >
        {title}
      </h2>
      <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">
        {message}
      </p>
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