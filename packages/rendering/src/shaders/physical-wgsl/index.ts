/**
 * WGSL twins of the PRD-04 physical-lobe chunks (PRD-04 §8.12, P6-1).
 *
 * One module per `shaders/physical/*.glsl.ts` chunk, exporting the WGSL body
 * string that the chunk attaches as `ShaderChunk.wgsl`. The twins keep the
 * same `a3d_` names and identical math; differences are WGSL-structural only
 * (`ptr<function>` for out params, `texture_2d`+`sampler` split bindings,
 * `textureSampleLevel` LOD, `dpdx`/`dpdy` derivatives, `mat3x3f` per-slot
 * transforms in material uniform structs).
 *
 * Dependencies mirror the GLSL `requires` graph: `brdf` shim helpers
 * (`pow2`, `pow2v`, `F_Schlick`, `Schlick_to_F0`, `V_GGX_SmithCorrelated`,
 * `D_GGX`, `a3dDFG`, `max3`, `PI`, `RECIPROCAL_PI`, `EPSILON`) are provided by
 * the PRD-11 brdf WGSL twin when C-29 lands — until then the test shim
 * (`tests/qr/prd04/shims/brdf_r185.wgsl.ts`) resolves them for validation.
 */
import A3D_PRD04_BSDF_LOBES_COMMON_WGSL from "./bsdf_lobes_common.wgsl.js";
import A3D_PRD04_SPECULAR_IOR_WGSL from "./specular_ior.wgsl.js";
import A3D_PRD04_CLEARCOAT_WGSL from "./clearcoat.wgsl.js";
import A3D_PRD04_SHEEN_WGSL from "./sheen.wgsl.js";
import A3D_PRD04_IRIDESCENCE_WGSL from "./iridescence.wgsl.js";
import A3D_PRD04_ANISOTROPY_WGSL from "./anisotropy.wgsl.js";
import A3D_PRD04_TRANSMISSION_WGSL from "./transmission.wgsl.js";
import A3D_PRD04_VOLUME_WGSL from "./volume.wgsl.js";
import A3D_PRD04_DISPERSION_WGSL from "./dispersion.wgsl.js";
import A3D_PRD04_EMISSIVE_STRENGTH_WGSL from "./emissive_strength.wgsl.js";
import A3D_PRD04_UNLIT_WGSL from "./unlit.wgsl.js";
import A3D_PRD04_TANGENT_FRAME_WGSL from "./tangent_frame.wgsl.js";
import A3D_PRD04_UV_TRANSFORM_WGSL from "./uv_transform.wgsl.js";
import A3D_PRD04_ALPHA_A2C_WGSL from "./alpha_a2c.wgsl.js";
import A3D_PRD04_DEBUG_VIEW_WGSL from "./debug_view.wgsl.js";

/** chunk name → WGSL twin body, mirroring PRD04_SHADER_CHUNKS. */
export const PRD04_WGSL_TWINS: Readonly<Record<string, string>> = {
	a3d_prd04_bsdf_lobes_common: A3D_PRD04_BSDF_LOBES_COMMON_WGSL,
	a3d_prd04_specular_ior: A3D_PRD04_SPECULAR_IOR_WGSL,
	a3d_prd04_clearcoat: A3D_PRD04_CLEARCOAT_WGSL,
	a3d_prd04_sheen: A3D_PRD04_SHEEN_WGSL,
	a3d_prd04_iridescence: A3D_PRD04_IRIDESCENCE_WGSL,
	a3d_prd04_anisotropy: A3D_PRD04_ANISOTROPY_WGSL,
	a3d_prd04_transmission: A3D_PRD04_TRANSMISSION_WGSL,
	a3d_prd04_volume: A3D_PRD04_VOLUME_WGSL,
	a3d_prd04_dispersion: A3D_PRD04_DISPERSION_WGSL,
	a3d_prd04_emissive_strength: A3D_PRD04_EMISSIVE_STRENGTH_WGSL,
	a3d_prd04_unlit: A3D_PRD04_UNLIT_WGSL,
	a3d_prd04_tangent_frame: A3D_PRD04_TANGENT_FRAME_WGSL,
	a3d_prd04_uv_transform: A3D_PRD04_UV_TRANSFORM_WGSL,
	a3d_prd04_alpha_a2c: A3D_PRD04_ALPHA_A2C_WGSL,
	a3d_prd04_debug_view: A3D_PRD04_DEBUG_VIEW_WGSL
};

export {
	A3D_PRD04_BSDF_LOBES_COMMON_WGSL,
	A3D_PRD04_SPECULAR_IOR_WGSL,
	A3D_PRD04_CLEARCOAT_WGSL,
	A3D_PRD04_SHEEN_WGSL,
	A3D_PRD04_IRIDESCENCE_WGSL,
	A3D_PRD04_ANISOTROPY_WGSL,
	A3D_PRD04_TRANSMISSION_WGSL,
	A3D_PRD04_VOLUME_WGSL,
	A3D_PRD04_DISPERSION_WGSL,
	A3D_PRD04_EMISSIVE_STRENGTH_WGSL,
	A3D_PRD04_UNLIT_WGSL,
	A3D_PRD04_TANGENT_FRAME_WGSL,
	A3D_PRD04_UV_TRANSFORM_WGSL,
	A3D_PRD04_ALPHA_A2C_WGSL,
	A3D_PRD04_DEBUG_VIEW_WGSL
};
