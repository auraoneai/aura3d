import { DirectionalLight, Light, PointLight, RectAreaLight, SpotLight } from "@aura3d/scene";
import type { CollectedLight, CollectedLightKind } from "./LightCollector";

export type LightingRigPreset =
  | "key-fill-rim"
  | "studio-softbox"
  | "sun"
  | "industrial"
  | "urban-neon"
  | "product-detail"
  | "product-shot"
  | "cinematic-night"
  | "arena-showdown"
  | "product-hero";

export type LightingRigUnsupportedFeature =
  | "rectangular-area-light"
  | "ies-photometric-profile"
  | "projected-light-image"
  | "contact-shadow-map"
  | "cascaded-shadow-map"
  | "global-illumination";

/** The subset of parsed Type-C IES data needed by the light evaluator. */
export interface LightingRigProfileData {
  readonly verticalAngles: readonly number[];
  readonly horizontalAngles: readonly number[];
  readonly candela: readonly number[];
  readonly symmetry: "rotational" | "quadrant" | "bilateral" | "none";
}
export interface LightingRigPhotometricProfile {
  readonly profile: LightingRigProfileData;
  readonly scale?: number;
  readonly rotation?: number;
}
export interface LightingRigProjectedImage {
  readonly texture: { readonly kind: "aura-asset-ref"; readonly type: "texture"; readonly id: string; readonly url: string };
  readonly offset?: readonly [number, number];
  readonly scale?: readonly [number, number];
  readonly rotation?: number;
}

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
  readonly width: number;
  readonly height: number;
  readonly castsShadow: boolean;
  readonly photometricProfile?: LightingRigPhotometricProfile;
  readonly projectedImage?: LightingRigProjectedImage;
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
  /** Optional profiles keyed by a point/spot preset light's id. */
  readonly photometricProfiles?: Readonly<Record<string, LightingRigPhotometricProfile>>;
  /** Optional projected textures keyed by a spot preset light's id. */
  readonly projectedImages?: Readonly<Record<string, LightingRigProjectedImage>>;
  /** Until a backend advertises native binding, choose an explicit unmodified forward fallback or error. */
  readonly unsupportedFallback?: "error" | "unmodified";
  /**
   * Scale light *placements* to the rendered subject, keeping the rig's geometry across asset swaps.
   *
   * ## Why this exists
   *
   * Preset positions are authored for a subject about 1 unit tall. Every showcase route therefore ignored
   * them and hand-authored its own coordinates: Turbo as `SCENE_SIZE` multiples, Blockfall and Aura Clash as
   * bare numbers. The *structure* those routes built was identical -- ambient, key, opposing rims -- and only
   * the coordinates differed, because each route re-derived where a rim belongs for its own subject size.
   *
   * That is the same defect class as the framing constants: a coordinate correct for one subject reads as a
   * design decision, survives an asset swap, and is then silently wrong. Turbo's `CAR_SCENE_HEIGHT` and its
   * hand-tuned chase height both outlived their assets exactly this way.
   *
   * Supplying `subject` multiplies each preset position by `subjectHeight` (and lateral placement by the
   * subject's widest horizontal extent, since a rim must reach the silhouette edge to do anything), then
   * lifts the rig onto `floorY`. Intensities are untouched: a rig that dimmed with subject size would make
   * large subjects dark for no photographic reason.
   */
  readonly subject?: LightingRigSubject;
}

/** Rendered subject measurements a rig scales its placements to. */
export interface LightingRigSubject {
  /** Rendered subject height in world units. Pair with `resolveSubjectRenderedSize` so it is derived. */
  readonly height: number;
  /** Widest horizontal extent, used for lateral rim placement. Defaults to `height`. */
  readonly width?: number;
  /** World Y of the surface the subject stands on. Defaults to 0. */
  readonly floorY?: number;
}

