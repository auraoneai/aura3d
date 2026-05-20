import { DirectionalLight, Light, PointLight, SpotLight } from "@galileo3d/scene";
import type { CollectedLight, CollectedLightKind } from "./LightCollector";

export type LightingRigPreset =
  | "key-fill-rim"
  | "studio-softbox"
  | "sun"
  | "industrial"
  | "urban-neon"
  | "product-detail"
  | "product-shot";

export type LightingRigUnsupportedFeature =
  | "rectangular-area-light"
  | "ies-photometric-profile"
  | "contact-shadow-map"
  | "cascaded-shadow-map"
  | "global-illumination";

export interface LightingRigLightDescriptor {
  readonly id: string;
  readonly kind: CollectedLightKind;
  readonly role: "key" | "fill" | "rim" | "sun" | "accent" | "practical" | "ambient-proxy";
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly range: number;
  readonly spotAngle: number;
  readonly penumbra: number;
  readonly castsShadow: boolean;
  readonly claimBoundary: string;
}

export interface LightingRigSoftboxDescriptor {
  readonly id: string;
  readonly role: "key" | "fill" | "rim";
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly position: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly size: readonly [number, number];
  readonly linkedLightIds: readonly string[];
  readonly claimBoundary: string;
}

export interface LightingRigDiagnostics {
  readonly preset: LightingRigPreset;
  readonly lightCount: number;
  readonly shadowCastingLightCount: number;
  readonly softboxProxyCount: number;
  readonly unsupportedFeatures: readonly LightingRigUnsupportedFeature[];
  readonly disclosures: readonly string[];
  readonly claimBoundary: string;
}

export interface LightingRig {
  readonly preset: LightingRigPreset;
  readonly lights: readonly LightingRigLightDescriptor[];
  readonly softboxes: readonly LightingRigSoftboxDescriptor[];
  readonly collectedLights: readonly CollectedLight[];
  readonly diagnostics: LightingRigDiagnostics;
}

export interface LightingRigOptions {
  readonly preset?: LightingRigPreset;
  readonly intensityScale?: number;
  readonly shadows?: boolean;
  readonly includeUnsupportedDiagnostics?: boolean;
}

export function createLightingRig(options: LightingRigOptions = {}): LightingRig {
  const preset = options.preset ?? "key-fill-rim";
  const intensityScale = positive(options.intensityScale ?? 1, "lighting rig intensityScale");
  const shadows = options.shadows ?? true;
  const lights = lightingRigDescriptors(preset).map((light) => ({
    ...light,
    intensity: round3(light.intensity * intensityScale),
    castsShadow: shadows && light.castsShadow
  }));
  const softboxes = lightingRigSoftboxes(preset).map((softbox) => ({
    ...softbox,
    intensity: round3(softbox.intensity * intensityScale)
  }));
  const unsupportedFeatures = unsupportedFeaturesForRig(preset, options.includeUnsupportedDiagnostics ?? true);
  return {
    preset,
    lights,
    softboxes,
    collectedLights: lights.map(toCollectedLight),
    diagnostics: {
      preset,
      lightCount: lights.length,
      shadowCastingLightCount: lights.filter((light) => light.castsShadow).length,
      softboxProxyCount: softboxes.length,
      unsupportedFeatures,
      disclosures: unsupportedFeatures.map(lightingDisclosure),
      claimBoundary: "Lighting rigs are reusable direct-light descriptors for G3D ForwardPass; true area lights, IES profiles, GI, contact shadows, and cascaded-shadow production claims require separate renderer evidence."
    }
  };
}

export function listLightingRigPresets(): readonly LightingRigPreset[] {
  return ["key-fill-rim", "studio-softbox", "sun", "industrial", "urban-neon", "product-detail", "product-shot"];
}

