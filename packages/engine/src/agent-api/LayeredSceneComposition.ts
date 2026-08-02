/**
 * Reusable depth-layered environment composition.
 *
 * ## Why this exists
 *
 * Skyline Runner reads as a clean prototype rather than a game, and the measured reason is
 * composition, not asset quality: in the retained route-primary frame a single flat sky bucket covers
 * **44.3%** of the scene viewport, and flat sky plus flat ground together cover **24.9%** even after
 * quantisation, with the playable content compressed into one horizontal band. There is no
 * foreground, no middle distance, and no atmospheric separation -- so every element reads at the same
 * apparent depth and the frame has no hierarchy.
 *
 * The instinct is to hand-place more props in the route. That is exactly what produced 30,141 lines of
 * route-local visual code across four showcase games against 3,072 reusable lines. Skyline needs the
 * *capability*, not the placements: a route should declare depth layers, density targets and spacing
 * constraints, and reusable code should produce a deterministic composition from them.
 *
 * ## What this module does and does not do
 *
 * It is a pure **placement planner**. It consumes a declarative spec and returns typed placements with
 * layer identity, depth, scale and a variation seed. It deliberately does not construct scene nodes,
 * reference any renderer type, or know about Skyline, platformers, or any specific asset -- so the same
 * planner serves racing set dressing, city blocks, or arena surrounds.
 *
 * Determinism is a hard requirement, not a convenience: retained screenshot evidence is only
 * comparable if the same spec yields byte-identical placements. Placement therefore uses an explicit
 * seeded PRNG, never `Math.random`.
 */

/** Where a layer sits relative to the playable plane. */
export type SceneDepthLayerRole =
  | "foreground"
  | "gameplay"
  | "midground"
  | "background"
  | "far-background";

/** A prop kind a layer may draw from, with the relative frequency it should appear at. */
export interface SceneCompositionPropKind {
  /** Caller-defined identifier, typically a typed asset id or a primitive recipe name. */
  readonly id: string;
  /** Relative selection weight. Higher appears more often. Non-positive weights are ignored. */
  readonly weight?: number | undefined;
  /** Multiplier applied on top of the layer's scale range, for props with different native sizes. */
  readonly scaleBias?: number | undefined;
}

/** Declarative description of one depth layer. */
export interface SceneDepthLayerSpec {
  readonly role: SceneDepthLayerRole;
  /** Depth (world Z, or any single depth axis the caller uses) this layer occupies. */
  readonly depth: number;
  /** Horizontal span the layer populates, as `[min, max]`. */
  readonly span: readonly [number, number];
  /** Prop kinds this layer may place. An empty list yields no placements. */
  readonly props: readonly SceneCompositionPropKind[];
  /**
   * How many props per unit of horizontal span. Expressed as a density rather than a count so the
   * same spec adapts when a level's span changes.
   */
  readonly densityPerUnit: number;
  /** Uniform scale range applied to placed props, as `[min, max]`. */
  readonly scaleRange: readonly [number, number];
  /** Minimum horizontal spacing between placements in this layer. */
  readonly minSpacing?: number | undefined;
  /** Vertical placement, as `[min, max]`. Defaults to `[0, 0]`. */
  readonly heightRange?: readonly [number, number] | undefined;
  /**
   * Atmospheric attenuation for this layer, `0` = fully present, `1` = fully faded into the sky.
   * Callers map this onto fog blend, opacity or desaturation. Providing it here keeps depth cueing a
   * property of the composition rather than a per-route material tweak.
   */
  readonly atmosphere?: number | undefined;
}

/** Horizontal bands that must stay clear so gameplay reads. */
export interface SceneProtectedZone {
  /** Horizontal interval to keep clear, as `[min, max]`. */
  readonly span: readonly [number, number];
  /** Layers this zone applies to. Defaults to every layer. */
  readonly roles?: readonly SceneDepthLayerRole[] | undefined;
  /** Caller-facing reason, surfaced in the report for auditability. */
  readonly reason: string;
}

