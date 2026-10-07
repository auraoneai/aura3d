/**
 * PRD 04 physical-material shader chunks (PRD-04 §8, P1-1).
 *
 * One exported ShaderChunk per file, named `a3d_prd04_<name>`, owner
 * "prd04". Registration happens unconditionally via the rendering lane
 * barrel (`lanes/prd04.ts`); chunk activation stays feature/flag driven —
 * a registered chunk is inert until a ShaderFeature selects it.
 *
 * The `requires` edges order chunk splices inside generateProgram: every
 * lobe that uses the PhysicalMaterial-facing helpers (saturate, pow2,
 * F_Schlick, V_GGX_SmithCorrelated, D_GGX, a3dDFG, …) declares `brdf`; lobes
 * that read the shared A3DPrd04Lobes struct declare
 * `a3d_prd04_bsdf_lobes_common`; transmission-family lobes chain
 * `a3d_prd04_volume` / `a3d_prd04_transmission` / `a3d_prd04_dispersion`.
 */
import { registerShaderChunk, shaderChunk } from "../../contracts/program";

import { A3D_PRD04_BSDF_LOBES_COMMON } from "./bsdf_lobes_common.glsl.js";
import { A3D_PRD04_SPECULAR_IOR } from "./specular_ior.glsl.js";
import { A3D_PRD04_CLEARCOAT } from "./clearcoat.glsl.js";
import { A3D_PRD04_SHEEN } from "./sheen.glsl.js";
import { A3D_PRD04_IRIDESCENCE } from "./iridescence.glsl.js";
import { A3D_PRD04_ANISOTROPY } from "./anisotropy.glsl.js";
import { A3D_PRD04_TRANSMISSION } from "./transmission.glsl.js";
import { A3D_PRD04_VOLUME } from "./volume.glsl.js";
import { A3D_PRD04_DISPERSION } from "./dispersion.glsl.js";
import { A3D_PRD04_EMISSIVE_STRENGTH } from "./emissive_strength.glsl.js";
import { A3D_PRD04_UNLIT } from "./unlit.glsl.js";
import { A3D_PRD04_TANGENT_FRAME } from "./tangent_frame.glsl.js";
import { A3D_PRD04_UV_TRANSFORM } from "./uv_transform.glsl.js";
import { A3D_PRD04_ALPHA_A2C } from "./alpha_a2c.glsl.js";
import { A3D_PRD04_DEBUG_VIEW } from "./debug_view.glsl.js";

export const PRD04_SHADER_CHUNKS = [
	A3D_PRD04_BSDF_LOBES_COMMON,
	A3D_PRD04_SPECULAR_IOR,
	A3D_PRD04_CLEARCOAT,
	A3D_PRD04_SHEEN,
	A3D_PRD04_IRIDESCENCE,
	A3D_PRD04_ANISOTROPY,
	A3D_PRD04_TRANSMISSION,
	A3D_PRD04_VOLUME,
	A3D_PRD04_DISPERSION,
	A3D_PRD04_EMISSIVE_STRENGTH,
	A3D_PRD04_UNLIT,
	A3D_PRD04_TANGENT_FRAME,
	A3D_PRD04_UV_TRANSFORM,
	A3D_PRD04_ALPHA_A2C,
	A3D_PRD04_DEBUG_VIEW
] as const;

let registered = false;

/**
 * Register every a3d_prd04_* chunk with the program registry (C-02).
 * Idempotent: a second call is a no-op so repeated lane-barrel evaluation
 * or test setups cannot double-register.
 */
export function registerPrd04ShaderChunks(): void {
	if (registered) return;
	for (const chunk of PRD04_SHADER_CHUNKS) {
		if (shaderChunk(chunk.name) === undefined) {
			registerShaderChunk(chunk);
		}
	}
	registered = true;
}

export {
	A3D_PRD04_BSDF_LOBES_COMMON,
	A3D_PRD04_SPECULAR_IOR,
	A3D_PRD04_CLEARCOAT,
	A3D_PRD04_SHEEN,
	A3D_PRD04_IRIDESCENCE,
	A3D_PRD04_ANISOTROPY,
	A3D_PRD04_TRANSMISSION,
	A3D_PRD04_VOLUME,
	A3D_PRD04_DISPERSION,
	A3D_PRD04_EMISSIVE_STRENGTH,
	A3D_PRD04_UNLIT,
	A3D_PRD04_TANGENT_FRAME,
	A3D_PRD04_UV_TRANSFORM,
	A3D_PRD04_ALPHA_A2C,
	A3D_PRD04_DEBUG_VIEW
};
