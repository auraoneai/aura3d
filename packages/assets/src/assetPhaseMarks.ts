/**
 * Lane-05 GLB load-phase marks (Track 0 #375 ready-time attribution).
 *
 * `performance.mark("a3d:assets:<phase>")` at the GLB fetch/parse and image
 * decode boundaries. The marks cost about a microsecond each, have no other
 * side effects, and are skipped where `performance.mark` is missing (Node
 * without perf_hooks globals). `capture.mjs` collects every `a3d:*` mark on a
 * capture timeout, and the benchmark adapter copies them into
 * `payload.extra.mountTiming`.
 */
export function assetPhaseMark(phase: string): void {
  const perf = (globalThis as { performance?: { mark?: (name: string) => unknown } }).performance;
  if (typeof perf?.mark !== "function") return;
  perf.mark(`a3d:assets:${phase}`);
}

/** Short, stable label for a URL in a mark name (last path segment, no query). */
export function assetMarkLabel(url: string): string {
  const path = url.split(/[?#]/)[0] ?? url;
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.length > 0 ? name.slice(0, 80) : "inline";
}