function lightingRigDescriptors(preset: LightingRigPreset): readonly LightingRigLightDescriptor[] {
  switch (preset) {
    case "studio-softbox":
      return [
        light("studio-key", "directional", "key", [1, 0.95, 0.88], 1.25, [-3, 5, 4], [0.45, -0.72, -0.53], 0, 0, 0, true, "Softbox represented as a broad directional key plus fill accents, not a physical rectangular area light."),
        light("studio-fill", "directional", "fill", [0.68, 0.78, 1], 0.38, [4, 3, 2], [-0.76, -0.42, -0.5], 0, 0, 0, false, "Fill is a direct-light approximation."),
        light("studio-rim", "spot", "rim", [0.78, 0.9, 1], 0.72, [0, 3.2, -4], [0, -0.42, 0.91], 9, Math.PI / 5, 0.45, false, "Rim light is a bounded spot helper.")
      ];
    case "sun":
      return [
        light("sun-main", "directional", "sun", [1, 0.92, 0.78], 2.4, [-8, 9, 4], [0.62, -0.68, -0.38], 0, 0, 0, true, "Sun preset is a directional light and does not imply physical atmosphere or cascaded shadow proof."),
        light("sky-fill", "directional", "fill", [0.45, 0.58, 0.85], 0.28, [4, 6, -3], [-0.25, -0.8, 0.54], 0, 0, 0, false, "Sky fill is an approximation.")
      ];
    case "industrial":
      return [
        light("industrial-key", "spot", "key", [1, 0.88, 0.68], 1.45, [-2.5, 5.5, 2.5], [0.36, -0.86, -0.36], 11, Math.PI / 6, 0.35, true, "Overhead industrial fixture represented as spot light."),
        light("industrial-practical-a", "point", "practical", [1, 0.72, 0.48], 0.56, [3, 2.8, -2], [0, -1, 0], 7, 0, 0, false, "Point practical has no IES profile."),
        light("industrial-fill", "directional", "fill", [0.45, 0.58, 0.72], 0.24, [5, 3, 4], [-0.64, -0.48, -0.6], 0, 0, 0, false, "Fill is a direct-light approximation.")
      ];
    case "urban-neon":
      return [
        light("neon-key", "spot", "key", [0.42, 0.86, 1], 1.05, [-3, 4, 2.5], [0.5, -0.68, -0.54], 10, Math.PI / 5, 0.55, true, "Neon key is a colored spot helper, not emissive GI."),
        light("neon-magenta", "point", "accent", [1, 0.2, 0.66], 0.75, [3.2, 2.1, -1.2], [-1, -0.2, 0.1], 6, 0, 0, false, "Neon accent does not bounce light globally."),
        light("neon-rim", "directional", "rim", [0.64, 0.72, 1], 0.4, [1, 5, -5], [-0.2, -0.44, 0.88], 0, 0, 0, false, "Rim is a direct-light approximation.")
      ];
    case "product-detail":
      return [
        light("product-detail-key", "directional", "key", [1, 0.9, 0.78], 1.48, [-4.8, 3.3, 3.2], [0.7, -0.48, -0.52], 0, 0, 0, true, "Product detail key is a low glancing directional softbox approximation for normal/AO inspection."),
        light("product-detail-cool-edge", "spot", "rim", [0.64, 0.78, 1], 1.15, [2.9, 2.6, -3.6], [-0.42, -0.34, 0.84], 8, Math.PI / 5.5, 0.38, false, "Cool edge strip is a bounded spot helper for product silhouette separation."),
        light("product-detail-warm-edge", "point", "accent", [1, 0.55, 0.28], 0.54, [-2.4, 1.1, -1.2], [0.3, -0.18, 0.72], 4.8, 0, 0, false, "Warm practical accent adds bounded hue separation; it is not emissive bounce or GI."),
        light("product-detail-fill", "directional", "fill", [0.48, 0.56, 0.68], 0.16, [4.2, 2.4, 3.6], [-0.68, -0.34, -0.64], 0, 0, 0, false, "Low fill preserves product material contrast.")
      ];
    case "product-shot":
      return [
        light("product-key", "directional", "key", [1, 0.95, 0.88], 1.55, [-4, 5, 4], [0.52, -0.64, -0.56], 0, 0, 0, true, "Product key approximates a large softbox."),
        light("product-fill", "directional", "fill", [0.7, 0.78, 0.9], 0.3, [4, 3, 3], [-0.68, -0.46, -0.57], 0, 0, 0, false, "Product fill is direct lighting."),
        light("product-rim", "spot", "rim", [0.85, 0.92, 1], 0.78, [0.5, 3.2, -4.5], [-0.08, -0.36, 0.93], 8, Math.PI / 6, 0.42, false, "Rim light is a bounded spot helper.")
      ];
    case "key-fill-rim":
      return [
        light("key", "directional", "key", [1, 0.94, 0.86], 1.2, [-3, 4, 3], [0.5, -0.66, -0.56], 0, 0, 0, true, "Reusable key light descriptor."),
        light("fill", "directional", "fill", [0.62, 0.72, 1], 0.35, [4, 3, 2], [-0.75, -0.42, -0.51], 0, 0, 0, false, "Reusable fill light descriptor."),
        light("rim", "directional", "rim", [0.72, 0.86, 1], 0.55, [0, 3, -4], [0, -0.45, 0.89], 0, 0, 0, false, "Reusable rim light descriptor.")
      ];
  }
}

