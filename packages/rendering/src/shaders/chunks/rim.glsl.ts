/**
 * GU47 E-D (PRD §3.1): `rim: { color, power, intensity }` on the forward PBR program.
 *
 * The forward term is the PRD-04 `prd04.rim` ShaderFeature (#88: `materials/features.ts`, chunks `a3d_prd04_rim_pars`
 * and `a3d_prd04_rim_call` in `shaders/physical/lobe_calls.glsl.ts`, registered by `lanes/prd04.ts`). It adds
 * `u_prd04RimColor * u_prd04RimStrength * (1 - N·V)^u_prd04RimPower` to the emitted light of lit generated programs and
 * selects only when the draw's material carries `u_prd04RimStrength > 0`, so a material without rim (or with intensity
 * 0) gets no feature bit, no define and no chunk: its program is byte-identical to the one it compiled to before.
 *
 * GU47 reuses that feature instead of registering a second one (a second `prd04.rim` id throws REGISTRY_DUPLICATE when
 * the rendering barrel loads, and two rim terms could stack). This module is the single source of the parameter names
 * and defaults the engine lowers `rim` onto (`production-runtime/ModelMaterialOverrides.ts` mirrors them, it cannot
 * import this file), and of the `a3dRim()` GLSL the toon material and the author chunk `a3d_rim` share. Generated
 * programs only (the default `A3D_QR_CORE` path); the frozen legacy shaderKey library (`?a3d-qr=-core`) has no rim.
 */

import type { Material } from "../../Material";
import { MaterialInstance } from "../../MaterialInstance";

/** The forward ShaderFeature that draws the rim (`materials/features.ts` `rimFeature`). */
export const A3D_RIM_FEATURE = "prd04.rim";

/** Material parameter names (also the GLSL uniform names of `a3d_prd04_rim_pars`). */
export const A3D_RIM_COLOR_PARAM = "u_prd04RimColor";
export const A3D_RIM_POWER_PARAM = "u_prd04RimPower";
export const A3D_RIM_INTENSITY_PARAM = "u_prd04RimStrength";

export const A3D_RIM_DEFAULT_POWER = 3;
export const A3D_RIM_DEFAULT_INTENSITY = 1;
/** Clamp ranges the engine lowering applies (`power` 0.1..16, `intensity` 0..16). */
export const A3D_RIM_POWER_RANGE: readonly [number, number] = [0.1, 16];
export const A3D_RIM_INTENSITY_RANGE: readonly [number, number] = [0, 16];

/**
 * `vec3 a3dRim(n, v, color, power, intensity)`: the same term as `a3d_prd04_rim_call`, written with `exp2/log2` instead
 * of `pow` so it is defined for every input on every GPU and composes with the custom-material safe-`pow` define. Used by
 * `material.toon` and published to `material.custom` authors as `#include <a3d_rim>`.
 */
export const A3D_RIM_FUNCTION_GLSL = /* glsl */ `
vec3 a3dRim(vec3 n, vec3 v, vec3 color, float power, float intensity) {
  float facing = clamp(dot(normalize(n), normalize(v)), 0.0, 1.0);
  float edge = exp2(clamp(power, 0.1, 16.0) * log2(max(1.0 - facing, 1e-4)));
  return color * (clamp(intensity, 0.0, 16.0) * edge);
}
`;

/** The rim intensity a material carries (0 when it has no rim, so `prd04.rim` does not select). */
export function materialRimIntensity(material: Material | MaterialInstance | undefined): number {
  if (!material) return 0;
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  if (base.disposed) return 0;
  const value = base.getParameter(A3D_RIM_INTENSITY_PARAM);
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
