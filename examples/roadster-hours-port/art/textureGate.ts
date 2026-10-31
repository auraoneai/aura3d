/**
 * GU47 phase 2: when judged shots may start (the QA hook's `texturesReady()`). Every textured material must have left the
 * upgrade queue: `textured`, or settled on its scalar `fallback`. The 4.7 hook waited for `textured === total`, which never
 * holds once one row settles on its fallback or carries no texture, so the remote capture timed out on every variant
 * (recap2 and g22p2a round 1). Rows the upgrade pass has not reached (`none`) still count as waiting until
 * `TEXTURE_WAIT_MS` after the route became ready; software WebGL2 can take minutes per upload, and a judged shot after
 * that bound is better than none.
 */
/** The fields of `summarizeTextureUpgrade()` this gate reads. */
interface TextureCounts { readonly total: number; readonly textured: number; readonly pending: number; readonly none: number }

/** Longest wait for texture uploads after the route is ready (ms). */
export const TEXTURE_WAIT_MS = 240_000;

export function texturesSettled(t: TextureCounts, sinceReadyMs: number): boolean {
  if (t.total === 0 || t.textured === 0) return sinceReadyMs >= TEXTURE_WAIT_MS;
  if (t.pending === 0 && t.none === 0) return true;
  return sinceReadyMs >= TEXTURE_WAIT_MS;
}