function lightingRigSoftboxes(preset: LightingRigPreset): readonly LightingRigSoftboxDescriptor[] {
  switch (preset) {
    case "studio-softbox":
      return [
        softbox("studio-key-softbox", "key", [1, 0.95, 0.88], 1.25, [-2.6, 3.4, 2.6], [0.45, -0.72, -0.53], [2.2, 1.2], ["studio-key"], "Large studio key softbox proxy used for panel placement and diagnostics only."),
        softbox("studio-fill-card", "fill", [0.68, 0.78, 1], 0.42, [2.8, 2.5, 1.8], [-0.76, -0.42, -0.5], [1.8, 1.1], ["studio-fill"], "Cool fill card proxy; not a physical rectangular area light."),
        softbox("studio-rim-strip", "rim", [0.78, 0.9, 1], 0.72, [0, 2.9, -3.4], [0, -0.42, 0.91], [1.6, 0.42], ["studio-rim"], "Rim strip proxy coupled to a spot helper.")
      ];
    case "product-shot":
      return [
        softbox("product-key-softbox", "key", [1, 0.95, 0.88], 1.55, [-3.2, 3.8, 3.1], [0.52, -0.64, -0.56], [2.4, 1.35], ["product-key"], "Product key softbox proxy; renderer still receives direct light descriptors."),
        softbox("product-fill-card", "fill", [0.7, 0.78, 0.9], 0.32, [3.1, 2.2, 2.4], [-0.68, -0.46, -0.57], [1.65, 1.0], ["product-fill"], "Low-intensity fill card proxy for product studio reports."),
        softbox("product-rim-strip", "rim", [0.85, 0.92, 1], 0.78, [0.5, 2.8, -3.7], [-0.08, -0.36, 0.93], [1.85, 0.38], ["product-rim"], "Rear strip proxy for product edge separation; not GI or area-light shading.")
      ];
    case "product-detail":
      return [
        softbox("product-detail-key-strip", "key", [1, 0.9, 0.78], 1.48, [-4.0, 2.7, 2.7], [0.7, -0.48, -0.52], [1.9, 0.58], ["product-detail-key"], "Low glancing key strip proxy for product material inspection; renderer still receives direct lights."),
        softbox("product-detail-cool-rim", "rim", [0.64, 0.78, 1], 1.15, [2.5, 2.3, -3.0], [-0.42, -0.34, 0.84], [1.55, 0.34], ["product-detail-cool-edge"], "Cool rim proxy for edge separation; not GI or physical area lighting."),
        softbox("product-detail-fill-card", "fill", [0.48, 0.56, 0.68], 0.16, [3.2, 2.0, 2.7], [-0.68, -0.34, -0.64], [1.3, 0.9], ["product-detail-fill"], "Low fill proxy keeps material contrast bounded.")
      ];
    default:
      return [];
  }
}

