/**
 * GU47: which look a page boots in. `?look=original` keeps the 4.6.2 look (four-light rig, flat backdrop, 4.6.1 camera and
 * HUD); `?look=world-tour` forces the World Tour look. With neither, a boot venue listed in ORIGINAL_LOOK_VENUES (no
 * `?venue=` boots the hard court) falls back to the 4.6.2 look: the blind-panel fix pass restores it on any variant whose
 * World Tour frame was not judged better. Shared by the shell (HUD) and the view (scene, camera) so they cannot drift.
 */
export const ORIGINAL_LOOK_VENUES: ReadonlySet<string> = new Set<string>([]);

export function lookMode(search?: string): "world-tour" | "original" {
  const raw = search ?? (typeof location !== "undefined" ? location.search : "");
  const params = new URLSearchParams(raw);
  const forced = params.get("look");
  if (forced === "original") return "original";
  if (forced === "world-tour") return "world-tour";
  return ORIGINAL_LOOK_VENUES.has(params.get("venue") || "hard") ? "original" : "world-tour";
}
