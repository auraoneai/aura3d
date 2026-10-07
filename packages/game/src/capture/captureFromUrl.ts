/**
 * capture/captureFromUrl.ts — PRD-09 day-0.
 *
 * `?capture=review|overview` resolves to `{ mode: "play" }` and warns ONCE
 * per captured value per session. All other capture params parse exactly as
 * the C-24 contract's `captureFromUrl` (the engine impl warns per call, so
 * the parse is duplicated here to keep the once-only semantics).
 */

import type { CaptureContext } from "@aura3d/engine/contracts";

const warned = new Set<string>();

export function captureFromUrl(url?: URL): CaptureContext {
  if (url === undefined || typeof URL === "undefined") return { mode: "play" };
  const capture = url.searchParams.get("capture");
  if (capture === "review" || capture === "overview") {
    if (!warned.has(capture) && typeof console !== "undefined") {
      warned.add(capture);
      console.warn(`capture:${capture} is ignored`);
    }
    return { mode: "play" };
  }
  const scenario = url.searchParams.get("scenario") ?? undefined;
  const seedRaw = url.searchParams.get("seed");
  const freezeAtRaw = url.searchParams.get("freezeAt");
  const cameraPose = url.searchParams.get("cameraPose") ?? undefined;
  if (scenario === undefined && seedRaw === null && freezeAtRaw === null && cameraPose === undefined) {
    return { mode: "play" };
  }
  return {
    mode: "scenario",
    scenario,
    seed: seedRaw !== null ? Number(seedRaw) : undefined,
    freezeAt: freezeAtRaw !== null ? Number(freezeAtRaw) : undefined,
    cameraPose
  };
}