export interface LayeredSceneCompositionSpec {
  /** Seed for deterministic placement. The same seed and spec always produce identical output. */
  readonly seed: number;
  readonly layers: readonly SceneDepthLayerSpec[];
  /** Regions that must remain unpopulated, e.g. the hero's start area or a collectible chain. */
  readonly protectedZones?: readonly SceneProtectedZone[] | undefined;
  /**
   * Global density multiplier. Used for viewport adaptation: a mobile viewport can request `0.6`
   * without the route restating any per-layer number.
   */
  readonly densityScale?: number | undefined;
}

export interface ScenePropPlacement {
  readonly layer: SceneDepthLayerRole;
  /** Prop kind id chosen for this placement. */
  readonly prop: string;
  /** Horizontal position within the layer span. */
  readonly x: number;
  /** Vertical position. */
  readonly y: number;
  /** Depth position, taken from the layer. */
  readonly z: number;
  /** Uniform scale, including the prop's `scaleBias`. */
  readonly scale: number;
  /** Yaw in radians, for breaking up repeated silhouettes. */
  readonly rotationY: number;
  /** Per-placement deterministic value in `[0, 1)`, for caller-side variation (tint, clip offset). */
  readonly variation: number;
  /** Layer atmosphere, copied through so callers do not re-derive it. */
  readonly atmosphere: number;
}

export interface SceneCompositionLayerReport {
  readonly role: SceneDepthLayerRole;
  readonly depth: number;
  readonly requested: number;
  readonly placed: number;
  readonly rejectedForSpacing: number;
  readonly rejectedForProtectedZone: number;
  /** Distinct prop kinds actually used, so a layer that collapsed to one clone is visible. */
  readonly distinctProps: number;
  readonly atmosphere: number;
}

export interface LayeredSceneComposition {
  readonly kind: "aura-layered-scene-composition";
  readonly seed: number;
  readonly placements: readonly ScenePropPlacement[];
  readonly layers: readonly SceneCompositionLayerReport[];
  /** Roles that produced at least one placement, in depth order. */
  readonly populatedRoles: readonly SceneDepthLayerRole[];
}

/**
 * Plan a deterministic layered composition.
 *
 * Placement is rejection-sampled against `minSpacing` and `protectedZones` rather than nudged, because
 * nudging a rejected placement biases props toward zone edges and produces visible clumping at exactly
 * the boundaries gameplay cares about.
 */
