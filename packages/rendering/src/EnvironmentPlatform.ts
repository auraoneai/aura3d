import { Geometry, type Bounds3 } from "./Geometry";
import { type EnvironmentLightingOptions, type RenderItem } from "./ForwardPass";
import { PBRMaterial, type PBRProceduralEnvironmentMapOptions } from "./PBRMaterial";
import { UnlitMaterial } from "./UnlitMaterial";
import { createV4ContactShadowPlan, type V4ContactShadowPlan } from "./shadows/ContactShadows";

export type EnvironmentCapabilityId =
  | "cubemap-renderer"
  | "equirectangular-projection"
  | "pmrem-generator"
  | "atmospheric-scattering"
  | "analytical-studio-box"
  | "linear-fog"
  | "exponential-fog"
  | "rgbe-hdr-parser"
  | "exr-parser"
  | "cube-camera-reflections"
  | "dynamic-ocean-plane"
  | "procedural-sky-dome"
  | "volumetric-weather-enclosure"
  | "infinite-ground-grid"
  | "indoor-studio-stage"
  | "outdoor-nature-backdrop"
  | "urban-city-shell"
  | "industrial-warehouse-void"
  | "deep-space-box"
  | "clean-void-backdrop";

export type EnvironmentCapabilityStatus = "implemented" | "partial" | "helper" | "missing";

export interface EnvironmentCapability {
  readonly id: EnvironmentCapabilityId;
  readonly label: string;
  readonly status: EnvironmentCapabilityStatus;
  readonly reusable: boolean;
  readonly evidence: readonly string[];
  readonly gap: string;
  readonly requiredForAcceptedClaim: string;
}

export interface EnvironmentCapabilityReport {
  readonly requestedCount: number;
  readonly implementedCount: number;
  readonly partialCount: number;
  readonly helperCount: number;
  readonly missingCount: number;
  readonly productionReadyCount: number;
  readonly nonProductionReadyCount: number;
  readonly productionReady: readonly EnvironmentCapabilityId[];
  readonly backlog: readonly EnvironmentCapability[];
  readonly capabilities: readonly EnvironmentCapability[];
}

export type EnvironmentStagePresetId =
  | "clean-void"
  | "indoor-studio"
  | "outdoor-nature"
  | "urban-city"
  | "industrial-warehouse"
  | "deep-space";
export type EnvironmentStudioTone = "standard" | "premium-dark" | "product-premium";
export type EnvironmentContactGroundingMode = "auto" | "off" | "contact-shadow";

export type EnvironmentPresetType = EnvironmentStagePresetId | "studio" | "outdoor" | "city" | "warehouse" | "ocean" | "space";
export type EnvironmentPresetLighting = "softbox" | "sunset" | "overcast" | "night" | "neon" | "warehouse" | "space";
export type EnvironmentPresetBackground = "cubemap" | "equirect" | "sky" | "procedural" | "none";
export type EnvironmentPresetGround = "grid" | "shadow-catcher" | "reflective-floor" | "terrain" | "none";
export type EnvironmentFeatureRequest =
  | "cubemap-background"
  | "equirect-background"
  | "reflective-floor"
  | "terrain-heightfield"
  | "rectangular-area-light"
  | "cube-camera-reflection"
  | "planar-reflection"
  | "transmission-refraction"
  | "linear-fog"
  | "exponential-fog"
  | "volumetric-fog"
  | "fft-webgpu-water"
  | "water-caustics"
  | "underwater-volume";

export type EnvironmentFogMode = "linear" | "exponential" | "exponential-squared";
export type EnvironmentFogPresetId = "distant-haze" | "morning-mist" | "marine-layer" | "night-smog" | "warehouse-dust";
export type EnvironmentFogInput = EnvironmentFogPresetId | EnvironmentFogOptions | false;

export interface EnvironmentFogOptions {
  readonly preset?: EnvironmentFogPresetId;
  readonly mode?: EnvironmentFogMode;
  readonly color?: Rgb;
  readonly near?: number;
  readonly far?: number;
  readonly density?: number;
  readonly heightFalloff?: number;
  readonly heightReference?: number;
  readonly maxOpacity?: number;
  readonly sampleDistances?: readonly number[];
}

export interface EnvironmentFogUniforms {
  readonly u_environmentFogEnabled: 1;
  readonly u_environmentFogMode: 1 | 2 | 3;
  readonly u_environmentFogColor: Rgb;
  readonly u_environmentFogNear: number;
  readonly u_environmentFogFar: number;
  readonly u_environmentFogDensity: number;
  readonly u_environmentFogHeightFalloff: number;
  readonly u_environmentFogHeightReference: number;
  readonly u_environmentFogMaxOpacity: number;
}

export interface EnvironmentFogTelemetry {
  readonly mode: EnvironmentFogMode;
  readonly preset: EnvironmentFogPresetId;
  readonly capabilityIds: readonly EnvironmentCapabilityId[];
  readonly sampleDistances: readonly number[];
  readonly sampleFactors: readonly number[];
  readonly monotonicDistanceResponse: boolean;
  readonly uniformKeys: readonly string[];
  readonly claimBoundary: string;
  readonly limitations: readonly string[];
}

export interface EnvironmentFogProfile {
  readonly preset: EnvironmentFogPresetId;
  readonly mode: EnvironmentFogMode;
  readonly color: Rgb;
  readonly near: number;
  readonly far: number;
  readonly density: number;
  readonly heightFalloff: number;
  readonly heightReference: number;
  readonly maxOpacity: number;
  readonly capabilityIds: readonly EnvironmentCapabilityId[];
  readonly uniforms: EnvironmentFogUniforms;
  readonly telemetry: EnvironmentFogTelemetry;
  readonly limitations: readonly string[];
}

export interface EnvironmentStageOptions {
  readonly preset?: EnvironmentStagePresetId;
  readonly size?: number;
  readonly floorY?: number;
  readonly gridDivisions?: number;
  readonly timeSeconds?: number;
  readonly studioTone?: EnvironmentStudioTone;
  readonly includeSkyDome?: boolean;
  readonly includeStageShell?: boolean;
  readonly includeGroundGrid?: boolean;
  readonly contactGrounding?: EnvironmentContactGroundingMode | EnvironmentContactGroundingOptions;
}

export interface EnvironmentContactGroundingOptions {
  readonly mode?: EnvironmentContactGroundingMode;
  readonly casterRadius?: number;
  readonly receiverDistance?: number;
  readonly softness?: number;
  readonly opacity?: number;
  readonly layerCount?: number;
  readonly anisotropy?: number;
  readonly yOffset?: number;
  readonly label?: string;
}

export interface EnvironmentContactGrounding {
  readonly mode: "contact-shadow";
  readonly plan: V4ContactShadowPlan;
  readonly items: readonly RenderItem[];
  readonly receiverLabel: string;
  readonly limitations: readonly string[];
}

export interface EnvironmentStage {
  readonly preset: EnvironmentStagePresetId;
  readonly items: readonly RenderItem[];
  readonly bounds: Bounds3;
  readonly lighting: EnvironmentLightingOptions;
  readonly systems: readonly string[];
  readonly capabilityIds: readonly EnvironmentCapabilityId[];
  readonly limitations: readonly string[];
  readonly contactGrounding?: EnvironmentContactGrounding;
}