function softbox(
  id: string,
  role: LightingRigSoftboxDescriptor["role"],
  color: readonly [number, number, number],
  intensity: number,
  position: readonly [number, number, number],
  direction: readonly [number, number, number],
  size: readonly [number, number],
  linkedLightIds: readonly string[],
  claimBoundary: string
): LightingRigSoftboxDescriptor {
  return {
    id,
    role,
    color,
    intensity,
    position,
    direction: normalize(direction),
    size,
    linkedLightIds,
    claimBoundary
  };
}

function light(
  id: string,
  kind: CollectedLightKind,
  role: LightingRigLightDescriptor["role"],
  color: readonly [number, number, number],
  intensity: number,
  position: readonly [number, number, number],
  direction: readonly [number, number, number],
  range: number,
  spotAngle: number,
  penumbra: number,
  castsShadow: boolean,
  claimBoundary: string
): LightingRigLightDescriptor {
  return { id, kind, role, color, intensity, position, direction: normalize(direction), range, spotAngle, penumbra, castsShadow, claimBoundary };
}

function toCollectedLight(light: LightingRigLightDescriptor): CollectedLight {
  const source = createSourceLight(light);
  return {
    kind: light.kind,
    color: light.color,
    intensity: light.intensity,
    position: light.position,
    direction: light.direction,
    range: light.range,
    spotAngle: light.spotAngle,
    penumbra: light.penumbra,
    castsShadow: light.castsShadow,
    layerMask: 0xffffffff,
    source
  };
}

function createSourceLight(light: LightingRigLightDescriptor): Light {
  const source = light.kind === "directional"
    ? new DirectionalLight(light.id)
    : light.kind === "point"
      ? new PointLight(light.id)
      : new SpotLight(light.id);
  source.color = [...light.color];
  source.intensity = light.intensity;
  source.castsShadow = light.castsShadow;
  source.transform.setPosition(light.position[0], light.position[1], light.position[2]);
  if (source instanceof PointLight || source instanceof SpotLight) source.range = Math.max(0.001, light.range);
  if (source instanceof SpotLight) {
    source.angle = clamp(light.spotAngle || Math.PI / 5, 0.001, Math.PI / 2 - 0.001);
    source.penumbra = clamp(light.penumbra, 0, 1);
  }
  return source;
}

function unsupportedFeaturesForRig(
  preset: LightingRigPreset,
  includeUnsupportedDiagnostics: boolean
): readonly LightingRigUnsupportedFeature[] {
  if (!includeUnsupportedDiagnostics) return [];
  const base: LightingRigUnsupportedFeature[] = ["ies-photometric-profile", "contact-shadow-map", "global-illumination"];
  if (preset === "studio-softbox" || preset === "product-shot" || preset === "product-detail") base.unshift("rectangular-area-light");
  if (preset === "sun") base.push("cascaded-shadow-map");
  return base;
}

function lightingDisclosure(feature: LightingRigUnsupportedFeature): string {
  switch (feature) {
    case "rectangular-area-light":
      return "Rectangular/area lights are represented by direct-light and emissive-panel approximations until physical area-light shading exists.";
    case "ies-photometric-profile":
      return "IES photometric profiles are unsupported; point and spot practicals use bounded cone/range descriptors only.";
    case "contact-shadow-map":
      return "Contact shadows require the separate contact-shadow pipeline and visual grounding evidence; direct-light rigs do not claim it.";
    case "cascaded-shadow-map":
      return "Cascaded shadow maps are a separate shadow pipeline and are not implied by the sun lighting preset.";
    case "global-illumination":
      return "Global illumination/light bounce is unsupported; rigs expose direct lights plus environment-light approximations only.";
  }
}

function normalize(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length === 0 ? [0, -1, 0] : [round5(value[0] / length), round5(value[1] / length), round5(value[2] / length)];
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function round5(value: number): number {
  return Number(value.toFixed(5));
}
