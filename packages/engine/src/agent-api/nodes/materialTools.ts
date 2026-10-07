// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraProceduralTextureKind, AuraProceduralTextureSpec, AuraMaterialSpec, AuraMaterialInspectorParameter, AuraMaterialInspectorPanel, AuraMaterialCapabilityFeatureId, AuraMaterialCapabilityFeature, AuraMaterialCapabilityDiagnostics, AuraMaterialCapabilityInput, AuraSceneNode, AuraModelNode, AuraPrimitiveNode, AuraSceneSnapshot } from "./types.js";
import { AuraSceneBuilder } from "./scene.js";
import { colorToClearColor } from "../colorUtils.js";
import { groups } from "./groups.js";
import { normalizeSceneSnapshot } from "../sceneMath.js";

function clampMaterialScalar(value: number | undefined, fallback: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}

export function proceduralTexture(texture: AuraProceduralTextureKind, options: Partial<Omit<AuraProceduralTextureSpec, "kind" | "texture">> = {}): AuraProceduralTextureSpec {
  return {
    kind: "aura-procedural-texture",
    texture,
    scale: options.scale ?? 1,
    strength: options.strength ?? 1,
    contrast: options.contrast,
    direction: options.direction,
    colorA: options.colorA,
    colorB: options.colorB
  };
}

export const PHYSICAL_SPEC_KEYS = [
  "color", "roughness", "metallic", "metalness", "clearcoat", "clearcoatRoughness",
  "sheen", "sheenColor", "sheenRoughness", "iridescence", "iridescenceIOR",
  "iridescenceThicknessRange", "anisotropy", "anisotropyRotation", "transmission",
  "thickness", "attenuationColor", "attenuationDistance", "ior", "specularIntensity",
  "specularColor"
] as const;