export interface EnvironmentPresetOptions extends Omit<EnvironmentStageOptions, "preset" | "includeSkyDome" | "includeGroundGrid"> {
  readonly type?: EnvironmentPresetType;
  readonly lighting?: EnvironmentPresetLighting;
  readonly background?: EnvironmentPresetBackground;
  readonly ground?: EnvironmentPresetGround;
  readonly fog?: EnvironmentFogInput;
  readonly requestedFeatures?: readonly EnvironmentFeatureRequest[];
}

export interface EnvironmentUnsupportedRequestDisclosure {
  readonly request: EnvironmentFeatureRequest;
  readonly supported: false;
  readonly capabilityIds: readonly EnvironmentCapabilityId[];
  readonly fallback: string;
  readonly disclosure: string;
}

export interface EnvironmentUnsupportedRequestDisclosureOptions {
  readonly type?: EnvironmentPresetType;
  readonly lighting?: EnvironmentPresetLighting;
  readonly background?: EnvironmentPresetBackground;
  readonly ground?: EnvironmentPresetGround;
  readonly fog?: EnvironmentFogInput | EnvironmentFogProfile;
  readonly requestedFeatures?: readonly EnvironmentFeatureRequest[];
}

export interface EnvironmentPreset extends EnvironmentStage {
  readonly type: EnvironmentPresetType;
  readonly lightingPreset: EnvironmentPresetLighting;
  readonly background: EnvironmentPresetBackground;
  readonly ground: EnvironmentPresetGround;
  readonly fog?: EnvironmentFogProfile;
  readonly unsupportedRequests: readonly string[];
  readonly unsupportedRequestDetails: readonly EnvironmentUnsupportedRequestDisclosure[];
}

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];
type Vec3 = readonly [number, number, number];

const ENVIRONMENT_CAPABILITIES: readonly EnvironmentCapability[] = [
  capability("cubemap-renderer", "Cubemap Renderer", "partial", true, [
    "Texture supports six cube faces.",
    "WebGL2Device binds cubemap faces.",
    "V6 environment lighting resources create PMREM cube textures.",
    "Renderer schedules EnvironmentBackgroundPass for camera-correct cubemap backgrounds."
  ], "Renderer cubemap background path exists, but no accepted gallery route/screenshot proves six-face visual sampling yet.", "Add visible six-face skybox/background rendering and screenshot gates."),
  capability("equirectangular-projection", "Equirectangular Projection Engine", "partial", true, [
    "PBR shader includes equirectangular UV sampling.",
    "PMREM generator projects equirectangular HDR into cube faces.",
    "Renderer schedules EnvironmentBackgroundPass for camera-correct equirect panorama backgrounds."
  ], "Renderer equirect background path exists, but no accepted gallery route/screenshot proves panorama background rendering yet.", "Add equirect panorama background rendering and route proof."),
  capability("pmrem-generator", "PMREM Generator", "partial", true, [
    "generateCubemapPMREMResources creates GGX-prefiltered cubemap mip levels.",
    "createCubemapPMREMShaderContract documents sampler-cube material bindings."
  ], "Current PMREM audit is explicitly bounded and not Three.js parity.", "Prove material roughness response against stable HDR route screenshots."),
  capability("atmospheric-scattering", "Atmospheric Scattering Shader", "missing", false, [], "No reusable Rayleigh/Mie sky shader is exposed.", "Implement physical sky shader or keep scattering out of accepted claims."),
  capability("analytical-studio-box", "Analytical Studio Box", "helper", true, [
    "createEnvironmentStage(\"indoor-studio\") returns reusable softbox panels and cove geometry."
  ], "Studio helper is procedural geometry, not an infinite analytical lighting renderer.", "Connect reusable stage helper to accepted product/material routes and visual tests."),
  capability("linear-fog", "Linear Fog System", "partial", true, [
    "createEnvironmentFogProfile emits uniform-ready linear fog settings.",
    "sampleEnvironmentFogFactor provides deterministic CPU reference attenuation for validation.",
    "Renderer and ForwardPass bind linear fog uniforms into active PBR-family shader paths."
  ], "Renderer shader path exists, but no accepted gallery route/screenshot proves object/background blending yet.", "Add visual gates before claiming Three.js Fog parity."),
  capability("exponential-fog", "Exponential Fog System", "partial", true, [
    "createEnvironmentFogProfile emits uniform-ready exponential and exponential-squared fog settings.",
    "Fog telemetry records distance sample factors and uniform keys for route evidence.",
    "Renderer and ForwardPass bind exponential fog uniforms into active PBR-family shader paths."
  ], "Renderer shader path exists, but no accepted gallery route/screenshot proves FogExp2-style blending yet.", "Add visual gates before claiming FogExp2 parity."),
  capability("rgbe-hdr-parser", "RGBE HDR Parser", "partial", true, [
    "parseV6RadianceHDR decodes Radiance/RGBE RLE buffers.",
    "decodeRgbeEnvironmentMap converts RGBE pixels to linear HDR data."
  ], "Public HDRLoaderV5 remains diagnostic-only.", "Expose an end-to-end public HDR file-to-environment loader path."),
  capability("exr-parser", "EXR Parser", "missing", false, [], "EXRLoaderV5 is diagnostic-only and does not decode OpenEXR pixels.", "Implement real EXR decode or document EXR as unsupported."),
  capability("cube-camera-reflections", "Cube Camera Reflections", "missing", false, [], "ReflectionProbe is a descriptor helper; live six-direction capture is not implemented.", "Implement cube camera/probe capture and reflective material binding."),
  capability("dynamic-ocean-plane", "Dynamic Ocean Plane", "helper", true, [
    "OceanFixtures and waterSystems provide Gerstner/procedural water telemetry.",
    "Gallery routes can build dynamic water meshes from reusable samples."
  ], "No FFT/WebGPU ocean, planar reflection/refraction, caustics, or underwater volume renderer is accepted.", "Promote water helper to renderer subsystem or keep claims scoped to CPU/Gerstner water."),
  capability("procedural-sky-dome", "Procedural Sky Dome", "helper", true, [
    "createEnvironmentStage can emit an infinite-ish sky dome item and procedural environment lighting."
  ], "The helper is color-gradient geometry, not physical sun/atmosphere scattering.", "Add sun/moon/day-night controls and shader-backed sky model before parity claims."),
  capability("volumetric-weather-enclosure", "Volumetric Weather Enclosure", "helper", true, [
    "Weather and gallery fog helpers expose deterministic mist/dust/particle telemetry."
  ], "No volumetric cloud, participating-media, or native god-ray pass is implemented.", "Implement volumetric/layered weather or keep route claims bounded."),
  capability("infinite-ground-grid", "Infinite Ground Grid", "helper", true, [
    "createInfiniteGroundGrid returns reusable line geometry and material."
  ], "Grid is finite helper geometry, not a renderer-level infinite grid with shadow catch.", "Add fade/shadow/catch-plane controls and route evidence."),
  capability("indoor-studio-stage", "Indoor Studio Stage", "helper", true, [
    "createEnvironmentStage(\"indoor-studio\") creates reusable cove, floor, wall, and softbox items."
  ], "Stage does not yet provide physically accurate area-light shading.", "Use as shared product/material route stage and document area-light limits."),
  capability("outdoor-nature-backdrop", "Outdoor Nature Backdrop", "helper", true, [
    "createEnvironmentStage(\"outdoor-nature\") creates reusable sky, ground, horizon, and ambient palette."
  ], "No terrain streaming, vegetation lighting, or physical atmosphere is accepted.", "Add route proof and keep outdoor claims bounded to backdrop/lighting."),
  capability("urban-city-shell", "Urban City Shell", "helper", true, [
    "createEnvironmentStage(\"urban-city\") creates reusable neon shell panels and lighting colors."
  ], "This is a reusable shell, not a city renderer or instancing proof.", "Use with Smart City/data routes while keeping scale claims separate."),
  capability("industrial-warehouse-void", "Industrial Warehouse Void", "helper", true, [
    "createEnvironmentStage(\"industrial-warehouse\") creates reusable overhead bulbs, concrete floor, window strips, and rails."
  ], "No GI, physical area lights, or warehouse asset library is accepted.", "Use as shared robotics/physics/digital-twin environment shell."),
  capability("deep-space-box", "Deep Space Box", "helper", true, [
    "createEnvironmentStage(\"deep-space\") creates reusable starfield shell points and sky dome."
  ], "Not volumetric nebula or HDR skybox lighting parity.", "Add cubemap/HDR background integration before accepted deep-space claims."),
  capability("clean-void-backdrop", "Clean Void Backdrop", "helper", true, [
    "createEnvironmentStage(\"clean-void\") creates reusable infinity-wall-style floor and backdrop."
  ], "Clean void still needs shared shadow/reflection controls for product-grade use.", "Use as fallback stage with explicit limitations.")
];