export function createLightingRig(options: LightingRigOptions = {}): LightingRig {
  const preset = options.preset ?? "key-fill-rim";
  const intensityScale = positive(options.intensityScale ?? 1, "lighting rig intensityScale");
  const shadows = options.shadows ?? true;
  const descriptors = lightingRigDescriptors(preset);
  const knownIds = new Set(descriptors.map((light) => light.id));
  for (const id of [...Object.keys(options.photometricProfiles ?? {}), ...Object.keys(options.projectedImages ?? {})]) {
    if (!knownIds.has(id)) throw new RangeError(`Unknown lighting rig light: ${id}`);
  }
  const lights = descriptors.map((light) => {
    const photometricProfile = options.photometricProfiles?.[light.id];
    const projectedImage = options.projectedImages?.[light.id];
    if (photometricProfile && light.kind !== "point" && light.kind !== "spot") throw new RangeError(`Photometric profile requires a point or spot light: ${light.id}`);
    if (projectedImage && light.kind !== "spot") throw new RangeError(`Projected image requires a spot light: ${light.id}`);
    if (photometricProfile) validateRigProfile(photometricProfile);
    if (projectedImage) validateRigProjection(projectedImage);
    return {
      ...light,
      intensity: round3(light.intensity * intensityScale),
      position: scaleRigPosition(light.position, options.subject),
      castsShadow: shadows && light.castsShadow,
      ...(photometricProfile ? { photometricProfile: intensityScale === 1 ? photometricProfile : { ...photometricProfile, scale: (photometricProfile.scale ?? 1) * intensityScale } } : {}),
      ...(projectedImage ? { projectedImage } : {})
    };
  });
  const hasProfile = lights.some((light) => light.photometricProfile !== undefined);
  const hasProjection = lights.some((light) => light.projectedImage !== undefined);
  if ((hasProfile || hasProjection) && options.unsupportedFallback !== "unmodified") {
    throw new Error("Forward light profile/image binding is unavailable; set unsupportedFallback to 'unmodified' for explicit scalar-light fallback");
  }
  const softboxes = lightingRigSoftboxes(preset).map((softbox) => ({
    ...softbox,
    intensity: round3(softbox.intensity * intensityScale)
  }));
  const unsupportedFeatures = [...unsupportedFeaturesForRig(preset, options.includeUnsupportedDiagnostics ?? true)];
  if (hasProfile && !unsupportedFeatures.includes("ies-photometric-profile")) unsupportedFeatures.push("ies-photometric-profile");
  if (hasProjection && !unsupportedFeatures.includes("projected-light-image")) unsupportedFeatures.push("projected-light-image");
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
      claimBoundary: "Lighting rigs are reusable direct-light descriptors for A3D ForwardPass, including finite rectangular emitters in studio presets; IES profiles, GI, contact shadows, cascaded shadows, and rectangular-light shadow maps require separate renderer evidence."
    }
  };
}

/** Placement for a rim light that follows a moving subject. */
export interface SubjectRimPlacement {
  /** World position for the rim light. */
  readonly position: readonly [number, number, number];
  /** Point-light range, sized so falloff keeps the rim on the subject rather than the backdrop. */
  readonly range: number;
}

export interface SubjectRimPlacementOptions {
  /** Subject's current world position (its ground contact point). */
  readonly subjectPosition: readonly [number, number, number];
  /** Rendered subject height in world units. Everything below is a fraction of it. */
  readonly subjectHeight: number;
  /** Which side of the subject the rim sits on. */
  readonly side: "left" | "right";
  /**
   * Depth offset behind the subject, as a fraction of subject height.
   *
   * Negative values sit behind a subject viewed down -z, which is what makes the light graze the silhouette
   * edge instead of front-lighting the body.
   */
  readonly depthFraction?: number | undefined;
  /** Height above the subject's contact point, as a fraction of subject height. */
  readonly heightFraction?: number | undefined;
  /** Lateral offset, as a fraction of subject height. */
  readonly lateralFraction?: number | undefined;
  /** Range as a fraction of subject height. */
  readonly rangeFraction?: number | undefined;
}

/**
 * Place a rim light relative to a moving subject.
 *
 * ## Why this is reusable rather than route-local
 *
 * Aura Clash computes per-fighter rim placement inline as
 * `(fighter.x ± 0.34, fighter.y + 1.22, -0.72)` with `range = 1.5`. Against its 1.829-unit fighter rig those
 * are 0.186x, 0.667x, -0.394x and 0.820x of subject height respectively — clean photographic ratios written as
 * absolute literals. Any fighter rig of a different height silently breaks them: the rim drifts off the
 * silhouette and stops separating the subject from the backdrop, which is the one thing a rim exists to do.
 *
 * That is the same defect class as the framing constants removed earlier in this work: a coordinate correct
 * for one asset reads as a design decision, survives a swap, and is then wrong. Expressing the ratios keeps
 * the intent ("upper-torso height, slightly outboard, behind the subject") and lets the numbers follow the rig.
 *
 * The defaults are Aura Clash's measured values, so adopting this helper is a no-op for its current rig.
 */
