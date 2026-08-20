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

/**
 * PRE_SESSION — landing (DESIGN.md §5.1). Matte --bg-base page, one
 * --bg-surface card (max 30rem) holding the session form: eyebrow, Cormorant
 * event title, underline name field, single gold 48px Start. All states
 * (closed, not-found, rate-limited, invalid, offline, carry-over) render as
 * quiet bordered blocks; gold is reserved for the Start action.
 */
export function PreSession({
  event,
  name,
  state,
  message,
  carryOverPrompt,
  expiredPending,
  onNameChange,
  onStart,
  onCarryOver,
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
  onCarryOver: () => void;
  onDeclineCarryOver: () => void;
}) {
  if (state === "loading") {
    return (
      <Shell>
        <Card>
          <Skeleton />
          <p role="status" className="sr-only">Loading event.</p>
        </Card>
      </Shell>
    );
  }

  if (state === "not-found") {
    return (
      <Shell>
        <Card>
          <Status title="Event unavailable" message="This event cannot be found." />
        </Card>
      </Shell>
    );
  }

  if (!event) {
    return (
      <Shell>
        <Card>
          <Status
            title="Event unavailable"
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
        <header>
          <p className="text-xs font-medium tracking-[0.04em] text-text-muted">You&rsquo;re invited</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight text-text-primary">
            {event.title}
          </h1>
        </header>

        {blocked && (
          <Status
            title="Event closed"
            message="This event remains viewable, but new submissions are not accepted."
          />
        )}
        {failed && (
          <Status
            title={state === "invalid" ? "Check your name" : "Could not start"}
            message={message}
          />
        )}

        {/* Carry-over prompt */}
        {carryOverPrompt && expiredPending.length > 0 && (
          <div
            role="alert"
            className="mt-8 rounded-lg border border-border p-5"
          >
            <h2 className="font-display text-xl font-semibold text-text-primary">
              Unsaved photos from your previous session
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              You have {expiredPending.length} photo{expiredPending.length > 1 ? "s" : ""} that{" "}
              {expiredPending.length > 1 ? "were" : "was"} not saved. If you start again, you can
              add {expiredPending.length > 1 ? "them" : "it"} to this new session.{" "}
              {expiredPending.length > 1 ? "They" : "It"} will count toward your 5-photo limit.
            </p>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {expiredPending.map((p) => (
                <img
                  key={p.id}
                  src={p.previewUrl}
                  alt="Unsaved photo"
                  className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onDeclineCarryOver}
              className="mt-4 min-h-12 rounded-lg border border-border px-5 font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Discard unsaved photos
            </button>
          </div>
        )}

        <form onSubmit={onStart} className="mt-8 space-y-6" aria-busy={state === "starting"}>
          <div className="space-y-2">
            <label htmlFor="guest-name" className="text-sm font-medium text-text-primary">
              Your name <span className="font-normal text-text-muted">(optional)</span>
            </label>
            <input
              id="guest-name"
              name="guest_name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={blocked || state === "starting"}
              className="h-12 w-full border-0 border-b border-border bg-transparent px-0 text-text-primary outline-none placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              aria-describedby="name-help"
            />
            <p id="name-help" className="text-sm text-text-muted">
              Your name applies to submissions in this session.
            </p>
          </div>
          <button
            type="submit"
            disabled={blocked || state === "starting"}
            className="h-12 w-full rounded-lg bg-accent px-4 font-semibold text-on-accent transition duration-fast ease-out hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            {state === "starting"
              ? "Starting…"
              : carryOverPrompt
                ? "Start and add unsaved photos"
                : "Start"}
          </button>
          <p role="status" className="min-h-5 text-sm text-text-muted">
            {state === "starting" ? "Starting your session…" : ""}
          </p>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg-base px-5 pt-[calc(4rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] text-text-primary sm:px-8">
      {children}
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[30rem] rounded-xl border border-border bg-bg-surface p-6 sm:p-8">
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
      className="mt-8 rounded-lg border border-border p-5"
    >
      <h2 className="font-display text-xl font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 text-sm text-text-secondary">{message}</p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-5 h-12 rounded-lg bg-accent px-5 font-semibold text-on-accent transition duration-fast ease-out hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Try again
        </button>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="h-4 w-24 animate-pulse rounded bg-bg-elevated" />
      <div className="h-12 w-4/5 animate-pulse rounded bg-bg-elevated" />
      <div className="mt-10 h-12 animate-pulse rounded bg-bg-elevated" />
      <div className="h-12 animate-pulse rounded bg-bg-elevated" />
    </div>
  );
}
