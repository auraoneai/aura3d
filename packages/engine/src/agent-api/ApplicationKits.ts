/**
 * Reusable application kits for static and enterprise experiences.
 *
 * ## Why these exist
 *
 * The remediation's reusable *systems* -- focus, labels, asset-relative anchoring -- removed
 * the defects that made these routes wrong. They did not remove the reason each route is
 * 800 to 1,400 lines: every one still assembles part selection, variant state, overlay
 * composition, camera presets and annotation placement by hand, and each assembles it
 * slightly differently. A developer building a sixth configurator gets no help from the five
 * that exist.
 *
 * A kit owns that assembly. A route declares *what* it is configuring -- these parts, these
 * variants, these zones, these camera presets -- and the kit owns selection state, focus
 * feedback, annotation placement, camera framing, reset and the evidence a gate needs. The
 * route composes scene nodes from the kit's output instead of computing them.
 *
 * All five kits are pure: they hold state and return scene-node JSON plus intent. No
 * renderer, no DOM, no asset loading, so each is unit-testable and reusable by any route.
 *
 * Deliberately *not* included: anything a kit cannot honestly own. Measurement and section
 * views in the architecture kit need geometry the public API does not expose, so they are
 * absent rather than stubbed. See `unsupported` on each kit's capability report.
 */

import type { AuraCameraSpec, AuraColor, AuraSceneNode, AuraVec3 } from "./index.js";
import {
  clearFocus,
  focusCameraIntent,
  focusSemanticRegion,
  type FocusIndicator,
  type FocusResult
} from "./FocusSelection.js";
import {
  checkSpatialInvariants,
  distributeInRegion,
  resolveBoundsAnchor,
  resolveSemanticRegion,
  type BoundsAnchor,
  type HelperPlacementClaim,
  type PlacedBounds,
  type SemanticRegion,
  type SpatialInvariantReport
} from "./SpatialAnchoring.js";

/** Capability report every kit publishes, so a claim can be checked against it. */
export interface KitCapabilityReport {
  readonly kind: "aura-application-kit-capabilities";
  readonly kit: string;
  /** Capabilities the kit owns and a route no longer implements. */
  readonly supported: readonly string[];
  /**
   * Capabilities the assignment names that this kit does **not** own, with the reason.
   *
   * Present so a kit cannot imply completeness it does not have. A stub that returns empty
   * geometry would be worse than an honest absence.
   */
  readonly unsupported: readonly { readonly capability: string; readonly reason: string }[];
}

// ---------------------------------------------------------------------------
// Product configurator
// ---------------------------------------------------------------------------

export interface ConfiguratorPart extends SemanticRegion {
  /** Optional price contribution, for data binding. */
  readonly price?: number | undefined;
}

export interface ConfiguratorVariant {
  readonly id: string;
  readonly label: string;
  readonly color: AuraColor;
  readonly accent: AuraColor;
  readonly price?: number | undefined;
}

export interface ConfiguratorFinish {
  readonly id: string;
  readonly label: string;
  readonly price?: number | undefined;
}

export interface ConfiguratorCameraPreset {
  readonly id: string;
  readonly camera: AuraCameraSpec;
}

export interface ProductConfiguratorKitOptions {
  /** Placed bounds of the product, from `placedBoundsFromAsset`. */
  readonly bounds: PlacedBounds;
  readonly parts: readonly ConfiguratorPart[];
  readonly variants: readonly ConfiguratorVariant[];
  readonly finishes: readonly ConfiguratorFinish[];
  readonly cameraPresets?: readonly ConfiguratorCameraPreset[] | undefined;
  /** Base price, before variant and finish contributions. */
  readonly basePrice?: number | undefined;
  /** Focus indicators to draw for a selected part. */
  readonly indicators?: readonly FocusIndicator[] | undefined;
  /** Viewport aspect, for camera framing. */
  readonly aspect?: number | undefined;
}

export interface ProductConfiguratorState {
  readonly variantId: string;
  readonly finishId: string;
  readonly partId: string | undefined;
  readonly exploded: boolean;
  readonly cameraPresetId: string | undefined;
}

export interface ProductConfiguratorFrame {
  readonly kind: "aura-product-configurator-frame";
  readonly state: ProductConfiguratorState;
  /** Focus indicator and annotation nodes for the current selection. */
  readonly nodes: readonly AuraSceneNode[];
  /** Exploded-part placements, empty unless `exploded`. */
  readonly explodedPlacements: readonly { readonly partId: string; readonly position: AuraVec3; readonly size: AuraVec3 }[];
  readonly camera: AuraCameraSpec | undefined;
  readonly focus: FocusResult;
  readonly price: number | undefined;
  readonly accessibilityLabel: string;
  readonly spatialInvariants: SpatialInvariantReport;
}

