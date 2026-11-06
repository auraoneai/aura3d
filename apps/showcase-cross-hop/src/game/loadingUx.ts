/**
 * 5.0.3 A1: real loading progress for Cross Hop's 26 critter, traffic and prop GLBs (about 44 MB).
 *
 * The 5.0.2 pass only set the shell bar to 5 percent and then jumped to 100 percent. This watches the browser's own
 * resource timing for finished `.glb` downloads, so the bar moves with the real transfers and costs no extra request.
 * Pure helpers are exported for unit tests; nothing here touches the simulation, the scene or any asset id.
 */

/** Bar range owned by model downloads; 0..FLOOR is mount start, CEIL..1 is "first frame drawn". */
export const MODEL_PROGRESS_FLOOR = 0.08;
export const MODEL_PROGRESS_CEIL = 0.92;

/** Distinct GLB urls in an `aura-assets` style map. */
export function modelUrls(assetMap: Readonly<Record<string, unknown>>): string[] {
  const out = new Set<string>();
  for (const value of Object.values(assetMap)) {
    const url = (value as { url?: unknown } | null)?.url;
    if (typeof url === "string" && /\.glb(\?|#|$)/i.test(url)) out.add(url);
  }
  return [...out];
}

/** Bar fraction for `done` of `total` finished model downloads; never reaches CEIL by itself. */
export function modelProgressFraction(done: number, total: number): number {
  if (!(total > 0)) return MODEL_PROGRESS_FLOOR;
  const ratio = Math.min(1, Math.max(0, done / total));
  return MODEL_PROGRESS_FLOOR + (MODEL_PROGRESS_CEIL - MODEL_PROGRESS_FLOOR) * ratio;
}

export function modelLabel(done: number, total: number): string {
  return total > 0 ? `Loading Cross Hop (${Math.min(done, total)}/${total} models)` : "Loading Cross Hop";
}

function pathOf(name: string): string {
  try { return new URL(name, "http://x.invalid/").pathname; } catch { return name; }
}

/**
 * Report each expected model once as it finishes downloading. Returns a stop function. Entries that finished before the
 * observer attached are replayed (`buffered`). No-op where `PerformanceObserver` is unavailable.
 */
export function watchModelDownloads(
  urls: readonly string[],
  onStep: (done: number, total: number) => void
): () => void {
  const expected = new Set(urls.map(pathOf));
  const seen = new Set<string>();
  if (expected.size === 0 || typeof PerformanceObserver === "undefined") return () => undefined;
  const handle = (entries: readonly PerformanceEntry[]): void => {
    let changed = false;
    for (const entry of entries) {
      const path = pathOf(entry.name);
      if (expected.has(path) && !seen.has(path)) { seen.add(path); changed = true; }
    }
    if (changed) onStep(seen.size, expected.size);
  };
  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver((list) => handle(list.getEntries()));
    observer.observe({ type: "resource", buffered: true });
  } catch {
    return () => undefined;
  }
  return () => observer?.disconnect();
}
