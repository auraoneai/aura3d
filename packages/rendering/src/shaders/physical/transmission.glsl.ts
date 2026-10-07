/**
 * a3d_prd04_transmission — KHR_materials_transmission (PRD-04 §8.7).
 *
 * Ported from three r185 (glTF-Sampler-Viewer lineage):
 *  - `getVolumeTransmissionRay` — refraction vector scaled by model matrix:
 *    transmission_pars_fragment.glsl.js:121-135.
 *  - `applyIorToRoughness` — `roughness * clamp( ior * 2 - 2, 0, 1 )`:
 *    transmission_pars_fragment.glsl.js:137-143.
 *  - `getTransmissionSample` — lod = log2( size.x ) * applyIorToRoughness;
 *    bicubic filtering (N8, shadertoy Dl2SDW) behind
 *    `A3D_TRANSMISSION_BICUBIC` (PRD-04 quality tier table: bilinear Medium,
 *    bicubic High/Ultra): transmission_pars_fragment.glsl.js:32-119,145-150.
 *  - `getIBLVolumeRefraction` composition:
 *    transmission_pars_fragment.glsl.js:170-233.
 *
 * All declarations live inside `#ifdef A3D_TRANSMISSION` mirroring r185's
 * USE_TRANSMISSION guards. Sampler uniforms are the TransmissiveSurface's
 * opaque-scene copy (PRD-04 §7.3 TransmissiveSurface, §17).
 *
 * Requires `brdf` (saturate), `a3d_prd04_bsdf_lobes_common`
 * (a3dPrd04EnvironmentBRDF) and `a3d_prd04_volume` (a3dVolumeAttenuation).
 */
import type { ShaderChunk } from "../../contracts/program";

