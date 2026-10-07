/**
 * WGSL twin of a3d_prd04_debug_view (PRD-04 §8.2 [14]/§8.12): same `a3d_`
 * name, identical channel math. The `A3D_PRD04_DEBUG_VIEW_<NAME>` selection is
 * a generator-time define — the twin takes the channel as a u32 param
 * (A3D_PRD04_DEBUG_VIEW_*) so one module covers every define arm.
 */
const wgsl = /* wgsl */ `
struct A3DPrd04DebugInput {
	baseColor: vec3f,
	normal: vec3f,
	roughness: f32,
	metallic: f32,
	specularF0: vec3f,
	tangent: vec3f,
}

// Channel ids mirror the A3D_PRD04_DEBUG_VIEW_<NAME> define suffixes; the
// generator emits a call with the selected id as the define arm expands.
const A3D_PRD04_DEBUG_VIEW_BASECOLOR = 0u;
const A3D_PRD04_DEBUG_VIEW_NORMAL = 1u;
const A3D_PRD04_DEBUG_VIEW_ROUGHNESS = 2u;
const A3D_PRD04_DEBUG_VIEW_METALLIC = 3u;
const A3D_PRD04_DEBUG_VIEW_CLEARCOAT = 4u;
const A3D_PRD04_DEBUG_VIEW_CLEARCOAT_ROUGHNESS = 5u;
const A3D_PRD04_DEBUG_VIEW_CLEARCOAT_ROUGHNESS_EFFECTIVE = 6u;
const A3D_PRD04_DEBUG_VIEW_SHEEN = 7u;
const A3D_PRD04_DEBUG_VIEW_F0 = 8u;
const A3D_PRD04_DEBUG_VIEW_TANGENT = 9u;
const A3D_PRD04_DEBUG_VIEW_ANISOTROPY_DIRECTION = 10u;

fn a3dPrd04DebugView(dbg: A3DPrd04DebugInput, lobes: A3DPrd04Lobes, channel: u32) -> vec3f {
	switch (channel) {
		case A3D_PRD04_DEBUG_VIEW_BASECOLOR: {
			return dbg.baseColor;
		}
		case A3D_PRD04_DEBUG_VIEW_NORMAL: {
			return dbg.normal * 0.5 + 0.5;
		}
		case A3D_PRD04_DEBUG_VIEW_ROUGHNESS: {
			return vec3f(dbg.roughness);
		}
		case A3D_PRD04_DEBUG_VIEW_METALLIC: {
			return vec3f(dbg.metallic);
		}
		case A3D_PRD04_DEBUG_VIEW_CLEARCOAT: {
			return vec3f(lobes.clearcoat);
		}
		case A3D_PRD04_DEBUG_VIEW_CLEARCOAT_ROUGHNESS, A3D_PRD04_DEBUG_VIEW_CLEARCOAT_ROUGHNESS_EFFECTIVE: {
			return vec3f(lobes.clearcoatRoughness);
		}
		case A3D_PRD04_DEBUG_VIEW_SHEEN: {
			return lobes.sheenColor;
		}
		case A3D_PRD04_DEBUG_VIEW_F0: {
			return dbg.specularF0;
		}
		case A3D_PRD04_DEBUG_VIEW_TANGENT: {
			return dbg.tangent * 0.5 + 0.5;
		}
		case A3D_PRD04_DEBUG_VIEW_ANISOTROPY_DIRECTION: {
			return lobes.anisotropyT * 0.5 + 0.5;
		}
		default: {
			return vec3f(0.0);
		}
	}
}
`;

export const A3D_PRD04_DEBUG_VIEW_WGSL = wgsl;
export default wgsl;
