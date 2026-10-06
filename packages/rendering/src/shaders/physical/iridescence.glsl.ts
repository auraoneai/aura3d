/**
 * a3d_prd04_iridescence — KHR_materials_iridescence thin-film (PRD-04 §8.5).
 *
 * Ported from three r185:
 *  - Factor resolution: iridescence *= tex.r; thickness =
 *    (max-min) * tex.g + min (default max when no map) —
 *    lights_physical_fragment.glsl.js:88-109; zero-thickness lobe off and
 *    saturate — lights_fragment_begin.glsl.js:30-40.
 *  - `evalSensitivity` XYZ Fourier sensitivity curves and
 *    `evalIridescence` thin-film Fresnel — Belcour/Barla 2017:
 *    iridescence_fragment.glsl.js:5-116.
 *  - Fresnel split + Schlick_to_F0:
 *    lights_fragment_begin.glsl.js:42-50; direct-lobe blend
 *    `F = mix( F, iridescenceFresnel, iridescence )`
 *    (lights_physical_pars_fragment.glsl.js:170-174); indirect
 *    multiscattering split — dielectric evaluated with
 *    iridescenceFresnelDielectric/specularF90, metallic with
 *    iridescenceFresnelMetallic/1.0 (:389-419, :596-644).
 *
 * Requires `brdf` (F_Schlick, Schlick_to_F0, pow2, PI, saturate) and
 * `a3d_prd04_bsdf_lobes_common` (A3DPrd04Lobes, a3dDFG).
 */
import type { ShaderChunk } from "../../contracts/program";