export function planLayeredSceneComposition(spec: LayeredSceneCompositionSpec): LayeredSceneComposition {
  const densityScale = positiveOr(spec.densityScale, 1);
  const placements: ScenePropPlacement[] = [];
  const layerReports: SceneCompositionLayerReport[] = [];
  // One stream per layer, seeded from the spec seed and the layer index, so adding or removing a
  // layer cannot reshuffle the layers before it.
  for (const [layerIndex, layer] of spec.layers.entries()) {
    const random = createSeededRandom(spec.seed + layerIndex * 0x9e37);
    const span = normalizedRange(layer.span);
    const spanWidth = Math.max(0, span[1] - span[0]);
    const requested = Math.max(0, Math.round(spanWidth * Math.max(0, layer.densityPerUnit) * densityScale));
    const candidates = weightedPropKinds(layer.props);
    const heightRange = normalizedRange(layer.heightRange ?? [0, 0]);
    const scaleRange = normalizedRange(layer.scaleRange);
    const minSpacing = Math.max(0, layer.minSpacing ?? 0);
    const atmosphere = clamp01(layer.atmosphere ?? 0);
    const zones = (spec.protectedZones ?? []).filter(
      (zone) => !zone.roles || zone.roles.includes(layer.role)
    );

    const placedXs: number[] = [];
    let rejectedForSpacing = 0;
    let rejectedForProtectedZone = 0;
    const usedProps = new Set<string>();

    if (candidates.length > 0 && requested > 0 && spanWidth > 0) {
      // Bounded attempts: a dense layer inside a tight span can be genuinely unsatisfiable, and a
      // planner must degrade to fewer props rather than loop forever.
      const maxAttempts = requested * 12 + 24;
      for (let attempt = 0; attempt < maxAttempts && placedXs.length < requested; attempt += 1) {
        const x = round4(span[0] + random() * spanWidth);
        if (zones.some((zone) => withinRange(x, normalizedRange(zone.span)))) {
          rejectedForProtectedZone += 1;
          continue;
        }
        if (minSpacing > 0 && placedXs.some((existing) => Math.abs(existing - x) < minSpacing)) {
          rejectedForSpacing += 1;
          continue;
        }
        const kind = pickWeighted(candidates, random());
        const baseScale = scaleRange[0] + random() * (scaleRange[1] - scaleRange[0]);
        placedXs.push(x);
        usedProps.add(kind.id);
        placements.push({
          layer: layer.role,
          prop: kind.id,
          x,
          y: round4(heightRange[0] + random() * (heightRange[1] - heightRange[0])),
          z: round4(layer.depth),
          scale: round4(baseScale * positiveOr(kind.scaleBias, 1)),
          // Full-circle yaw variation: repeated props are the main source of visible cloning.
          rotationY: round4(random() * Math.PI * 2),
          variation: round4(random()),
          atmosphere
        });
      }
    }

    layerReports.push({
      role: layer.role,
      depth: round4(layer.depth),
      requested,
      placed: placedXs.length,
      rejectedForSpacing,
      rejectedForProtectedZone,
      distinctProps: usedProps.size,
      atmosphere
    });
  }

  return {
    kind: "aura-layered-scene-composition",
    seed: spec.seed,
    placements,
    layers: layerReports,
    populatedRoles: layerReports.filter((report) => report.placed > 0).map((report) => report.role)
  };
}

/**
 * Genre preset for a side-on platformer, parameterised by the level's own extent.
 *
 * This is the reusable answer to "Skyline needs art direction": the *shape* of a readable platformer
 * frame -- a near foreground band, a populated middle distance, and a far silhouette layer with strong
 * atmospheric attenuation -- is genre knowledge, not route knowledge. A route supplies its span, its
 * protected gameplay zones and its prop vocabulary.
 */
export interface PlatformerCompositionPresetOptions {
  readonly seed: number;
  /** Horizontal extent of the level, as `[min, max]`. */
  readonly span: readonly [number, number];
  /** Depth of the playable plane. Layers are placed relative to it. */
  readonly gameplayDepth: number;
  readonly foregroundProps: readonly SceneCompositionPropKind[];
  readonly midgroundProps: readonly SceneCompositionPropKind[];
  readonly backgroundProps: readonly SceneCompositionPropKind[];
  readonly protectedZones?: readonly SceneProtectedZone[] | undefined;
  /** Global density multiplier; use below 1 for mobile viewports. */
  readonly densityScale?: number | undefined;
}

