/**
 * Slingshot Siege — URL guard for the engine's render-path switches.
 *
 * `?aura3d-render=` and `?aura3d-bloom-fusion=` are read by the engine at
 * mount and throw on an unknown value, so a typo in a shared link stopped the
 * game from mounting. This drops an invalid value (with a console warning)
 * before the app is created; valid values pass through untouched.
 */
const VALID: Readonly<Record<string, readonly string[]>> = {
  "aura3d-render": ["auto", "production", "safe-basic", "cinematic"],
  "aura3d-bloom-fusion": ["separable", "fused-2d"]
};

export function invalidRenderParams(search: string): string[] {
  const params = new URLSearchParams(search);
  const bad: string[] = [];
  for (const [key, allowed] of Object.entries(VALID)) {
    const value = params.get(key);
    if (value !== null && !allowed.includes(value)) bad.push(key);
  }
  return bad;
}

export function sanitizeRenderParams(): void {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  const bad = invalidRenderParams(location.search);
  if (bad.length === 0) return;
  const params = new URLSearchParams(location.search);
  for (const key of bad) {
    console.warn(`[slingshot-siege] ignoring ?${key}=${params.get(key)} (expected ${VALID[key]!.join("|")}); using the default.`);
    params.delete(key);
  }
  const query = params.toString();
  history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}
