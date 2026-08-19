import { FrameSelector } from "@/components/frame-selector";
import type { Frame } from "@/lib/frames";

export function FrameSelection({
  eventTitle,
  onFrameConfirm,
}: {
  eventTitle: string;
  onFrameConfirm: (frame: Frame) => void;
}) {
  return (
    <main className="min-h-screen bg-background px-5 pt-8 pb-[calc(2rem_+_env(safe-area-inset-bottom))] text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-xl">
        <header>
          <p className="text-sm font-medium text-muted-foreground">Guest entry</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
            {eventTitle}
          </h1>
        </header>
        <FrameSelector onSelect={onFrameConfirm} />
      </div>
    </main>
  );
}
