/**
 * Colour of the broad multiple-scattering lobe that generated programs add to direct specular (`brdf` chunk,
 * `a3dDirectSpecular`). The lobe returns part of the energy a single GGX bounce misses.
 *
 * - `"single-fresnel"` (default): coloured by the mean Fresnel once. Right for metals (Favg near 1); for dielectrics it
 *   over-lights rough surfaces: on a roughness-1 dielectric under a lone directional light it adds about 0.025 linear
 *   of white (three.js adds no such lobe), which greys saturated rough colours.
 * - `"kulla-conty"`: coloured by the multiple-bounce Fresnel of Kulla and Conty, Favg^2 Eavg / (1 - Favg (1 - Eavg)),
 *   which is 1 at Favg = 1 (metals unchanged) and about 0.0035 for a 0.04 dielectric.
 *
 * The same switch colours the image-based multiple-scattering term (`a3dMultiscatter`): Fdez-Aguera's
 * FssEss Favg Ems / (1 - Ems Favg), as three.js computes it, instead of Ems Favg (which lifts rough dielectrics under an
 * environment the same way).
 *
 * Per device, so one app's choice never reaches another canvas. The engine selects `"kulla-conty"` for apps on the N3
 * plain look path (no authored look or output); every other app keeps `"single-fresnel"` and renders as before.
 */
export type DirectMultiscatterModel = "single-fresnel" | "kulla-conty";

const models = new WeakMap<object, DirectMultiscatterModel>();

export function setDirectMultiscatterModel(device: object, model: DirectMultiscatterModel): void {
  if (model === "single-fresnel") models.delete(device);
  else models.set(device, model);
}

export function directMultiscatterModel(device?: object | null): DirectMultiscatterModel {
  return (device ? models.get(device) : undefined) ?? "single-fresnel";
}

/** Uniform the `brdf` chunk reads (1 = Kulla-Conty / Fdez-Aguera colour, 0 = single mean Fresnel; WebGL defaults omitted floats to 0). */
export const DIRECT_MULTISCATTER_UNIFORM = "u_a3dMultiscatterKullaConty";