export function listEnvironmentCapabilities(): readonly EnvironmentCapability[] {
  return ENVIRONMENT_CAPABILITIES.map((item) => ({ ...item, evidence: [...item.evidence] }));
}

export function createEnvironmentCapabilityReport(): EnvironmentCapabilityReport {
  const capabilities = listEnvironmentCapabilities();
  const productionReady = capabilities.filter((item) => item.status === "implemented").map((item) => item.id);
  const backlog = capabilities.filter((item) => item.status !== "implemented");
  return {
    requestedCount: capabilities.length,
    implementedCount: capabilities.filter((item) => item.status === "implemented").length,
    partialCount: capabilities.filter((item) => item.status === "partial").length,
    helperCount: capabilities.filter((item) => item.status === "helper").length,
    missingCount: capabilities.filter((item) => item.status === "missing").length,
    productionReadyCount: productionReady.length,
    nonProductionReadyCount: backlog.length,
    productionReady,
    backlog,
    capabilities
  };
}

export function createInfiniteGroundGrid(options: {
  readonly size?: number;
  readonly divisions?: number;
  readonly y?: number;
  readonly color?: Rgba;
  readonly label?: string;
} = {}): RenderItem {
  const size = positive(options.size ?? 24, "grid size");
  const divisions = integerInRange(options.divisions ?? 24, 2, 512, "grid divisions");
  const y = finite(options.y ?? 0, "grid y");
  const half = size / 2;
  const positions: Vec3[] = [];
  for (let i = 0; i <= divisions; i += 1) {
    const offset = -half + (i / divisions) * size;
    positions.push([-half, y, offset], [half, y, offset], [offset, y, -half], [offset, y, half]);
  }
  return {
    geometry: Geometry.lineSegments(positions),
    material: new UnlitMaterial({
      name: options.label ?? "environment infinite ground grid",
      color: options.color ?? [0.28, 0.42, 0.48, 0.42],
      renderState: { blend: true, depthWrite: false }
    }),
    includeInAutoFrame: false,
    label: options.label ?? "environment infinite ground grid"
  };
}

export function createProceduralSkyDome(options: {
  readonly preset?: EnvironmentStagePresetId;
  readonly radius?: number;
  readonly color?: Rgba;
  readonly y?: number;
  readonly label?: string;
} = {}): RenderItem {
  const preset = options.preset ?? "clean-void";
  const palette = stagePalette(preset);
  return {
    geometry: Geometry.uvSphere(positive(options.radius ?? 42, "sky dome radius"), 48, 24),
    material: new UnlitMaterial({
      name: options.label ?? `${preset} procedural sky dome`,
      color: options.color ?? [...palette.sky, 1],
      renderState: { depthWrite: false, cullMode: "front" }
    }),
    modelMatrix: translation([0, finite(options.y ?? 0, "sky dome y"), 0]),
    includeInAutoFrame: false,
    label: options.label ?? `${preset} procedural sky dome`
  };
}

export function createEnvironmentStage(options: EnvironmentStageOptions = {}): EnvironmentStage {
  const preset = options.preset ?? "clean-void";
  const size = positive(options.size ?? 12, "stage size");
  const floorY = finite(options.floorY ?? 0, "stage floorY");
  const studioTone = options.studioTone ?? "standard";
  const palette = stagePalette(preset, studioTone);
  const items: RenderItem[] = [];
  const includeStageShell = options.includeStageShell !== false;
  const includeGroundGrid = options.includeGroundGrid !== false;
  const contactGrounding = createStageContactGrounding(preset, size, floorY, studioTone, options.contactGrounding);

  if (options.includeSkyDome !== false) {
    items.push(createProceduralSkyDome({ preset, radius: size * 3.5, color: [...palette.sky, 1], y: floorY }));
  }
  if (includeStageShell) {
    items.push(...createStageShell(preset, size, palette, floorY, studioTone));
  }
  if (includeGroundGrid) {
    items.push(createInfiniteGroundGrid({
      size: size * 1.8,
      divisions: options.gridDivisions ?? 18,
      y: floorY - 0.004,
      color: [...palette.grid, 0.46],
      label: `${preset} ground grid`
    }));
  }
  if (contactGrounding) {
    items.push(...contactGrounding.items);
  }
  items.push(...createStageAccents(preset, size, palette, finite(options.timeSeconds ?? 0, "timeSeconds"), floorY, studioTone));

  return {
    preset,
    items,
    bounds: {
      min: [-size, floorY - 0.08, -size],
      max: [size, floorY + size * 0.74, size]
    },
    lighting: createStageLighting(preset, palette),
    systems: [
      includeStageShell ? "environment stage shell" : "environment stage shell disabled",
      "procedural sky/backdrop",
      includeGroundGrid ? "ground grid/catch plane" : "ground grid disabled",
      ...(contactGrounding ? ["contact grounding helper"] : []),
      "preset environment lighting",
      "stage accent panels"
    ],
    capabilityIds: stageCapabilities(preset),
    limitations: [
      ...stageLimitations(preset),
      ...(contactGrounding ? contactGrounding.limitations : []),
      ...(includeStageShell ? [] : ["Physical stage shell is disabled for this environment stage; it proves reusable backdrop/lighting behavior, not floor, wall, or catch-plane rendering."]),
      ...(includeGroundGrid ? [] : ["Ground grid/catch-plane rendering is disabled for this environment stage."])
    ],
    ...(contactGrounding ? { contactGrounding } : {})
  };
}

