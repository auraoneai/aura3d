export type AuraClashArenaStageLayer =
  | "typed-asset"
  | "platform"
  | "backdrop"
  | "lighting"
  | "atmosphere";

export interface AuraClashArenaStageElement {
  readonly id: string;
  readonly label: string;
  readonly renderLabel: string;
  readonly layer: AuraClashArenaStageLayer;
  readonly toggleGroup: "backdrop" | "motion" | "particles" | "reflections" | null;
  readonly evidenceKey: string;
  readonly implementation: "production-runtime-render-item";
}

export interface AuraClashArenaStageEvidence {
  readonly schemaVersion: "aura-clash-arena-stage/v2";
  readonly rendererOwner: "production-runtime";
  readonly domSceneElementCount: 0;
  readonly elementCount: number;
  readonly namedElementCount: number;
  readonly togglableElementCount: number;
  readonly missingElementIds: readonly string[];
  readonly evidenceBacked: boolean;
  /** Whether `evidenceBacked` was decided by observed render items or is merely declared. */
  readonly evidenceSource: "declared-only" | "observed-render-items";
  readonly observedRenderLabelCount: number;
  readonly elements: readonly AuraClashArenaStageElement[];
  readonly toggleGroups: readonly string[];
}

const element = (
  id: string,
  label: string,
  renderLabel: string,
  layer: AuraClashArenaStageLayer,
  toggleGroup: AuraClashArenaStageElement["toggleGroup"]
): AuraClashArenaStageElement => ({
  id,
  label,
  renderLabel,
  layer,
  toggleGroup,
  evidenceKey: `renderedStage.${id}`,
  implementation: "production-runtime-render-item"
});

/**
 * Declared stage elements, each bound to the render label *prefix* its geometry emits.
 *
 * `renderLabel` is matched as a prefix because indexed families emit
 * `practical-post-0..3` and `atmospheric-mote-0..7` rather than one label. Before defect 48
 * these were declared as `portal-segments` / `atmospheric-motes` / `side-banners` /
 * `light-pillars`, which matched *nothing* emitted -- and the mismatch was invisible because
 * `evidenceBacked` compared this list against another hardcoded list instead of against real
 * render items.
 *
 * The former `side-banners` / `light-pillars` / `portal-segments` elements are gone rather than
 * renamed: they were unlit slabs and a ring of loose bars authored against an empty void, and once
 * the typed textured arena rendered behind them they read as debris over real architecture. The
 * replacements are grounded stage practicals and the lane-boundary markers, which is furniture a
 * generic city block genuinely cannot supply.
 */
export const auraClashArenaStageElements: readonly AuraClashArenaStageElement[] = [
  element("combat-floor", "rendered combat floor", "combat-floor", "platform", null),
  element("stage-riser", "rendered stage riser under the fight plane", "stage-riser", "platform", null),
  element("arena-rims", "rendered arena rim lights", "front-rim", "lighting", "reflections"),
  element("center-line", "rendered center-line marker", "center-line", "platform", null),
  element("lane-markers", "rendered lane-boundary markers at the fighter clamp", "lane-marker-", "platform", null),
  element("stage-practicals", "rendered grounded stage-light practicals", "practical-post-", "lighting", "backdrop"),
  element("practical-motion", "rendered practical brightness pulse", "practical-glow-", "lighting", "motion"),
  element("typed-arena-environment", "typed Neon Downtown arena environment", "aura-clash-arena-architecture", "typed-asset", "backdrop"),
  element("atmospheric-motes", "rendered atmospheric motes", "atmospheric-mote-", "atmosphere", "particles"),
  element("floor-sheen", "rendered floor sheen", "floor-sheen", "platform", "reflections"),
  // AC-A3/AC-A5 additions. Both always submit geometry (reduced motion freezes motion, it never
  // removes the items), so declared elements stay evidence-backed on observed frames.
  element("rooftop-crowd", "instanced rooftop crowd silhouettes (one instanced pool)", "crowd-fan-pool", "backdrop", null),
  element("hanging-signs", "spring-joint hanging neon signs outside the combat lane", "hanging-sign-", "backdrop", null)
];

export function annotateAuraClashArenaStage(root: ParentNode): void {
  const canvas = root.querySelector<HTMLElement>("#aura-clash-arena-canvas");
  if (!canvas) return;
  canvas.dataset.stageElement = "production-runtime-stage";
  canvas.dataset.stageLayer = "renderer";
  canvas.dataset.stageEvidence = "renderedStage.productionRuntimeCanvas";
}

/**
 * Build stage evidence from the render labels a frame actually emitted.
 *
 * Defect 48: this previously computed `missingElementIds` by comparing
 * `auraClashArenaStageElements` against `auraClashRenderedStageLabels` -- two hardcoded lists in
 * the same source tree. A declared element with **zero geometry** therefore reported
 * `evidenceBacked: true`, which is precisely the "source-authored boolean substitutes for
 * rendered proof" pattern this repo forbids. Five of ten declared labels were in that state.
 *
 * `observedRenderLabels` must come from a real `collectRenderItems()` result, so an element can
 * only be evidence-backed if geometry carrying its label prefix was submitted to the renderer.
 */
export function collectAuraClashArenaStageEvidence(
  _root: ParentNode,
  observedRenderLabels?: readonly string[]
): AuraClashArenaStageEvidence {
  const observed = observedRenderLabels === undefined ? undefined : normalizeStageLabels(observedRenderLabels);
  // With no observed frame nothing is proven, so every element is missing.
  const missingElementIds = observed === undefined
    ? auraClashArenaStageElements.map((entry) => entry.id)
    : auraClashArenaStageElements
      .filter((entry) => !hasObservedLabel(observed, entry.renderLabel))
      .map((entry) => entry.id);
  const toggleGroups = Array.from(new Set(auraClashArenaStageElements.flatMap((entry) => entry.toggleGroup ? [entry.toggleGroup] : []))).sort();
  return {
    schemaVersion: "aura-clash-arena-stage/v2",
    rendererOwner: "production-runtime",
    domSceneElementCount: 0,
    elementCount: auraClashArenaStageElements.length,
    namedElementCount: auraClashArenaStageElements.length,
    togglableElementCount: auraClashArenaStageElements.filter((entry) => entry.toggleGroup !== null).length,
    missingElementIds,
    // Unproven until a frame is observed. An evidence record built without render labels reports
    // `false` rather than inheriting a source-authored `true`.
    evidenceBacked: observed !== undefined && missingElementIds.length === 0,
    evidenceSource: observed === undefined ? "declared-only" : "observed-render-items",
    observedRenderLabelCount: observed?.size ?? 0,
    elements: auraClashArenaStageElements,
    toggleGroups
  };
}

/** Strip the shared render-item namespace so declared prefixes can be matched directly. */
function normalizeStageLabels(labels: readonly string[]): ReadonlySet<string> {
  const prefix = "aura-clash-rendered-stage:";
  return new Set(labels.map((label) => label.startsWith(prefix) ? label.slice(prefix.length) : label));
}

function hasObservedLabel(observed: ReadonlySet<string>, renderLabel: string): boolean {
  for (const label of observed) {
    if (label === renderLabel || label.startsWith(renderLabel)) return true;
  }
  return false;
}