const materialCapabilityCatalog: readonly Omit<AuraMaterialCapabilityFeature, "requested">[] = [
  {
    id: "base-color",
    label: "Base color",
    rootSafeApi: "supported",
    productionRuntime: "supported",
    evidence: "AuraMaterialSpec.color and imported GLB baseColorFactor are consumed by the root renderer.",
    claimRule: "Can be claimed with a route screenshot."
  },
  {
    id: "base-color-texture",
    label: "Base-color texture",
    rootSafeApi: "supported",
    productionRuntime: "supported",
    evidence: "Root textured-PBR upgrade resolves AuraAssetRef texture urls to sRGB baseColor textures with controlled texture on/off pixel deltas (tests/browser/root-textured-c1.spec.ts, tests/reports/root-textured-c1/c1-probe.json).",
    claimRule: "Can describe typed texture metadata and rendered textured assets; do not claim full texture-material parity without controlled root pixels."
  },
  {
    id: "metallic-roughness",
    label: "Metallic/roughness",
    rootSafeApi: "supported",
    productionRuntime: "supported",
    evidence: "Root textured-PBR upgrade composites roughnessMap/metalnessMap to the glTF metallic-roughness convention with scalar fallbacks and controlled browser pixel proof (tests/browser/root-textured-c1.spec.ts).",
    claimRule: "Do not claim full PBR parity without browser evidence."
  },
  {
    id: "normal-map",
    label: "Normal maps",
    rootSafeApi: "supported",
    productionRuntime: "supported",
    evidence: "Root textured-PBR upgrade binds linear normal maps with tangent-space sampling over authored TBN and controlled browser pixel proof (tests/browser/root-textured-c1.spec.ts).",
    claimRule: "Claim only with material-specific screenshot evidence."
  },
  {
    id: "occlusion-map",
    label: "Occlusion maps",
    rootSafeApi: "supported",
    productionRuntime: "supported",
    evidence: "Root textured-PBR upgrade binds linear occlusionMap textures (R channel) with occlusionStrength and controlled browser pixel proof (tests/browser/root-textured-c1.spec.ts).",
    claimRule: "Claim only with material-specific screenshot evidence."
  },
  {
    id: "emissive",
    label: "Emissive",
    rootSafeApi: "supported",
    productionRuntime: "supported",
    evidence: "Root textured-PBR upgrade binds sRGB emissiveMap textures multiplied by the emissive factor with controlled browser pixel proof (tests/browser/root-textured-c1.spec.ts); pixel-backed bloom is reported separately.",
    claimRule: "Distinguish emissive material from postprocess bloom."
  },
  {
    id: "alpha",
    label: "Alpha/opacity",
    rootSafeApi: "partial",
    productionRuntime: "supported",
    evidence: "Opacity is accepted by the public spec, but sorting and blending must be visually verified.",
    claimRule: "Verify alpha behavior in screenshots before claiming."
  },
  {
    id: "double-sided",
    label: "Double-sided materials",
    rootSafeApi: "metadata-only",
    productionRuntime: "supported",
    evidence: "Root diagnostics may preserve metadata, but public material specs do not expose a full double-sided render contract.",
    claimRule: "Claim only when tested route shows backface behavior."
  },
  {
    id: "clearcoat",
    label: "Clearcoat",
    rootSafeApi: "partial",
    productionRuntime: "supported",
    evidence: "Root specs and inspectors expose clearcoat values; physically accurate layered highlights need pixel proof.",
    claimRule: "Do not call clearcoat physically accurate without renderer evidence."
  },
  {
    id: "sheen",
    label: "Sheen",
    rootSafeApi: "partial",
    productionRuntime: "supported",
    evidence: "Root specs expose sheen values for inspection and future renderer binding.",
    claimRule: "Treat as partial unless screenshot-proven."
  },
  {
    id: "transmission",
    label: "Transmission/glass",
    rootSafeApi: "partial",
    productionRuntime: "supported",
    evidence: "Root specs expose glass intent, opacity, IOR, and thickness; real refraction/volume is not proven in the root path.",
    claimRule: "Do not claim real transmission/refraction through root createAuraApp without pixels."
  },
  {
    id: "variants",
    label: "Material variants",
    rootSafeApi: "metadata-only",
    productionRuntime: "supported",
    evidence: "Variant metadata and route logic can be inspected; renderer-level variant switching needs route tests.",
    claimRule: "Claim selected variant behavior only when tested."
  },
  {
    id: "hdr-ibl",
    label: "HDR/IBL",
    rootSafeApi: "supported",
    productionRuntime: "supported",
    evidence: "Root environments.hdri resolves authored Radiance HDR through the HDR-to-cubemap-to-GGX-to-BRDF-LUT chain with iblPixelBacked diagnostics and controlled browser pixel deltas (tests/browser/root-ibl-b3.spec.ts, tests/reports/root-ibl-b3/b3-probe.json).",
    claimRule: "Root HDR/IBL claims require diagnostics and browser pixels."
  },
  {
    id: "shadow-maps",
    label: "Shadow maps",
    rootSafeApi: "partial",
    productionRuntime: "supported",
    evidence: "Root path reports contact-shadow cues; production shadow-map sampling is not proven by spec alone.",
    claimRule: "Production-shadow claims require pixel proof."
  }
];

