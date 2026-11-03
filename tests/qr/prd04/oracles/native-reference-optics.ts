/**
 * Standalone CPU-double optics models for a future native numeric harness.
 * These are not measurements of, or compatibility claims about, a renderer.
 *
 * Physical background: Snell's law and total internal reflection are discussed
 * in https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction;
 * optical path and thin-film interference are discussed in
 * https://openstax.org/books/university-physics-volume-3/pages/3-4-interference-in-thin-films.
 * For lossless, nonmagnetic dielectrics, the formulas below independently sum
 * the two polarized interface amplitudes and all coherent film round trips.
 * The volume model uses the Beer–Lambert exponential absorption law.
 *
 * Wavelengths and film thickness use nanometres; distances and ray thickness
 * use any common length unit. IORs and cosines are dimensionless. Inputs are
 * finite unless +Infinity is explicitly documented. Invalid domains throw a
 * RangeError instead of silently turning NaN into a plausible reference value.
 * No illuminant, observer, color-matching functions, RGB primaries, conductor
 * extinction, surface roughness, or partial coherence are presumed by the
 * spectral model. The caller supplies a wavelength and three real indices for
 * each sample, including any desired dispersion. Spectral samples are NOT RGB.
 */

export type OpticalVec3 = readonly [number, number, number];
export type OpticalColor = readonly [number, number, number];

export interface IridescenceSample {
  readonly wavelengthNm: number;
  readonly incidentIor: number;
  readonly filmIor: number;
  readonly substrateIor: number;
}

export interface IridescenceInput {
  readonly cosThetaIncident: number;
  readonly filmThicknessNm: number;
  readonly samples: readonly IridescenceSample[];
}

type Complex = readonly [number, number];
const ZERO: Complex = [0, 0];
const ONE: Complex = [1, 0];