export function createEnvironmentFogProfile(options: EnvironmentFogPresetId | EnvironmentFogOptions = {}): EnvironmentFogProfile {
  const requestedPreset = typeof options === "string" ? options : options.preset;
  const preset = requestedPreset ?? "distant-haze";
  const defaults = fogPresetDefaults(preset);
  const overrides = typeof options === "string" ? {} : options;
  const mode = overrides.mode ?? defaults.mode;
  const color = rgb(overrides.color ?? defaults.color, "fog color");
  const near = finite(overrides.near ?? defaults.near, "fog near");
  const far = finite(overrides.far ?? defaults.far, "fog far");
  if (far <= near) throw new RangeError("Environment platform fog far must be greater than fog near.");
  const density = nonNegative(overrides.density ?? defaults.density, "fog density");
  const heightFalloff = nonNegative(overrides.heightFalloff ?? defaults.heightFalloff, "fog heightFalloff");
  const heightReference = finite(overrides.heightReference ?? defaults.heightReference, "fog heightReference");
  const maxOpacity = unit(overrides.maxOpacity ?? defaults.maxOpacity, "fog maxOpacity");
  const capabilityIds = fogCapabilities(mode);
  const uniforms: EnvironmentFogUniforms = {
    u_environmentFogEnabled: 1,
    u_environmentFogMode: fogModeUniform(mode),
    u_environmentFogColor: color,
    u_environmentFogNear: round3(near),
    u_environmentFogFar: round3(far),
    u_environmentFogDensity: round5(density),
    u_environmentFogHeightFalloff: round5(heightFalloff),
    u_environmentFogHeightReference: round3(heightReference),
    u_environmentFogMaxOpacity: round3(maxOpacity)
  };
  const limitations = [
    "Environment fog profiles are reusable uniform payloads and CPU reference math, not proof that every renderer shader path applies fog.",
    "Volumetric fog, participating media, god rays, cloud scattering, and water caustic/refraction effects remain unsupported."
  ];
  const profileBase = {
    preset,
    mode,
    color,
    near,
    far,
    density,
    heightFalloff,
    heightReference,
    maxOpacity,
    capabilityIds,
    uniforms,
    limitations
  };
  const sampleDistances = sanitizeFogSampleDistances(overrides.sampleDistances ?? defaultFogSampleDistances(near, far));
  const sampleFactors = sampleDistances.map((distance) => sampleEnvironmentFogFactor(profileBase, distance));
  return {
    ...profileBase,
    telemetry: {
      mode,
      preset,
      capabilityIds,
      sampleDistances,
      sampleFactors,
      monotonicDistanceResponse: sampleFactors.every((value, index) => index === 0 || value >= sampleFactors[index - 1]!),
      uniformKeys: Object.keys(uniforms),
      claimBoundary: "Uniform-ready G3D environment fog helper with deterministic CPU attenuation samples; not an accepted volumetric fog, atmospheric scattering, or Three.js Fog/FogExp2 parity claim.",
      limitations
    }
  };
}

export function sampleEnvironmentFogFactor(
  fog: Pick<EnvironmentFogProfile, "mode" | "near" | "far" | "density" | "heightFalloff" | "heightReference" | "maxOpacity">,
  distance: number,
  worldY = fog.heightReference
): number {
  const d = Math.max(0, finite(distance, "fog sample distance"));
  const height = finite(worldY, "fog sample height");
  let factor = 0;
  if (fog.mode === "linear") {
    factor = (d - fog.near) / Math.max(0.000001, fog.far - fog.near);
  } else if (fog.mode === "exponential") {
    factor = 1 - Math.exp(-fog.density * d);
  } else {
    const scaled = fog.density * d;
    factor = 1 - Math.exp(-(scaled * scaled));
  }
  const heightMultiplier = fog.heightFalloff > 0
    ? Math.exp(-Math.max(0, height - fog.heightReference) * fog.heightFalloff)
    : 1;
  return round5(clamp(factor * heightMultiplier, 0, 1) * fog.maxOpacity);
}

export function applyEnvironmentFogToColor(
  color: Rgb,
  fog: EnvironmentFogProfile,
  distance: number,
  worldY = fog.heightReference
): Rgb {
  const source = rgb(color, "source color");
  const factor = sampleEnvironmentFogFactor(fog, distance, worldY);
  return [
    round5(source[0] + (fog.color[0] - source[0]) * factor),
    round5(source[1] + (fog.color[1] - source[1]) * factor),
    round5(source[2] + (fog.color[2] - source[2]) * factor)
  ];
}

export function createEnvironmentPreset(options: EnvironmentPresetOptions = {}): EnvironmentPreset {
  const type = options.type ?? "clean-void";
  const background = options.background ?? "procedural";
  const ground = options.ground ?? "grid";
  const lightingPreset = options.lighting ?? defaultLightingForType(type);
  const preset = stagePresetForType(type);
  const fog = resolveEnvironmentFog(options.fog, type);
  const stage = createEnvironmentStage({
    size: options.size,
    gridDivisions: options.gridDivisions,
    timeSeconds: options.timeSeconds,
    preset,
    includeSkyDome: background !== "none",
    includeStageShell: options.includeStageShell,
    includeGroundGrid: ground === "grid"
  });
  const unsupportedRequestDetails = createEnvironmentUnsupportedRequestDisclosures({
    type,
    lighting: lightingPreset,
    background,
    ground,
    fog,
    requestedFeatures: options.requestedFeatures
  });
  const unsupportedRequests = unsupportedRequestDetails.map((request) => request.disclosure);
  return {
    ...stage,
    type,
    lightingPreset,
    background,
    ground,
    capabilityIds: uniqueCapabilities([
      ...stage.capabilityIds,
      ...backgroundCapabilities(background),
      ...groundCapabilities(ground),
      ...(fog ? fog.capabilityIds : []),
      ...unsupportedRequestDetails.flatMap((request) => request.capabilityIds),
      ...(type === "ocean" ? ["dynamic-ocean-plane" as const] : [])
    ]),
    systems: fog ? [...stage.systems, "environment fog profile"] : stage.systems,
    limitations: [
      ...stage.limitations,
      ...(fog ? fog.limitations : []),
      ...unsupportedRequests
    ],
    ...(fog ? { fog } : {}),
    unsupportedRequests,
    unsupportedRequestDetails
  };
}

export function createEnvironmentUnsupportedRequestDisclosures(
  options: EnvironmentUnsupportedRequestDisclosureOptions = {}
): readonly EnvironmentUnsupportedRequestDisclosure[] {
  const type = options.type ?? "clean-void";
  const background = options.background ?? "procedural";
  const ground = options.ground ?? "grid";
  const lighting = options.lighting ?? defaultLightingForType(type);
  const fog = resolveEnvironmentFog(options.fog, type);
  const requested = new Set<EnvironmentFeatureRequest>(options.requestedFeatures ?? []);

  if (background === "cubemap") requested.add("cubemap-background");
  if (background === "equirect") requested.add("equirect-background");
  if (ground === "reflective-floor") {
    requested.add("reflective-floor");
    requested.add("planar-reflection");
  }
  if (ground === "terrain") requested.add("terrain-heightfield");
  if (lighting === "softbox") requested.add("rectangular-area-light");
  if (type === "ocean") {
    requested.add("fft-webgpu-water");
    requested.add("planar-reflection");
    requested.add("transmission-refraction");
    requested.add("water-caustics");
    requested.add("underwater-volume");
  }
  if (fog?.mode === "linear") requested.delete("linear-fog");
  if (fog?.mode === "exponential" || fog?.mode === "exponential-squared") requested.delete("exponential-fog");

  return [...requested].map((request) => unsupportedRequestDisclosure(request));
}

