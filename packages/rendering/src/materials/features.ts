/**
 * materials/features.ts — PRD-04 C-02 ShaderFeatures (P3-3):
 *   prd04.uvTransform   (fragment:pars, per-slot mat3, KHR_texture_transform)
 *   prd04.tangentFrame  (vertex:world + fragment:normal)
 *   prd04.debugView     (fragment:end, A3D_PRD04_DEBUG_VIEW_<NAME>)
 * plus `uvTransformMatrix`, the spec-faithful CPU matrix builder.
 *
 * Registered from the rendering lane barrel; registry state only until the
 * C-02 generator splices feature chunks.
 */
import {
  registerShaderFeature,
  type ShaderFeature,
  type ShaderFeatureSelectInput
} from "../contracts/program";
import { Material, type RenderState } from "../Material.js";
import { MaterialInstance } from "../MaterialInstance.js";
import type { UniformValue } from "../RenderDevice";

/**
 * KHR_texture_transform matrix per PRD-04 §8.9: `T · R · S` with
 * `R = [[c, s], [-s, c]]` — the spec's counter-clockwise UV rotation in
 * glTF's top-left-origin UV space. Returned column-major (GLSL `mat3`
 * constructor order, same layout as `THREE.Matrix3.elements`).
 *
 * For uniform scale the elements are numerically identical to three's
 * `Matrix3.setUvTransform(ox, oy, s, s, r, 0, 0)`; for non-uniform scale with
 * `r ≠ 0` they intentionally differ (three composes `S · R`, which bakes the
 * rotation into the wrong axes — the README formula applies it in UV space).
 */
export function uvTransformMatrix(
  offset: readonly [number, number],
  rotation: number,
  scale: readonly [number, number]
): Float32Array {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const [sx, sy] = scale;
  // Matrix rows (column-vector apply M · uv):
  //   [ c*sx,  s*sy, ox ]
  //   [ -s*sx, c*sy, oy ]
  //   [ 0,     0,    1  ]
  return new Float32Array([
    c * sx, -s * sx, 0,
    s * sy, c * sy, 0,
    offset[0], offset[1], 1
  ]);
}

const FLAG = "A3D_QR_MATERIALS";
const OWNER = "prd04" as const;

/** Slots that may carry u_<slot>UvTransform (PRD-04 §8.9). */
const UV_TRANSFORM_SLOTS = [
  "baseColor", "normal", "metallicRoughness", "occlusion", "emissive",
  "clearcoat", "clearcoatRoughness", "clearcoatNormal",
  "transmission", "diffuseTransmission", "diffuseTransmissionColor",
  "volumeThickness", "specular", "specularColor",
  "sheenColor", "sheenRoughness", "anisotropy",
  "iridescence", "iridescenceThickness"
] as const;

type ParameterSource = { getParameter(name: string): UniformValue | undefined };

/**
 * Resolve the base material's render state across `Material`/`MaterialInstance`. The return
 * type admits C-04's `alphaToCoverage`, which `renderStateForGLTFMaterial` sets at runtime
 * even though the material `RenderState` type predates it (see P5-5).
 */
function renderStateOf(material: ParameterSource | undefined): (RenderState & { alphaToCoverage?: boolean }) | undefined {
  if (material instanceof MaterialInstance) return material.baseMaterial.renderState;
  if (material instanceof Material) return material.renderState;
  return undefined;
}

/** u_<slot>UvTransform mat3 (Float32Array, 9) stored on the material, if any. */
function transformParam(material: ParameterSource | undefined, slot: string): Float32Array | undefined {
  const v = material?.getParameter(`u_${slot}UvTransform`);
  return v instanceof Float32Array && v.length === 9 ? v : undefined;
}

const uvTransformFeature: ShaderFeature = {
  id: "prd04.uvTransform",
  owner: OWNER,
  flag: FLAG,
  hooks: ["fragment:pars"],
  chunks: ["a3d_prd04_uv_transform"],
  select(input: ShaderFeatureSelectInput) {
    const material = input.item.material as ParameterSource | undefined;
    let mask = 0;
    UV_TRANSFORM_SLOTS.forEach((slot, i) => {
      if (transformParam(material, slot) !== undefined) mask |= 1 << i;
    });
    return mask === 0 ? undefined : mask;
  },
  defines(value) {
    return { A3D_PRD04_UV_TRANSFORM_MASK: typeof value === "number" ? value : 0 };
  },
  bindUniforms(_value, item, set) {
    const material = item.material as ParameterSource | undefined;
    for (const slot of UV_TRANSFORM_SLOTS) {
      const mat = transformParam(material, slot);
      if (mat) set(`u_${slot}UvTransform`, mat);
    }
  }
};

/** Materials needing the tangent frame carry at least one of these params. */
const TANGENT_FRAME_PARAMS = [
  "u_normalTextureEnabled",
  "u_anisotropyTextureEnabled",
  "u_clearcoatNormalTextureEnabled",
  "u_prd04TangentFrame"
] as const;

const tangentFrameFeature: ShaderFeature = {
  id: "prd04.tangentFrame",
  owner: OWNER,
  flag: FLAG,
  hooks: ["vertex:world", "fragment:normal"],
  chunks: ["a3d_prd04_tangent_frame"],
  select(input: ShaderFeatureSelectInput) {
    const material = input.item.material as ParameterSource | undefined;
    if (!material) return undefined;
    for (const name of TANGENT_FRAME_PARAMS) {
      const v = material.getParameter(name);
      if (typeof v === "number" && v !== 0) return true;
    }
    return undefined;
  },
  defines(value) {
    return { A3D_PRD04_TANGENT_FRAME: value === true ? 1 : 0 };
  }
};