export function platformerCompositionSpec(options: PlatformerCompositionPresetOptions): LayeredSceneCompositionSpec {
  const span = normalizedRange(options.span);
  const width = Math.max(0.001, span[1] - span[0]);
  return {
    seed: options.seed,
    ...(options.densityScale !== undefined ? { densityScale: options.densityScale } : {}),
    ...(options.protectedZones ? { protectedZones: options.protectedZones } : {}),
    layers: [
      {
        // Nearest band, in front of the play plane. Sparse and large: it frames the shot and creates
        // parallax without ever occluding gameplay, which is why its density is the lowest.
        //
        // Density is per *unit*, so a level whose visible window is only a fraction of its full span
        // gets very few near props in frame. `0.5` keeps a near band present at typical side-scroller
        // camera distances; the earlier `0.12` produced two props across the whole level, both of which
        // fell outside the camera's view of the start area.
        role: "foreground",
        depth: options.gameplayDepth + width * 0.06,
        span,
        props: options.foregroundProps,
        densityPerUnit: 0.28,
        scaleRange: [0.9, 1.4],
        minSpacing: width * 0.07,
        heightRange: [-0.05, 0.05],
        atmosphere: 0
      },
      {
        // The layer Skyline is missing entirely. Densest of the set: middle distance is what makes a
        // frame read as a populated world rather than props on an empty plane.
        role: "midground",
        depth: options.gameplayDepth - width * 0.1,
        span: [span[0] - width * 0.08, span[1] + width * 0.08],
        props: options.midgroundProps,
        densityPerUnit: 1.0,
        scaleRange: [0.55, 0.95],
        minSpacing: width * 0.012,
        heightRange: [-0.1, 0.25],
        atmosphere: 0.35
      },
      {
        // Far silhouettes. Heavily attenuated so they separate from the midground by value rather
        // than by detail, which is what stops a low-poly asset set reading as flat.
        role: "far-background",
        depth: options.gameplayDepth - width * 0.34,
        span: [span[0] - width * 0.2, span[1] + width * 0.2],
        props: options.backgroundProps,
        densityPerUnit: 0.5,
        scaleRange: [1.1, 2.2],
        minSpacing: width * 0.03,
        heightRange: [-0.2, 0.5],
        atmosphere: 0.72
      }
    ]
  };
}

/**
 * Measure how much of a frame is flat, unbroken sky or ground.
 *
 * Skyline's core defect is measurable and therefore gateable. This computes the dominant-flat-region
 * fraction so a composition change can be held to a documented threshold instead of an opinion.
 */
export function measureFlatRegionFraction(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: { readonly channels?: number | undefined; readonly quantiseBits?: number | undefined } = {}
): { readonly flatFraction: number; readonly dominantBucketFraction: number; readonly distinctBuckets: number } {
  const channels = options.channels ?? 4;
  const shift = Math.max(0, Math.min(7, options.quantiseBits ?? 4));
  const total = Math.max(1, width * height);
  const counts = new Map<number, number>();
  for (let index = 0; index + channels - 1 < pixels.length; index += channels) {
    const r = (pixels[index] ?? 0) >> shift;
    const g = (pixels[index + 1] ?? 0) >> shift;
    const b = (pixels[index + 2] ?? 0) >> shift;
    const key = (r << 16) | (g << 8) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.values()].sort((a, b) => b - a);
  const dominant = sorted[0] ?? 0;
  // Flat region = the two largest buckets, which for an outdoor frame are sky and ground.
  const flat = dominant + (sorted[1] ?? 0);
  return {
    flatFraction: round4(flat / total),
    dominantBucketFraction: round4(dominant / total),
    distinctBuckets: counts.size
  };
}

/**
 * Small deterministic PRNG (mulberry32).
 *
 * Chosen over any ambient randomness because retained screenshot evidence must be reproducible: the
 * same spec has to yield identical placements on every machine and every run.
 */