function createStageShell(
  preset: EnvironmentStagePresetId,
  size: number,
  palette: StagePalette,
  floorY: number,
  studioTone: EnvironmentStudioTone
): RenderItem[] {
  const premiumStudio = preset === "indoor-studio" && (studioTone === "premium-dark" || studioTone === "product-premium");
  const productPremiumStudio = preset === "indoor-studio" && studioTone === "product-premium";
  const floorScale: Vec3 = productPremiumStudio
    ? [size * 1.02, 0.03, size * 0.66]
    : premiumStudio
    ? [size * 1.78, 0.052, size * 1.22]
    : [size * 1.65, 0.06, size * 1.65];
  const wallCenter: Vec3 = premiumStudio
    ? [0, floorY + size * 1.38, -size * 1.55]
    : [0, floorY + size * 0.36, -size * 0.82];
  const wallScale: Vec3 = premiumStudio
    ? [size * 8.0, size * 4.0, 0.07]
    : [size * 1.65, size * 0.74, 0.08];
  const floor = new PBRMaterial({
    name: `${preset} environment floor`,
    baseColor: [...(productPremiumStudio ? ([palette.floor[0] * 0.72, palette.floor[1] * 0.72, palette.floor[2] * 0.72] as Rgb) : palette.floor), 1],
    roughness: premiumStudio ? 0.68 : preset === "indoor-studio" ? 0.54 : 0.62,
    metallic: preset === "urban-city" || preset === "industrial-warehouse" ? 0.14 : 0.02,
    environmentColor: palette.ambient,
    environmentIntensity: premiumStudio ? 0.0 : preset === "indoor-studio" ? 0.24 : 0.48,
    proceduralEnvironmentMap: proceduralMap(palette)
  });
  const wall = new PBRMaterial({
    name: `${preset} environment backdrop`,
    baseColor: [...palette.backdrop, 1],
    roughness: premiumStudio ? 0.92 : preset === "indoor-studio" ? 0.86 : 0.72,
    metallic: 0,
    environmentColor: palette.ambient,
    environmentIntensity: premiumStudio ? 0.0 : preset === "indoor-studio" ? 0.16 : 0.36,
    proceduralEnvironmentMap: proceduralMap(palette)
  });
  const floorItem: RenderItem = {
    geometry: premiumStudio ? Geometry.cylinder({ radius: 0.5, height: 1, segments: 96 }) : Geometry.litCube(1),
    material: floor,
    modelMatrix: trs([0, floorY - floorScale[1] * 0.5 - 0.005, productPremiumStudio ? 0.02 : 0.04], floorScale),
    includeInAutoFrame: false,
    label: `${preset} floor/catch plane`
  };
  if (premiumStudio) return [floorItem];
  return [
    floorItem,
    {
      geometry: Geometry.litCube(1),
      material: wall,
      modelMatrix: trs(wallCenter, wallScale),
      includeInAutoFrame: false,
      label: `${preset} rear infinity wall`
    }
  ];
}

function createStageAccents(
  preset: EnvironmentStagePresetId,
  size: number,
  palette: StagePalette,
  time: number,
  floorY: number,
  studioTone: EnvironmentStudioTone
): RenderItem[] {
  if (preset === "clean-void" || preset === "outdoor-nature") {
    return horizonBands(preset, size, palette, floorY);
  }
  if (preset === "deep-space") {
    const points: Vec3[] = [];
    for (let i = 0; i < 220; i += 1) {
      const a = hash01(i, 17) * Math.PI * 2;
      const r = size * (1.1 + hash01(i, 23) * 1.15);
      points.push([
        Math.cos(a) * r,
        floorY + size * (0.14 + hash01(i, 31) * 0.72),
        -size * (0.28 + hash01(i, 43) * 1.1) + Math.sin(time * 0.05 + i) * 0.04
      ]);
    }
    return [{
      geometry: Geometry.points(points),
      material: new UnlitMaterial({ name: "deep space star field", color: [0.78, 0.9, 1, 0.82], pointSize: 2.2, roundPoints: true, renderState: { blend: true, depthWrite: false } }),
      includeInAutoFrame: false,
      label: "deep space reusable star field"
    }];
  }

  const panels: RenderItem[] = [];
  const panelCount = preset === "urban-city" ? 10 : preset === "industrial-warehouse" ? 8 : 6;
  const premiumStudio = preset === "indoor-studio" && (studioTone === "premium-dark" || studioTone === "product-premium");
  const productPremiumStudio = preset === "indoor-studio" && studioTone === "product-premium";
  if (premiumStudio) {
    const studioPanels: readonly { readonly position: Vec3; readonly scale: Vec3; readonly rotation: Vec3; readonly color: Rgb; readonly label: string }[] = [
      { position: [-size * 0.24, floorY + size * (productPremiumStudio ? 1.02 : 0.66), -size * (productPremiumStudio ? 0.92 : 0.54)], scale: [size * (productPremiumStudio ? 0.095 : 0.18), size * 0.01, size * (productPremiumStudio ? 0.026 : 0.045)], rotation: [0, 0, 0.05], color: palette.accentB, label: "upper warm softbox" },
      { position: [size * 0.28, floorY + size * (productPremiumStudio ? 1.03 : 0.66), -size * (productPremiumStudio ? 0.94 : 0.56)], scale: [size * (productPremiumStudio ? 0.095 : 0.18), size * 0.01, size * (productPremiumStudio ? 0.026 : 0.045)], rotation: [0, 0, -0.05], color: palette.accentA, label: "upper cool softbox" }
    ];
    return studioPanels.map((panel, index): RenderItem => ({
      geometry: Geometry.litCube(1),
      material: new PBRMaterial({
        name: `${preset} premium analytical ${panel.label}`,
        baseColor: [...panel.color, 1],
        roughness: 0.38,
        emissiveColor: panel.color,
        emissiveStrength: productPremiumStudio ? index === 0 ? 0.052 : 0.044 : index === 0 ? 0.16 : 0.12,
        environmentColor: palette.ambient,
        proceduralEnvironmentMap: proceduralMap(palette)
      }),
      modelMatrix: trs(panel.position, panel.scale, panel.rotation),
      includeInAutoFrame: false,
      label: `${preset} reusable ${panel.label}`
    }));
  }
  for (let i = 0; i < panelCount; i += 1) {
    const x = premiumStudio
      ? -size * 0.56 + (i / Math.max(1, panelCount - 1)) * size * 1.12
      : -size * 0.72 + (i / Math.max(1, panelCount - 1)) * size * 1.44;
    const y = floorY + size * (premiumStudio ? 0.68 : preset === "indoor-studio" ? 0.62 : 0.62 + (i % 2) * 0.08);
    const z = premiumStudio ? -size * 0.42 : preset === "indoor-studio" ? -size * 0.52 : -size * 0.77;
    const emissive = i % 2 === 0 ? palette.accentA : palette.accentB;
    panels.push({
      geometry: Geometry.litCube(1),
      material: new PBRMaterial({
        name: `${preset} analytical light panel ${i}`,
        baseColor: [...emissive, 1],
        roughness: 0.22,
        emissiveColor: emissive,
        emissiveStrength: preset === "urban-city" ? 2.4 : premiumStudio ? 0.42 : preset === "indoor-studio" ? 0.82 : 1.55,
        environmentColor: palette.ambient,
        proceduralEnvironmentMap: proceduralMap(palette)
      }),
      modelMatrix: trs([x, y, z], premiumStudio ? [size * 0.07, size * 0.014, size * 0.11] : [size * 0.09, size * 0.018, size * 0.16], [0, 0, (i % 2 ? -0.1 : 0.1)]),
      includeInAutoFrame: false,
      label: `${preset} reusable light panel`
    });
  }
  return panels;
}