export function createMaterialCapabilityDiagnostics(input?: AuraMaterialCapabilityInput): AuraMaterialCapabilityDiagnostics {
  const specs = extractMaterialCapabilitySpecs(input);
  const requested = new Set<AuraMaterialCapabilityFeatureId>();
  if (specs.length > 0) requested.add("base-color");
  for (const spec of specs) {
    if (spec.texture) requested.add("base-color-texture");
    if (spec.metallic !== undefined || spec.metalness !== undefined || spec.roughness !== undefined || spec.roughnessMap || spec.metalnessMap) requested.add("metallic-roughness");
    if (spec.normal) requested.add("normal-map");
    if (spec.occlusionMap || spec.occlusionStrength !== undefined) requested.add("occlusion-map");
    if (spec.emissive || spec.emissiveIntensity !== undefined || spec.emissiveMap) requested.add("emissive");
    if (spec.opacity !== undefined && spec.opacity < 1) requested.add("alpha");
    if (spec.clearcoat !== undefined || spec.clearcoatRoughness !== undefined) requested.add("clearcoat");
    if (spec.sheen !== undefined || spec.sheenColor !== undefined || spec.sheenRoughness !== undefined) requested.add("sheen");
    if (spec.transmission !== undefined || spec.thickness !== undefined || spec.ior !== undefined || spec.attenuationColor !== undefined || spec.attenuationDistance !== undefined) requested.add("transmission");
    if (spec.envMapIntensity !== undefined) requested.add("hdr-ibl");
  }
  const features = materialCapabilityCatalog.map((feature) => ({ ...feature, requested: requested.has(feature.id) }));
  const unsupportedRequestedFeatures = features
    .filter((feature) => feature.requested && (feature.rootSafeApi === "unsupported" || feature.rootSafeApi === "internal" || feature.rootSafeApi === "metadata-only"))
    .map((feature) => feature.id);
  const partialRequestedFeatures = features
    .filter((feature) => feature.requested && feature.rootSafeApi === "partial")
    .map((feature) => feature.id);
  const warnings: string[] = [];
  if (partialRequestedFeatures.length > 0) {
    warnings.push(`Partial root material features requested: ${partialRequestedFeatures.join(", ")}. Capture route pixels before claiming production material quality.`);
  }
  for (const spec of specs) {
    for (const physicalWarning of spec.physicalWarnings ?? []) {
      warnings.push(`Physical material extension bounded: ${physicalWarning}`);
    }
  }
  if (unsupportedRequestedFeatures.length > 0) {
    warnings.push(`Metadata/internal material features requested: ${unsupportedRequestedFeatures.join(", ")}. Do not claim rendered support from root createAuraApp alone.`);
  }
  return {
    kind: "aura-material-capability-diagnostics",
    rendererPath: "root-createAuraApp",
    requestedFeatures: [...requested].sort(),
    unsupportedRequestedFeatures,
    partialRequestedFeatures,
    features,
    warnings,
    claimBoundary: "Material diagnostics describe public root createAuraApp support. They are not a substitute for browser screenshot evidence."
  };
}

function extractMaterialCapabilitySpecs(input?: AuraMaterialCapabilityInput): readonly AuraMaterialSpec[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    if (input.every(isAuraMaterialSpecLike)) return input as readonly AuraMaterialSpec[];
    return groups.flatten(input as readonly AuraSceneNode[])
      .filter((node): node is AuraPrimitiveNode | AuraModelNode => (node.kind === "primitive" || node.kind === "model") && Boolean(node.material))
      .map((node) => node.material!);
  }
  if (isAuraMaterialSpecLike(input)) return [input];
  const snapshot = normalizeSceneSnapshot(input as AuraSceneBuilder | AuraSceneSnapshot);
  return groups.flatten(snapshot.nodes)
    .filter((node): node is AuraPrimitiveNode | AuraModelNode => (node.kind === "primitive" || node.kind === "model") && Boolean(node.material))
    .map((node) => node.material!);
}

function isAuraMaterialSpecLike(value: unknown): value is AuraMaterialSpec {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuraMaterialSpec> & { readonly kind?: unknown; readonly nodes?: unknown };
  if (candidate.kind !== undefined || candidate.nodes !== undefined) return false;
  return Boolean(
    candidate.color !== undefined ||
    candidate.roughness !== undefined ||
    candidate.metallic !== undefined ||
    candidate.metalness !== undefined ||
    candidate.emissive !== undefined ||
    candidate.opacity !== undefined ||
    candidate.transmission !== undefined ||
    candidate.clearcoat !== undefined ||
    candidate.sheen !== undefined ||
    candidate.texture !== undefined ||
    candidate.normal !== undefined ||
    candidate.roughnessMap !== undefined ||
    candidate.metalnessMap !== undefined ||
    candidate.envMapIntensity !== undefined ||
    candidate.shader !== undefined ||
    candidate.name !== undefined
  );
}