/**
 * `u_prd04DebugView` numeric channel selector (UniformValue has no string
 * type): ids 1..15 emit `A3D_PRD04_DEBUG_VIEW_<NAME>`; ids 101..115 emit the
 * `<NAME>EFFECTIVE` variant (the value the lobe receives, PRD-04 §8.10/P3-3).
 */
export const PRD04_DEBUG_VIEW_CHANNELS = [
  "BASECOLOR", "NORMAL", "METALLIC", "ROUGHNESS", "EMISSIVE", "OCCLUSION",
  "ALPHA", "CLEARCOAT", "SHEENCOLOR", "IRIDESCENCE", "ANISOTROPY",
  "TRANSMISSION", "TANGENT", "UV0", "UV1"
] as const;

export function prd04DebugViewDefineName(value: number): string | undefined {
  if (!Number.isInteger(value) || value <= 0) return undefined;
  const effective = value > 100;
  const index = (effective ? value - 100 : value) - 1;
  const name = PRD04_DEBUG_VIEW_CHANNELS[index];
  return name === undefined ? undefined : `A3D_PRD04_DEBUG_VIEW_${name}${effective ? "EFFECTIVE" : ""}`;
}

const debugViewFeature: ShaderFeature = {
  id: "prd04.debugView",
  owner: OWNER,
  flag: FLAG,
  hooks: ["fragment:end"],
  chunks: ["a3d_prd04_debug_view"],
  select(input: ShaderFeatureSelectInput) {
    const material = input.item.material as ParameterSource | undefined;
    const v = material?.getParameter("u_prd04DebugView");
    return typeof v === "number" && prd04DebugViewDefineName(v) !== undefined ? v : undefined;
  },
  defines(value) {
    const name = typeof value === "number" ? prd04DebugViewDefineName(value) : undefined;
    return name === undefined ? {} : { [name]: true };
  }
};

/**
 * `prd04.transmissionTarget` (P4-2): generated programs sample the lane
 * capture for KHR_materials_transmission/volume. The texture itself is a
 * frame resource — the C-01 path rebinds `a3d_prd04_transmissionSampler` per
 * frame from the `prd04.transmissionTarget` blackboard entry; `bindUniforms`
 * additionally forwards `u_prd04TransmissionTarget(Size)` material params so
 * a captured target can be pinned on the material for tests. The legacy
 * per-material `transmissionBackdropTexture` option is never read here.
 */
const transmissionTargetFeature: ShaderFeature = {
  id: "prd04.transmissionTarget",
  owner: OWNER,
  flag: "A3D_QR_MATERIALS_TRANSMISSION",
  hooks: ["fragment:pars", "fragment:indirect"],
  chunks: ["a3d_prd04_transmission", "a3d_prd04_volume"],
  select(input: ShaderFeatureSelectInput) {
    const material = input.item.material as ParameterSource | undefined;
    if (!material) return undefined;
    for (const name of ["u_transmissionFactor", "u_diffuseTransmissionFactor", "u_volumeThicknessFactor"] as const) {
      const v = material.getParameter(name);
      if (typeof v === "number" && v > 0.001) return true;
    }
    return undefined;
  },
  defines(value) {
    return { A3D_PRD04_TRANSMISSION_TARGET: value === true ? 1 : 0 };
  },
  bindUniforms(_value, item, set) {
    const material = item.material as ParameterSource | undefined;
    const target = material?.getParameter("u_prd04TransmissionTarget");
    if (target !== undefined) set("a3d_prd04_transmissionSampler", target);
    const size = material?.getParameter("u_prd04TransmissionTargetSize");
    if (size !== undefined) set("a3d_prd04_transmissionSamplerSize", size);
  }
};

/**
 * `prd04.alphaToCoverage` (P5-5): `a3d_prd04_alpha_a2c` splices at `fragment:alpha` for MASK
 * materials that requested alpha-to-coverage (`renderState.alphaToCoverage`, set by
 * `renderStateForGLTFMaterial` under the lane flag) and only when the tier's framebuffer
 * carries MSAA samples — on a 0-sample tier the smoothing has nothing to write into and the
 * plain MASK discard path keeps running.
 */
export const alphaToCoverageFeature: ShaderFeature = {
  id: "prd04.alphaToCoverage",
  owner: OWNER,
  flag: FLAG,
  hooks: ["fragment:alpha"],
  chunks: ["a3d_prd04_alpha_a2c"],
  select(input: ShaderFeatureSelectInput) {
    const material = input.item.material as ParameterSource | undefined;
    if (!material) return undefined;
    const cutoff = material.getParameter("u_alphaCutoff");
    const maskMode = typeof cutoff === "number" && cutoff > 0;
    return maskMode
      && renderStateOf(material)?.alphaToCoverage === true
      && (input.tier.msaaSamples ?? 0) > 0 ? true : undefined;
  },
  defines(value) {
    return { A3D_PRD04_ALPHA_TO_COVERAGE: value === true ? 1 : 0 };
  }
};

const FEATURES: readonly ShaderFeature[] = [uvTransformFeature, tangentFrameFeature, debugViewFeature, transmissionTargetFeature, alphaToCoverageFeature];

let registered = false;

/** Registers the PRD-04 ShaderFeatures; idempotent. */
export function registerPrd04ShaderFeatures(): void {
  if (registered) return;
  for (const feature of FEATURES) registerShaderFeature(feature);
  registered = true;
}