export function resolveSubjectRimPlacement(options: SubjectRimPlacementOptions): SubjectRimPlacement {
  const height = Math.max(1e-6, options.subjectHeight);
  const lateral = height * (options.lateralFraction ?? 0.1859);
  const sign = options.side === "left" ? -1 : 1;
  return {
    position: [
      round3((options.subjectPosition[0] ?? 0) + sign * lateral),
      round3((options.subjectPosition[1] ?? 0) + height * (options.heightFraction ?? 0.667)),
      round3((options.subjectPosition[2] ?? 0) + height * (options.depthFraction ?? -0.3937))
    ],
    range: round3(height * (options.rangeFraction ?? 0.8201))
  };
}

/**
 * Scale a preset placement onto a subject.
 *
 * Lateral (X) placement follows the subject's widest horizontal extent so a rim actually reaches the
 * silhouette edge; height and depth follow subject height so the rig's vertical geometry is preserved.
 * Returns the authored position unchanged when no subject is supplied, so existing callers are unaffected.
 */
function scaleRigPosition(
  position: readonly [number, number, number],
  subject: LightingRigSubject | undefined
): readonly [number, number, number] {
  if (!subject) return position;
  const height = Math.max(1e-6, subject.height);
  const lateral = Math.max(height, subject.width ?? height);
  const floorY = subject.floorY ?? 0;
  return [
    round3(position[0] * lateral),
    round3(floorY + position[1] * height),
    round3(position[2] * height)
  ];
}

export function listLightingRigPresets(): readonly LightingRigPreset[] {
  return ["key-fill-rim", "studio-softbox", "sun", "industrial", "urban-neon", "product-detail", "product-shot", "cinematic-night", "arena-showdown", "product-hero"];
}

/**
 * Moonlit-night rig: cool directional moon key with shadows, a warm tungsten
 * practical, a finite rectangular neon-sign emitter, a cool spot rim, and a
 * dim sky fill. Pure descriptors — mounting onto a scene stays opt-in.
 */
export function cinematicNight(options: Omit<LightingRigOptions, "preset"> = {}): LightingRig {
  return createLightingRig({ ...options, preset: "cinematic-night" });
}

/**
 * High-contrast arena rig: warm overhead spot key with shadows, cool spot rim,
 * magenta crowd-wash practical, finite rectangular jumbotron emitter, and a
 * dim fill. Pure descriptors — mounting onto a scene stays opt-in.
 */
export function arenaShowdown(options: Omit<LightingRigOptions, "preset"> = {}): LightingRig {
  return createLightingRig({ ...options, preset: "arena-showdown" });
}

/**
 * Product-hero rig: large finite rectangular key, low directional fill, cool
 * spot rim, and a warm point accent. Pure descriptors — mounting onto a scene
 * stays opt-in.
 */
export function productHero(options: Omit<LightingRigOptions, "preset"> = {}): LightingRig {
  return createLightingRig({ ...options, preset: "product-hero" });
}

