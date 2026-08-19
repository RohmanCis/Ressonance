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
        <Skeleton />
        <p role="status" className="sr-only">Loading event.</p>
      </Shell>
    );
  }

  if (state === "not-found") {
    return (
      <Shell>
        <Status title="Event unavailable" message="This event cannot be found." />
      </Shell>
    );
  }

  if (!event) {
    return (
      <Shell>
        <Status
          title="Event unavailable"
          message={message}
          retry={() => window.location.reload()}
        />
      </Shell>
    );
  }

  const blocked = state === "closed";
  const failed = recoverable.includes(state);

  return (
    <Shell>
      <Header title={event.title} />
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
          className="mt-8 rounded-[var(--radius)] border bg-card p-5 shadow-[var(--shadow-1)]"
        >
          <h2 className="font-display text-xl font-semibold">
            Unsaved photos from your previous session
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
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
                className="h-12 w-12 shrink-0 rounded-md object-cover"
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onDeclineCarryOver}
            className="mt-4 min-h-12 rounded-md bg-secondary px-5 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Discard unsaved photos
          </button>
        </div>
      )}

      <form onSubmit={onStart} className="mt-8 space-y-6" aria-busy={state === "starting"}>
        <div className="space-y-2">
          <label htmlFor="guest-name" className="text-sm font-medium">
            Your name <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="guest-name"
            name="guest_name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={blocked || state === "starting"}
            className="h-12 w-full rounded-md border bg-background px-3 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-describedby="name-help"
          />
          <p id="name-help" className="text-sm text-muted-foreground">
            Your name applies to submissions in this session.
          </p>
        </div>
        <button
          type="submit"
          disabled={blocked || state === "starting"}
          className="h-12 w-full rounded-md bg-primary px-4 font-semibold text-primary-foreground shadow-[var(--shadow-1)] transition duration-200 ease-out hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45"
        >
          {state === "starting"
            ? "Starting…"
            : carryOverPrompt
              ? "Start and add unsaved photos"
              : "Start"}
        </button>
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {state === "starting" ? "Starting your session…" : ""}
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-5 pt-8 pb-[calc(2rem_+_env(safe-area-inset-bottom))] text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </main>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header>
      <p className="text-sm font-medium text-muted-foreground">Guest entry</p>
      <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
        {title}
      </h1>
    </header>
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
      className="mt-8 rounded-[var(--radius)] border bg-card p-5 shadow-[var(--shadow-1)]"
    >
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-5 h-12 rounded-md bg-primary px-5 font-semibold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-12 w-4/5 animate-pulse rounded bg-muted" />
      <div className="mt-10 h-12 animate-pulse rounded bg-muted" />
      <div className="h-12 animate-pulse rounded bg-muted" />
    </div>
  );
}