function createStageContactGrounding(
  preset: EnvironmentStagePresetId,
  size: number,
  floorY: number,
  studioTone: EnvironmentStudioTone,
  input: EnvironmentStageOptions["contactGrounding"]
): EnvironmentContactGrounding | undefined {
  const requestedMode = typeof input === "string" ? input : input?.mode ?? "auto";
  if (requestedMode === "off") return undefined;
  const defaultProductGrounding = preset === "indoor-studio" && studioTone === "product-premium";
  if (requestedMode === "auto" && !defaultProductGrounding) return undefined;
  const options: EnvironmentContactGroundingOptions = typeof input === "object" ? input : {};
  const casterRadius = positive(options.casterRadius ?? size * (defaultProductGrounding ? 0.28 : 0.34), "contact grounding casterRadius");
  const receiverDistance = positive(options.receiverDistance ?? size * 0.075, "contact grounding receiverDistance");
  const label = options.label ?? `${preset} product grounding`;
  const plan = createV4ContactShadowPlan({
    casterRadius,
    receiverDistance,
    softness: options.softness ?? (defaultProductGrounding ? 0.62 : 0.52),
    opacity: options.opacity ?? (defaultProductGrounding ? 0.34 : 0.42),
    layerCount: options.layerCount ?? (defaultProductGrounding ? 3 : 2),
    anisotropy: options.anisotropy ?? (defaultProductGrounding ? 1.42 : 1.22),
    yOffset: options.yOffset ?? 0.003
  });
  const items = plan.layers.map((layer): RenderItem => ({
    geometry: Geometry.cylinder({ radius: 0.5, height: 1, segments: 96 }),
    material: new PBRMaterial({
      name: `${label} layer ${layer.index}`,
      baseColor: [0, 0, 0, layer.opacity],
      roughness: 1,
      metallic: 0,
      environmentColor: [0, 0, 0],
      environmentIntensity: 0,
      proceduralEnvironmentMap: {
        skyColor: [0, 0, 0],
        horizonColor: [0, 0, 0],
        groundColor: [0, 0, 0],
        specularColor: [0, 0, 0],
        intensity: 0,
        specularIntensity: 0
      },
      renderState: {
        blend: true,
        depthWrite: false,
        cullMode: "none",
        polygonOffset: { factor: -1, units: -1 }
      }
    }),
    modelMatrix: trs([0, floorY + layer.yOffset, 0.03], [layer.scale[0], 0.003, layer.scale[1]]),
    includeInAutoFrame: false,
    label: `${label} contact shadow layer ${layer.index}`
  }));
  return {
    mode: "contact-shadow",
    plan,
    items,
    receiverLabel: `${preset} floor/catch plane`,
    limitations: [
      "Contact grounding uses layered receiver geometry so product assets have reusable visual grounding without route crop or floor-slab expansion.",
      plan.claimBoundary
    ]
  };
}

function horizonBands(preset: EnvironmentStagePresetId, size: number, palette: StagePalette, floorY = 0): RenderItem[] {
  return [0, 1, 2].map((band): RenderItem => ({
    geometry: Geometry.litCube(1),
    material: new UnlitMaterial({
      name: `${preset} horizon band ${band}`,
      color: [...mixRgb(palette.horizon, palette.sky, band * 0.28), 0.28 - band * 0.05],
      renderState: { blend: true, depthWrite: false }
    }),
    modelMatrix: trs([0, floorY + size * (0.18 + band * 0.12), -size * (0.76 + band * 0.02)], [size * 1.64, size * 0.08, 0.025]),
    includeInAutoFrame: false,
    label: `${preset} procedural horizon band`
  }));
}

function createStageLighting(preset: EnvironmentStagePresetId, palette: StagePalette): EnvironmentLightingOptions {
  return {
    color: palette.ambient,
    intensity: preset === "deep-space" ? 0.18 : preset === "urban-city" ? 0.62 : 0.48,
    proceduralMap: proceduralMap(palette)
  };
}

function stageCapabilities(preset: EnvironmentStagePresetId): readonly EnvironmentCapabilityId[] {
  const base: EnvironmentCapabilityId[] = ["procedural-sky-dome", "infinite-ground-grid"];
  if (preset === "clean-void") return [...base, "clean-void-backdrop"];
  if (preset === "indoor-studio") return [...base, "analytical-studio-box", "indoor-studio-stage"];
  if (preset === "outdoor-nature") return [...base, "outdoor-nature-backdrop"];
  if (preset === "urban-city") return [...base, "urban-city-shell"];
  if (preset === "industrial-warehouse") return [...base, "industrial-warehouse-void"];
  return [...base, "deep-space-box"];
}

function stagePresetForType(type: EnvironmentPresetType): EnvironmentStagePresetId {
  switch (type) {
    case "studio": return "indoor-studio";
    case "outdoor": return "outdoor-nature";
    case "city": return "urban-city";
    case "warehouse": return "industrial-warehouse";
    case "space": return "deep-space";
    case "ocean": return "outdoor-nature";
    default: return type;
  }
}

function defaultLightingForType(type: EnvironmentPresetType): EnvironmentPresetLighting {
  switch (type) {
    case "studio":
    case "indoor-studio":
    case "clean-void":
      return "softbox";
    case "city":
    case "urban-city":
      return "neon";
    case "warehouse":
    case "industrial-warehouse":
      return "warehouse";
    case "space":
    case "deep-space":
      return "space";
    case "ocean":
      return "sunset";
    case "outdoor":
    case "outdoor-nature":
      return "overcast";
  }
}

function backgroundCapabilities(background: EnvironmentPresetBackground): readonly EnvironmentCapabilityId[] {
  if (background === "cubemap") return ["cubemap-renderer"];
  if (background === "equirect") return ["equirectangular-projection"];
  if (background === "sky" || background === "procedural") return ["procedural-sky-dome"];
  return [];
}

function groundCapabilities(ground: EnvironmentPresetGround): readonly EnvironmentCapabilityId[] {
  if (ground === "grid") return ["infinite-ground-grid"];
  if (ground === "reflective-floor") return ["clean-void-backdrop", "cube-camera-reflections"];
  if (ground === "shadow-catcher") return ["clean-void-backdrop"];
  if (ground === "terrain") return ["outdoor-nature-backdrop"];
  return [];
}

function uniqueCapabilities(values: readonly EnvironmentCapabilityId[]): readonly EnvironmentCapabilityId[] {
  return [...new Set(values)];
}

function resolveEnvironmentFog(input: EnvironmentFogInput | EnvironmentFogProfile | undefined, type: EnvironmentPresetType): EnvironmentFogProfile | undefined {
  if (input === false) return undefined;
  if (input && typeof input === "object" && "uniforms" in input && "telemetry" in input) return input;
  if (input !== undefined) return createEnvironmentFogProfile(input);
  const preset = defaultFogForType(type);
  return preset ? createEnvironmentFogProfile(preset) : undefined;
}