export interface ProductConfiguratorKit {
  readonly kind: "aura-product-configurator-kit";
  readonly capabilities: KitCapabilityReport;
  selectVariant(variantId: string): ProductConfiguratorFrame;
  selectFinish(finishId: string): ProductConfiguratorFrame;
  /** Select a part, or pass the current part again to deselect it. */
  selectPart(partId: string | undefined): ProductConfiguratorFrame;
  toggleExploded(): ProductConfiguratorFrame;
  selectCameraPreset(presetId: string | undefined): ProductConfiguratorFrame;
  reset(): ProductConfiguratorFrame;
  frame(): ProductConfiguratorFrame;
}

export function createProductConfiguratorKit(options: ProductConfiguratorKitOptions): ProductConfiguratorKit {
  const variants = new Map(options.variants.map((variant) => [variant.id, variant]));
  const finishes = new Map(options.finishes.map((finish) => [finish.id, finish]));
  const parts = new Map(options.parts.map((part) => [part.id, part]));
  const presets = new Map((options.cameraPresets ?? []).map((preset) => [preset.id, preset]));
  const initial: ProductConfiguratorState = {
    variantId: options.variants[0]?.id ?? "",
    finishId: options.finishes[0]?.id ?? "",
    partId: undefined,
    exploded: false,
    cameraPresetId: options.cameraPresets?.[0]?.id
  };
  let state = initial;

  const capabilities: KitCapabilityReport = {
    kind: "aura-application-kit-capabilities",
    kit: "product-configurator",
    supported: [
      "part selection", "focus feedback", "variants", "materials/finishes",
      "exploded view", "annotations", "reset", "camera presets", "price data binding",
      "spatial invariants"
    ],
    unsupported: [
      {
        capability: "material authoring",
        reason: "the kit selects among finishes a route supplies; authoring new material graphs belongs to the materials surface, not to a configurator"
      }
    ]
  };

  const buildFrame = (): ProductConfiguratorFrame => {
    const variant = variants.get(state.variantId);
    const finish = finishes.get(state.finishId);
    const part = state.partId ? parts.get(state.partId) : undefined;
    const focus = part
      ? focusSemanticRegion(options.bounds, part, {
          color: variant?.accent ?? "#fde68a",
          indicators: options.indicators ?? ["ring", "halo"],
          callout: true,
          leaderLine: true,
          // The kit reports camera intent through `camera`; it does not seize the camera.
          cameraFocus: false,
          namePrefix: `${part.id} focus`,
          aspect: options.aspect
        })
      : clearFocus();

    /*
     * Exploded placements are derived from the product's bounds and each part's own
     * normalized region, so the explosion direction follows the part rather than a literal.
     */
    const explodedPlacements = state.exploded
      ? options.parts.map((entry) => {
          const region = resolveSemanticRegion(options.bounds, entry);
          // Push each part outward from the product centre along its own offset direction.
          const offsetX = region.center[0] - options.bounds.center[0];
          const offsetY = region.center[1] - options.bounds.center[1];
          const spread = 1.6;
          return {
            partId: entry.id,
            position: [
              options.bounds.center[0] + offsetX * spread,
              options.bounds.center[1] + offsetY * spread,
              region.center[2]
            ] as AuraVec3,
            size: (region.size[0] > 0 ? region.size : [
              options.bounds.size[0] * 0.2,
              options.bounds.size[1] * 0.2,
              options.bounds.size[2] * 0.2
            ]) as AuraVec3
          };
        })
      : [];

    // Camera: an explicit preset wins; otherwise a selected part is framed.
    const preset = state.cameraPresetId ? presets.get(state.cameraPresetId) : undefined;
    const partRegion = part ? resolveSemanticRegion(options.bounds, part) : undefined;
    const camera = preset?.camera ?? (partRegion
      ? cameraSpecFromIntent(focusCameraIntent(partRegion.center, sizeOrFraction(partRegion.size, options.bounds), { aspect: options.aspect }))
      : undefined);

    const price = options.basePrice === undefined
      ? undefined
      : options.basePrice + (variant?.price ?? 0) + (finish?.price ?? 0)
        + (state.exploded ? 0 : 0)
        + (part?.price ?? 0);

    const claims: HelperPlacementClaim[] = [
      ...options.parts.map((entry) => ({
        id: `${entry.id} region`,
        position: resolveSemanticRegion(options.bounds, entry).center,
        relation: "inside" as const
      })),
      /*
       * An exploded part's claim depends on whether it actually moved.
       *
       * A part at the product's centre has no offset direction, so multiplying its offset by
       * the spread leaves it where it was -- correctly, since a central component is revealed
       * in place rather than displaced. Claiming every exploded part is `outside` is therefore
       * a false claim, not a lenient one, and it fails the spatial gate on correct geometry.
       * This is the same mistake the configurator route made with its driver discs.
       */
      ...explodedPlacements.map((placement) => {
        const displacement = Math.hypot(
          placement.position[0] - options.bounds.center[0],
          placement.position[1] - options.bounds.center[1],
          placement.position[2] - options.bounds.center[2]
        );
        // "Moved" means displaced by more than a tenth of the product's largest extent.
        const displaced = displacement > Math.max(...options.bounds.size) * 0.1;
        return displaced
          ? {
              id: `${placement.partId} exploded`,
              position: placement.position,
              relation: "outside" as const,
              maxDistance: Math.max(...options.bounds.size) * 2.5
            }
          : { id: `${placement.partId} exploded`, position: placement.position, relation: "inside" as const };
      })
    ];

    return {
      kind: "aura-product-configurator-frame",
      state,
      nodes: focus.nodes,
      explodedPlacements,
      camera,
      focus,
      price,
      accessibilityLabel: part
        ? `${part.label ?? part.id} selected on ${variant?.label ?? state.variantId} in ${finish?.label ?? state.finishId}`
        : `${variant?.label ?? state.variantId} in ${finish?.label ?? state.finishId}, no part selected`,
      spatialInvariants: checkSpatialInvariants(options.bounds, claims)
    };
  };

  return {
    kind: "aura-product-configurator-kit",
    capabilities,
    selectVariant(variantId) {
      if (variants.has(variantId)) state = { ...state, variantId };
      return buildFrame();
    },
    selectFinish(finishId) {
      if (finishes.has(finishId)) state = { ...state, finishId };
      return buildFrame();
    },
    selectPart(partId) {
      // Selecting the current part deselects it, which is what a user expects from a toggle.
      const next = partId !== undefined && partId === state.partId ? undefined : partId;
      state = { ...state, partId: next !== undefined && parts.has(next) ? next : undefined };
      return buildFrame();
    },
    toggleExploded() {
      state = { ...state, exploded: !state.exploded };
      return buildFrame();
    },
    selectCameraPreset(presetId) {
      state = { ...state, cameraPresetId: presetId !== undefined && presets.has(presetId) ? presetId : undefined };
      return buildFrame();
    },
    reset() {
      state = initial;
      return buildFrame();
    },
    frame: buildFrame
  };
}

