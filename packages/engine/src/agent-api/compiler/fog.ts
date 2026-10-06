// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraEffectNode, AuraSceneSnapshot } from "../index.js";
import { clampNumber, colorToLinearRgb, groups } from "../index.js";
import { resolveVolumetricFog, type CollectedLight, type ForwardEnvironmentFogOptions } from "@aura3d/rendering";
import { lights } from "../nodes/lights.js";

export function createProductionRuntimeEnvironmentFog(
  snapshot: AuraSceneSnapshot,
  lights: readonly CollectedLight[] = [],
  renderWidth = 1280,
  renderHeight = 720
): ForwardEnvironmentFogOptions | false {
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
