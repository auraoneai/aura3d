// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.
// PRD-07 P4-T4 — flag-on branch resolves live atmosphere state (§6.6): the
// last *visible* fog node in scene order, C-21 defaults applied at resolve
// time, height mode mapped to legacy exp uniforms via packLegacy, and
// `color: "sky"` resolved from the sky's horizon radiance at the view azimuth.

import type { AuraEffectNode, AuraSceneSnapshot } from "../index.js";
import { clampNumber, colorToLinearRgb, groups } from "../index.js";
import { resolveVolumetricFog, type CollectedLight, type ForwardEnvironmentFogOptions } from "@aura3d/rendering";
import { packLegacy, parseFogColor, resolvePrd07FogSpec, skyHorizonRadiance, type Prd07FogSpec } from "@aura3d/rendering/lanes";
import type { QrFlags } from "@aura3d/rendering/contracts";
import type { LiveAtmosphere } from "../../production-runtime/effects/LiveAtmosphere";
import { lights } from "../nodes/lights.js";

/**
 * P4-T3/P4-T4 binding — the atmosphere extension registers the app's resolved
 * flags + LiveAtmosphere here so the per-frame compile can read live fog
 * without a signature change to the PRD-15 call site (renderInput.ts).
 * Flag-off / unbound: the legacy path below is byte-identical.
 */
let prd07FogRuntime: { readonly flags: QrFlags; readonly atmosphere: LiveAtmosphere } | null = null;

export function bindPrd07FogRuntime(runtime: { flags: QrFlags; atmosphere: LiveAtmosphere } | null): void {
  prd07FogRuntime = runtime;
}

/** Exported for tests. */
export function prd07FogRuntimeState(): { readonly flags: QrFlags; readonly atmosphere: LiveAtmosphere } | null {
  return prd07FogRuntime;
}

/** `color: "sky"` → horizon radiance at the view azimuth (§6.6, shared 8-sample table). */
function skyHorizonColor(live: LiveAtmosphere): [number, number, number] | null {
  const sky = live.state().sky;
  if (!sky) return null;
  const fwd = live.cameraPose().forward;
  const sample = skyHorizonRadiance(sky, Math.atan2(fwd[0], fwd[2]));
  return sample ? ([sample[0], sample[1], sample[2]] as [number, number, number]) : null;
}

/**
 * Flag-on compile (§6.6): resolve the live spec (nodes tracked on
 * LiveAtmosphere, transitions applied), apply C-21 defaults, map to the legacy
 * `u_environmentFog*` uniforms via packLegacy — the "legacy-approximation"
 * path while forward geometry is on the C-04 stub.
 */
function createPrd07EnvironmentFog(live: LiveAtmosphere): ForwardEnvironmentFogOptions | false {
  const raw = live.resolveFog();
  if (!raw) return false;
  const spec = resolvePrd07FogSpec(raw as Prd07FogSpec);
  const cameraY = live.cameraPose().position[1];
  const packed = packLegacy(spec, cameraY);
  const color =
    spec.color === "sky"
      ? skyHorizonColor(live) ?? [0.663, 0.737, 0.812]
      : [...parseFogColor(spec.color, [0.663, 0.737, 0.812])] as [number, number, number];
  return {
    mode: packed.mode,
    color,
    // near/far no longer hard-coded (§6.6) — only meaningful in linear mode.
    near: packed.near,
    far: packed.far,
    density: packed.density,
    heightFalloff: packed.heightFalloff,
    heightReference: packed.heightReference,
    // 0.525 cap dropped unless the spec asks for it (legacyOpacityCap, §11).
    maxOpacity: packed.maxOpacity
  };
}

export function createProductionRuntimeEnvironmentFog(
  snapshot: AuraSceneSnapshot,
  lights: readonly CollectedLight[] = [],
  renderWidth = 1280,
  renderHeight = 720
): ForwardEnvironmentFogOptions | false {
  const prd07 = prd07FogRuntime?.flags.on("A3D_QR_VFX_FOG") ? prd07FogRuntime : null;
  if (prd07) {
    return createPrd07EnvironmentFog(prd07.atmosphere);
  }
  const nodes = groups.flatten(snapshot.nodes);
  const volumetric = nodes.find(
    (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "volumetric-fog"
  );
  const fog = volumetric ?? nodes.find(
    (node): node is AuraEffectNode => node.kind === "effect" && node.effect === "fog"
  );
  if (!fog) return false;
  const density = clampNumber(fog.density ?? 0.12, 0, 1);
  const intensity = clampNumber(fog.intensity ?? 0.5, 0, 1);
  const color = colorToLinearRgb(fog.color ?? "#9fb7d9");
  const base = {
    // Exponential-squared reads as depth haze rather than a hard linear band, which
    // matches what the public helper documents.
    mode: "exponential-squared" as const,
    color: [color[0], color[1], color[2]] as [number, number, number],
    near: 1,
    far: 60,
    density,
    maxOpacity: clampNumber(0.25 + intensity * 0.55, 0, 0.92)
  };
  if (!volumetric) return base;
  // A5: the volumetric-fog node drives the GPU forward inscatter terms from
  // the dominant collected light; quality "off" zeroes the forward term and
  // keeps this exp2 base exactly.
  const resolved = resolveVolumetricFog(
    {
      density: volumetric.density,
      intensity: volumetric.intensity,
      ...(volumetric.lightPosition ? { lightPosition: volumetric.lightPosition } : {}),
      ...(volumetric.heightFalloff !== undefined ? { heightFalloff: volumetric.heightFalloff } : {}),
      ...(volumetric.heightReference !== undefined ? { heightReference: volumetric.heightReference } : {}),
      ...(volumetric.volumetricQuality ? { quality: volumetric.volumetricQuality } : {})
    },
    lights,
    renderWidth,
    renderHeight
  );
  return {
    ...base,
    density: clampNumber(volumetric.density ?? 0.18, 0, 1),
    volumetricIntensity: resolved.forward.volumetricIntensity,
    ...(resolved.forward.volumetricLightDirection ? { volumetricLightDirection: resolved.forward.volumetricLightDirection } : {}),
    volumetricLightColor: resolved.forward.volumetricLightColor,
    ...(resolved.forward.heightFalloff !== undefined ? { heightFalloff: resolved.forward.heightFalloff } : {}),
    ...(resolved.forward.heightReference !== undefined ? { heightReference: resolved.forward.heightReference } : {})
  };
}