// ---------------------------------------------------------------------------
// Digital twin
// ---------------------------------------------------------------------------

export interface TwinEquipment extends SemanticRegion {
  /** Sensor readings a route supplies; the kit carries them into overlays and evidence. */
  readonly sensors?: Readonly<Record<string, number>> | undefined;
}

export interface TwinAlarm {
  readonly equipmentId: string;
  readonly severity: "info" | "warning" | "critical";
  readonly message: string;
}

export interface DigitalTwinKitOptions {
  readonly bounds: PlacedBounds;
  readonly equipment: readonly TwinEquipment[];
  /** Where the alarm beacon sits relative to the workcell. */
  readonly alarmAnchor?: BoundsAnchor | undefined;
  /** Conveyor or belt region, for distributed markers. */
  readonly flowRegion?: SemanticRegion | undefined;
  readonly markerCount?: number | undefined;
  readonly aspect?: number | undefined;
}

export interface DigitalTwinFrame {
  readonly kind: "aura-digital-twin-frame";
  readonly selectedEquipmentId: string | undefined;
  readonly focused: boolean;
  readonly mode: string;
  readonly nodes: readonly AuraSceneNode[];
  /** Marker placements along the flow region, deterministic for a given seed. */
  readonly markerPlacements: readonly AuraVec3[];
  readonly alarmPosition: AuraVec3;
  readonly camera: AuraCameraSpec | undefined;
  readonly alarms: readonly TwinAlarm[];
  readonly sensorReadout: Readonly<Record<string, number>>;
  readonly timeline: { readonly step: number; readonly steps: number };
  readonly spatialInvariants: SpatialInvariantReport;
  readonly accessibilityLabel: string;
}

export interface DigitalTwinKit {
  readonly kind: "aura-digital-twin-kit";
  readonly capabilities: KitCapabilityReport;
  selectEquipment(equipmentId: string | undefined): DigitalTwinFrame;
  setMode(mode: string): DigitalTwinFrame;
  toggleFocus(): DigitalTwinFrame;
  raiseAlarm(alarm: TwinAlarm): DigitalTwinFrame;
  clearAlarms(): DigitalTwinFrame;
  /** Advance the state-simulation timeline by one step. */
  advanceTimeline(): DigitalTwinFrame;
  reset(): DigitalTwinFrame;
  frame(): DigitalTwinFrame;
}

