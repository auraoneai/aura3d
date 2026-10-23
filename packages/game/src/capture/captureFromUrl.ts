/**
 * capture/captureFromUrl.ts — PRD-09 day-0.
 *
 * Parses the C-24 scenario params (`scenario`, `seed`, `freezeAt`,
 * `cameraPose`). The legacy `?capture=review|overview` lens is gone: it is
 * never read, so it has no effect and the route renders its shipped (play)
 * view. Not reading it matters — the capture harness's forbidden-param probe
 * (PRD-12 §6.6 / T5.2) fails any game that reads `capture`, `review`,
 * `overview` or the debug params (T0-29 crash table, #979).
 */

import type { CaptureContext } from "@aura3d/engine";

export function captureFromUrl(url?: URL): CaptureContext {
  if (url === undefined || typeof URL === "undefined") return { mode: "play" };
  const params = url.searchParams;
  const scenario = params.get("scenario") ?? undefined;
  const seedRaw = params.get("seed");
  const freezeAtRaw = params.get("freezeAt");
  const cameraPose = params.get("cameraPose") ?? undefined;
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
