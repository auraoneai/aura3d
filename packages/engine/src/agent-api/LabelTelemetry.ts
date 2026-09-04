import type { AuraLabelNode } from "./index.js";
import type { ProjectedLabel } from "./WorldLabelRenderer.js";

/**
 * Label telemetry for the three text buckets (muse3jsparity-PRD N4).
 *
 * N4 ends the DOM-vs-3D ambiguity with three buckets and three proofs:
 *
 * 1. Accessible DOM (`ui.*`) — screen-reader text, never projected. Counted
 *    from the scene as `hud` labels plus `ui.*` bindings, not from pixels.
 * 2. World-anchored screen-space labels (`labels.billboard/anchor/axisTick/
 *    callout`) — DOM boxes placed by 3D projection. Proven by
 *    `collectLabelTelemetry` below: placed-vs-offscreen counts per route,
 *    computed from the projected set, not the node set. Counting nodes is
 *    what let silently-dropped callouts stay green.
 * 3. Lit/occluded 3D text (G1 SDF) — in-world quads. Proven by
 *    `textPixelBacked`, owned by `packages/rendering/src/SdfText.ts`.
 *
 * ## CSS2D/CSS3D
 *
 * Explicit 2.1 decision (see `CSS2D_OUT_OF_SCOPE`): NO `CSS2DRenderer` /
 * `CSS3DRenderer` parity. Verified: zero `CSS2D`/`CSS3D` references exist in
 * `packages/`. Game annotation needs are covered by buckets 2 and 3; the
 * three-compat migration lab documents the manual CSS2D/3D mapping for
 * importers. Revisit only with a named customer workload.
 *
 * Pure: no DOM. Takes scene nodes plus the projected set (from
 * `AuraDiagnostics.labels`) and returns counts. The engine bridge embeds the
 * result in diagnostics; route-health enforces it per route.
 */

/** Collision-avoidance role: HUD copy never collides, ticks are dense, annotations steer. */
export type LabelTelemetryRole = "hud" | "annotation" | "tick";

export function labelTelemetryRoleFor(label: AuraLabelNode["label"]): LabelTelemetryRole {
  if (label === "hud") return "hud";
  if (label === "axis-tick") return "tick";
  return "annotation";
}

export interface LabelTelemetryByRole {
  readonly declared: number;
  readonly placed: number;
  readonly offscreen: number;
}

export interface LabelTelemetry {
  readonly kind: "aura-label-telemetry";
  /** Labels declared in the scene snapshot. */
  readonly declared: number;
  /** Labels actually placed on screen this frame (`visible === true`). */
  readonly placed: number;
  /** Labels declared but not on screen (hidden, clamped-away, behind camera, occlusion-hidden). */
  readonly offscreen: number;
  readonly behindCamera: number;
  readonly clamped: number;
  readonly occludedDimmed: number;
  readonly byRole: Readonly<Record<LabelTelemetryRole, LabelTelemetryByRole>>;
  /**
   * Fail-closed gate signal for route-health: a route that declares labels
   * but places none fails. A route with no labels passes vacuously.
   */
  readonly placesLabels: boolean;
}

/**
 * Join scene label nodes with their projected results by node id.
 *
 * Ids must match `worldLabelsFromSnapshot` exactly: `node.name`, else
 * `${node.label}-${position}` where position is 1-based in flattened snapshot
 * order. Pass nodes in that same order; a mismatched id counts the label as
 * offscreen rather than inventing a placement.
 */