export function createDigitalTwinKit(options: DigitalTwinKitOptions): DigitalTwinKit {
  const equipment = new Map(options.equipment.map((entry) => [entry.id, entry]));
  const timelineSteps = 8;
  /**
   * Initial state, typed explicitly.
   *
   * Inferring it from `options.equipment[0]?.id` narrows `selectedEquipmentId` to `string`
   * when the array is non-empty, which then rejects deselection. Deselection is a real
   * operation, so the type has to admit it.
   */
  interface TwinState {
    selectedEquipmentId: string | undefined;
    mode: string;
    focused: boolean;
    alarms: TwinAlarm[];
    step: number;
  }
  const initial: TwinState = {
    selectedEquipmentId: options.equipment[0]?.id,
    mode: "normal",
    focused: false,
    alarms: [],
    step: 0
  };
  let state: TwinState = { ...initial, alarms: [...initial.alarms] };

  const capabilities: KitCapabilityReport = {
    kind: "aura-application-kit-capabilities",
    kit: "digital-twin",
    supported: [
      "semantic equipment", "state overlays", "sensor values", "alarms",
      "asset-relative markers", "workcell bounds", "camera focus", "timeline",
      "state simulation", "spatial invariants"
    ],
    unsupported: [
      {
        capability: "live facility data",
        reason: "the kit carries sensor values a route supplies; connecting to a PLC or historian is integration work outside the engine"
      }
    ]
  };

  const buildFrame = (): DigitalTwinFrame => {
    const selected = state.selectedEquipmentId ? equipment.get(state.selectedEquipmentId) : undefined;
    const focus = selected
      ? focusSemanticRegion(options.bounds, selected, {
          color: state.alarms.length > 0 ? "#f2715c" : "#7ee8c4",
          indicators: ["ring"],
          callout: true,
          cameraFocus: false,
          namePrefix: `${selected.id} selection`,
          aspect: options.aspect
        })
      : clearFocus();

    const alarmAnchor = resolveBoundsAnchor(options.bounds, options.alarmAnchor ?? "top-left", {
      offset: Math.max(...options.bounds.size) * 0.12
    });

    const flow = options.flowRegion ? resolveSemanticRegion(options.bounds, options.flowRegion) : undefined;
    const markerPlacements = flow
      ? distributeInRegion(
          { min: [flow.min[0], flow.center[1], flow.center[2]], max: [flow.max[0], flow.center[1], flow.center[2]] },
          { count: options.markerCount ?? 4, seed: 17 }
        ).map((placement) => placement.position)
      : [];

    const selectedRegion = selected ? resolveSemanticRegion(options.bounds, selected) : undefined;
    const camera = state.focused && selectedRegion
      ? cameraSpecFromIntent(focusCameraIntent(selectedRegion.center, sizeOrFraction(selectedRegion.size, options.bounds), { aspect: options.aspect }))
      : undefined;

    const sensorReadout: Record<string, number> = {};
    for (const entry of options.equipment) {
      for (const [key, value] of Object.entries(entry.sensors ?? {})) {
        // Timeline advances readings deterministically, so a replay reproduces them.
        sensorReadout[`${entry.id}.${key}`] = Number((value * (1 + Math.sin(state.step * 0.7) * 0.06)).toFixed(4));
      }
    }

    const claims: HelperPlacementClaim[] = [
      ...options.equipment.map((entry) => ({
        id: `${entry.id} equipment`,
        position: resolveSemanticRegion(options.bounds, entry).center,
        relation: "inside" as const
      })),
      ...markerPlacements.map((position, index) => ({
        id: `flow marker ${index + 1}`,
        position,
        relation: "inside" as const
      })),
      {
        id: "alarm beacon",
        position: alarmAnchor.position,
        relation: "outside" as const,
        maxDistance: Math.max(...options.bounds.size) * 0.6
      }
    ];

    return {
      kind: "aura-digital-twin-frame",
      selectedEquipmentId: state.selectedEquipmentId,
      focused: state.focused,
      mode: state.mode,
      nodes: focus.nodes,
      markerPlacements,
      alarmPosition: alarmAnchor.position,
      camera,
      alarms: [...state.alarms],
      sensorReadout,
      timeline: { step: state.step, steps: timelineSteps },
      spatialInvariants: checkSpatialInvariants(options.bounds, claims),
      accessibilityLabel: selected
        ? `${selected.label ?? selected.id} selected, mode ${state.mode}, ${state.alarms.length} alarm(s)`
        : `no equipment selected, mode ${state.mode}`
    };
  };

  return {
    kind: "aura-digital-twin-kit",
    capabilities,
    selectEquipment(equipmentId) {
      state = { ...state, selectedEquipmentId: equipmentId !== undefined && equipment.has(equipmentId) ? equipmentId : undefined };
      return buildFrame();
    },
    setMode(mode) {
      state = { ...state, mode };
      return buildFrame();
    },
    toggleFocus() {
      state = { ...state, focused: !state.focused };
      return buildFrame();
    },
    raiseAlarm(alarm) {
      state = { ...state, alarms: [...state.alarms, alarm], mode: alarm.severity === "critical" ? "incident" : state.mode };
      return buildFrame();
    },
    clearAlarms() {
      state = { ...state, alarms: [], mode: "normal" };
      return buildFrame();
    },
    advanceTimeline() {
      state = { ...state, step: (state.step + 1) % timelineSteps };
      return buildFrame();
    },
    reset() {
      state = { ...initial, alarms: [] };
      return buildFrame();
    },
    frame: buildFrame
  };
}

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

