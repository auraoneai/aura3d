/**
 * A4 shader-graph pilots: the default-off `?portable=1` flag. It lives beside, not inside, `lab-flags.ts` so the shared lab
 * parser (which other lanes edit) is untouched. Absent, `0`, or any other value means off: the games keep their original GLSL
 * materials, byte for byte. No DOM access at import time.
 */
export function parsePortableFlag(search: string | URLSearchParams | undefined): boolean {
  const params = typeof search === "string" ? new URLSearchParams(search) : (search ?? new URLSearchParams());
  return params.get("portable")?.trim() === "1";
}

/** Reads `location.search` when a window exists; otherwise false. */
export function readPortableFlag(): boolean {
  return parsePortableFlag(typeof window !== "undefined" ? window.location.search : undefined);
}