export function collectLabelTelemetry(
  nodes: readonly AuraLabelNode[],
  projected: readonly ProjectedLabel[]
): LabelTelemetry {
  const byId = new Map(projected.map((label) => [label.id, label]));
  const byRole: Record<LabelTelemetryRole, LabelTelemetryByRole> = {
    hud: { declared: 0, placed: 0, offscreen: 0 },
    annotation: { declared: 0, placed: 0, offscreen: 0 },
    tick: { declared: 0, placed: 0, offscreen: 0 }
  };
  let behindCamera = 0;
  let clamped = 0;
  let occludedDimmed = 0;
  let placedCount = 0;
  nodes.forEach((node, index) => {
    const role = labelTelemetryRoleFor(node.label);
    const slot = byRole[role];
    byRole[role] = { ...slot, declared: slot.declared + 1 };
    const id = node.name ?? `${node.label}-${index + 1}`;
    const result = byId.get(id);
    const placed = result?.visible === true;
    if (placed) {
      placedCount += 1;
      byRole[role] = { ...byRole[role], placed: byRole[role].placed + 1 };
      if (result.clamped) clamped += 1;
      if (result.occluded && result.occlusionOpacity < 1) occludedDimmed += 1;
    } else {
      byRole[role] = { ...byRole[role], offscreen: byRole[role].offscreen + 1 };
      if (result?.behindCamera === true) behindCamera += 1;
    }
  });
  const declared = nodes.length;
  return {
    kind: "aura-label-telemetry",
    declared,
    placed: placedCount,
    offscreen: declared - placedCount,
    behindCamera,
    clamped,
    occludedDimmed,
    byRole,
    placesLabels: declared === 0 || placedCount > 0
  };
}

export interface LabelCollisionTuning {
  readonly role: LabelTelemetryRole;
  /** Minimum vertical gap in CSS pixels used by `resolveLabelCollisions`. */
  readonly minGapPx: number;
  /** Whether collision avoidance runs for this role at all. */
  readonly avoidanceEnabled: boolean;
  readonly note: string;
}

/**
 * Per-role collision-avoidance tuning (N4 task 2).
 *
 * HUD copy is screen-anchored and never collides; axis ticks are dense and get
 * the tightest gap; annotations keep the default gap so leaders stay readable.
 */
export function tuneLabelCollision(role: LabelTelemetryRole): LabelCollisionTuning {
  if (role === "hud") {
    return {
      role,
      minGapPx: 0,
      avoidanceEnabled: false,
      note: "HUD labels are screen-anchored; collision avoidance is disabled so copy never moves."
    };
  }
  if (role === "tick") {
    return {
      role,
      minGapPx: 2,
      avoidanceEnabled: true,
      note: "Axis ticks are dense by design; tight gap with front-to-back priority."
    };
  }
  return {
    role,
    minGapPx: 4,
    avoidanceEnabled: true,
    note: "Annotations keep the default gap so leader lines stay attached to their subject."
  };
}

export interface TextBucketSummary {
  /** Bucket 1: accessible DOM (`ui.*` bindings + `hud` labels). UI-only, never 3D proof. */
  readonly accessibleDom: number;
  /** Bucket 2: world-anchored screen-space labels placed this frame. */
  readonly worldAnchoredPlaced: number;
  /** Bucket 3: lit/occluded SDF 3D text quads submitted this frame. */
  readonly sdfTexts: number;
  readonly note: string;
}

/** Three buckets, three numbers — never merged, per the inventory rule. */
export function summarizeTextBuckets(input: {
  readonly accessibleDom: number;
  readonly worldAnchoredPlaced: number;
  readonly sdfTexts: number;
}): TextBucketSummary {
  for (const [key, value] of Object.entries(input)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Aura3D text bucket "${key}" must be a non-negative integer.`);
    }
  }
  return {
    ...input,
    note: "Accessible DOM, world-anchored labels, and SDF 3D text are separate capabilities with separate proof."
  };
}

/**
 * The explicit 2.1 decision: NO `CSS2DRenderer`/`CSS3DRenderer` parity.
 * Game annotation needs are covered by world-anchored labels + G1 SDF text;
 * the three-compat migration lab documents the manual CSS2D/3D mapping for
 * importers. Revisit only with a named customer workload.
 */
export const CSS2D_OUT_OF_SCOPE = {
  decision: "no-css2d-css3d-parity",
  renderers: ["CSS2DRenderer", "CSS3DRenderer"] as const,
  coveredBy: ["world-anchored labels", "G1 SDF text"] as const,
  importerPath: "three-compat migration lab documents the manual CSS2D/3D mapping",
  revisit: "named customer workload only"
} as const;