export interface ArchitectureSpace extends SemanticRegion {
  /** Which floor this space belongs to, so floor focus can group spaces. */
  readonly floor: number;
}

export interface ArchitectureKitOptions {
  readonly bounds: PlacedBounds;
  readonly spaces: readonly ArchitectureSpace[];
  /** Named lighting moods a route supplies. */
  readonly moods: readonly { readonly id: string; readonly label: string; readonly sunElevation: number; readonly sunAzimuth: number }[];
  readonly materialVariants?: readonly { readonly id: string; readonly label: string }[] | undefined;
  readonly aspect?: number | undefined;
}

export interface ArchitectureFrame {
  readonly kind: "aura-architecture-frame";
  readonly floor: number | undefined;
  readonly spaceId: string | undefined;
  readonly moodId: string;
  readonly materialVariantId: string | undefined;
  readonly nodes: readonly AuraSceneNode[];
  readonly camera: AuraCameraSpec | undefined;
  /** Sun direction for the active mood, as a unit vector. */
  readonly sunDirection: AuraVec3;
  /** Spaces on the focused floor, or all spaces when no floor is focused. */
  readonly visibleSpaceIds: readonly string[];
  readonly spatialInvariants: SpatialInvariantReport;
  readonly accessibilityLabel: string;
}

export interface ArchitectureKit {
  readonly kind: "aura-architecture-kit";
  readonly capabilities: KitCapabilityReport;
  focusFloor(floor: number | undefined): ArchitectureFrame;
  focusSpace(spaceId: string | undefined): ArchitectureFrame;
  setMood(moodId: string): ArchitectureFrame;
  setMaterialVariant(variantId: string | undefined): ArchitectureFrame;
  reset(): ArchitectureFrame;
  frame(): ArchitectureFrame;
}

export function createArchitectureKit(options: ArchitectureKitOptions): ArchitectureKit {
  const spaces = new Map(options.spaces.map((space) => [space.id, space]));
  const moods = new Map(options.moods.map((mood) => [mood.id, mood]));
  const variants = new Map((options.materialVariants ?? []).map((variant) => [variant.id, variant]));
  const initial = {
    floor: undefined as number | undefined,
    spaceId: undefined as string | undefined,
    moodId: options.moods[0]?.id ?? "",
    materialVariantId: options.materialVariants?.[0]?.id
  };
  let state = initial;

  const capabilities: KitCapabilityReport = {
    kind: "aura-application-kit-capabilities",
    kit: "architecture",
    supported: [
      "navigation between spaces", "floor focus", "room focus", "annotations",
      "sun/light controls", "material variants", "camera framing", "spatial invariants"
    ],
    unsupported: [
      {
        capability: "measurement",
        reason: "point-to-point measurement needs picked world positions from the renderer, which the safe public API does not expose; a kit returning made-up distances would be worse than none"
      },
      {
        capability: "clipping/section views",
        reason: "clip planes are not surfaced through the root safe API, so a kit cannot honestly produce a section view"
      }
    ]
  };

  const buildFrame = (): ArchitectureFrame => {
    const space = state.spaceId ? spaces.get(state.spaceId) : undefined;
    const mood = moods.get(state.moodId);
    const focus = space
      ? focusSemanticRegion(options.bounds, space, {
          indicators: ["bounding-box"],
          callout: true,
          cameraFocus: false,
          namePrefix: `${space.id} focus`,
          aspect: options.aspect
        })
      : clearFocus();

    const visibleSpaceIds = state.floor === undefined
      ? options.spaces.map((entry) => entry.id)
      : options.spaces.filter((entry) => entry.floor === state.floor).map((entry) => entry.id);

    // Camera frames the focused space, or the focused floor's combined extent.
    const spaceRegion = space ? resolveSemanticRegion(options.bounds, space) : undefined;
    const floorSpaces = state.floor === undefined
      ? []
      : options.spaces.filter((entry) => entry.floor === state.floor);
    const camera = spaceRegion
      ? cameraSpecFromIntent(focusCameraIntent(spaceRegion.center, sizeOrFraction(spaceRegion.size, options.bounds), { aspect: options.aspect }))
      : floorSpaces.length > 0
        ? cameraSpecFromIntent(focusCameraIntent(
            combinedCentre(floorSpaces.map((entry) => resolveSemanticRegion(options.bounds, entry).center)),
            [options.bounds.size[0], options.bounds.size[1] / Math.max(1, floorCount(options.spaces)), options.bounds.size[2]],
            { aspect: options.aspect }
          ))
        : undefined;

    /*
     * Sun direction from elevation and azimuth. Derived rather than a per-mood literal, so a
     * new mood is two angles rather than a hand-picked vector that may not match its name.
     */
    const elevation = (mood?.sunElevation ?? 45) * (Math.PI / 180);
    const azimuth = (mood?.sunAzimuth ?? 135) * (Math.PI / 180);
    const sunDirection: AuraVec3 = [
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.cos(azimuth)
    ];

    return {
      kind: "aura-architecture-frame",
      floor: state.floor,
      spaceId: state.spaceId,
      moodId: state.moodId,
      materialVariantId: state.materialVariantId,
      nodes: focus.nodes,
      camera,
      sunDirection,
      visibleSpaceIds,
      spatialInvariants: checkSpatialInvariants(
        options.bounds,
        options.spaces.map((entry) => ({
          id: `${entry.id} space`,
          position: resolveSemanticRegion(options.bounds, entry).center,
          relation: "inside" as const
        }))
      ),
      accessibilityLabel: space
        ? `${space.label ?? space.id} focused on floor ${space.floor}, ${mood?.label ?? state.moodId} lighting`
        : state.floor !== undefined
          ? `floor ${state.floor} focused, ${mood?.label ?? state.moodId} lighting`
          : `${mood?.label ?? state.moodId} lighting, no focus`
    };
  };

  return {
    kind: "aura-architecture-kit",
    capabilities,
    focusFloor(floor) {
      state = { ...state, floor, spaceId: undefined };
      return buildFrame();
    },
    focusSpace(spaceId) {
      const resolved = spaceId !== undefined && spaces.has(spaceId) ? spaceId : undefined;
      // Focusing a space also focuses its floor, so the two cannot disagree.
      const floor: number | undefined = resolved === undefined ? state.floor : spaces.get(resolved)?.floor;
      state = { ...state, spaceId: resolved, floor };
      return buildFrame();
    },
    setMood(moodId) {
      if (moods.has(moodId)) state = { ...state, moodId };
      return buildFrame();
    },
    setMaterialVariant(variantId) {
      state = { ...state, materialVariantId: variantId !== undefined && variants.has(variantId) ? variantId : undefined };
      return buildFrame();
    },
    reset() {
      state = initial;
      return buildFrame();
    },
    frame: buildFrame
  };
}