function createSeededRandom(seed: number): () => number {
  let state = (seed | 0) + 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface WeightedPropKind extends SceneCompositionPropKind {
  readonly cumulative: number;
}

function weightedPropKinds(props: readonly SceneCompositionPropKind[]): readonly WeightedPropKind[] {
  const out: WeightedPropKind[] = [];
  let cumulative = 0;
  for (const prop of props) {
    const weight = positiveOr(prop.weight, 1);
    cumulative += weight;
    out.push({ ...prop, cumulative });
  }
  return out;
}

function pickWeighted(candidates: readonly WeightedPropKind[], sample: number): SceneCompositionPropKind {
  const last = candidates[candidates.length - 1];
  if (!last) throw new Error("planLayeredSceneComposition requires at least one prop kind per populated layer.");
  const target = sample * last.cumulative;
  for (const candidate of candidates) {
    if (target < candidate.cumulative) return candidate;
  }
  return last;
}

function normalizedRange(range: readonly [number, number]): readonly [number, number] {
  return range[0] <= range[1] ? [range[0], range[1]] : [range[1], range[0]];
}

function withinRange(value: number, range: readonly [number, number]): boolean {
  return value >= range[0] && value <= range[1];
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Declarative sky/backdrop intent for an outdoor scene.
 *
 * ## Why this belongs in the reusable layer
 *
 * Skyline Runner authored its backdrop as a single emissive box:
 * `.position(0, 3.4, -9).scale([46, 20, 0.2])`. Every one of those six numbers is a route-local magic
 * constant, and together they are the *measured* cause of the frame's remaining weakness: one flat
 * emissive plane fills the upper frame, so the dominant colour bucket covers 43.65% of the scene
 * viewport and flat sky plus flat ground covers 59.77% (measured on the retained
 * `showcase-skyline-runner.png` analysis crop, 1108x900).
 *
 * A flat backdrop is not an art-direction preference that happens to be wrong here; it is a missing
 * capability. The brief's WS5 list names "sky gradient or sky asset", "horizon placement" and
 * "atmospheric perspective" as things the reusable layer must supply, and no reusable code supplied
 * them, so the route had no option but to hand-place a plane.
 *
 * This planner returns **banded** backdrop geometry: a small number of stacked quads from horizon to
 * zenith, each with its own blend factor. A caller maps `blend` onto a colour ramp between its horizon
 * and zenith colours, which breaks the single dominant bucket into several without adding any prop
 * geometry, and does so from the same declarative intent the composition layers already use.
 *
 * It stays a pure planner for the same reason `planLayeredSceneComposition` does: it returns numbers,
 * never scene nodes, so it is testable without a renderer and reusable by any route or genre.
 */
export interface SkyBackdropSpec {
  /** Horizontal span the backdrop must cover, as `[min, max]`. Widened internally so edges never show. */
  readonly span: readonly [number, number];
  /** Depth to place the backdrop at. Must sit behind every populated layer. */
  readonly depth: number;
  /** World height of the horizon line, i.e. where the backdrop's lowest band starts. */
  readonly horizonY: number;
  /** Total vertical extent above the horizon the backdrop covers. */
  readonly height: number;
  /**
   * Number of stacked bands. Two or more is what distinguishes a gradient from a flat plane; the
   * default of 4 measured as enough to break a single dominant bucket without adding draw cost that
   * matters against a route's primitive budget.
   */
  readonly bands?: number | undefined;
  /**
   * Fraction of `height` occupied by the lowest band, which carries the horizon haze. Lower values
   * concentrate value change near the horizon, where atmospheric perspective actually happens.
   */
  readonly horizonBandFraction?: number | undefined;
  /**
   * Vertical extent to grade *below* the horizon, for the region beneath the play plane.
   *
   * Grading only upward leaves whatever sits below the horizon as a single flat wash. That is not a
   * hypothetical: after the first banded sky landed on Skyline Runner the dominant bucket fell from
   * 43.65% to 26.08%, but the lower frame became the largest remaining flat region because the scene
   * background showed through unmodulated. "Horizon placement" is only a capability if both sides of the
   * horizon are placed. Omit or pass `0` for scenes where nothing is visible below the horizon.
   */
  readonly belowHorizonHeight?: number | undefined;
  /** Bands to use below the horizon. Defaults to half the sky band count, minimum 2. */
  readonly belowHorizonBands?: number | undefined;
}

/** One backdrop band, positioned and sized for the caller to realise as a quad. */
export interface SkyBackdropBand {
  /** Index from the horizon outward within this band's side, `0` being the band touching the horizon. */
  readonly index: number;
  /** Which side of the horizon this band grades. */
  readonly side: "sky" | "ground";
  /** Band centre on the vertical axis. */
  readonly centerY: number;
  /** Band height. */
  readonly height: number;
  /** Band width, already widened past the requested span. */
  readonly width: number;
  /** Depth, copied from the spec so a caller never re-derives it. */
  readonly z: number;
  /**
   * Position within the gradient, `0` at the horizon and `1` at the zenith. Callers interpolate their
   * horizon and zenith colours by this value; it is the whole point of banding.
   */
  readonly blend: number;
  /**
   * Suggested emissive strength, strongest at the horizon. Atmospheric scattering brightens the
   * horizon, so this falls off upward rather than being uniform.
   */
  readonly emissiveIntensity: number;
}

export interface SkyBackdropPlan {
  readonly kind: "aura-sky-backdrop-plan";
  /** Every band, sky and ground, in a single list a caller can map directly onto scene nodes. */
  readonly bands: readonly SkyBackdropBand[];
  /** Horizon line, echoed back for callers that also place ground or fog against it. */
  readonly horizonY: number;
  /** Top of the backdrop. */
  readonly zenithY: number;
  /** Bottom of the backdrop. Equals `horizonY` when nothing below the horizon was requested. */
  readonly nadirY: number;
}

/**
 * Plan a banded sky backdrop from declarative intent.
 *
 * Bands above the horizon band are distributed with increasing height, because a linear split puts
 * equal value change into the zenith (where a viewer reads none) and the horizon (where all of it is).
 */
export function planSkyBackdrop(spec: SkyBackdropSpec): SkyBackdropPlan {
  const span = normalizedRange(spec.span);
  // Widen well past the span: a backdrop whose edge enters frame is worse than no backdrop, and the
  // camera's horizontal view at side-scroller distances exceeds the level span.
  const width = round4(Math.max(0.001, (span[1] - span[0]) * 1.6 + 12));
  const height = Math.max(0.001, spec.height);
  const bandCount = resolveBandCount(spec.bands, 4);
  const horizonFraction = Math.min(0.8, Math.max(0.05, positiveOr(spec.horizonBandFraction, 0.22)));
  const z = round4(spec.depth);
  const bands: SkyBackdropBand[] = [];

  // Sky side, upward from the horizon.
  for (const band of gradedBands(height, bandCount, horizonFraction)) {
    bands.push({
      index: band.index,
      side: "sky",
      centerY: round4(spec.horizonY + band.offset + band.height / 2),
      height: round4(band.height),
      width,
      z,
      blend: round4(band.blend),
      // Horizon glow: strongest at blend 0, never fully dark at the zenith.
      emissiveIntensity: round4(0.52 - band.blend * 0.34)
    });
  }

  // Ground side, downward from the horizon. Requested explicitly, because many scenes show nothing there.
  const belowHeight = Math.max(0, spec.belowHorizonHeight ?? 0);
  if (belowHeight > 0) {
    const belowCount = resolveBandCount(spec.belowHorizonBands, Math.max(2, Math.round(bandCount / 2)));
    for (const band of gradedBands(belowHeight, belowCount, horizonFraction)) {
      bands.push({
        index: band.index,
        side: "ground",
        centerY: round4(spec.horizonY - band.offset - band.height / 2),
        height: round4(band.height),
        width,
        z,
        blend: round4(band.blend),
        // Ground darkens away from the horizon, mirroring the sky's falloff rather than repeating it.
        emissiveIntensity: round4(0.34 - band.blend * 0.26)
      });
    }
  }

  return {
    kind: "aura-sky-backdrop-plan",
    bands,
    horizonY: round4(spec.horizonY),
    zenithY: round4(spec.horizonY + height),
    nadirY: round4(spec.horizonY - belowHeight)
  };
}

/**
 * Clamp an explicitly provided band count rather than falling back to the default.
 *
 * `positiveOr(count, fallback)` would turn an explicit `0` into the default, which is unpredictable: a
 * caller who computed a count and got zero would silently receive the default instead of the documented
 * floor. `undefined` means "use the default"; any provided number is clamped into the supported range.
 */
function resolveBandCount(requested: number | undefined, fallback: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  // Upper bound raised from 12 to 32: at 5 bands over Skyline's own ramp the measured step was 21 per
  // channel, which reads as visible banding rather than a gradient (see `skyBandCountForRamp`). Keeping a
  // bound at all still prevents a caller from requesting thousands of quads by accident.
  return Math.max(2, Math.min(32, Math.round(requested)));
}

/**
 * Distribute one side of the backdrop into contiguous bands, finest at the horizon.
 *
 * Band heights grow away from the horizon because a linear split puts equal value change into the zenith
 * (where a viewer reads none) and the horizon (where all of it is).
 */
function gradedBands(
  height: number,
  count: number,
  horizonFraction: number
): readonly { readonly index: number; readonly offset: number; readonly height: number; readonly blend: number }[] {
  const horizonHeight = height * horizonFraction;
  const remaining = height - horizonHeight;
  const weights: number[] = [];
  for (let index = 1; index < count; index += 1) weights.push(index);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  const out: { index: number; offset: number; height: number; blend: number }[] = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    const bandHeight = index === 0 ? horizonHeight : (remaining * (weights[index - 1] ?? 1)) / weightTotal;
    out.push({ index, offset, height: bandHeight, blend: count === 1 ? 0 : index / (count - 1) });
    offset += bandHeight;
  }
  return out;
}

/**
 * Interpolate a hex colour ramp for a band's `blend`.
 *
 * Provided here rather than left to each route because "gradient sky" is only reusable if producing the
 * per-band colour is reusable too; a route that has to write its own hex mixing has not been relieved
 * of the art-direction code this layer exists to absorb.
 */
export function blendSkyBandColor(horizonColor: string, zenithColor: string, blend: number): string {
  const from = parseHexColor(horizonColor);
  const to = parseHexColor(zenithColor);
  const t = clamp01(blend);
  const mix = (a: number, b: number): number => Math.round(a + (b - a) * t);
  return `#${[mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2])]
    .map((channel) => Math.min(255, Math.max(0, channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Minimum band count that keeps a colour ramp from reading as visible banding.
 *
 * ## Why this is a reusable function and not a constant
 *
 * A banded backdrop trades one defect for another if the band count is chosen by eye. Skyline's first
 * banded sky used 5 bands over `#4e93b4 -> #173a5c`; sampling the rendered frame down a backdrop-only
 * column measured hard steps of **21 per channel** at the horizon and 18 in the ground ramp -- a visible
 * stair, replacing "flat sky" with "banded sky".
 *
 * The step size is a property of the *ramp*, not of taste: it is the largest per-channel endpoint
 * distance divided by the number of gaps between bands. So the correct band count is derivable, and any
 * route with any pair of colours can derive it instead of guessing. `maxChannelStep` defaults to 8, which
 * is below the threshold where adjacent flat quads read as an edge at typical viewing sizes.
 */
export function skyBandCountForRamp(
  fromColor: string,
  toColor: string,
  maxChannelStep = 8
): number {
  const from = parseHexColor(fromColor);
  const to = parseHexColor(toColor);
  const widestChannelRange = Math.max(
    Math.abs(from[0] - to[0]),
    Math.abs(from[1] - to[1]),
    Math.abs(from[2] - to[2])
  );
  const step = Math.max(1, maxChannelStep);
  // `+ 1` converts gaps to bands; a 2-band backdrop has one gap.
  return Math.max(2, Math.ceil(widestChannelRange / step) + 1);
}

function parseHexColor(value: string): readonly [number, number, number] {
  const hex = value.trim().replace(/^#/, "");
  const expanded = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`blendSkyBandColor requires a 3- or 6-digit hex colour, received "${value}".`);
  }
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16)
  ];
}