const glsl = /* glsl */ `
#ifdef A3D_TRANSMISSION

uniform sampler2D a3d_prd04_transmissionSampler;
uniform vec2 a3d_prd04_transmissionSamplerSize;

uniform mat4 a3d_prd04_modelMatrix;
uniform mat4 a3d_prd04_projectionMatrix;
uniform mat4 a3d_prd04_viewMatrix;

// Mipped Bicubic Texture Filtering by N8
// https://www.shadertoy.com/view/Dl2SDW
// (r185 transmission_pars_fragment.glsl.js:35-119)
#ifdef A3D_TRANSMISSION_BICUBIC

float a3d_prd04_w0( const in float a ) {

	return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );

}

float a3d_prd04_w1( const in float a ) {

	return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );

}

float a3d_prd04_w2( const in float a ){

	return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );

}

float a3d_prd04_w3( const in float a ) {

	return ( 1.0 / 6.0 ) * ( a * a * a );

}

float a3d_prd04_g0( const in float a ) {

	return a3d_prd04_w0( a ) + a3d_prd04_w1( a );

}

float a3d_prd04_g1( const in float a ) {

	return a3d_prd04_w2( a ) + a3d_prd04_w3( a );

}

float a3d_prd04_h0( const in float a ) {

	return - 1.0 + a3d_prd04_w1( a ) / ( a3d_prd04_w0( a ) + a3d_prd04_w1( a ) );

}

float a3d_prd04_h1( const in float a ) {

	return 1.0 + a3d_prd04_w3( a ) / ( a3d_prd04_w2( a ) + a3d_prd04_w3( a ) );

}

vec4 a3d_prd04_bicubic( const in sampler2D tex, const in vec2 uv, const in vec4 texelSize, const in float lod ) {

	vec2 uvScaled = uv * texelSize.zw + 0.5;

	vec2 iuv = floor( uvScaled );
	vec2 fuv = fract( uvScaled );

	float g0x = a3d_prd04_g0( fuv.x );
	float g1x = a3d_prd04_g1( fuv.x );
	float h0x = a3d_prd04_h0( fuv.x );
	float h1x = a3d_prd04_h1( fuv.x );
	float h0y = a3d_prd04_h0( fuv.y );
	float h1y = a3d_prd04_h1( fuv.y );

	vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
	vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
	vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
	vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;

	return a3d_prd04_g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
		a3d_prd04_g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );

}

vec4 a3d_prd04_textureBicubic( const in sampler2D sampler, const in vec2 uv, const in float lod ) {

	vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
	vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
	vec2 fLodSizeInv = 1.0 / fLodSize;
	vec2 cLodSizeInv = 1.0 / cLodSize;
	vec4 fSample = a3d_prd04_bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
	vec4 cSample = a3d_prd04_bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
	return mix( fSample, cSample, fract( lod ) );

}

#endif // A3D_TRANSMISSION_BICUBIC

// Direction of refracted light through the volume (r185
// getVolumeTransmissionRay, transmission_pars_fragment.glsl.js:121-135).
vec3 a3dVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {

	vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );

	// Compute rotation-independent scaling of the model matrix.
	vec3 modelScale;
	modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
	modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
	modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );

	// The thickness is specified in local space.
	return normalize( refractionVector ) * thickness * modelScale;

}

// Scale roughness with IOR so that an IOR of 1.0 results in no microfacet
// refraction and an IOR of 1.5 results in the default amount (r185
// applyIorToRoughness, transmission_pars_fragment.glsl.js:137-143).
float a3dApplyIorToRoughness( const in float roughness, const in float ior ) {

	return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );

}

// Sample the opaque-scene copy at the mip implied by the IOR-scaled
// roughness (r185 getTransmissionSample,
// transmission_pars_fragment.glsl.js:145-150). fragCoord in [0,1] NDC-UV.
vec4 a3dTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {

	float lod = log2( a3d_prd04_transmissionSamplerSize.x ) * a3dApplyIorToRoughness( roughness, ior );

	#ifdef A3D_TRANSMISSION_BICUBIC

		return a3d_prd04_textureBicubic( a3d_prd04_transmissionSampler, fragCoord.xy, lod );

	#else

		return textureLod( a3d_prd04_transmissionSampler, fragCoord.xy, lod );

	#endif

}

// Screen-space refraction sample: NDC-UV for the point position +
// transmissionRay (r185 getIBLVolumeRefraction projection block,
// transmission_pars_fragment.glsl.js:188-195).
vec2 a3dTransmissionCoords( const in vec3 exitPosition, const in mat4 viewMatrix, const in mat4 projMatrix ) {

	vec4 ndcPos = projMatrix * viewMatrix * vec4( exitPosition, 1.0 );
	vec2 refractionCoords = ndcPos.xy / ndcPos.w;
	refractionCoords += 1.0;
	refractionCoords /= 2.0;
	return refractionCoords;

}

// Single-band volume refraction (r185 getIBLVolumeRefraction non-dispersion
// arm, transmission_pars_fragment.glsl.js:206-231).
vec4 a3dGetIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor, const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix, const in float ior, const in float thickness, const in vec3 attenuationColor, const in float attenuationDistance ) {

	vec3 transmissionRay = a3dVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
	vec3 refractedRayExit = position + transmissionRay;

	// Project refracted vector on the framebuffer, while mapping to normalized device coordinates.
	vec2 refractionCoords = a3dTransmissionCoords( refractedRayExit, a3d_prd04_viewMatrix, a3d_prd04_projectionMatrix );

	// Sample framebuffer to get pixel the refracted ray hits.
	vec4 transmittedLight = a3dTransmissionSample( refractionCoords, roughness, ior );
	vec3 transmittance = diffuseColor * a3dVolumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );

	vec3 attenuatedColor = transmittance * transmittedLight.rgb;

	// Get the specular component.
	vec3 F = a3dPrd04EnvironmentBRDF( n, v, specularColor, specularF90, roughness );

	// As less light is transmitted, the opacity should be increased. This simple approximation does a decent job
	// of modulating a CSS background, and has no effect when the buffer is opaque, due to a solid object or clear color.
	float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;

	return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );

}

#endif // A3D_TRANSMISSION
`;

export const A3D_PRD04_TRANSMISSION: ShaderChunk = {
	name: "a3d_prd04_transmission",
	owner: "prd04",
	glsl,
	stage: "fragment",
	requires: ["brdf", "a3d_prd04_bsdf_lobes_common", "a3d_prd04_volume"]
};