// ---------------------------------------------------------------------------
// Smart city
// ---------------------------------------------------------------------------

export interface CityDistrict extends SemanticRegion {
  readonly color: AuraColor;
}

export interface CityDataLayer {
  readonly id: string;
  readonly label: string;
  /** Values per district id, so a layer's overlay follows the district it describes. */
  readonly values: Readonly<Record<string, number>>;
}

export interface SmartCityKitOptions {
  readonly bounds: PlacedBounds;
  readonly districts: readonly CityDistrict[];
  readonly layers: readonly CityDataLayer[];
  /** Temporal states, such as time of day. */
  readonly temporalStates?: readonly string[] | undefined;
  readonly aspect?: number | undefined;
}

export interface SmartCityFrame {
  readonly kind: "aura-smart-city-frame";
  readonly districtId: string | undefined;
  readonly activeLayerIds: readonly string[];
  readonly temporalState: string | undefined;
  readonly nodes: readonly AuraSceneNode[];
  readonly camera: AuraCameraSpec | undefined;
  /** Overlay placement and value per district, for each active layer. */
  readonly overlays: readonly {
    readonly layerId: string;
    readonly districtId: string;
    readonly position: AuraVec3;
    readonly value: number;
  }[];
  /** Districts rendered at reduced detail because too many are active at once. */
  readonly reducedDetailDistrictIds: readonly string[];
  readonly spatialInvariants: SpatialInvariantReport;
  readonly accessibilityLabel: string;
}

export interface SmartCityKit {
  readonly kind: "aura-smart-city-kit";
  readonly capabilities: KitCapabilityReport;
  selectDistrict(districtId: string | undefined): SmartCityFrame;
  toggleLayer(layerId: string): SmartCityFrame;
  setTemporalState(state: string | undefined): SmartCityFrame;
  reset(): SmartCityFrame;
  frame(): SmartCityFrame;
}

