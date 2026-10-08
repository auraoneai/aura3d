/**
 * T1.11 (PRD-06 §10) — the `A3D_QR_ANIMATION_POSE_MIXER` read for
 * `@aura3d/animation`. The package cannot import the engine's flag machinery
 * (dependency direction is engine → animation), so a provider seam is
 * installed by the app side (lane barrel `packages/engine/src/lanes/prd06.ts`
 * binds `qrAnimationFlags().on("A3D_QR_ANIMATION_POSE_MIXER")`). Without a
 * provider the env fallback reads `A3D_QR_ANIMATION_POSE_MIXER` directly.
 * Multi-word sub-flags cannot appear in the `A3D_QR=` list (the resolver's
 * short-name form is `lane.sub`, two parts), so the env var and the
 * `qualityRebuild.flags` record are the only sources — matching
 * `applyPerFlagEnv` semantics.
 *
 * Sub-flag semantics (§10): OFF means the legacy blend math runs unchanged —
 * the flag being merely unset is not an implicit opt-in.
 */

let poseMixerBlendProvider: (() => boolean) | undefined;

export function setPoseMixerBlendFlagProvider(provider: (() => boolean) | undefined): void {
  poseMixerBlendProvider = provider;
}

export function poseMixerBlendEnabled(): boolean {
  if (poseMixerBlendProvider !== undefined) {
    return poseMixerBlendProvider();
  }
  if (typeof process === "undefined") {
    return false;
  }
  const direct = process.env.A3D_QR_ANIMATION_POSE_MIXER;
  return direct === "1" || direct === "on" || direct === "true";
}
