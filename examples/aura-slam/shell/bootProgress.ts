/**
 * A1 (5.x): the `#boot` splash shows a real loading bar and waits for the first drawn frame before it lifts.
 * No engine import and no DOM access at module load; every function tolerates a missing element.
 */
export interface BootProgress {
  set(fraction: number, label?: string): void;
  /** Complete the bar and lift the splash (after the first presented frame, or `maxWaitMs`). */
  reveal(firstFrame?: (() => Promise<unknown>) | undefined, maxWaitMs?: number): Promise<void>;
  readonly fraction: number;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export function createBootProgress(doc: Document | undefined = typeof document === "undefined" ? undefined : document): BootProgress {
  let current = 0;
  let revealed = false;
  const publish = (text?: string): void => {
    const el = doc?.getElementById("boot-progress");
    if (el) {
      el.style.setProperty("--aura3d-loading", String(current));
      el.setAttribute("aria-valuenow", String(Math.round(current * 100)));
      if (current >= 1) el.setAttribute("data-complete", "true");
    }
    const sub = doc?.getElementById("boot-sub");
    if (sub && text) sub.dataset.stage = text;
  };
  return {
    get fraction() { return current; },
    set(fraction, text) {
      current = Math.max(current, clamp01(fraction)); // never goes backwards
      publish(text);
    },
    async reveal(firstFrame, maxWaitMs = 3000) {
      if (revealed) return;
      revealed = true;
      if (firstFrame) {
        try {
          await Promise.race([firstFrame().catch(() => undefined), new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs))]);
        } catch { /* the splash must always lift */ }
      }
      current = 1;
      publish("ready");
      doc?.getElementById("boot")?.classList.add("done");
    }
  };
}
