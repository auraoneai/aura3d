/**
 * Rendering switches that restore the 4.2.0 sun-shadow behaviour.
 *
 * 4.3.0 changed the cascade fit (casters no longer widen the ortho, depth range reach, clip range resolved from the VP), added an
 * oversize-caster skip, and drew large instanced casters through a per-instance attribute buffer. Those were proven on software
 * WebGL2 only. Real GPUs rendered Aura Slam dark with dense stripes, so the 4.2.0 behaviour is the default again.
 *
 * `globalThis.__A3D_SHADOW_FIT__ = "current"` (or `?shadowfit=current`) opts a game into the 4.3.0 behaviour; Shadowstep Gauntlet's
 * 4000 m sky dome needs it. `"legacy"` (the default) is exactly 4.2.0.
 */
export type ShadowFitMode = "legacy" | "current";

export function shadowFitMode(): ShadowFitMode {
  const g = globalThis as { __A3D_SHADOW_FIT__?: string; location?: { search?: string } };
  let value = g.__A3D_SHADOW_FIT__;
  try {
    const q = typeof g.location?.search === "string" ? new URLSearchParams(g.location.search).get("shadowfit") : null;
    if (q === "current" || q === "legacy") value = q;
  } catch {
    // no location (node, workers): fall through to the global
  }
  return value === "current" ? "current" : "legacy";
}

export const shadowFitLegacy = (): boolean => shadowFitMode() === "legacy";

/**
 * Dense instanced casters (one node with at least this many instances) draw their depth through a per-instance attribute buffer even
 * in the default (legacy) fit: one draw per node per cascade instead of ceil(n / 64). Same per-node threshold as the engine's
 * instanced shadow proxies, so the scenes it touches are the ones already audited for them (the forest benchmark: 8,000 / 8,000 /
 * 2,000 instances, 282 depth draws per cascade become 3). Nodes below it keep the 4.2.0 uniform-array batches exactly.
 */
export const DENSE_DEPTH_INSTANCE_MIN = 1024;

/** `globalThis.__A3D_DENSE_DEPTH_DRAWS__ = "off"` (or `?densedepth=off`) restores uniform-array batches for dense casters. */
export function denseDepthDrawsEnabled(): boolean {
  const g = globalThis as { __A3D_DENSE_DEPTH_DRAWS__?: string; location?: { search?: string } };
  let value = g.__A3D_DENSE_DEPTH_DRAWS__;
  try {
    const q = typeof g.location?.search === "string" ? new URLSearchParams(g.location.search).get("densedepth") : null;
    if (q === "off" || q === "on") value = q;
  } catch {
    // no location (node, workers): fall through to the global
  }
  return value !== "off";
}
