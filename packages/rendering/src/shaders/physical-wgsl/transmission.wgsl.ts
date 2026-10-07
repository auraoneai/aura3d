/**
 * WGSL twin of a3d_prd04_transmission (PRD-04 §8.12): same `a3d_` names,
 * identical math (r185 transmission_pars_fragment.glsl.js:32-233).
 *
 * §8.12 deltas vs the GLSL chunk: `textureSampleLevel` for LOD, a material
 * uniform struct instead of loose `uniform mat4` globals, and separate
 * `texture_2d`/`sampler` bindings. The `A3D_TRANSMISSION`/`A3D_TRANSMISSION_BICUBIC`
 * guards are generator-time defines (C-29), so the twin emits all functions;
 * the bicubic helpers stay inert until the generator selects them.
 */
const wgsl = /* wgsl */ `
struct A3DPrd04TransmissionUniforms {
	transmissionSamplerSize: vec2f,
	modelMatrix: mat4x4f,
	projectionMatrix: mat4x4f,
	viewMatrix: mat4x4f,
}

@group(1) @binding(30) var<uniform> a3d_prd04_transmission: A3DPrd04TransmissionUniforms;
@group(1) @binding(31) var a3d_prd04_transmissionTex: texture_2d<f32>;
@group(1) @binding(32) var a3d_prd04_transmissionSmp: sampler;

// Mipped Bicubic Texture Filtering by N8
// https://www.shadertoy.com/view/Dl2SDW
// (r185 transmission_pars_fragment.glsl.js:35-119 — A3D_TRANSMISSION_BICUBIC arm)
fn a3d_prd04_w0(a: f32) -> f32 {
	return (1.0 / 6.0) * (a * (a * (-a + 3.0) - 3.0) + 1.0);
}

fn a3d_prd04_w1(a: f32) -> f32 {
	return (1.0 / 6.0) * (a * a * (3.0 * a - 6.0) + 4.0);
}

fn a3d_prd04_w2(a: f32) -> f32 {
	return (1.0 / 6.0) * (a * (a * (-3.0 * a + 3.0) + 3.0) + 1.0);
}

fn a3d_prd04_w3(a: f32) -> f32 {
	return (1.0 / 6.0) * (a * a * a);
}

fn a3d_prd04_g0(a: f32) -> f32 {
	return a3d_prd04_w0(a) + a3d_prd04_w1(a);
}

fn a3d_prd04_g1(a: f32) -> f32 {
	return a3d_prd04_w2(a) + a3d_prd04_w3(a);
}

fn a3d_prd04_h0(a: f32) -> f32 {
	return -1.0 + a3d_prd04_w1(a) / (a3d_prd04_w0(a) + a3d_prd04_w1(a));
}

fn a3d_prd04_h1(a: f32) -> f32 {
	return 1.0 + a3d_prd04_w3(a) / (a3d_prd04_w2(a) + a3d_prd04_w3(a));
}

fn a3d_prd04_bicubic(tex: texture_2d<f32>, smp: sampler, uv: vec2f, texelSize: vec4f, lod: f32) -> vec4f {
	let uvScaled = uv * texelSize.zw + vec2f(0.5);

	let iuv = floor(uvScaled);
	let fuv = fract(uvScaled);

	let g0x = a3d_prd04_g0(fuv.x);
	let g1x = a3d_prd04_g1(fuv.x);
	let h0x = a3d_prd04_h0(fuv.x);
	let h1x = a3d_prd04_h1(fuv.x);
	let h0y = a3d_prd04_h0(fuv.y);
	let h1y = a3d_prd04_h1(fuv.y);

	let p0 = (vec2f(iuv.x + h0x, iuv.y + h0y) - vec2f(0.5)) * texelSize.xy;
	let p1 = (vec2f(iuv.x + h1x, iuv.y + h0y) - vec2f(0.5)) * texelSize.xy;
	let p2 = (vec2f(iuv.x + h0x, iuv.y + h1y) - vec2f(0.5)) * texelSize.xy;
	let p3 = (vec2f(iuv.x + h1x, iuv.y + h1y) - vec2f(0.5)) * texelSize.xy;

	return a3d_prd04_g0(fuv.y) * (g0x * textureSampleLevel(tex, smp, p0, lod) + g1x * textureSampleLevel(tex, smp, p1, lod)) +
		a3d_prd04_g1(fuv.y) * (g0x * textureSampleLevel(tex, smp, p2, lod) + g1x * textureSampleLevel(tex, smp, p3, lod));
}

fn a3d_prd04_textureBicubic(tex: texture_2d<f32>, smp: sampler, uv: vec2f, lod: f32) -> vec4f {
	let fLodSize = vec2f(textureDimensions(tex, u32(lod)));
	let cLodSize = vec2f(textureDimensions(tex, u32(lod + 1.0)));
	let fLodSizeInv = 1.0 / fLodSize;
	let cLodSizeInv = 1.0 / cLodSize;
	let fSample = a3d_prd04_bicubic(tex, smp, uv, vec4f(fLodSizeInv, fLodSize), floor(lod));
	let cSample = a3d_prd04_bicubic(tex, smp, uv, vec4f(cLodSizeInv, cLodSize), ceil(lod));
	return mix(fSample, cSample, fract(lod));
}

// Direction of refracted light through the volume (r185
// getVolumeTransmissionRay, transmission_pars_fragment.glsl.js:121-135).
fn a3dVolumeTransmissionRay(n: vec3f, v: vec3f, thickness: f32, ior: f32, modelMatrix: mat4x4f) -> vec3f {
	let refractionVector = refract(-v, normalize(n), 1.0 / ior);

	// Compute rotation-independent scaling of the model matrix.
	var modelScale: vec3f;
	modelScale.x = length(modelMatrix[0].xyz);
	modelScale.y = length(modelMatrix[1].xyz);
	modelScale.z = length(modelMatrix[2].xyz);

	// The thickness is specified in local space.
	return normalize(refractionVector) * thickness * modelScale;
}

// Scale roughness with IOR (r185 applyIorToRoughness,
// transmission_pars_fragment.glsl.js:137-143).
fn a3dApplyIorToRoughness(roughness: f32, ior: f32) -> f32 {
	return roughness * clamp(ior * 2.0 - 2.0, 0.0, 1.0);
}

// Sample the opaque-scene copy at the mip implied by the IOR-scaled
// roughness (r185 getTransmissionSample,
// transmission_pars_fragment.glsl.js:145-150). fragCoord in [0,1] NDC-UV.
// WGSL twin keeps the bicubic arm as a separate function the generator picks;
// default arm is the plain textureSampleLevel.
fn a3dTransmissionSample(fragCoord: vec2f, roughness: f32, ior: f32) -> vec4f {
	let lod = log2(a3d_prd04_transmission.transmissionSamplerSize.x) * a3dApplyIorToRoughness(roughness, ior);
	return textureSampleLevel(a3d_prd04_transmissionTex, a3d_prd04_transmissionSmp, fragCoord, lod);
}

fn a3dTransmissionSampleBicubic(fragCoord: vec2f, roughness: f32, ior: f32) -> vec4f {
	let lod = log2(a3d_prd04_transmission.transmissionSamplerSize.x) * a3dApplyIorToRoughness(roughness, ior);
	return a3d_prd04_textureBicubic(a3d_prd04_transmissionTex, a3d_prd04_transmissionSmp, fragCoord, lod);
}

// Screen-space refraction sample: NDC-UV for position + transmissionRay
// (r185 getIBLVolumeRefraction projection block,
// transmission_pars_fragment.glsl.js:188-195).
fn a3dTransmissionCoords(exitPosition: vec3f, viewMatrix: mat4x4f, projMatrix: mat4x4f) -> vec2f {
	let ndcPos = projMatrix * viewMatrix * vec4f(exitPosition, 1.0);
	var refractionCoords = ndcPos.xy / ndcPos.w;
	refractionCoords += 1.0;
	refractionCoords /= 2.0;
	return refractionCoords;
}

// Single-band volume refraction (r185 getIBLVolumeRefraction non-dispersion
// arm, transmission_pars_fragment.glsl.js:206-231).
fn a3dGetIBLVolumeRefraction(n: vec3f, v: vec3f, roughness: f32, diffuseColor: vec3f, specularColor: vec3f, specularF90: f32, position: vec3f, modelMatrix: mat4x4f, ior: f32, thickness: f32, attenuationColor: vec3f, attenuationDistance: f32) -> vec4f {
	let transmissionRay = a3dVolumeTransmissionRay(n, v, thickness, ior, modelMatrix);
	let refractedRayExit = position + transmissionRay;

	let refractionCoords = a3dTransmissionCoords(refractedRayExit, a3d_prd04_transmission.viewMatrix, a3d_prd04_transmission.projectionMatrix);

	let transmittedLight = a3dTransmissionSample(refractionCoords, roughness, ior);
	let transmittance = diffuseColor * a3dVolumeAttenuation(length(transmissionRay), attenuationColor, attenuationDistance);

	let attenuatedColor = transmittance * transmittedLight.rgb;

	let F = a3dPrd04EnvironmentBRDF(n, v, specularColor, specularF90, roughness);

	let transmittanceFactor = (transmittance.r + transmittance.g + transmittance.b) / 3.0;

	return vec4f((1.0 - F) * attenuatedColor, 1.0 - (1.0 - transmittedLight.a) * transmittanceFactor);
}
`;

export const A3D_PRD04_TRANSMISSION_WGSL = wgsl;
export default wgsl;
