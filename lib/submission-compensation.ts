import { logApiError } from "@/lib/api-log";

/**
 * Best-effort storage compensation for guest media submissions.
 *
 * Shared by photo/voice-note orchestration; the only per-kind difference is
 * the structured log event name. Never rethrows into a success path; a cleanup
 * failure is logged for operational reconciliation (TECHNICAL_DESIGN §6).
 */

export interface DeletableStorage {
  delete(key: string): Promise<void>;
}

/** Best-effort object deletion; logs a cleanup failure without rethrowing. */
export async function tryDeleteObject(
  storage: DeletableStorage,
  key: string,
  logEvent: string,
): Promise<void> {
  try {
    await storage.delete(key);
  } catch (err) {
    logApiError({
      event: logEvent,
      error: err,
      context: { storageKey: key },
    });
  }
}

/** Roll back the transaction and compensate the just-written object. */
export async function compensateObject(
  tx: { rollback(): Promise<void> },
  storage: DeletableStorage,
  key: string,
  logEvent: string,
): Promise<void> {
  await tx.rollback();
  await tryDeleteObject(storage, key, logEvent);
}
