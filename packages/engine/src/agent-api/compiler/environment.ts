// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraEnvironmentNode, AuraLightNode, AuraSceneSnapshot } from "../index.js";
import { colorToLinearRgb, groups, nonNegativeFinite, resolveRendererSceneCategory } from "../index.js";
import { createExternalParityEnvironmentLighting, linearToSrgbChannel, type EnvironmentLightingOptions } from "@aura3d/rendering";
import { registerEnvironmentSource, type AuraEnvironmentSourceResolution } from "../../contracts/environment.js";
import type { AuraEnvironmentNodeV2, AuraEnvironmentPresetName } from "../nodes/environments.js";
import type { AuraColor } from "../index.js";

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
    const presetByEnvironment: Record<string, Parameters<typeof createExternalParityEnvironmentLighting>[0]> = {
      "studio": "studio",
      "material-lab": "inspection",
      "product-hero": "softbox",
      "night-cinematic": "evening",
      "metal-studio": "exhibit",
      "glass-studio": "softbox",
      // B3: HDRI first frames render the honest studio procedural fallback;
      // the post-mount upgrade swaps in the HDR chain (hdriUrl below).
      "hdri": "studio",
      // PRD-02 V2 kinds with the flag OFF degrade to the closest legacy
      // preset (additive keys; previously they could not appear).
      "preset": "studio",
      "neutral": "studio",
      "capture": "studio"
    };
    if (authoredEnvironment.environment === "none" as AuraEnvironmentNode["environment"]) {
      // environments.none(): explicit zero-IBL opt-out (PRD-02 §7).
      return {
        preset: "none",
        intensity: 0,
        evidence: "production bridge binds no environment map (environments.none())",
        lighting: { color: [1, 1, 1], intensity: 0, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 }
      };
    }
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

// ---------- PRD-02 Phase 2 — C-09 environment sources (flag path) ----------

/** Additive ambient term: ambient lights never replace IBL under the flag
 *  (F-02-01). Returns null when no ambient light contributes. Colors blend
 *  in linear space (same weighting as the legacy authored-ambient branch)
 *  and are emitted back as an sRGB hex `AuraColor`. */
export function prd02AmbientTerm(snapshot: AuraSceneSnapshot): { readonly color: AuraColor; readonly intensity: number } | null {
  const ambientLights = groups.flatten(snapshot.nodes).filter(
    (node): node is AuraLightNode => node.kind === "light" && node.light === "ambient" && (node.intensity ?? 0) > 0
  );
  if (ambientLights.length === 0) return null;
  const intensity = ambientLights.reduce((total, light) => total + (light.intensity ?? 0), 0);
  const color = ambientLights.reduce<readonly [number, number, number]>((sum, light) => {
    const linear = colorToLinearRgb(light.color ?? "#ffffff");
    const weight = (light.intensity ?? 0) / intensity;
    return [sum[0] + linear[0] * weight, sum[1] + linear[1] * weight, sum[2] + linear[2] * weight];
  }, [0, 0, 0]);
  const hex = (v: number) => Math.round(linearToSrgbChannel(v) * 255).toString(16).padStart(2, "0");
  return { color: `#${hex(color[0])}${hex(color[1])}${hex(color[2])}`, intensity };
}

/** §11 alias → preset name: every legacy environment kind except
 *  night-cinematic resolves to the "studio" preset (§11 table); the
 *  categories keep their semantic name only in the legacy path. */
const LEGACY_ENVIRONMENT_PRESET: Record<string, AuraEnvironmentPresetName> = {
  "studio": "studio",
  "material-lab": "studio",
  "product-hero": "studio",
  "night-cinematic": "night",
  "metal-studio": "studio",
  "glass-studio": "studio"
};

function resolveBackgroundOption(
  node: AuraEnvironmentNodeV2,
  defaultVisible: boolean
): AuraEnvironmentSourceResolution["background"] {
  const opt = node.background;
  if (opt === false) return false;
  if (opt === true || opt === undefined) {
    return { visible: opt === undefined ? defaultVisible : true, blurriness: 0, intensity: 1, rotation: 0 };
  }
  return {
    visible: opt.visible ?? defaultVisible,
    blurriness: opt.blurriness ?? 0,
    intensity: opt.intensity ?? 1,
    rotation: opt.rotation ?? 0
  };
}

