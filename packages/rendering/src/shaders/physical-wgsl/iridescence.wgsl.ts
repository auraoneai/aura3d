/**
 * WGSL twin of a3d_prd04_iridescence (PRD-04 §8.12): same `a3d_` names,
 * identical math (r185 iridescence_fragment.glsl.js:5-116,
 * lights_physical_fragment.glsl.js:88-109, lights_fragment_begin.glsl.js:30-50).
 */
const wgsl = /* wgsl */ `
const a3d_prd04_XYZ_TO_REC709 = mat3x3f(
	vec3f( 3.2404542, -0.9692660,  0.0556434),
	vec3f(-1.5371385,  1.8760108, -0.2040259),
	vec3f(-0.4985314,  0.0415560,  1.0572252)
);

// Fresnel0 -> IOR (r185 iridescence_fragment.glsl.js:14-19).
fn a3dPrd04IridescenceFresnel0ToIor(fresnel0: vec3f) -> vec3f {
	let sqrtF0 = sqrt(fresnel0);
	return (vec3f(1.0) + sqrtF0) / (vec3f(1.0) - sqrtF0);
}

fn a3dPrd04IridescenceIorToFresnel0(transmittedIor: vec3f, incidentIor: f32) -> vec3f {
	return pow2v((transmittedIor - vec3f(incidentIor)) / (transmittedIor + vec3f(incidentIor)));
}

fn a3dPrd04IridescenceIorToFresnel0f(transmittedIor: f32, incidentIor: f32) -> f32 {
	return pow2((transmittedIor - incidentIor) / (transmittedIor + incidentIor));
}

// XYZ sensitivity curves in Fourier space — Belcour & Barla 2017
// (r185 evalSensitivity, iridescence_fragment.glsl.js:38-52).
fn a3dPrd04EvalSensitivity(OPD: f32, shift: vec3f) -> vec3f {
	let phase = 2.0 * PI * OPD * 1.0e-9;
	let val = vec3f(5.4856e-13, 4.4201e-13, 5.2481e-13);
	let pos = vec3f(1.6810e+06, 1.7953e+06, 2.2084e+06);
	let var_ = vec3f(4.3278e+09, 9.3046e+09, 6.6121e+09);

	var xyz = val * sqrt(2.0 * PI * var_) * cos(pos * phase + shift) * exp(-pow2(phase) * var_);
	xyz.x += 9.7470e-14 * sqrt(2.0 * PI * 4.5282e+09) * cos(2.2399e+06 * phase + shift[0]) * exp(-4.5282e+09 * pow2(phase));
	xyz /= 1.0685e-7;

	let rgb = a3d_prd04_XYZ_TO_REC709 * xyz;
	return rgb;
}

// Thin-film Fresnel (r185 evalIridescence, iridescence_fragment.glsl.js:54-116).
fn a3dPrd04EvalIridescence(outsideIOR: f32, eta2: f32, cosTheta1: f32, thinFilmThickness: f32, baseF0: vec3f) -> vec3f {
	var I: vec3f;

	// Force iridescenceIOR -> outsideIOR when thinFilmThickness -> 0.0
	let iridescenceIOR = mix(outsideIOR, eta2, smoothstep(0.0, 0.03, thinFilmThickness));
	// Evaluate the cosTheta on the base layer (Snell law)
	let sinTheta2Sq = pow2(outsideIOR / iridescenceIOR) * (1.0 - pow2(cosTheta1));

	// Handle TIR:
	let cosTheta2Sq = 1.0 - sinTheta2Sq;
	if (cosTheta2Sq < 0.0) {
		return vec3f(1.0);
	}

	let cosTheta2 = sqrt(cosTheta2Sq);

	// First interface
	let R0 = a3dPrd04IridescenceIorToFresnel0f(iridescenceIOR, outsideIOR);
	let R12 = F_Schlick(vec3f(R0), 1.0, cosTheta1).x;
	let T121 = 1.0 - R12;
	var phi12 = 0.0;
	if (iridescenceIOR < outsideIOR) {
		phi12 = PI;
	}
	let phi21 = PI - phi12;

	// Second interface
	let baseIOR = a3dPrd04IridescenceFresnel0ToIor(clamp(baseF0, vec3f(0.0), vec3f(0.9999))); // guard against 1.0
	let R1 = a3dPrd04IridescenceIorToFresnel0(baseIOR, iridescenceIOR);
	let R23 = F_Schlick(R1, 1.0, cosTheta2);
	var phi23 = vec3f(0.0);
	if (baseIOR[0] < iridescenceIOR) {
		phi23[0] = PI;
	}
	if (baseIOR[1] < iridescenceIOR) {
		phi23[1] = PI;
	}
	if (baseIOR[2] < iridescenceIOR) {
		phi23[2] = PI;
	}

	// Phase shift
	let OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
	let phi = vec3f(phi21) + phi23;

	// Compound terms
	let R123 = clamp(R12 * R23, vec3f(1e-5), vec3f(0.9999));
	let r123 = sqrt(R123);
	let Rs = pow2(T121) * R23 / (vec3f(1.0) - R123);

	// Reflectance term for m = 0 (DC term amplitude)
	let C0 = R12 + Rs;
	I = C0;

	// Reflectance term for m > 0 (pairs of diracs)
	var Cm = Rs - T121;
	for (var m = 1; m <= 2; m++) {
		Cm *= r123;
		let Sm = 2.0 * a3dPrd04EvalSensitivity(f32(m) * OPD, f32(m) * phi);
		I += Cm * Sm;
	}

	// Since out of gamut colors might be produced, negative color values are clamped to 0.
	return max(I, vec3f(0.0));
}

// Factor resolution (r185 lights_physical_fragment.glsl.js:88-109 +
// lights_fragment_begin.glsl.js:30-40).
fn a3dPrd04IridescenceInit(lobes: ptr<function, A3DPrd04Lobes>, iridescenceFactor: f32, iridescenceIOR: f32, iridescenceTex: vec4f, thicknessTex: vec4f, thicknessMin: f32, thicknessMax: f32, specularColor: vec3f, diffuseColor: vec3f, metalness: f32, dotNV: f32) {
	(*lobes).iridescence = iridescenceFactor * iridescenceTex.r;
	(*lobes).iridescenceIOR = iridescenceIOR;
	(*lobes).iridescenceThickness = (thicknessMax - thicknessMin) * thicknessTex.g + thicknessMin;

	if ((*lobes).iridescenceThickness == 0.0) {
		(*lobes).iridescence = 0.0;
	} else {
		(*lobes).iridescence = saturate((*lobes).iridescence);
	}

	if ((*lobes).iridescence > 0.0) {
		let fresnelDielectric = a3dPrd04EvalIridescence(1.0, (*lobes).iridescenceIOR, dotNV, (*lobes).iridescenceThickness, specularColor);
		let fresnelMetallic = a3dPrd04EvalIridescence(1.0, (*lobes).iridescenceIOR, dotNV, (*lobes).iridescenceThickness, diffuseColor);

		(*lobes).iridescenceFresnel = mix(fresnelDielectric, fresnelMetallic, metalness);
		(*lobes).iridescenceF0 = Schlick_to_F0((*lobes).iridescenceFresnel, 1.0, dotNV);
	} else {
		(*lobes).iridescenceFresnel = vec3f(0.0);
		(*lobes).iridescenceF0 = vec3f(0.0);
	}
}

// Direct-lobe Fresnel blend (r185 lights_physical_pars_fragment.glsl.js:170-174).
fn a3dPrd04IridescenceFresnelMix(F: vec3f, iridescenceFresnel: vec3f, iridescence: f32) -> vec3f {
	return mix(F, iridescenceFresnel, iridescence);
}

// IBL multiscattering with thin-film F0 (r185 computeMultiscatteringIridescence,
// lights_physical_pars_fragment.glsl.js:389-419).
fn a3dPrd04ComputeMultiscatteringIridescence(normal: vec3f, viewDir: vec3f, specularColor: vec3f, specularF90: f32, iridescence: f32, iridescenceF0: vec3f, roughness: f32, singleScatter: ptr<function, vec3f>, multiScatter: ptr<function, vec3f>) {
	let dotNV = saturate(dot(normal, viewDir));
	let fab = a3dDFG(roughness, dotNV);

	let Fr = mix(specularColor, iridescenceF0, iridescence);

	let FssEss = Fr * fab.x + specularF90 * fab.y;

	let Ess = fab.x + fab.y;
	let Ems = 1.0 - Ess;

	let Favg = Fr + (1.0 - Fr) * 0.047619; // 1/21
	let Fms = FssEss * Favg / (1.0 - Ems * Favg);

	*singleScatter += FssEss;
	*multiScatter += Fms * Ems;
}
`;

export const A3D_PRD04_IRIDESCENCE_WGSL = wgsl;
export default wgsl;