export function createSmartCityKit(options: SmartCityKitOptions): SmartCityKit {
  const districts = new Map(options.districts.map((district) => [district.id, district]));
  const layers = new Map(options.layers.map((layer) => [layer.id, layer]));
  /**
   * Density budget: overlay markers drawn at full detail before reduction kicks in.
   *
   * Stated rather than tuned. Above this, the kit reports which districts drop to reduced
   * detail instead of silently drawing thousands of markers.
   */
  const DENSITY_BUDGET = 24;
  const initial = {
    districtId: undefined as string | undefined,
    activeLayerIds: options.layers.slice(0, 1).map((layer) => layer.id),
    temporalState: options.temporalStates?.[0]
  };
  let state = { ...initial, activeLayerIds: [...initial.activeLayerIds] };

  const capabilities: KitCapabilityReport = {
    kind: "aura-application-kit-capabilities",
    kit: "smart-city",
    supported: [
      "layer toggles", "data overlays", "camera focus", "district selection",
      "temporal state", "density handling", "labels", "spatial invariants"
    ],
    unsupported: [
      {
        capability: "real GIS data",
        reason: "the kit places overlays for values a route supplies; ingesting geospatial sources is integration work outside the engine"
      }
    ]
  };

  const buildFrame = (): SmartCityFrame => {
    const district = state.districtId ? districts.get(state.districtId) : undefined;
    const focus = district
      ? focusSemanticRegion(options.bounds, district, {
          color: district.color,
          indicators: ["ring"],
          callout: true,
          cameraFocus: false,
          namePrefix: `${district.id} district focus`,
          aspect: options.aspect
        })
      : clearFocus();

    const overlays: {
      layerId: string;
      districtId: string;
      position: AuraVec3;
      value: number;
    }[] = [];
    for (const layerId of state.activeLayerIds) {
      const layer = layers.get(layerId);
      if (!layer) continue;
      for (const entry of options.districts) {
        const value = layer.values[entry.id];
        if (value === undefined) continue;
        const region = resolveSemanticRegion(options.bounds, entry);
        overlays.push({
          layerId,
          districtId: entry.id,
          // Overlay height scales with the value, so a reading is legible as height.
          position: [region.center[0], options.bounds.floorY + options.bounds.size[1] * (0.1 + value * 0.4), region.center[2]],
          value
        });
      }
    }

    // Density handling: report reduction rather than drawing past the budget.
    const reducedDetailDistrictIds = overlays.length > DENSITY_BUDGET
      ? [...new Set(overlays.slice(DENSITY_BUDGET).map((overlay) => overlay.districtId))]
      : [];

    const districtRegion = district ? resolveSemanticRegion(options.bounds, district) : undefined;
    const camera = districtRegion
      ? cameraSpecFromIntent(focusCameraIntent(districtRegion.center, sizeOrFraction(districtRegion.size, options.bounds), { aspect: options.aspect }))
      : undefined;

    return {
      kind: "aura-smart-city-frame",
      districtId: state.districtId,
      activeLayerIds: [...state.activeLayerIds],
      temporalState: state.temporalState,
      nodes: focus.nodes,
      camera,
      overlays,
      reducedDetailDistrictIds,
      spatialInvariants: checkSpatialInvariants(
        options.bounds,
        options.districts.map((entry) => ({
          id: `${entry.id} district`,
          position: resolveSemanticRegion(options.bounds, entry).center,
          relation: "inside" as const
        }))
      ),
      accessibilityLabel: district
        ? `${district.label ?? district.id} district selected, ${state.activeLayerIds.length} layer(s) active`
        : `no district selected, ${state.activeLayerIds.length} layer(s) active`
    };
  };

  return {
    kind: "aura-smart-city-kit",
    capabilities,
    selectDistrict(districtId) {
      state = { ...state, districtId: districtId !== undefined && districts.has(districtId) ? districtId : undefined };
      return buildFrame();
    },
    toggleLayer(layerId) {
      if (!layers.has(layerId)) return buildFrame();
      const active = state.activeLayerIds.includes(layerId);
      state = {
        ...state,
        activeLayerIds: active
          ? state.activeLayerIds.filter((id) => id !== layerId)
          : [...state.activeLayerIds, layerId]
      };
      return buildFrame();
    },
    setTemporalState(temporalState) {
      state = { ...state, temporalState };
      return buildFrame();
    },
    reset() {
      state = { ...initial, activeLayerIds: [...initial.activeLayerIds] };
      return buildFrame();
    },
    frame: buildFrame
  };
}

// ---------------------------------------------------------------------------
// Cinematic
// ---------------------------------------------------------------------------

export interface CinematicShot {
  readonly id: string;
  readonly seconds: number;
  readonly from: AuraVec3;
  readonly to: AuraVec3;
  readonly target: AuraVec3;
  /** Animation clip to coordinate with this shot, when there is one. */
  readonly clip?: string | undefined;
  readonly transition?: "cut" | "ease" | "linear" | undefined;
}

export interface CinematicKitOptions {
  readonly shots: readonly CinematicShot[];
  readonly fov?: number | undefined;
}

export interface CinematicFrame {
  readonly kind: "aura-cinematic-frame";
  readonly time: number;
  readonly shotId: string;
  readonly shotIndex: number;
  /** Progress through the current shot, 0..1. */
  readonly shotProgress: number;
  readonly camera: AuraCameraSpec;
  readonly activeClip: string | undefined;
  /** True while a transition into this shot is still resolving. */
  readonly transitioning: boolean;
  readonly totalSeconds: number;
}

export interface CinematicKit {
  readonly kind: "aura-cinematic-kit";
  readonly capabilities: KitCapabilityReport;
  /** Sample the sequence at a time, in seconds. Pure: no internal clock. */
  sampleAt(seconds: number): CinematicFrame;
  /** Every shot boundary, for timeline UI and export. */
  shotBoundaries(): readonly { readonly shotId: string; readonly start: number; readonly end: number }[];
  /** A deterministic frame list for replay or export at a given rate. */
  exportPlan(fps: number): readonly { readonly frame: number; readonly time: number; readonly shotId: string }[];
  readonly totalSeconds: number;
}