function finite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function positive(name: string, value: number): void {
  finite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be positive`);
}

function nonnegative(name: string, value: number): void {
  finite(name, value);
  if (value < 0) throw new RangeError(`${name} must be nonnegative`);
}

function unitInterval(name: string, value: number): void {
  finite(name, value);
  if (value < 0 || value > 1) throw new RangeError(`${name} must be in [0, 1]`);
}

function colorUnit(name: string, color: OpticalColor): void {
  if (color.length !== 3) throw new RangeError(`${name} must have three channels`);
  for (let i = 0; i < 3; i++) unitInterval(name, color[i]);
}

function colorRadiance(name: string, color: OpticalColor): void {
  if (color.length !== 3) throw new RangeError(`${name} must have three channels`);
  for (let i = 0; i < 3; i++) nonnegative(name, color[i]);
}

const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Complex, b: Complex): Complex => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const scale = (a: Complex, value: number): Complex => [a[0] * value, a[1] * value];

function divide(a: Complex, b: Complex): Complex {
  const factor = Math.max(Math.abs(b[0]), Math.abs(b[1]));
  if (factor === 0 || !Number.isFinite(factor)) throw new RangeError("singular optical amplitude");
  const br = b[0] / factor;
  const bi = b[1] / factor;
  const denominator = br * br + bi * bi;
  const result: Complex = [(a[0] / factor * br + a[1] / factor * bi) / denominator,
    (a[1] / factor * br - a[0] / factor * bi) / denominator];
  if (!result.every(Number.isFinite)) throw new RangeError("unrepresentable optical amplitude");
  return result;
}

// kz = n cos(theta) = sqrt(n² - (n0 sin(theta0))²), choosing +i for
// an evanescent wave so that exp(i kz z) decays into the next medium.
function normalWaveNumber(index: number, tangent: number): Complex {
  if (index >= tangent) {
    const ratio = tangent / index;
    return [index * Math.sqrt((1 - ratio) * (1 + ratio)), 0];
  }
  const ratio = index / tangent;
  return [0, tangent * Math.sqrt((1 - ratio) * (1 + ratio))];
}

// For s polarization q=kz; for p, q=n²/kz. Writing the latter in
// cross-multiplied form avoids division by kz at a critical angle.
function interfaceAmplitude(nA: number, nB: number, kA: Complex, kB: Complex, polarization: "s" | "p"): Complex {
  if (nA === nB) return ZERO;
  if (polarization === "s") return divide(sub(kA, kB), add(kA, kB));
  const maxIndex = Math.max(nA, nB);
  const a = scale(kB, (nA / maxIndex) ** 2);
  const b = scale(kA, (nB / maxIndex) ** 2);
  return divide(sub(a, b), add(a, b));
}

function reflectanceFromAmplitudes(s: Complex, p: Complex): number {
  const result = (s[0] ** 2 + s[1] ** 2 + p[0] ** 2 + p[1] ** 2) / 2;
  if (!Number.isFinite(result) || result > 1 + 1e-10) {
    throw new RangeError("unrepresentable lossless-film reflectance");
  }
  return Math.max(0, Math.min(1, result)); // roundoff only
}

function bareInterface(n0: number, n2: number, cosTheta: number): number {
  if (n0 === n2) return 0;
  if (cosTheta === 0) return 1;
  const tangent = n0 * Math.sqrt((1 - cosTheta) * (1 + cosTheta));
  const k0: Complex = [n0 * cosTheta, 0];
  const k2 = normalWaveNumber(n2, tangent);
  return reflectanceFromAmplitudes(
    interfaceAmplitude(n0, n2, k0, k2, "s"),
    interfaceAmplitude(n0, n2, k0, k2, "p")
  );
}

/**
 * Unpolarized monochromatic reflectance of incident / film / substrate.
 * Each sample is a separate vacuum wavelength in nm, and may provide its own
 * IORs. The film is planar, isotropic, nonabsorbing and coherent; the substrate
 * is semi-infinite. Exact evanescent film propagation includes frustrated TIR.
 * Fresnel amplitudes r01, r12 are combined as
 * (r01 + r12 exp(2 i delta)) / (1 + r01 r12 exp(2 i delta)), with
 * delta = 2 pi filmThicknessNm * n1 cos(theta1) / wavelengthNm.
 * The returned values are the mean of squared s and p amplitudes.
 *
 * At exactly grazing incidence, except for absent/matched interfaces, we
 * choose the usual off-resonance limit 1; an isolated exact film resonance
 * at grazing has a path-dependent limiting value and needs a contract choice.
 * A future renderer comparison also needs a chosen illuminant, observer, RGB
 * conversion, dispersion, roughness/coherence and numerical tolerances.
 */
export function evalIridescence(input: IridescenceInput): number[] {
  unitInterval("cosThetaIncident", input.cosThetaIncident);
  nonnegative("filmThicknessNm", input.filmThicknessNm);
  if (input.samples.length === 0) throw new RangeError("at least one spectral sample is required");
  return input.samples.map(({ wavelengthNm, incidentIor: n0, filmIor: n1, substrateIor: n2 }) => {
    positive("wavelengthNm", wavelengthNm);
    positive("incidentIor", n0);
    positive("filmIor", n1);
    positive("substrateIor", n2);
    const c = input.cosThetaIncident;
    if (input.filmThicknessNm === 0 || n0 === n1 || n1 === n2) return bareInterface(n0, n2, c);
    if (c === 0) return 1;
    const tangent = n0 * Math.sqrt((1 - c) * (1 + c));
    const k0: Complex = [n0 * c, 0];
    const k1 = normalWaveNumber(n1, tangent);
    const k2 = normalWaveNumber(n2, tangent);
    const phaseScale = 2 * Math.PI * (input.filmThicknessNm / wavelengthNm);
    if (!Number.isFinite(phaseScale)) throw new RangeError("unrepresentable film optical path");
    if (Math.hypot(k1[0], k1[1]) * phaseScale < 1e-4) {
      // The usual amplitude quotient loses digits near the film's critical
      // angle because numerator and denominator both approach zero. Rewrite
      // it with cos(delta) and sin(delta)/delta; their short Taylor series
      // include the exact kz1=0 limit. For real IORs, delta² is real even
      // when kz1 is imaginary. Cross-multiplying p admittances also covers
      // a substrate exactly at its own critical angle without dividing by kz2.
      const k1Squared = k1[0] ** 2 - k1[1] ** 2;
      const deltaSquared = phaseScale ** 2 * k1Squared;
      const cosDelta = 1 - deltaSquared / 2 + deltaSquared ** 2 / 24;
      const sincDelta = 1 - deltaSquared / 6 + deltaSquared ** 2 / 120;
      const common = phaseScale * sincDelta;
      const k0k2 = mul(k0, k2);
      const k1sq: Complex = [k1Squared, 0];
      const sTerm = scale(sub(k1sq, k0k2), common);
      const sDenTerm = scale(add(k1sq, k0k2), common);
      const s = divide(add(scale(sub(k0, k2), cosDelta), mul([0, 1], sTerm)),
        sub(scale(add(k0, k2), cosDelta), mul([0, 1], sDenTerm)));
      const a = scale(k2, n0 * n0);
      const b = scale(k0, n2 * n2);
      const pFilm = scale(k0k2, n1 * n1);
      const pCross = scale(k1sq, (n0 * n2 / n1) ** 2);
      const pTerm = scale(sub(pFilm, pCross), common);
      const pDenTerm = scale(add(pFilm, pCross), common);
      const p = divide(add(scale(sub(a, b), cosDelta), mul([0, 1], pTerm)),
        sub(scale(add(a, b), cosDelta), mul([0, 1], pDenTerm)));
      return reflectanceFromAmplitudes(s, p);
    }
    const phaseReal = 2 * phaseScale * k1[0];
    const phaseImaginary = 2 * phaseScale * k1[1];
    if (!Number.isFinite(phaseReal) || !Number.isFinite(phaseImaginary)) {
      throw new RangeError("unrepresentable film phase");
    }
    const decay = Math.exp(-phaseImaginary);
    const roundTrip: Complex = [decay * Math.cos(phaseReal), decay * Math.sin(phaseReal)];
    const amplitude = (polarization: "s" | "p"): Complex => {
      const r01 = interfaceAmplitude(n0, n1, k0, k1, polarization);
      const r12 = interfaceAmplitude(n1, n2, k1, k2, polarization);
      const reflected = mul(r12, roundTrip);
      return divide(add(r01, reflected), add(ONE, mul(r01, reflected)));
    };
    return reflectanceFromAmplitudes(amplitude("s"), amplitude("p"));
  });
}

/** Normal-incidence dielectric Fresnel reflectance ((n1 - n0)/(n1 + n0))². */
export function iorToF0(transmittedIor: number, incidentIor = 1): number {
  positive("transmittedIor", transmittedIor);
  positive("incidentIor", incidentIor);
  const maxIndex = Math.max(transmittedIor, incidentIor);
  const a = transmittedIor / maxIndex;
  const b = incidentIor / maxIndex;
  return ((a - b) / (a + b)) ** 2;
}

/**
 * Explicit renderer heuristic, NOT an optical law: scale roughness by the
 * ratio of normal-incidence Fresnel amplitude magnitudes to a chosen reference
 * interface, capped at one. The caller must choose referenceIor; this model
 * does not establish any particular renderer's roughness remapping.
 */
export function applyIorToRoughness(roughness: number, transmittedIor: number, referenceIor: number, incidentIor = 1): number {
  unitInterval("roughness", roughness);
  const targetAmplitude = Math.sqrt(iorToF0(transmittedIor, incidentIor));
  const referenceAmplitude = Math.sqrt(iorToF0(referenceIor, incidentIor));
  if (referenceAmplitude === 0) throw new RangeError("reference interface must have nonzero Fresnel reflectance");
  return roughness * Math.min(1, targetAmplitude / referenceAmplitude);
}

/**
 * Explicit material heuristic: tint and scale the physical dielectric F0.
 * Color channels and strength are dimensionless [0,1] controls; they are not
 * measured complex refractive indices or a conductor Fresnel model.
 */
export function specIorSpecularColor(transmittedIor: number, specularColor: OpticalColor, specularFactor: number, incidentIor = 1): OpticalColor {
  colorUnit("specularColor", specularColor);
  unitInterval("specularFactor", specularFactor);
  const f0 = iorToF0(transmittedIor, incidentIor) * specularFactor;
  return [f0 * specularColor[0], f0 * specularColor[1], f0 * specularColor[2]];
}

/**
 * Explicit material heuristic: scale a unit grazing reflectance by the
 * specular factor. Index-matched media have no interface; applying this
 * control there is a renderer policy, not a physical grazing-limit claim.
 */
export function specIorSpecularF90(specularFactor: number): number {
  unitInterval("specularFactor", specularFactor);
  return specularFactor;
}

/**
 * Beer–Lambert attenuation for a homogeneous, nonscattering medium. The color
 * is transmittance over attenuationDistance; output channel = color^(d / D).
 * Distance and D share units. A zero path is transparent, including for zero
 * color; D=+Infinity explicitly disables absorption. Zero color means zero
 * transmittance at every strictly positive finite path.
 */
export function volumeAttenuation(distance: number, attenuationColor: OpticalColor, attenuationDistance: number): OpticalColor {
  nonnegative("distance", distance);
  colorUnit("attenuationColor", attenuationColor);
  if (attenuationDistance !== Infinity) positive("attenuationDistance", attenuationDistance);
  if (distance === 0 || attenuationDistance === Infinity) return [1, 1, 1];
  const exponent = distance / attenuationDistance;
  const channel = (value: number): number => value === 0 ? 0 : value === 1 ? 1 : Math.exp(Math.log(value) * exponent);
  return [channel(attenuationColor[0]), channel(attenuationColor[1]), channel(attenuationColor[2])];
}

/**
 * Deliberate single-pass compositing heuristic: base * (1 - coverage * Fcc)
 * + coverage * coat. Inputs are linear nonnegative radiances, and coat is an
 * already-evaluated lobe, not a color to multiply by Fcc again. This is not a
 * full two-direction, multiple-scattering layered BRDF or a renderer contract.
 */
export function clearcoatFccCompose(base: OpticalColor, coat: OpticalColor, coverage: number, fcc: number): OpticalColor {
  colorRadiance("base", base);
  colorRadiance("coat", coat);
  unitInterval("coverage", coverage);
  unitInterval("fcc", fcc);
  const result: OpticalColor = [0, 1, 2].map((i) => base[i] * (1 - coverage * fcc) + coat[i] * coverage) as unknown as OpticalColor;
  if (!result.every(Number.isFinite)) throw new RangeError("unrepresentable layer radiance");
  return result;
}

export type TransmissionRay =
  | { readonly kind: "transmitted"; readonly direction: OpticalVec3; readonly pathLength: number; readonly ray: OpticalVec3 }
  | { readonly kind: "total-internal-reflection" }
  | { readonly kind: "parallel-to-boundary"; readonly direction: OpticalVec3 };

function normalized(name: string, vector: OpticalVec3): OpticalVec3 {
  if (vector.length !== 3) throw new RangeError(`${name} must have three components`);
  for (let i = 0; i < 3; i++) finite(name, vector[i]);
  const magnitude = Math.max(...vector.map(Math.abs));
  if (magnitude === 0) throw new RangeError(`${name} must be nonzero`);
  const x = vector[0] / magnitude;
  const y = vector[1] / magnitude;
  const z = vector[2] / magnitude;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

/**
 * Snell refraction through a parallel slab. The incident vector points toward
 * the surface; the normal points into the incident medium. Both are normalized
 * internally and must not point in the same direction. Plane separation is
 * thickness; transmitted path length is thickness / cos(thetaTransmitted).
 * The discriminated result makes TIR and an infinite parallel path explicit.
 * Model/world transforms, object scale, curved exits, absorption and screen
 * sampling are deliberately outside this geometry-only reference.
 */
export function volumeTransmissionRay(incidentDirection: OpticalVec3, surfaceNormal: OpticalVec3,
  incidentIor: number, transmittedIor: number, thickness: number): TransmissionRay {
  const direction = normalized("incidentDirection", incidentDirection);
  const normal = normalized("surfaceNormal", surfaceNormal);
  positive("incidentIor", incidentIor);
  positive("transmittedIor", transmittedIor);
  nonnegative("thickness", thickness);
  const dot = direction[0] * normal[0] + direction[1] * normal[1] + direction[2] * normal[2];
  if (dot > 1e-14) throw new RangeError("surfaceNormal must oppose the incident direction");
  // A cross product retains small angles when dot rounds to -1 and is exactly
  // zero for componentwise opposite directions, even with a very large IOR.
  const cross: OpticalVec3 = [direction[1] * normal[2] - direction[2] * normal[1],
    direction[2] * normal[0] - direction[0] * normal[2],
    direction[0] * normal[1] - direction[1] * normal[0]];
  const sine = Math.min(1, Math.hypot(...cross));
  const criticalSine = transmittedIor / incidentIor;
  if (sine > criticalSine) return { kind: "total-internal-reflection" };
  // Divide by the reciprocal for the n0 > n1 case; n0/n1 itself may overflow
  // even when the transmitted sine is finite. For n0 <= n1 multiply instead.
  const transmittedSine = sine === 0 ? 0 : Math.min(1, incidentIor > transmittedIor
    ? sine / criticalSine : sine * (incidentIor / transmittedIor));
  const transmittedCosine = Math.sqrt(Math.max(0, (1 - transmittedSine) * (1 + transmittedSine)));
  const projected: OpticalVec3 = [normal[1] * cross[2] - normal[2] * cross[1],
    normal[2] * cross[0] - normal[0] * cross[2],
    normal[0] * cross[1] - normal[1] * cross[0]];
  const projectedLength = Math.hypot(...projected);
  const tangent: OpticalVec3 = projectedLength === 0 ? [0, 0, 0] : [
    projected[0] / projectedLength, projected[1] / projectedLength, projected[2] / projectedLength
  ];
  const transmitted: OpticalVec3 = [
    transmittedSine * tangent[0] - transmittedCosine * normal[0],
    transmittedSine * tangent[1] - transmittedCosine * normal[1],
    transmittedSine * tangent[2] - transmittedCosine * normal[2]
  ];
  if (transmittedCosine === 0 && thickness > 0) return { kind: "parallel-to-boundary", direction: transmitted };
  const pathLength = thickness === 0 ? 0 : thickness / transmittedCosine;
  if (!Number.isFinite(pathLength)) throw new RangeError("unrepresentable transmitted path length");
  return { kind: "transmitted", direction: transmitted, pathLength,
    ray: [transmitted[0] * pathLength, transmitted[1] * pathLength, transmitted[2] * pathLength] };
}