export function explicitEnvironmentResolution(
  node: AuraEnvironmentNodeV2,
  ambient: AuraEnvironmentSourceResolution["ambient"]
): AuraEnvironmentSourceResolution | undefined {
  const intensity = nonNegativeFinite(node.intensity);
  const diffuseIntensity = nonNegativeFinite(node.diffuseIntensity ?? intensity);
  const specularIntensity = nonNegativeFinite(node.specularIntensity ?? intensity);
  const rotation = node.rotation ?? 0;
  const base = { kind: "explicit" as const, intensity, diffuseIntensity, specularIntensity, rotation, ambient };
  switch (node.environment) {
    case "none":
      // Explicit zero-IBL opt-out: the neutral probe is still bound so the
      // renderer path stays uniform, but both IBL intensities are zeroed.
      return { ...base, probe: "neutral", diffuseIntensity: 0, specularIntensity: 0, intensity: 0, background: false };
    case "neutral":
      return { ...base, probe: "neutral", background: resolveBackgroundOption(node, false) };
    case "preset":
      return { ...base, probe: { preset: node.preset ?? "studio" }, background: resolveBackgroundOption(node, true) };
    case "capture":
      return {
        ...base,
        probe: {
          capture: {
            include: node.capture?.include ?? "sky-only",
            ...(node.capture?.position ? { position: node.capture.position } : {}),
            ...(node.capture?.resolution ? { resolution: node.capture.resolution } : {}),
            ...(node.capture?.update ? { update: node.capture.update as "once" | "on-demand" | { readonly everyNFrames: number } } : {})
          }
        },
        background: resolveBackgroundOption(node, true)
      };
    case "hdri": {
      const url = typeof node.texture === "object" && node.texture !== null && node.texture.kind === "aura-asset-ref"
        ? node.texture.url
        : undefined;
      const reflection = typeof node.reflectionTexture === "object" && node.reflectionTexture !== null && node.reflectionTexture.kind === "aura-asset-ref"
        ? node.reflectionTexture.url
        : undefined;
      if (!url) return undefined; // malformed hdri node: fall through to neutral-room
      return { ...base, probe: { hdri: url, ...(reflection ? { reflection } : {}) }, background: resolveBackgroundOption(node, true) };
    }
    default: {
      // Legacy alias kinds (§11): resolve to presets with background off.
      const preset = LEGACY_ENVIRONMENT_PRESET[node.environment];
      if (!preset) return undefined;
      return { ...base, probe: { preset }, background: resolveBackgroundOption(node, false) };
    }
  }
}

let prd02SourcesRegistered = false;

/**
 * Registers the lane's two C-09 sources (idempotent):
 *  - `prd02.explicit` (400): an authored `environments.*`/`environment` node
 *    supplies the probe request; ambient stays additive.
 *  - `prd02.neutral-room` (0): no explicit source resolved → the
 *    code-generated RoomEnvironment probe, still additive-ambient.
 * The legacy category/ambient branches in createProductionRuntimeEnvironment
 * are untouched — they only run under the flag-off "legacy" source.
 */
export function registerPrd02EnvironmentSources(): void {
  if (prd02SourcesRegistered) return;
  prd02SourcesRegistered = true;
  registerEnvironmentSource({
    id: "prd02.explicit",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    priority: 400,
    resolve(snapshot) {
      const node = groups.flatten(snapshot.nodes).find(
        (n): n is AuraEnvironmentNode => n.kind === "environment"
      ) as AuraEnvironmentNodeV2 | undefined;
      if (!node) return undefined;
      return explicitEnvironmentResolution(node, prd02AmbientTerm(snapshot));
    }
  });
  registerEnvironmentSource({
    id: "prd02.neutral-room",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    priority: 0,
    resolve(snapshot) {
      return {
        kind: "neutral-room",
        probe: "neutral",
        intensity: 1,
        diffuseIntensity: 1,
        specularIntensity: 1,
        rotation: 0,
        background: false,
        ambient: prd02AmbientTerm(snapshot)
      };
    }
  });
}
