// PRD-07 §8.8 / I3 — scene lighting for the merged decal pass. Decals must
// shade like the surface they sit on (promote run 38196483050: a fixed
// half-Lambert sun + 0.14 SH ambient + unweighted GGX lit a #0a0a0c scorch mark
// brighter than the asphalt under it). Reads the same light list the forward
// pass shades with (`source.collectedLights`) and the
// ambient `environmentLighting` colour × intensity.

// Type-only imports: this module is reached from the lazily evaluated vfx
// chunk; a runtime LightCollector import tripped a chunk-cycle TDZ
// ("Cannot access 'g' before initialization", prd07-volumetric-shafts).
import type { CollectedLight } from "../LightCollector";
import type { FrameContributorContext } from "../contracts/frameGraph";
import type { RenderSource } from "../contracts/renderSource";
import type { DecalLight, DecalLighting } from "./DecalPass";

/** Mirrors DECAL_MAX_LIGHTS in DecalPass.ts (kept local: no runtime import cycle). */
const DECAL_MAX_LIGHTS = 5;

function unit(v: readonly number[]): [number, number, number] | null {
  const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return l > 0 ? [(v[0] ?? 0) / l, (v[1] ?? 0) / l, (v[2] ?? 0) / l] : null;
}

function luminance(c: readonly number[]): number {
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}

/** Collected lights → decal lights (directional + point/spot as point), brightest first. */
export function decalLightsFrom(collected: Iterable<CollectedLight>): DecalLight[] {
  const out: { light: DecalLight; weight: number }[] = [];
  for (const light of collected) {
    if (light.source?.visible === false || !(light.intensity > 0)) continue;
    const radiance: [number, number, number] = [light.color[0] * light.intensity, light.color[1] * light.intensity, light.color[2] * light.intensity];
    if (light.kind === "directional") {
      // CollectedLight.direction is the travel direction; the BRDF wants L.
      const toward = unit([-light.direction[0], -light.direction[1], -light.direction[2]]);
      if (toward) out.push({ light: { kind: "directional", vector: toward, radiance }, weight: luminance(radiance) * 4 });
    } else if (light.kind === "point" || light.kind === "spot") {
      out.push({
        light: { kind: "point", vector: [light.position[0], light.position[1], light.position[2]], radiance, range: Number.isFinite(light.range) ? light.range : 0 },
        weight: luminance(radiance)
      });
    }
  }
  out.sort((a, b) => b.weight - a.weight);
  return out.slice(0, DECAL_MAX_LIGHTS).map((entry) => entry.light);
}

/** Per-frame decal lighting from the render source; null when nothing is published. */
export function resolveDecalLighting(ctx: FrameContributorContext): DecalLighting | null {
  const source = ctx.source as RenderSource;
  // The compiled light list the forward pass shades with; without one the
  // pass falls back to its default rig.
  const collected = source.collectedLights ?? null;
  const env = source.environmentLighting;
  const ambient: [number, number, number] = env
    ? [env.color[0] * env.intensity, env.color[1] * env.intensity, env.color[2] * env.intensity]
    : [0, 0, 0];
  if (collected === null && !env) return null;
  return { lights: collected ? decalLightsFrom(collected) : [], ambient };
}