function lightingRigDescriptors(preset: LightingRigPreset): readonly LightingRigLightDescriptor[] {
  switch (preset) {
    case "studio-softbox":
      return [
        areaLight("studio-key", "key", [1, 0.95, 0.88], 12, [-3, 5, 4], [0.45, -0.72, -0.53], 12, [2.2, 1.2], "Finite rectangular studio key integrated by the forward PBR shader; rectangular-light shadow maps remain unsupported."),
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
        areaLight("product-detail-key", "key", [1, 0.9, 0.78], 14, [-4.8, 3.3, 3.2], [0.7, -0.48, -0.52], 12, [1.9, 0.58], "Finite rectangular glancing key for normal/AO inspection; its dimensions affect PBR lighting."),
        light("product-detail-cool-edge", "spot", "rim", [0.64, 0.78, 1], 1.15, [2.9, 2.6, -3.6], [-0.42, -0.34, 0.84], 8, Math.PI / 5.5, 0.38, false, "Cool edge strip is a bounded spot helper for product silhouette separation."),
        light("product-detail-warm-edge", "point", "accent", [1, 0.55, 0.28], 0.54, [-2.4, 1.1, -1.2], [0.3, -0.18, 0.72], 4.8, 0, 0, false, "Warm practical accent adds bounded hue separation; it is not emissive bounce or GI."),
        light("product-detail-fill", "directional", "fill", [0.48, 0.56, 0.68], 0.16, [4.2, 2.4, 3.6], [-0.68, -0.34, -0.64], 0, 0, 0, false, "Low fill preserves product material contrast.")
      ];
    case "product-shot":
      return [
        areaLight("product-key", "key", [1, 0.95, 0.88], 16, [-4, 5, 4], [0.52, -0.64, -0.56], 14, [2.4, 1.35], "Finite rectangular product key integrated across its emitting surface."),
        light("product-fill", "directional", "fill", [0.7, 0.78, 0.9], 0.3, [4, 3, 3], [-0.68, -0.46, -0.57], 0, 0, 0, false, "Product fill is direct lighting."),
        light("product-rim", "spot", "rim", [0.85, 0.92, 1], 0.78, [0.5, 3.2, -4.5], [-0.08, -0.36, 0.93], 8, Math.PI / 6, 0.42, false, "Rim light is a bounded spot helper.")
      ];
    case "cinematic-night":
      return [
        light("night-moon", "directional", "key", [0.62, 0.74, 1], 0.9, [6, 9, -4], [-0.52, -0.72, 0.46], 0, 0, 0, true, "Moon key is a directional approximation, not a physical atmosphere or sky model."),
        light("night-practical", "point", "practical", [1, 0.6, 0.3], 1.5, [-2.5, 1.7, 1.6], [0, -1, 0], 7, 0, 0, false, "Tungsten practical has no IES profile; falloff is bounded range attenuation only."),
        areaLight("night-sign", "accent", [1, 0.32, 0.55], 6, [3, 2.2, -2.5], [-0.62, -0.34, 0.71], 9, [1.6, 0.9], "Finite rectangular neon-sign emitter integrated by the forward PBR shader; rectangular-light shadow maps remain unsupported."),
        light("night-rim", "spot", "rim", [0.5, 0.72, 1], 1.1, [1, 3.2, -4.2], [-0.14, -0.4, 0.91], 10, Math.PI / 5, 0.5, false, "Cool rim is a bounded spot helper for silhouette separation."),
        light("night-sky-fill", "directional", "fill", [0.3, 0.42, 0.72], 0.16, [-4, 5, 3], [0.55, -0.62, -0.56], 0, 0, 0, false, "Sky fill is a direct-light approximation.")
      ];
    case "arena-showdown":
      return [
        light("arena-key", "spot", "key", [1, 0.86, 0.7], 2.4, [0, 6.5, 3.5], [0, -0.88, -0.48], 14, Math.PI / 6, 0.35, true, "Overhead arena fixture represented as a shadow-casting spot light, not a measured luminaire."),
        light("arena-rim", "spot", "rim", [0.45, 0.8, 1], 1.5, [0, 3.5, -5], [0, -0.44, 0.9], 12, Math.PI / 5, 0.5, false, "Cool rim is a bounded spot helper for silhouette separation."),
        light("arena-crowd", "point", "accent", [1, 0.28, 0.62], 0.85, [5, 2.5, 4], [-1, -0.2, 0.1], 12, 0, 0, false, "Crowd wash has no IES profile and does not bounce light globally."),
        areaLight("arena-jumbotron", "practical", [0.92, 0.96, 1], 9, [-4, 5, -3], [0.55, -0.62, 0.56], 12, [3, 1.6], "Finite rectangular jumbotron emitter integrated by the forward PBR shader; rectangular-light shadow maps remain unsupported."),
        light("arena-fill", "directional", "fill", [0.5, 0.56, 0.7], 0.2, [5, 3, 4], [-0.64, -0.48, -0.6], 0, 0, 0, false, "Fill is a direct-light approximation.")
      ];
    case "product-hero":
      return [
        areaLight("hero-key", "key", [1, 0.96, 0.9], 18, [-4, 5, 4], [0.52, -0.64, -0.56], 14, [2.6, 1.5], "Finite rectangular hero key integrated across its emitting surface; rectangular-light shadow maps remain unsupported."),
        light("hero-fill", "directional", "fill", [0.7, 0.78, 0.9], 0.32, [4, 3, 3], [-0.68, -0.46, -0.57], 0, 0, 0, false, "Hero fill is direct lighting that preserves material contrast."),
        light("hero-rim", "spot", "rim", [0.9, 0.95, 1], 1.1, [1, 3.5, -4], [-0.14, -0.4, 0.9], 9, Math.PI / 6, 0.42, false, "Rim light is a bounded spot helper for product edge separation."),
        light("hero-accent", "point", "accent", [1, 0.7, 0.45], 0.6, [2.5, 1.2, 2], [-0.5, -0.3, -0.81], 5, 0, 0, false, "Warm accent is a bounded point helper; it is not emissive bounce or GI.")
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
    case "cinematic-night":
      return [
        softbox("night-sign-softbox", "key", [1, 0.32, 0.55], 0.9, [2.6, 2.0, -2.1], [-0.62, -0.34, 0.71], [1.6, 0.9], ["night-sign"], "Neon-sign panel proxy used for placement and diagnostics only; renderer still receives direct light descriptors.")
      ];
    case "arena-showdown":
      return [
        softbox("arena-jumbotron-softbox", "key", [0.92, 0.96, 1], 1.1, [-3.4, 4.2, -2.5], [0.55, -0.62, 0.56], [3, 1.6], ["arena-jumbotron"], "Jumbotron panel proxy used for placement and diagnostics only; renderer still receives direct light descriptors.")
      ];
    case "product-hero":
      return [
        softbox("hero-key-softbox", "key", [1, 0.96, 0.9], 1.7, [-3.2, 3.8, 3.1], [0.52, -0.64, -0.56], [2.6, 1.5], ["hero-key"], "Hero key softbox proxy; renderer still receives direct light descriptors."),
        softbox("hero-rim-strip", "rim", [0.9, 0.95, 1], 1.1, [0.9, 3.0, -3.4], [-0.14, -0.4, 0.9], [1.7, 0.4], ["hero-rim"], "Rear strip proxy for product edge separation; not GI or area-light shading.")
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
  return { id, kind, role, color, intensity, position, direction: normalize(direction), range, spotAngle, penumbra, width: 0, height: 0, castsShadow, claimBoundary };
}

function areaLight(
  id: string,
  role: LightingRigLightDescriptor["role"],
  color: readonly [number, number, number],
  intensity: number,
  position: readonly [number, number, number],
  direction: readonly [number, number, number],
  range: number,
  size: readonly [number, number],
  claimBoundary: string
): LightingRigLightDescriptor {
  return {
    id,
    kind: "rect-area",
    role,
    color,
    intensity,
    position,
    direction: normalize(direction),
    range,
    spotAngle: 0,
    penumbra: 0,
    width: size[0],
    height: size[1],
    castsShadow: false,
    claimBoundary
  };
}

function toCollectedLight(light: LightingRigLightDescriptor): CollectedLight {
  const source = createSourceLight(light);
  const [right, up] = areaBasis(light.direction);
  return {
    kind: light.kind,
    color: light.color,
    intensity: light.intensity,
    position: light.position,
    direction: light.direction,
    right,
    up,
    range: light.range,
    width: light.width,
    height: light.height,
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
      : light.kind === "spot"
        ? new SpotLight(light.id)
        : new RectAreaLight(light.id);
  source.color = [...light.color];
  source.intensity = light.intensity;
  source.castsShadow = light.castsShadow;
  source.transform.setPosition(light.position[0], light.position[1], light.position[2]);
  if (source instanceof PointLight || source instanceof SpotLight || source instanceof RectAreaLight) source.range = Math.max(0.001, light.range);
  if (source instanceof SpotLight) {
    source.angle = clamp(light.spotAngle || Math.PI / 5, 0.001, Math.PI / 2 - 0.001);
    source.penumbra = clamp(light.penumbra, 0, 1);
  }
  if (source instanceof RectAreaLight) {
    source.width = light.width;
    source.height = light.height;
  }
  return source;
}

function unsupportedFeaturesForRig(
  preset: LightingRigPreset,
  includeUnsupportedDiagnostics: boolean
): readonly LightingRigUnsupportedFeature[] {
  if (!includeUnsupportedDiagnostics) return [];
  const base: LightingRigUnsupportedFeature[] = ["ies-photometric-profile", "contact-shadow-map", "global-illumination"];
  if (preset === "sun") base.push("cascaded-shadow-map");
  return base;
}

function lightingDisclosure(feature: LightingRigUnsupportedFeature): string {
  switch (feature) {
    case "rectangular-area-light":
      return "Rectangular area-light shading is implemented for finite emitters; this diagnostic is reserved for callers that explicitly require rectangular-light shadow maps or three.js LTC lookup-table identity.";
    case "ies-photometric-profile":
      return "IES photometric profiles are unsupported; point and spot practicals use bounded cone/range descriptors only.";
    case "projected-light-image":
      return "Projected images are not bound by this forward rig; the explicit fallback leaves the direct light unmodified.";
    case "contact-shadow-map":
      return "Contact shadows require the separate contact-shadow pipeline and visual grounding evidence; direct-light rigs do not claim it.";
    case "cascaded-shadow-map":
      return "Cascaded shadow maps are a separate shadow pipeline and are not implied by the sun lighting preset.";
    case "global-illumination":
      return "Global illumination/light bounce is unsupported; rigs expose direct lights plus environment-light approximations only.";
  }
}

function validateRigProfile(value: LightingRigPhotometricProfile): void {
  const { verticalAngles: v, horizontalAngles: h, candela } = value.profile;
  if (!v.length || v.length > 4096 || !h.length || h.length > 4096 || v.length * h.length > 1048576 || candela.length !== v.length * h.length) throw new RangeError("Invalid photometric profile table dimensions");
  for (const [list, max] of [[v, 180], [h, 360]] as const) {
    for (let i = 0; i < list.length; i++) if (!Number.isFinite(list[i]) || list[i]! < 0 || list[i]! > max || (i > 0 && list[i]! <= list[i - 1]!)) throw new RangeError("Photometric angles must be finite and strictly increasing");
  }
  const end = h[h.length - 1];
  const expected = h.length === 1 ? "rotational" : end === 90 ? "quadrant" : end === 180 ? "bilateral" : end === 360 ? "none" : undefined;
  if (h[0] !== 0 || value.profile.symmetry !== expected) throw new RangeError("Photometric symmetry and horizontal angles disagree");
  if (candela.some((x) => !Number.isFinite(x) || x < 0)) throw new RangeError("Photometric candelas must be finite and non-negative");
  if (value.scale !== undefined && (!Number.isFinite(value.scale) || value.scale < 0)) throw new RangeError("Photometric scale must be finite and non-negative");
  if (value.rotation !== undefined && !Number.isFinite(value.rotation)) throw new RangeError("Photometric rotation must be finite");
}

function validateRigProjection(value: LightingRigProjectedImage): void {
  if (value.texture?.kind !== "aura-asset-ref" || value.texture.type !== "texture") throw new TypeError("Projected image requires an admitted texture");
  if (value.rotation !== undefined && !Number.isFinite(value.rotation)) throw new RangeError("Projection rotation must be finite");
  if (value.offset && (value.offset.length !== 2 || value.offset.some((x) => !Number.isFinite(x)))) throw new RangeError("Projection offset must contain two finite values");
  if (value.scale && (value.scale.length !== 2 || value.scale.some((x) => !Number.isFinite(x) || x === 0))) throw new RangeError("Projection scale must contain two finite non-zero values");
}

function sampleProfile(profile: LightingRigProfileData, vertical: number, horizontal: number): number {
  const v = profile.verticalAngles, h = profile.horizontalAngles;
  if (vertical < v[0]! || vertical > v[v.length - 1]!) return 0;
  let angle = ((horizontal % 360) + 360) % 360;
  if (profile.symmetry === "quadrant") {
    if (angle > 180) angle = 360 - angle;
    if (angle > 90) angle = 180 - angle;
  } else if (profile.symmetry === "bilateral" && angle > 180) angle = 360 - angle;
  const bracket = (array: readonly number[], target: number): readonly [number, number, number] => {
    if (array.length === 1 || target <= array[0]!) return [0, 0, 0];
    const last = array.length - 1;
    if (target >= array[last]!) return [last, last, 0];
    let lo = 0, hi = last;
    while (hi - lo > 1) { const mid = (hi + lo) >> 1; if (array[mid]! <= target) lo = mid; else hi = mid; }
    return [lo, hi, (target - array[lo]!) / (array[hi]! - array[lo]!)];
  };
  const [v0, v1, vt] = bracket(v, vertical), [h0, h1, ht] = bracket(h, angle);
  const a = profile.candela[h0 * v.length + v0]!, b = profile.candela[h0 * v.length + v1]!;
  const c = profile.candela[h1 * v.length + v0]!, d = profile.candela[h1 * v.length + v1]!;
  return (a + (b - a) * vt) * (1 - ht) + (c + (d - c) * vt) * ht;
}

/**
 * CPU reference for point/spot profile direction and projected-image mapping.
 * The returned linear RGB is candela multiplied by the image and shadow term;
 * range, cone penumbra, BRDF and inverse-square distance falloff are separate.
 * The image callback must sample the admitted texture in linear RGB.
 */
export function evaluateLightingRigLightAt(
  light: LightingRigLightDescriptor,
  point: readonly [number, number, number],
  options: { readonly shadowVisibility?: number; readonly sampleProjection?: (u: number, v: number) => readonly [number, number, number] } = {}
): { readonly candela: number; readonly uv: readonly [number, number] | null; readonly rgb: readonly [number, number, number] } {
  if (light.kind !== "point" && light.kind !== "spot") throw new RangeError("Reference evaluation requires a point or spot light");
  if (point.length !== 3 || point.some((v) => !Number.isFinite(v))) throw new RangeError("Point must contain three finite coordinates");
  const visibility = options.shadowVisibility ?? 1;
  if (!Number.isFinite(visibility) || visibility < 0 || visibility > 1) throw new RangeError("shadowVisibility must be in [0, 1]");
  if (light.photometricProfile) validateRigProfile(light.photometricProfile);
  if (light.projectedImage) validateRigProjection(light.projectedImage);
  const delta = [point[0] - light.position[0], point[1] - light.position[1], point[2] - light.position[2]] as const;
  const distance = Math.hypot(...delta);
  if (distance === 0) throw new RangeError("Reference point cannot coincide with the light");
  const direction = normalize(light.direction);
  const reference: readonly [number, number, number] = Math.abs(direction[1]) < 0.99 ? [0, 1, 0] : [0, 0, 1];
  const right = normalize(cross(direction, reference)), up = normalize(cross(right, direction));
  const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const x = dot(delta, right), y = dot(delta, up), z = dot(delta, direction);
  const vertical = Math.acos(clamp(z / distance, -1, 1)) * 180 / Math.PI;
  const rotation = light.photometricProfile?.rotation ?? 0;
  const horizontal = (Math.atan2(y, x) - rotation) * 180 / Math.PI;
  const candela = light.photometricProfile
    ? sampleProfile(light.photometricProfile.profile, vertical, horizontal) * (light.photometricProfile.scale ?? 1)
    : light.intensity;
  let uv: readonly [number, number] | null = null;
  let image: readonly [number, number, number] = [1, 1, 1];
  if (light.projectedImage) {
    if (!options.sampleProjection) throw new Error("A projected image requires a linear texture sampler");
    if (z <= 0 || !(light.spotAngle > 0 && light.spotAngle < Math.PI / 2)) return { candela, uv: null, rgb: [0, 0, 0] };
    const t = Math.tan(light.spotAngle) * z;
    // Top-left image origin: world-space up projects toward decreasing v.
    const qx = x / (2 * t), qy = -y / (2 * t);
    const rot = light.projectedImage.rotation ?? 0, cs = Math.cos(rot), sn = Math.sin(rot);
    const sx = light.projectedImage.scale?.[0] ?? 1, sy = light.projectedImage.scale?.[1] ?? 1;
    uv = [0.5 + (cs * qx - sn * qy) * sx + (light.projectedImage.offset?.[0] ?? 0), 0.5 + (sn * qx + cs * qy) * sy + (light.projectedImage.offset?.[1] ?? 0)];
    if (uv[0] < 0 || uv[0] > 1 || uv[1] < 0 || uv[1] > 1) return { candela, uv, rgb: [0, 0, 0] };
    image = options.sampleProjection(...uv);
    if (image.length !== 3 || image.some((v) => !Number.isFinite(v) || v < 0)) throw new RangeError("Projection sampler must return three finite non-negative linear components");
  }
  return { candela, uv, rgb: [candela * light.color[0] * image[0] * visibility, candela * light.color[1] * image[1] * visibility, candela * light.color[2] * image[2] * visibility] };
}

function normalize(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length === 0 ? [0, -1, 0] : [round5(value[0] / length), round5(value[1] / length), round5(value[2] / length)];
}

function areaBasis(direction: readonly [number, number, number]): readonly [
  readonly [number, number, number],
  readonly [number, number, number]
] {
  const reference: readonly [number, number, number] = Math.abs(direction[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  const right = normalize(cross(reference, direction));
  return [right, normalize(cross(direction, right))];
}

function cross(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): readonly [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
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