export function createMaterialInspector(name: string, spec: AuraMaterialSpec): AuraMaterialInspectorPanel {
  const metalness = spec.metalness ?? spec.metallic ?? 0;
  const parameters: AuraMaterialInspectorParameter[] = [
    { name: "color", value: spec.color ?? "#d7dee8", visible: true },
    { name: "roughness", value: clampMaterialScalar(spec.roughness, 0.55), min: 0, max: 1, step: 0.01, visible: true },
    { name: "metalness", value: clampMaterialScalar(metalness, 0), min: 0, max: 1, step: 0.01, visible: true },
    { name: "clearcoat", value: clampMaterialScalar(spec.clearcoat, 0), min: 0, max: 1, step: 0.01, visible: spec.clearcoat !== undefined },
    { name: "clearcoatRoughness", value: clampMaterialScalar(spec.clearcoatRoughness, 0.18), min: 0, max: 1, step: 0.01, visible: spec.clearcoat !== undefined },
    { name: "transmission", value: clampMaterialScalar(spec.transmission, 0), min: 0, max: 1, step: 0.01, visible: spec.transmission !== undefined || (spec.opacity ?? 1) < 1 },
    { name: "thickness", value: spec.thickness ?? 0, min: 0, max: 5, step: 0.01, unit: "m", visible: spec.transmission !== undefined || spec.thickness !== undefined },
    { name: "ior", value: spec.ior ?? 1.5, min: 1, max: 2.333, step: 0.001, visible: spec.transmission !== undefined || spec.ior !== undefined },
    { name: "sheen", value: clampMaterialScalar(spec.sheen, 0), min: 0, max: 1, step: 0.01, visible: spec.sheen !== undefined },
    { name: "iridescence", value: clampMaterialScalar(spec.iridescence, 0), min: 0, max: 1, step: 0.01, visible: spec.iridescence !== undefined },
    { name: "anisotropy", value: clampMaterialScalar(spec.anisotropy, 0, -1, 1), min: -1, max: 1, step: 0.01, visible: spec.anisotropy !== undefined },
    { name: "emissiveIntensity", value: spec.emissiveIntensity ?? 0, min: 0, max: 8, step: 0.05, visible: spec.emissive !== undefined },
    { name: "envMapIntensity", value: spec.envMapIntensity ?? 1, min: 0, max: 4, step: 0.01, visible: true },
    { name: "normalScale", value: spec.normalScale ?? (spec.normal ? 1 : 0), min: 0, max: 2, step: 0.01, visible: spec.normal !== undefined }
  ];
  const liveValues: Record<string, number | string | boolean | readonly number[] | undefined> = {};
  for (const parameter of parameters) {
    if (parameter.visible) liveValues[String(parameter.name)] = parameter.value;
  }
  return {
    kind: "aura-material-inspector",
    name,
    material: spec,
    parameters,
    liveValues,
    summary: `${name}: roughness ${liveValues.roughness}, metalness ${liveValues.metalness}, transmission ${liveValues.transmission ?? 0}, clearcoat ${liveValues.clearcoat ?? 0}`
  };
}

function materialFeatureVector(spec: AuraMaterialSpec): readonly number[] {
  const [r, g, b] = colorToClearColor(spec.color ?? "#d7dee8");
  return [
    spec.roughness ?? 0.55,
    spec.metalness ?? spec.metallic ?? 0,
    spec.transmission ?? 0,
    spec.clearcoat ?? 0,
    Math.min(1, (spec.emissiveIntensity ?? (spec.emissive ? 1 : 0)) / 4),
    spec.opacity ?? 1,
    Math.min(1, (spec.envMapIntensity ?? 1) / 2),
    spec.sheen ?? 0,
    Math.abs(spec.anisotropy ?? 0),
    r,
    g,
    b
  ];
}

function materialFeatureDistance(a: AuraMaterialSpec, b: AuraMaterialSpec): number {
  const av = materialFeatureVector(a);
  const bv = materialFeatureVector(b);
  let sum = 0;
  for (let index = 0; index < av.length; index += 1) {
    const delta = (av[index] ?? 0) - (bv[index] ?? 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum / av.length);
}

export function minimumMaterialFeatureDistance(specs: readonly AuraMaterialSpec[]): number {
  if (specs.length < 2) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (let a = 0; a < specs.length; a += 1) {
    for (let b = a + 1; b < specs.length; b += 1) {
      minimum = Math.min(minimum, materialFeatureDistance(specs[a]!, specs[b]!));
    }
  }
  return Number.isFinite(minimum) ? Number(minimum.toFixed(3)) : 0;
}