function defaultFogForType(type: EnvironmentPresetType): EnvironmentFogPresetId | undefined {
  switch (type) {
    case "ocean":
      return "marine-layer";
    case "outdoor":
    case "outdoor-nature":
      return "distant-haze";
    case "city":
    case "urban-city":
      return "night-smog";
    case "warehouse":
    case "industrial-warehouse":
      return "warehouse-dust";
    default:
      return undefined;
  }
}

function fogPresetDefaults(preset: EnvironmentFogPresetId): Required<Omit<EnvironmentFogOptions, "sampleDistances">> {
  switch (preset) {
    case "morning-mist":
      return {
        preset,
        mode: "exponential",
        color: [0.68, 0.76, 0.78],
        near: 0,
        far: 90,
        density: 0.026,
        heightFalloff: 0.18,
        heightReference: 0,
        maxOpacity: 0.64
      };
    case "marine-layer":
      return {
        preset,
        mode: "exponential-squared",
        color: [0.56, 0.74, 0.82],
        near: 4,
        far: 130,
        density: 0.012,
        heightFalloff: 0.045,
        heightReference: 0,
        maxOpacity: 0.68
      };
    case "night-smog":
      return {
        preset,
        mode: "exponential",
        color: [0.07, 0.1, 0.16],
        near: 0,
        far: 120,
        density: 0.018,
        heightFalloff: 0.025,
        heightReference: 0,
        maxOpacity: 0.58
      };
    case "warehouse-dust":
      return {
        preset,
        mode: "linear",
        color: [0.46, 0.43, 0.35],
        near: 12,
        far: 72,
        density: 0.012,
        heightFalloff: 0.02,
        heightReference: 0,
        maxOpacity: 0.48
      };
    case "distant-haze":
      return {
        preset,
        mode: "linear",
        color: [0.62, 0.7, 0.78],
        near: 32,
        far: 160,
        density: 0.006,
        heightFalloff: 0.015,
        heightReference: 0,
        maxOpacity: 0.7
      };
  }
}

function fogCapabilities(mode: EnvironmentFogMode): readonly EnvironmentCapabilityId[] {
  return mode === "linear" ? ["linear-fog"] : ["exponential-fog"];
}

function fogModeUniform(mode: EnvironmentFogMode): 1 | 2 | 3 {
  if (mode === "linear") return 1;
  if (mode === "exponential") return 2;
  return 3;
}

function defaultFogSampleDistances(near: number, far: number): readonly number[] {
  const span = far - near;
  return [0, near, near + span * 0.35, near + span * 0.7, far, far + span * 0.35].map(round3);
}

function sanitizeFogSampleDistances(values: readonly number[]): readonly number[] {
  if (values.length === 0) throw new RangeError("Environment platform fog sampleDistances must not be empty.");
  return values.map((value, index) => round3(nonNegative(value, `fog sampleDistances[${index}]`)));
}

function unsupportedRequestDisclosure(request: EnvironmentFeatureRequest): EnvironmentUnsupportedRequestDisclosure {
  switch (request) {
    case "cubemap-background":
      return unsupported(
        request,
        ["cubemap-renderer"],
        "Renderer.environmentBackground cubemap binding when a cube texture is supplied",
        "Renderer cubemap background support exists, but this preset request did not attach six cube faces or accepted screenshot evidence."
      );
    case "equirect-background":
      return unsupported(
        request,
        ["equirectangular-projection"],
        "Renderer.environmentBackground equirect binding when a panorama texture is supplied",
        "Renderer equirect background support exists, but this preset request did not attach a panorama texture or accepted screenshot evidence."
      );
    case "reflective-floor":
      return unsupported(
        request,
        ["clean-void-backdrop", "cube-camera-reflections"],
        "staged floor/catch-plane geometry",
        "Requested reflective floor falls back to staged geometry; planar reflector/cube-camera floor reflections are not implemented."
      );
    case "terrain-heightfield":
      return unsupported(
        request,
        ["outdoor-nature-backdrop"],
        "outdoor backdrop and finite stage shell",
        "Requested terrain ground falls back to outdoor backdrop geometry; reusable terrain/heightfield generation is not implemented."
      );
    case "rectangular-area-light":
      return unsupported(
        request,
        ["analytical-studio-box"],
        "emissive panels plus environment lighting",
        "Softbox preset uses emissive panels and environment lighting; true rectangular area-light shading is not implemented."
      );
    case "cube-camera-reflection":
      return unsupported(
        request,
        ["cube-camera-reflections"],
        "static procedural environment lighting",
        "Cube-camera reflection requests remain unsupported; live six-direction probe capture and reflective material binding are not implemented."
      );
    case "planar-reflection":
      return unsupported(
        request,
        ["cube-camera-reflections"],
        "static procedural environment lighting and stage geometry",
        "Planar reflection requests remain unsupported; the environment preset does not create reflector render targets or screen-space reflections."
      );
    case "transmission-refraction":
      return unsupported(
        request,
        ["pmrem-generator"],
        "bounded material/environment response",
        "Scene-space refraction requests remain unsupported; current material/environment helpers do not provide water refraction, caustics, or background ray marching parity."
      );
    case "linear-fog":
      return unsupported(
        request,
        ["linear-fog"],
        "Renderer.environmentFog linear profile when a fog profile is supplied",
        "Renderer linear fog support exists, but this request did not attach an environment fog profile; accepted Fog parity still requires route visual gates."
      );
    case "exponential-fog":
      return unsupported(
        request,
        ["exponential-fog"],
        "Renderer.environmentFog exponential profile when a fog profile is supplied",
        "Renderer exponential fog support exists, but this request did not attach an exponential environment fog profile; accepted FogExp2 parity still requires route visual gates."
      );
    case "volumetric-fog":
      return unsupported(
        request,
        ["volumetric-weather-enclosure"],
        "deterministic mist/dust helper geometry",
        "Volumetric fog remains helper-only; no participating-media, volumetric cloud, or native god-ray pass is implemented."
      );
    case "fft-webgpu-water":
      return unsupported(
        request,
        ["dynamic-ocean-plane"],
        "CPU/Gerstner water telemetry and finite mesh helpers",
        "Ocean preset does not provide FFT/WebGPU water; dynamic water remains helper-level CPU/Gerstner/procedural geometry."
      );
    case "water-caustics":
      return unsupported(
        request,
        ["dynamic-ocean-plane"],
        "foam/glint helper geometry and material highlights",
        "Water caustics remain unsupported; environment presets do not create caustic projection, photon, or screen-space caustic passes."
      );
    case "underwater-volume":
      return unsupported(
        request,
        ["dynamic-ocean-plane"],
        "surface-only water helper geometry",
        "Underwater volume rendering remains unsupported; environment presets do not provide absorption/scattering volumes or underwater camera transitions."
      );
  }
}

function unsupported(
  request: EnvironmentFeatureRequest,
  capabilityIds: readonly EnvironmentCapabilityId[],
  fallback: string,
  disclosure: string
): EnvironmentUnsupportedRequestDisclosure {
  return {
    request,
    supported: false,
    capabilityIds,
    fallback,
    disclosure
  };
}