export function createCinematicKit(options: CinematicKitOptions): CinematicKit {
  const shots = options.shots.length > 0
    ? options.shots
    : [{ id: "default", seconds: 1, from: [0, 1, 4] as AuraVec3, to: [0, 1, 4] as AuraVec3, target: [0, 0, 0] as AuraVec3 }];
  const boundaries: { shotId: string; start: number; end: number }[] = [];
  let cursor = 0;
  for (const shot of shots) {
    const seconds = Math.max(0.01, shot.seconds);
    boundaries.push({ shotId: shot.id, start: cursor, end: cursor + seconds });
    cursor += seconds;
  }
  const totalSeconds = cursor;
  const fov = options.fov ?? 40;

  const capabilities: KitCapabilityReport = {
    kind: "aura-application-kit-capabilities",
    kit: "cinematic",
    supported: [
      "camera paths", "shot sequencing", "timing", "animation coordination",
      "transitions", "deterministic export/replay plan"
    ],
    unsupported: [
      {
        capability: "video encoding",
        reason: "the kit produces a deterministic frame plan; encoding belongs to the frame-encoder surface, which already owns it"
      }
    ]
  };

  return {
    kind: "aura-cinematic-kit",
    capabilities,
    totalSeconds,
    sampleAt(seconds) {
      // Sequence loops, so a sample past the end is a valid frame rather than an error.
      const time = totalSeconds > 0 ? ((seconds % totalSeconds) + totalSeconds) % totalSeconds : 0;
      let index = boundaries.findIndex((boundary) => time >= boundary.start && time < boundary.end);
      if (index === -1) index = boundaries.length - 1;
      const boundary = boundaries[index]!;
      const shot = shots[index]!;
      const span = Math.max(1e-6, boundary.end - boundary.start);
      const raw = (time - boundary.start) / span;
      const progress = Math.min(1, Math.max(0, raw));
      // Easing is applied to the path parameter, not to time, so shot durations stay exact.
      const eased = shot.transition === "cut"
        ? 1
        : shot.transition === "linear"
          ? progress
          : progress * progress * (3 - 2 * progress);
      const position: AuraVec3 = [
        shot.from[0] + (shot.to[0] - shot.from[0]) * eased,
        shot.from[1] + (shot.to[1] - shot.from[1]) * eased,
        shot.from[2] + (shot.to[2] - shot.from[2]) * eased
      ];
      return {
        kind: "aura-cinematic-frame",
        time: Number(time.toFixed(6)),
        shotId: shot.id,
        shotIndex: index,
        shotProgress: Number(progress.toFixed(6)),
        camera: { mode: "perspective", position, target: shot.target, fov } as AuraCameraSpec,
        activeClip: shot.clip,
        // A cut resolves instantly; an eased or linear move is transitioning until it lands.
        transitioning: shot.transition !== "cut" && progress < 1,
        totalSeconds
      };
    },
    shotBoundaries() {
      return boundaries.map((boundary) => ({ ...boundary }));
    },
    exportPlan(fps) {
      const rate = Math.max(1, Math.floor(fps));
      const frames = Math.max(1, Math.round(totalSeconds * rate));
      return Array.from({ length: frames }, (_, frame) => {
        const time = frame / rate;
        const boundary = boundaries.find((entry) => time >= entry.start && time < entry.end) ?? boundaries[boundaries.length - 1]!;
        return { frame, time: Number(time.toFixed(6)), shotId: boundary.shotId };
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Camera spec from a focus intent, so kits return something a scene can consume directly. */
function cameraSpecFromIntent(intent: { position: AuraVec3; target: AuraVec3; fov: number }): AuraCameraSpec {
  return { mode: "perspective", position: intent.position, target: intent.target, fov: intent.fov } as AuraCameraSpec;
}

/** A region's own size, or a readable fraction of the subject when the region is a point. */
function sizeOrFraction(size: AuraVec3, bounds: PlacedBounds): AuraVec3 {
  return [
    size[0] > 0 ? size[0] : bounds.size[0] * 0.3,
    size[1] > 0 ? size[1] : bounds.size[1] * 0.3,
    size[2] > 0 ? size[2] : bounds.size[2] * 0.3
  ];
}

function combinedCentre(points: readonly AuraVec3[]): AuraVec3 {
  if (points.length === 0) return [0, 0, 0];
  const sum = points.reduce<[number, number, number]>(
    (total, point) => [total[0] + point[0], total[1] + point[1], total[2] + point[2]],
    [0, 0, 0]
  );
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

function floorCount(spaces: readonly ArchitectureSpace[]): number {
  return new Set(spaces.map((space) => space.floor)).size;
}
