// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraEnvironmentNode, AuraLightNode, AuraSceneSnapshot } from "../index.js";
import { colorToLinearRgb, groups, nonNegativeFinite, resolveRendererSceneCategory } from "../index.js";
import { createExternalParityEnvironmentLighting, type EnvironmentLightingOptions } from "@aura3d/rendering";

export function createProductionRuntimeEnvironment(snapshot: AuraSceneSnapshot): {
  readonly preset: string;
  readonly intensity: number;
  readonly evidence: string;
  readonly lighting: EnvironmentLightingOptions;
  readonly hdriUrl?: string;
  readonly hdriReflectionUrl?: string;
  readonly hdriRotation?: number;
} {
  const nodes = groups.flatten(snapshot.nodes);
  const authoredEnvironment = nodes.find((node): node is AuraEnvironmentNode => node.kind === "environment");
  if (authoredEnvironment) {
    const presetByEnvironment: Record<AuraEnvironmentNode["environment"], Parameters<typeof createExternalParityEnvironmentLighting>[0]> = {
      "studio": "studio",
      "material-lab": "inspection",
      "product-hero": "softbox",
      "night-cinematic": "evening",
      "metal-studio": "exhibit",
      "glass-studio": "softbox",
      // B3: HDRI first frames render the honest studio procedural fallback;
      // the post-mount upgrade swaps in the HDR chain (hdriUrl below).
      "hdri": "studio"
    };
    const preset = presetByEnvironment[authoredEnvironment.environment];
    const bundle = createExternalParityEnvironmentLighting(preset);
    const intensity = nonNegativeFinite(authoredEnvironment.intensity);
    const proceduralMap = bundle.lighting.proceduralMap;
    const hdriUrl = authoredEnvironment.environment === "hdri"
      && typeof authoredEnvironment.texture === "object"
      && (authoredEnvironment.texture as { kind?: string }).kind === "aura-asset-ref"
      ? (authoredEnvironment.texture as AuraAssetRef<"texture">).url ?? undefined
      : undefined;
    const hdriReflectionUrl = authoredEnvironment.environment === "hdri"
      && typeof authoredEnvironment.reflectionTexture === "object"
      && (authoredEnvironment.reflectionTexture as { kind?: string }).kind === "aura-asset-ref"
      ? (authoredEnvironment.reflectionTexture as AuraAssetRef<"texture">).url ?? undefined
      : undefined;
    const hdriRotation = authoredEnvironment.environment === "hdri" && authoredEnvironment.rotation !== undefined
      ? authoredEnvironment.rotation
      : undefined;
    return {
      preset: authoredEnvironment.environment,
      intensity,
      evidence: hdriUrl
        ? `production bridge renders the studio procedural fallback until the authored HDRI ${hdriUrl}${hdriReflectionUrl ? ` (reflection ${hdriReflectionUrl})` : ""} resolves through the HDR chain`
        : `production bridge submitted the authored ${authoredEnvironment.environment} environment through generated HDR ${preset} lighting`,
      ...(hdriUrl ? { hdriUrl } : {}),
      ...(hdriReflectionUrl ? { hdriReflectionUrl } : {}),
      ...(hdriRotation !== undefined ? { hdriRotation } : {}),
      lighting: {
        ...bundle.lighting,
        color: authoredEnvironment.color ? colorToLinearRgb(authoredEnvironment.color) : bundle.lighting.color,
        intensity: bundle.lighting.intensity * intensity,
        ...(proceduralMap ? {
          proceduralMap: {
            ...proceduralMap,
            intensity: proceduralMap.intensity * intensity,
            specularIntensity: proceduralMap.specularIntensity * intensity
          }
        } : {}),
        environmentMapIntensity: (bundle.lighting.environmentMapIntensity ?? 0) * intensity,
        environmentMapSpecularIntensity: (bundle.lighting.environmentMapSpecularIntensity ?? 0) * intensity
      }
    };
  }
  const ambientLights = nodes.filter((node): node is AuraLightNode => node.kind === "light" && node.light === "ambient" && node.intensity > 0);
  if (ambientLights.length > 0) {
    const intensity = ambientLights.reduce((total, light) => total + light.intensity, 0);
    const color = ambientLights.reduce<readonly [number, number, number]>((sum, light) => {
      const linear = colorToLinearRgb(light.color ?? "#ffffff");
      const weight = light.intensity / intensity;
      return [sum[0] + linear[0] * weight, sum[1] + linear[1] * weight, sum[2] + linear[2] * weight];
    }, [0, 0, 0]);
    return {
      preset: "authored-ambient",
      intensity,
      evidence: `production bridge submitted ${ambientLights.length} authored ambient light${ambientLights.length === 1 ? "" : "s"} without an implicit environment map`,
      lighting: { color, intensity, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 }
    };
  }
  const names = nodes.map((node) => "name" in node ? node.name?.toLowerCase() ?? "" : "");
  const category = resolveRendererSceneCategory(snapshot, names);
  const preset: Parameters<typeof createExternalParityEnvironmentLighting>[0] =
    category === "city-day" ? "daylight"
      : category === "city-night" ? "evening"
        : category === "game" ? "gameplay"
          : category === "material" ? "inspection"
            : "studio";
  const bundle = createExternalParityEnvironmentLighting(preset);
  return {
    preset,
    intensity: bundle.lighting.environmentMapIntensity ?? bundle.lighting.intensity,
    evidence: `production bridge submitted generated HDR ${preset} environment lighting through RenderSource.environmentLighting`,
    lighting: bundle.lighting
  };
}