const glsl = /* glsl */ `
const mat3 a3d_prd04_XYZ_TO_REC709 = mat3(
	 3.2404542, -0.9692660,  0.0556434,
	-1.5371385,  1.8760108, -0.2040259,
	-0.4985314,  0.0415560,  1.0572252
);

// Fresnel0 -> IOR (r185 iridescence_fragment.glsl.js:14-19).
vec3 a3dPrd04IridescenceFresnel0ToIor( const in vec3 fresnel0 ) {

	vec3 sqrtF0 = sqrt( fresnel0 );
	return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );

}

vec3 a3dPrd04IridescenceIorToFresnel0( const in vec3 transmittedIor, const in float incidentIor ) {

	return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );

}

float a3dPrd04IridescenceIorToFresnel0f( const in float transmittedIor, const in float incidentIor ) {

	return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ) );

}

// XYZ sensitivity curves in Fourier space — Belcour & Barla 2017
// (r185 evalSensitivity, iridescence_fragment.glsl.js:38-52).
vec3 a3dPrd04EvalSensitivity( const in float OPD, const in vec3 shift ) {

	float phase = 2.0 * PI * OPD * 1.0e-9;
	vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
	vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
	vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );

	vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
	xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
	xyz /= 1.0685e-7;

	vec3 rgb = a3d_prd04_XYZ_TO_REC709 * xyz;
	return rgb;

}

// Thin-film Fresnel (r185 evalIridescence, iridescence_fragment.glsl.js:54-116).
vec3 a3dPrd04EvalIridescence( const in float outsideIOR, const in float eta2, const in float cosTheta1, const in float thinFilmThickness, const in vec3 baseF0 ) {

	vec3 I;

	// Force iridescenceIOR -> outsideIOR when thinFilmThickness -> 0.0
	float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
	// Evaluate the cosTheta on the base layer (Snell law)
	float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );

	// Handle TIR:
	float cosTheta2Sq = 1.0 - sinTheta2Sq;
	if ( cosTheta2Sq < 0.0 ) {

		return vec3( 1.0 );

	}

	float cosTheta2 = sqrt( cosTheta2Sq );

	// First interface
	float R0 = a3dPrd04IridescenceIorToFresnel0f( iridescenceIOR, outsideIOR );
	float R12 = F_Schlick( R0, 1.0, cosTheta1 );
	float T121 = 1.0 - R12;
	float phi12 = 0.0;
	if ( iridescenceIOR < outsideIOR ) phi12 = PI;
	float phi21 = PI - phi12;

	// Second interface
	vec3 baseIOR = a3dPrd04IridescenceFresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) ); // guard against 1.0
	vec3 R1 = a3dPrd04IridescenceIorToFresnel0( baseIOR, vec3( iridescenceIOR ) );
	vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
	vec3 phi23 = vec3( 0.0 );
	if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
	if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
	if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;

	// Phase shift
	float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
	vec3 phi = vec3( phi21 ) + phi23;

	// Compound terms
	vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
	vec3 r123 = sqrt( R123 );
	vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );

	// Reflectance term for m = 0 (DC term amplitude)
	vec3 C0 = R12 + Rs;
	I = C0;

	// Reflectance term for m > 0 (pairs of diracs)
	vec3 Cm = Rs - T121;
	for ( int m = 1; m <= 2; ++ m ) {

		Cm *= r123;
		vec3 Sm = 2.0 * a3dPrd04EvalSensitivity( float( m ) * OPD, float( m ) * phi );
		I += Cm * Sm;

	}

	// Since out of gamut colors might be produced, negative color values are clamped to 0.
	return max( I, vec3( 0.0 ) );

}

// Factor resolution (r185 lights_physical_fragment.glsl.js:88-109 +
// lights_fragment_begin.glsl.js:30-40). thicknessTex = iridescenceThicknessMap
// texel (.g); pass vec4(1.0) when no map is bound.
void a3dPrd04IridescenceInit( inout A3DPrd04Lobes lobes, const in float iridescenceFactor, const in float iridescenceIOR, const in vec4 iridescenceTex, const in vec4 thicknessTex, const in float thicknessMin, const in float thicknessMax, const in vec3 specularColor, const in vec3 diffuseColor, const in float metalness, const in float dotNV ) {

	lobes.iridescence = iridescenceFactor * iridescenceTex.r;
	lobes.iridescenceIOR = iridescenceIOR;
	lobes.iridescenceThickness = ( thicknessMax - thicknessMin ) * thicknessTex.g + thicknessMin;

	if ( lobes.iridescenceThickness == 0.0 ) {

		lobes.iridescence = 0.0;

	} else {

		lobes.iridescence = saturate( lobes.iridescence );

	}

	if ( lobes.iridescence > 0.0 ) {

		vec3 fresnelDielectric = a3dPrd04EvalIridescence( 1.0, lobes.iridescenceIOR, dotNV, lobes.iridescenceThickness, specularColor );
		vec3 fresnelMetallic = a3dPrd04EvalIridescence( 1.0, lobes.iridescenceIOR, dotNV, lobes.iridescenceThickness, diffuseColor );

		lobes.iridescenceFresnel = mix( fresnelDielectric, fresnelMetallic, metalness );
		lobes.iridescenceF0 = Schlick_to_F0( lobes.iridescenceFresnel, 1.0, dotNV );

	} else {

		lobes.iridescenceFresnel = vec3( 0.0 );
		lobes.iridescenceF0 = vec3( 0.0 );

	}

}

// Direct-lobe Fresnel blend (r185 lights_physical_pars_fragment.glsl.js:170-174):
// F = mix( F_Schlick( f0, f90, dotVH ), iridescenceFresnel, iridescence ).
vec3 a3dPrd04IridescenceFresnelMix( const in vec3 F, const in vec3 iridescenceFresnel, const in float iridescence ) {

	return mix( F, iridescenceFresnel, iridescence );

}

// IBL multiscattering with thin-film F0 (r185 computeMultiscatteringIridescence,
// lights_physical_pars_fragment.glsl.js:389-419).
void a3dPrd04ComputeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {

	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = a3dDFG( roughness, dotNV );

	vec3 Fr = mix( specularColor, iridescenceF0, iridescence );

	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;

	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;

	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619; // 1/21
	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );

	singleScatter += FssEss;
	multiScatter += Fms * Ems;

}
`;

export const A3D_PRD04_IRIDESCENCE: ShaderChunk = {
	name: "a3d_prd04_iridescence",
	owner: "prd04",
	glsl,
	stage: "fragment",
	requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
