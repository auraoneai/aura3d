/**
 * GU47 E-D (PRD §3.1): what a per-instance colour multiplies (`instanceColorTarget`).
 *
 * Today the generated program multiplies the base colour by `a_instanceColor` (`USE_INSTANCING_COLOR`). The engine
 * stamps `u_a3dInstanceColorTarget` on the node's material (0 = "base", 1 = "emissive", 2 = "both"; written through the
 * public `Material.setParameter` API) and ForwardPass routes the colours per draw:
 *   - "base" (or no parameter): unchanged; this feature never selects, so the program is byte-identical.
 *   - "both": `a_instanceColor` still multiplies the base, and this feature also multiplies the emissive term by it.
 *   - "emissive": ForwardPass drops `instancing.color` from the program record (no base multiply) and binds the same
 *     colour buffer as `a_a3dInstanceEmissive`; this feature declares it and multiplies the emissive term only.
 * Multiply semantics match "base": give the material an emissive colour (white is the usual choice) and an
 * `emissiveIntensity`, and each instance glows its own colour. Generated programs only.
 */

import { registerShaderChunk, registerShaderFeature, shaderChunk, type ShaderFeature } from "../../contracts/program";
import type { RenderItem } from "../../contracts/renderItem";
import type { Material } from "../../Material";
import { MaterialInstance } from "../../MaterialInstance";

export type InstanceColorTarget = "base" | "emissive" | "both";

export const A3D_INSTANCE_COLOR_TARGET_FEATURE = "prd04.instanceColorTarget";
export const A3D_INSTANCE_COLOR_TARGET_PARAM = "u_a3dInstanceColorTarget";
/** Per-instance attribute that carries the colours when the target is "emissive" (no base multiply). */
export const A3D_INSTANCE_EMISSIVE_ATTRIBUTE = "a_a3dInstanceEmissive";

export const A3D_INSTANCE_EMISSIVE_VTX_PARS_CHUNK = "a3d_prd04_instance_emissive_vtx_pars";
export const A3D_INSTANCE_EMISSIVE_VTX_END_CHUNK = "a3d_prd04_instance_emissive_vtx_end";
export const A3D_INSTANCE_EMISSIVE_FRAG_PARS_CHUNK = "a3d_prd04_instance_emissive_frag_pars";
export const A3D_INSTANCE_EMISSIVE_FRAG_CALL_CHUNK = "a3d_prd04_instance_emissive_frag_call";

// Varying named apart from PRD-11's `v_a3dInstanceEmissive` (`batching/shaders/instanceEmissive.glsl.ts`), so both
// features may select in one program.
const VTX_PARS_GLSL = /* glsl */ `
#ifdef A3D_INSTANCE_EMISSIVE_ATTRIBUTE
in vec4 a_a3dInstanceEmissive;
out vec4 v_a3dInstanceEmissiveTint;
#endif
`;

const VTX_END_GLSL = /* glsl */ `
#ifdef A3D_INSTANCE_EMISSIVE_ATTRIBUTE
v_a3dInstanceEmissiveTint = a_a3dInstanceEmissive;
#endif
`;

const FRAG_PARS_GLSL = /* glsl */ `
#ifdef A3D_INSTANCE_EMISSIVE_ATTRIBUTE
in vec4 v_a3dInstanceEmissiveTint;
#endif
`;

const FRAG_CALL_GLSL = /* glsl */ `
#if defined(A3D_INSTANCE_EMISSIVE_ATTRIBUTE)
a3dEmissive *= v_a3dInstanceEmissiveTint.rgb;
#elif defined(USE_INSTANCING_COLOR)
a3dEmissive *= v_instanceColor.rgb;
#endif
`;

const TARGET_CODES: Readonly<Record<InstanceColorTarget, number>> = { base: 0, emissive: 1, both: 2 };

/** Material parameter value for a target. */
export function instanceColorTargetCode(target: InstanceColorTarget | undefined): number {
  return TARGET_CODES[target ?? "base"] ?? 0;
}

/** The target a material carries ("base" when it has none). */
export function materialInstanceColorTarget(material: Material | MaterialInstance | undefined): InstanceColorTarget {
  if (!material) return "base";
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  if (base.disposed) return "base";
  const value = base.getParameter(A3D_INSTANCE_COLOR_TARGET_PARAM);
  return value === 1 ? "emissive" : value === 2 ? "both" : "base";
}

/** `select`: forward draws with per-instance colours whose material targets the emissive term. Pure. */
export function selectInstanceColorTargetFeature(item: RenderItem, pass: string): "emissive" | "both" | undefined {
  if (pass !== "forward" || item.instanceTransforms === undefined || item.instanceColors === undefined) return undefined;
  const target = materialInstanceColorTarget(item.material);
  return target === "base" ? undefined : target;
}

const FEATURE: ShaderFeature = {
  id: A3D_INSTANCE_COLOR_TARGET_FEATURE,
  owner: "prd04",
  flag: "A3D_QR_MATERIALS",
  order: 10,
  select: (input) => selectInstanceColorTargetFeature(input.item, input.pass),
  defines: (value): Readonly<Record<string, string | number | true>> => value === "emissive"
    ? { A3D_INSTANCE_COLOR_EMISSIVE: true, A3D_INSTANCE_EMISSIVE_ATTRIBUTE: true }
    : { A3D_INSTANCE_COLOR_EMISSIVE: true },
  chunks: [A3D_INSTANCE_EMISSIVE_VTX_PARS_CHUNK, A3D_INSTANCE_EMISSIVE_VTX_END_CHUNK, A3D_INSTANCE_EMISSIVE_FRAG_PARS_CHUNK, A3D_INSTANCE_EMISSIVE_FRAG_CALL_CHUNK],
  hooks: ["vertex:pars", "vertex:end", "fragment:pars", "fragment:emissive"]
};

let registered = false;

/** Registers the chunks and the `prd04.instanceColorTarget` ShaderFeature once per process (ForwardPass calls this at load). */
export function registerInstanceColorTargetFeature(): void {
  if (registered) return;
  const chunks: readonly [string, string, "vertex" | "fragment"][] = [
    [A3D_INSTANCE_EMISSIVE_VTX_PARS_CHUNK, VTX_PARS_GLSL, "vertex"],
    [A3D_INSTANCE_EMISSIVE_VTX_END_CHUNK, VTX_END_GLSL, "vertex"],
    [A3D_INSTANCE_EMISSIVE_FRAG_PARS_CHUNK, FRAG_PARS_GLSL, "fragment"],
    [A3D_INSTANCE_EMISSIVE_FRAG_CALL_CHUNK, FRAG_CALL_GLSL, "fragment"]
  ];
  for (const [name, glsl, stage] of chunks) {
    if (!shaderChunk(name)) registerShaderChunk({ name, owner: "prd04", glsl, stage });
  }
  registerShaderFeature(FEATURE);
  registered = true;
}
