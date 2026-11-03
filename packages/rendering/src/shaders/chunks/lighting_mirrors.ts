/**
 * CPU counterparts for Aura's punctual range window and hemispheric light.
 * Distances are in scene units. A zero cutoff means an unbounded light; the
 * inverse-power singularity is limited to 100 at the source.
 */
type Vec3Tuple = readonly [number, number, number];

export function a3dDistanceFalloff(lightDistance: number, cutoffDistance: number, decayExponent: number): number {
  const d = Math.max(0, lightDistance);
  let window = 1;
  if (cutoffDistance > 0) {
    const ratio = d / cutoffDistance;
    const ratio2 = ratio * ratio;
    const remaining = Math.max(0, Math.min(1, 1 - ratio2 * ratio2));
    window = remaining * remaining;
  }
  return window / Math.max(0.01, Math.pow(d, Math.max(0, decayExponent)));
}

const normalize = (v: Vec3Tuple): Vec3Tuple => {
  const length = Math.hypot(...v);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0];
};

/** Sky and ground colors are irradiances already scaled by light intensity. */
export function a3dHemisphereIrradiance(
  skyColor: Vec3Tuple,
  groundColor: Vec3Tuple,
  direction: Vec3Tuple,
  normal: Vec3Tuple
): Vec3Tuple {
  const n = normalize(normal);
  const axis = normalize(direction);
  const dot = n[0] * axis[0] + n[1] * axis[1] + n[2] * axis[2];
  const skyWeight = Math.min(1, Math.max(0, (dot + 1) * 0.5));
  const groundWeight = 1 - skyWeight;
  return [
    skyColor[0] * skyWeight + groundColor[0] * groundWeight,
    skyColor[1] * skyWeight + groundColor[1] * groundWeight,
    skyColor[2] * skyWeight + groundColor[2] * groundWeight
  ];
}

export interface AuraPhysicalReferenceMaterial {
  readonly baseColor: Vec3Tuple;
  readonly metallic: number;
  readonly roughness: number;
  readonly ior: number;
  readonly specularIntensity: number;
  readonly specularColorFactor: Vec3Tuple;
  readonly diffuseRoughness: number;
  readonly retroreflection: number;
}

/**
 * CPU numerical reference for the generated physical-direct shader. Unit
 * direction vectors and DFG values must come from the caller's reference
 * integration. Results are linear outgoing diffuse and specular radiance.
 */
export function a3dPhysicalDirectReference(
  normal: Vec3Tuple,
  view: Vec3Tuple,
  light: Vec3Tuple,
  radiance: Vec3Tuple,
  material: AuraPhysicalReferenceMaterial,
  viewDfg: readonly [number, number],
  lightDfg: readonly [number, number]
): { readonly diffuse: Vec3Tuple; readonly specular: Vec3Tuple } {
  const scalars = [
    ...normal, ...view, ...light, ...radiance, ...material.baseColor, ...material.specularColorFactor,
    material.metallic, material.roughness, material.ior, material.specularIntensity,
    material.diffuseRoughness, material.retroreflection, ...viewDfg, ...lightDfg
  ];
  if (scalars.some((value) => !Number.isFinite(value))) throw new RangeError("Physical reference inputs must be finite");
  for (const direction of [normal, view, light]) {
    if (Math.abs(Math.hypot(...direction) - 1) > 1e-5) throw new RangeError("Physical reference directions must be unit vectors");
  }
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const dot = (a: Vec3Tuple, b: Vec3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nl = clamp(dot(normal, light)), nv = clamp(dot(normal, view));
  if (nl === 0 || nv === 0) return { diffuse: [0, 0, 0], specular: [0, 0, 0] };
  const half: Vec3Tuple = [light[0] + view[0], light[1] + view[1], light[2] + view[2]];
  const h = Math.hypot(...half) > 1e-3 ? normalize(half) : normal;
  const metallic = clamp(material.metallic), roughness = Math.max(0.0525, clamp(material.roughness));
  const alpha2 = roughness ** 4;
  const nh = clamp(dot(normal, h)), vh = clamp(dot(view, h));
  const denominator = 1 + nh * nh * (alpha2 - 1);
  const distribution = alpha2 / (Math.PI * Math.max(denominator * denominator, 1e-12));
  const lambdaView = nl * Math.sqrt(alpha2 + (1 - alpha2) * nv * nv);
  const lambdaLight = nv * Math.sqrt(alpha2 + (1 - alpha2) * nl * nl);
  const visibility = 0.5 / Math.max(lambdaView + lambdaLight, 1e-6);
  const ior = Math.max(material.ior, 0.0001);
  const dielectric = ((ior - 1) / (ior + 1)) ** 2;
  const intensity = clamp(material.specularIntensity);
  const f90 = intensity + (1 - intensity) * metallic;
  const missingV = 1 - clamp(clamp(viewDfg[0]) + clamp(viewDfg[1]));
  const missingL = 1 - clamp(clamp(lightDfg[0]) + clamp(lightDfg[1]));
  const sigma = clamp(material.diffuseRoughness) * Math.PI / 2, sigma2 = sigma * sigma;
  const sinL = Math.sqrt(Math.max(1 - nl * nl, 0)), sinV = Math.sqrt(Math.max(1 - nv * nv, 0));
  const alignment = sinL * sinV > 1e-6
    ? Math.max((dot(light, view) - nl * nv) / (sinL * sinV), 0)
    : 0;
  const a = 1 - 0.5 * sigma2 / (sigma2 + 0.33);
  const b = 0.45 * sigma2 / (sigma2 + 0.09);
  const angular = clamp(a + b * alignment * Math.max(sinL, sinV) * Math.min(sinL, sinV) / Math.max(nl, nv, 1e-6));
  const retro = 1 - clamp(material.retroreflection) * (1 - clamp(dot(light, view)) ** 8);
  const diffuse: [number, number, number] = [0, 0, 0];
  const specular: [number, number, number] = [0, 0, 0];
  for (let channel = 0; channel < 3; channel += 1) {
    const base = clamp(material.baseColor[channel]!);
    const f0Dielectric = clamp(dielectric * Math.max(0, material.specularColorFactor[channel]!)) * intensity;
    const f0 = f0Dielectric * (1 - metallic) + base * metallic;
    const fresnel = (cosine: number) => f0 + (f90 - f0) * (1 - cosine) ** 5;
    const available = 1 - clamp(Math.max(fresnel(nv), fresnel(nl)));
    const mean = clamp(f0 + (f90 - f0) / 21);
    const incoming = Math.max(0, radiance[channel]!) * nl;
    diffuse[channel] = incoming * base * (1 - metallic) * available * angular * retro / Math.PI;
    specular[channel] = incoming * (fresnel(vh) * distribution * visibility + mean * missingV * missingL / Math.PI);
  }
  return { diffuse, specular };
}
