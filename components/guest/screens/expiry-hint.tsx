const PRE_EXPIRY_WARN_SECONDS = 300;

/**
 * Pre-expiry hint (UX hint; server expires_at stays authoritative). Same muted
 * anatomy as the Capture banner, gold-rule compliant. Copy is per-screen.
 */
export function ExpiryHint({ secondsLeft, message }: { secondsLeft: number | null; message: string }) {
  if (secondsLeft === null || secondsLeft <= 0 || secondsLeft > PRE_EXPIRY_WARN_SECONDS) return null;
  return (
    <p role="status" className="mt-3 rounded-lg border border-border bg-bg-elevated/90 px-3 py-2 text-xs text-text-secondary">
      {message}
    </p>
  );
}
