/**
 * A4 shader-graph pilots: on by default since 2026-11-07 (real-GPU check: same look, no errors on WebGL2). `?portable=0`
 * opts out and restores the original GLSL materials byte for byte. No DOM access at import time.
 */
export function parsePortableFlag(search: string | URLSearchParams | undefined): boolean {
  const params = typeof search === "string" ? new URLSearchParams(search) : (search ?? new URLSearchParams());
  return params.get("portable")?.trim() !== "0";
}

/** Reads `location.search` when a window exists; otherwise false. */
export function readPortableFlag(): boolean {
  return parsePortableFlag(typeof window !== "undefined" ? window.location.search : undefined);
}