function stageLimitations(preset: EnvironmentStagePresetId): readonly string[] {
  const shared = [
    "Environment stage helpers are reusable G3D geometry/material systems, not proof of full Three.js environment parity.",
    "Linear/exponential fog profiles are uniform-ready helpers; accepted shader integration, cube-camera reflections, and volumetric weather remain separate backlog items."
  ];
  if (preset === "indoor-studio") return [
    ...shared,
    "Softboxes are emissive geometry and environment-light presets, not physically integrated area lights.",
    "Product studio tones use compact analytical catch planes; full contact shadows and live area-light integration remain separate renderer evidence."
  ];
  if (preset === "deep-space") return [...shared, "Star field is point geometry, not HDR cubemap or volumetric nebula rendering."];
  if (preset === "outdoor-nature") return [...shared, "Outdoor sky is a colored dome/horizon helper, not atmospheric scattering."];
  return shared;
}

interface StagePalette {
  readonly sky: Rgb;
  readonly horizon: Rgb;
  readonly ground: Rgb;
  readonly floor: Rgb;
  readonly backdrop: Rgb;
  readonly grid: Rgb;
  readonly ambient: Rgb;
  readonly specular: Rgb;
  readonly accentA: Rgb;
  readonly accentB: Rgb;
}

function stagePalette(preset: EnvironmentStagePresetId, studioTone: EnvironmentStudioTone = "standard"): StagePalette {
  switch (preset) {
    case "indoor-studio":
      if (studioTone === "premium-dark" || studioTone === "product-premium") {
        return colors([0.004, 0.005, 0.008], [0.009, 0.012, 0.018], [0.003, 0.004, 0.006], [0.006, 0.008, 0.012], [0.004, 0.005, 0.009], [0.06, 0.1, 0.13], [0.1, 0.13, 0.16], [0.44, 0.52, 0.62], [0.28, 0.44, 0.58], [0.72, 0.42, 0.24]);
      }
      return colors([0.02, 0.028, 0.038], [0.08, 0.095, 0.12], [0.018, 0.02, 0.024], [0.035, 0.039, 0.044], [0.026, 0.03, 0.038], [0.18, 0.28, 0.34], [0.42, 0.46, 0.5], [0.72, 0.78, 0.86], [0.55, 0.72, 0.86], [0.92, 0.68, 0.42]);
    case "outdoor-nature":
      return colors([0.38, 0.58, 0.8], [0.95, 0.55, 0.28], [0.08, 0.18, 0.12], [0.18, 0.24, 0.16], [0.2, 0.32, 0.28], [0.42, 0.58, 0.42], [0.62, 0.72, 0.58], [1, 0.76, 0.46], [0.88, 0.54, 0.28], [0.35, 0.62, 0.42]);
    case "urban-city":
      return colors([0.025, 0.045, 0.09], [0.08, 0.18, 0.28], [0.015, 0.018, 0.025], [0.035, 0.04, 0.05], [0.025, 0.03, 0.045], [0.1, 0.74, 0.92], [0.34, 0.46, 0.72], [0.56, 0.82, 1], [0.0, 0.82, 1], [1, 0.22, 0.68]);
    case "industrial-warehouse":
      return colors([0.08, 0.1, 0.11], [0.2, 0.22, 0.2], [0.06, 0.055, 0.05], [0.22, 0.22, 0.2], [0.14, 0.145, 0.14], [0.74, 0.64, 0.42], [0.58, 0.56, 0.5], [1, 0.86, 0.55], [1, 0.72, 0.32], [0.36, 0.62, 0.72]);
    case "deep-space":
      return colors([0.004, 0.006, 0.02], [0.045, 0.03, 0.12], [0, 0, 0.01], [0.012, 0.014, 0.025], [0.006, 0.008, 0.018], [0.32, 0.46, 0.78], [0.18, 0.24, 0.42], [0.42, 0.56, 1], [0.44, 0.72, 1], [0.8, 0.35, 1]);
    case "clean-void":
      return colors([0.68, 0.72, 0.76], [0.78, 0.8, 0.82], [0.24, 0.25, 0.26], [0.56, 0.58, 0.6], [0.48, 0.5, 0.52], [0.32, 0.36, 0.4], [0.74, 0.76, 0.78], [0.95, 0.95, 0.92], [0.74, 0.78, 0.82], [0.56, 0.6, 0.64]);
  }
}

function proceduralMap(palette: StagePalette): PBRProceduralEnvironmentMapOptions {
  return {
    skyColor: palette.sky,
    horizonColor: palette.horizon,
    groundColor: palette.ground,
    specularColor: palette.specular,
    intensity: 0.7,
    specularIntensity: 0.82
  };
}

function capability(
  id: EnvironmentCapabilityId,
  label: string,
  status: EnvironmentCapabilityStatus,
  reusable: boolean,
  evidence: readonly string[],
  gap: string,
  requiredForAcceptedClaim: string
): EnvironmentCapability {
  return { id, label, status, reusable, evidence, gap, requiredForAcceptedClaim };
}

function colors(
  sky: Rgb,
  horizon: Rgb,
  ground: Rgb,
  floor: Rgb,
  backdrop: Rgb,
  grid: Rgb,
  ambient: Rgb,
  specular: Rgb,
  accentA: Rgb,
  accentB: Rgb
): StagePalette {
  return { sky, horizon, ground, floor, backdrop, grid, ambient, specular, accentA, accentB };
}

function trs(position: Vec3, scale: Vec3, rotation: Vec3 = [0, 0, 0]): Float32Array {
  const [sx, sy, sz] = scale;
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx);
  const sxr = Math.sin(rx);
  const cy = Math.cos(ry);
  const syr = Math.sin(ry);
  const cz = Math.cos(rz);
  const szr = Math.sin(rz);
  const m00 = cy * cz;
  const m01 = sxr * syr * cz + cx * szr;
  const m02 = -cx * syr * cz + sxr * szr;
  const m10 = -cy * szr;
  const m11 = -sxr * syr * szr + cx * cz;
  const m12 = cx * syr * szr + sxr * cz;
  const m20 = syr;
  const m21 = -sxr * cy;
  const m22 = cx * cy;
  return new Float32Array([
    m00 * sx, m01 * sx, m02 * sx, 0,
    m10 * sy, m11 * sy, m12 * sy, 0,
    m20 * sz, m21 * sz, m22 * sz, 0,
    position[0], position[1], position[2], 1
  ]);
}

function translation(position: Vec3): Float32Array {
  return trs(position, [1, 1, 1]);
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k
  ];
}

function hash01(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return ((value >>> 0) / 0xffffffff);
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`Environment platform ${label} must be finite.`);
  return value;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Environment platform ${label} must be finite and non-negative.`);
  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Environment platform ${label} must be positive.`);
  return value;
}

function unit(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`Environment platform ${label} must be in [0, 1].`);
  return value;
}

function integerInRange(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`Environment platform ${label} must be an integer in [${min}, ${max}].`);
  }
  return value;
}

function rgb(value: Rgb, label: string): Rgb {
  return [
    unit(value[0], `${label}[0]`),
    unit(value[1], `${label}[1]`),
    unit(value[2], `${label}[2]`)
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round5(value: number): number {
  return Math.round(value * 100000) / 100000;
}
