/**
 * Reusable object focus and selection feedback.
 *
 * ## The defect this replaces
 *
 * The product configurator built its focus indicator by hand:
 *
 * ```ts
 * primitives.torus({ ... }).position(...p).rotate(1.5708, 0, 0).scale([1.22, 0.08, 0.78])
 * ```
 *
 * Aura3D's torus primitive is generated in local XY -- the ring lies in the XY
 * plane with its tube thin on **Z** (`createTorusGeometry` sweeps `cos u, sin u`
 * into X/Y and puts the tube's `sin v` on Z). Scaling `[1.22, 0.08, 0.78]`
 * therefore squashes the ring's own **Y radius** to 8%, turning the circle into a
 * flat horizontal sliver. The subsequent `rotate(pi/2, 0, 0)` tips that sliver
 * into the ground plane, and it renders as the "random yellow/white bar" the
 * user reported. A working ring in the same codebase uses `[0.72, 0.72, 0.028]`
 * -- equal X/Y radii, thin on Z -- which is why the two looked unrelated.
 *
 * Changing those three constants would have fixed one route and left the trap in
 * place for every other. The real defects are: primitive local axes were not
 * documented, and no reusable focus feedback existed, so every route invented
 * its own indicator geometry.
 *
 * This module removes the need to know the torus axis convention at all. A route
 * states intent -- focus this target, with a ring and a callout -- and gets
 * correct indicator geometry for any target size, orientation, or nonuniform
 * scale.
 *
 * Pure and dependency-free: it returns scene-node JSON and camera intent, so it
 * is unit-testable without a renderer and reusable by any route or kit.
 */

import type { AuraColor, AuraLabelNode, AuraPrimitiveNode, AuraSceneNode, AuraVec3 } from "./index.js";
import {
  containsPoint,
  distanceOutsideBounds,
  placedBounds,
  resolveSemanticRegion,
  type PlacedBounds,
  type SemanticRegion
} from "./SpatialAnchoring.js";

/**
 * Local-axis conventions for Aura3D primitives.
 *
 * Published so a route that must build custom geometry can do so correctly, and
 * so the reason for the configurator defect is discoverable rather than folklore.
 */
export const AURA_PRIMITIVE_AXES = {
  /**
   * A torus is a ring in the local XY plane. Its major radius spans X and Y
   * equally; its tube thickness lies on Z. To thin a ring, scale **Z**. Scaling
   * Y collapses the ring into a bar.
   */
  torus: { ringPlane: "xy", tubeAxis: "z", thinAxis: "z" },
  /** A cylinder's height runs along Y; its circular cross-section spans X and Z. */
  cylinder: { heightAxis: "y", crossSection: "xz", thinAxis: "y" },
  /** A plane lies in XZ with its normal on Y. */
  plane: { plane: "xz", normalAxis: "y", thinAxis: "y" },
  /** Boxes, spheres and capsules are axis-symmetric about their own extents. */
  box: { thinAxis: undefined },
  sphere: { thinAxis: undefined },
  capsule: { heightAxis: "y", thinAxis: undefined }
} as const;

/** Visual treatments a focus indicator can apply. */
export type FocusIndicator =
  | "ring"
  | "halo"
  | "bounding-box"
  | "outline"
  | "emissive-highlight";

export interface FocusTargetBounds {
  /** World position of the target's centre. */
  readonly center: AuraVec3;
  /** World-space extents of the target. */
  readonly size: AuraVec3;
  /**
   * Euler rotation of the target, radians. Indicator geometry inherits it so a
   * rotated part gets a rotated indicator rather than an axis-aligned one.
   */
  readonly rotation?: AuraVec3 | undefined;
}

export interface FocusTarget extends FocusTargetBounds {
  readonly id: string;
  /** Human-readable name used for the callout and accessibility text. */
  readonly label?: string | undefined;
}

export interface FocusOptions {
  /** Indicators to draw. Defaults to a ring plus a callout label. */
  readonly indicators?: readonly FocusIndicator[] | undefined;
  readonly color?: AuraColor | undefined;
  /** Draw a callout label anchored to the target. Defaults to true. */
  readonly callout?: boolean | undefined;
  /** Text for the callout. Defaults to the target's label. */
  readonly calloutText?: string | undefined;
  /** Draw a leader line from the callout to the target. Defaults to true. */
  readonly leaderLine?: boolean | undefined;
  /** Dim non-focused geometry. Reported as intent; the route applies it. */
  readonly dimOthers?: boolean | undefined;
  /** Move the camera to frame the target. Defaults to true. */
  readonly cameraFocus?: boolean | undefined;
  /**
   * Extra clearance between the indicator and the target surface, as a fraction
   * of the target's largest extent. Defaults to 0.12 so a ring reads as
   * surrounding the part rather than intersecting it.
   */
  readonly clearance?: number | undefined;
  /** Node-name prefix, so indicator nodes are identifiable in evidence. */
  readonly namePrefix?: string | undefined;
  /**
   * Viewport aspect ratio, used only to size camera framing distance. Defaults
   * to 16/9.
   */
  readonly aspect?: number | undefined;
  /** Mobile viewports need a wider frame; defaults to false. */
  readonly compactViewport?: boolean | undefined;
}

export interface FocusCameraIntent {
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly fov: number;
  /** True when the target's bounds fit inside the frustum at this distance. */
  readonly containsTarget: boolean;
}

export interface FocusResult {
  readonly kind: "aura-focus-result";
  readonly targetId: string;
  /** Indicator geometry and labels to add to the scene. */
  readonly nodes: readonly AuraSceneNode[];
  readonly camera: FocusCameraIntent | undefined;
  /** Set when `dimOthers` was requested, so the route can lower other materials. */
  readonly dimOthers: boolean;
  /** Machine-checkable statement that indicators surround their target. */
  readonly invariants: FocusInvariantReport;
  /** Screen-reader text describing the current selection. */
  readonly accessibilityLabel: string;
}

export interface FocusInvariantReport {
  readonly schema: "aura3d-focus-invariants/1.0";
  readonly checks: readonly {
    readonly id: string;
    readonly description: string;
    readonly passes: boolean;
    readonly detail: string;
  }[];
  readonly passes: boolean;
}

const DEFAULT_INDICATORS: readonly FocusIndicator[] = ["ring"];

/**
 * Build focus feedback for a target.
 *
 * The ring is sized from the target's own extents and thinned on **Z**, the
 * torus tube axis, then rotated to lie in the horizontal plane. Because the
 * radius is uniform in the ring's own plane it stays a ring for any target
 * aspect ratio -- which is what the flattened-bar defect got wrong.
 */
export function focusObject(target: FocusTarget, options: FocusOptions = {}): FocusResult {
  const indicators = options.indicators ?? DEFAULT_INDICATORS;
  const color = options.color ?? "#fde68a";
  const prefix = options.namePrefix ?? `focus ${target.id}`;
  const size = normalizeSize(target.size);
  const maxExtent = Math.max(size[0], size[1], size[2]);
  const clearance = Math.max(0, options.clearance ?? 0.12);
  const rotation = target.rotation ?? [0, 0, 0];

  const nodes: AuraSceneNode[] = [];

  // Horizontal radius that encloses the target's footprint, plus clearance.
  const footprintRadius = Math.sqrt(size[0] * size[0] + size[2] * size[2]) / 2;
  const ringRadius = footprintRadius * (1 + clearance);

  if (indicators.includes("ring")) {
    nodes.push(focusRingNode({
      name: `${prefix} selection ring`,
      center: target.center,
      radius: ringRadius,
      // The ring sits at the target's vertical centre so it reads as encircling
      // the part rather than sitting under it.
      color,
      rotation,
      // Tube thickness is a fraction of the ring's own radius, not of the
      // target's largest extent. Using the largest extent made the tube thicker
      // than the radius for tall thin targets (an antenna produced a disc).
      tubeScale: ringTubeScale(ringRadius)
    }));
  }

  if (indicators.includes("halo")) {
    // A halo is a larger, softer ring in the same plane, offset above the target.
    nodes.push(focusRingNode({
      name: `${prefix} selection halo`,
      center: [target.center[0], target.center[1] + size[1] / 2 + maxExtent * 0.06, target.center[2]],
      radius: ringRadius * 1.22,
      color,
      rotation,
      tubeScale: ringTubeScale(ringRadius * 1.22) * 0.6,
      opacity: 0.42
    }));
  }

  if (indicators.includes("bounding-box")) {
    nodes.push(...focusBoundingBoxNodes(prefix, target.center, size, rotation, color, clearance));
  }

  if (indicators.includes("outline")) {
    // An outline is a thin shell slightly larger than the target, drawn as an
    // additive box so it reads as an edge highlight without hiding the part.
    nodes.push({
      kind: "primitive",
      primitive: "box",
      name: `${prefix} selection outline shell`,
      material: { color, emissive: color, emissiveIntensity: 0.5, opacity: 0.18 },
      position: target.center,
      rotation,
      scale: [size[0] * (1 + clearance * 0.5), size[1] * (1 + clearance * 0.5), size[2] * (1 + clearance * 0.5)]
    } as AuraPrimitiveNode);
  }

  if (indicators.includes("emissive-highlight")) {
    nodes.push({
      kind: "primitive",
      primitive: "sphere",
      name: `${prefix} selection emissive highlight`,
      material: { color, emissive: color, emissiveIntensity: 1.1, opacity: 0.22 },
      position: target.center,
      scale: [size[0] * 0.5, size[1] * 0.5, size[2] * 0.5]
    } as AuraPrimitiveNode);
  }

  // Callout label, anchored outside the target so it never sits inside geometry.
  const wantsCallout = options.callout ?? true;
  const calloutText = options.calloutText ?? target.label ?? target.id;
  let calloutPosition: AuraVec3 | undefined;
  if (wantsCallout) {
    calloutPosition = [
      target.center[0] + ringRadius + maxExtent * 0.18,
      target.center[1] + size[1] * 0.5 + maxExtent * 0.14,
      target.center[2]
    ];
    nodes.push({
      kind: "label",
      label: "callout",
      name: `${prefix} callout`,
      text: calloutText,
      target: target.label ?? target.id,
      position: calloutPosition,
      color: "#f8fafc",
      background: "#111827",
      size: Math.max(0.12, maxExtent * 0.22),
      leader: options.leaderLine ?? true,
      // The label is anchored to a world point and projected each frame by the
      // label renderer, so it stays attached while the camera moves.
      anchorWorldPosition: target.center,
      collisionAvoidance: true,
      occlusionAware: true
    } as unknown as AuraLabelNode);
  }

  const camera = (options.cameraFocus ?? true)
    ? focusCameraIntent(target.center, size, {
        aspect: options.aspect ?? 16 / 9,
        compactViewport: options.compactViewport ?? false
      })
    : undefined;

  const invariants = checkFocusInvariants({
    target,
    size,
    ringRadius,
    nodes,
    calloutPosition,
    camera
  });

  return {
    kind: "aura-focus-result",
    targetId: target.id,
    nodes,
    camera,
    dimOthers: options.dimOthers ?? false,
    invariants,
    accessibilityLabel: `${calloutText} selected${camera ? ", camera focused" : ""}`
  };
}

/**
 * Focus a named region of a subject rather than a standalone object.
 *
 * This is how a configurator focuses "the earcups" without knowing where the
 * earcups are in world space: the region is normalized to the subject's bounds,
 * so it follows the asset.
 */
export function focusSemanticRegion(
  subject: PlacedBounds,
  region: SemanticRegion,
  options: FocusOptions = {}
): FocusResult {
  const resolved = resolveSemanticRegion(subject, region);
  return focusObject({
    id: resolved.id,
    label: resolved.label ?? resolved.id,
    center: resolved.center,
    // A point region would produce a zero-radius ring. Fall back to a readable
    // fraction of the subject so `extent`-less regions still get usable feedback.
    size: [
      resolved.size[0] > 0 ? resolved.size[0] : subject.size[0] * 0.3,
      resolved.size[1] > 0 ? resolved.size[1] : subject.size[1] * 0.3,
      resolved.size[2] > 0 ? resolved.size[2] : subject.size[2] * 0.3
    ]
  }, options);
}

/** Empty focus state: no indicators, no camera change, reset accessibility text. */
export function clearFocus(): FocusResult {
  return {
    kind: "aura-focus-result",
    targetId: "",
    nodes: [],
    camera: undefined,
    dimOthers: false,
    invariants: { schema: "aura3d-focus-invariants/1.0", checks: [], passes: true },
    accessibilityLabel: "no selection"
  };
}

/**
 * Camera pose that frames a target's bounds.
 *
 * Distance is derived from the vertical and horizontal half-angles so the whole
 * target fits regardless of viewport aspect. A compact (mobile) viewport pulls
 * back further because UI chrome takes vertical space.
 */
export function focusCameraIntent(
  center: AuraVec3,
  size: AuraVec3,
  options: { readonly aspect?: number | undefined; readonly compactViewport?: boolean | undefined; readonly fov?: number | undefined } = {}
): FocusCameraIntent {
  const fov = options.fov ?? 38;
  const aspect = Math.max(0.2, options.aspect ?? 16 / 9);
  const normalized = normalizeSize(size);
  const halfHeight = normalized[1] / 2;
  const halfWidth = Math.max(normalized[0], normalized[2]) / 2;
  const vFov = (fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distanceForHeight = halfHeight / Math.tan(vFov / 2);
  const distanceForWidth = halfWidth / Math.tan(hFov / 2);
  // Distance must also clear the target's bounding sphere against the narrower
  // frustum half-angle. Sizing only from the axis-aligned half-extents framed a
  // cube's faces but clipped its corners, so `containsTarget` was false for
  // ordinary targets and the invariant reported a failure with no visible cause.
  const boundingRadius = Math.sqrt(normalized[0] ** 2 + normalized[1] ** 2 + normalized[2] ** 2) / 2;
  const narrowHalfAngle = Math.min(vFov, hFov) / 2;
  const distanceForSphere = boundingRadius / Math.max(1e-6, Math.sin(narrowHalfAngle));
  const margin = options.compactViewport === true ? 2.1 : 1.6;
  const distance = Math.max(distanceForHeight, distanceForWidth, distanceForSphere) * margin;
  // Approach from the front and slightly above: a three-quarter view reads the
  // target's form without looking straight down on it.
  const position: AuraVec3 = [
    center[0] + distance * 0.42,
    center[1] + distance * 0.34,
    center[2] + distance * 0.84
  ];
  const eyeDistance = Math.sqrt(
    (position[0] - center[0]) ** 2 + (position[1] - center[1]) ** 2 + (position[2] - center[2]) ** 2
  );
  // The target fits when its bounding sphere is inside both frustum half-angles.
  const containsTarget = eyeDistance * Math.sin(narrowHalfAngle) >= boundingRadius;
  return { position, target: center, fov, containsTarget };
}

/**
 * Ring geometry that is correct for any target proportions.
 *
 * Radius is applied uniformly in the torus's own ring plane (X and Y) and the
 * tube is thinned on Z, its documented thin axis. The node is then rotated so
 * the ring lies horizontally around the target. Compare with the defect, which
 * thinned Y -- inside the ring plane -- and produced a bar.
 */
function focusRingNode(options: {
  readonly name: string;
  readonly center: AuraVec3;
  readonly radius: number;
  readonly color: AuraColor;
  readonly rotation: AuraVec3;
  readonly tubeScale: number;
  readonly opacity?: number | undefined;
}): AuraPrimitiveNode {
  const radius = Math.max(1e-4, options.radius);
  return {
    kind: "primitive",
    primitive: "torus",
    name: options.name,
    material: {
      color: options.color,
      emissive: options.color,
      emissiveIntensity: 0.72,
      opacity: options.opacity ?? 0.72
    },
    position: options.center,
    // Tip the ring plane (local XY) into the world XZ plane, then apply the
    // target's own yaw so a rotated part gets an aligned ring.
    rotation: [Math.PI / 2 + options.rotation[0], options.rotation[1], options.rotation[2]],
    // X and Y carry the ring radius; Z carries tube thickness.
    scale: [radius, radius, Math.max(1e-4, options.tubeScale)]
  } as AuraPrimitiveNode;
}

/** Twelve thin bars forming a wireframe box around the target. */
function focusBoundingBoxNodes(
  prefix: string,
  center: AuraVec3,
  size: AuraVec3,
  rotation: AuraVec3,
  color: AuraColor,
  clearance: number
): readonly AuraSceneNode[] {
  const half: AuraVec3 = [
    (size[0] * (1 + clearance)) / 2,
    (size[1] * (1 + clearance)) / 2,
    (size[2] * (1 + clearance)) / 2
  ];
  const thickness = Math.max(0.004, Math.max(size[0], size[1], size[2]) * 0.012);
  const material = { color, emissive: color, emissiveIntensity: 0.8, opacity: 0.85 };
  const bars: AuraSceneNode[] = [];
  const signs = [-1, 1] as const;
  // Edges along X.
  for (const y of signs) {
    for (const z of signs) {
      bars.push({
        kind: "primitive",
        primitive: "box",
        name: `${prefix} bounds edge x ${y > 0 ? "top" : "bottom"} ${z > 0 ? "front" : "rear"}`,
        material,
        position: [center[0], center[1] + half[1] * y, center[2] + half[2] * z],
        rotation,
        scale: [half[0] * 2, thickness, thickness]
      } as AuraPrimitiveNode);
    }
  }
  // Edges along Y.
  for (const x of signs) {
    for (const z of signs) {
      bars.push({
        kind: "primitive",
        primitive: "box",
        name: `${prefix} bounds edge y ${x > 0 ? "right" : "left"} ${z > 0 ? "front" : "rear"}`,
        material,
        position: [center[0] + half[0] * x, center[1], center[2] + half[2] * z],
        rotation,
        scale: [thickness, half[1] * 2, thickness]
      } as AuraPrimitiveNode);
    }
  }
  // Edges along Z.
  for (const x of signs) {
    for (const y of signs) {
      bars.push({
        kind: "primitive",
        primitive: "box",
        name: `${prefix} bounds edge z ${x > 0 ? "right" : "left"} ${y > 0 ? "top" : "bottom"}`,
        material,
        position: [center[0] + half[0] * x, center[1] + half[1] * y, center[2]],
        rotation,
        scale: [thickness, thickness, half[2] * 2]
      } as AuraPrimitiveNode);
    }
  }
  return bars;
}

/**
 * Assert that focus feedback is actually correct.
 *
 * These are the checks a pixel metric cannot make: that the indicator encloses
 * the target rather than intersecting or missing it, that it is not degenerate
 * in any axis (the bar defect), that the callout sits outside the target, and
 * that the camera frames the selection.
 */
function checkFocusInvariants(input: {
  readonly target: FocusTarget;
  readonly size: AuraVec3;
  readonly ringRadius: number;
  readonly nodes: readonly AuraSceneNode[];
  readonly calloutPosition: AuraVec3 | undefined;
  readonly camera: FocusCameraIntent | undefined;
}): FocusInvariantReport {
  const checks: { id: string; description: string; passes: boolean; detail: string }[] = [];
  const footprintRadius = Math.sqrt(input.size[0] ** 2 + input.size[2] ** 2) / 2;

  const ring = input.nodes.find(
    (node): node is AuraPrimitiveNode => node.kind === "primitive" && node.primitive === "torus" && (node.name ?? "").includes("selection ring")
  );
  if (ring) {
    const scale = toVec3Scale(ring.scale);
    // The two ring-plane axes must be equal, or the ring is an ellipse/bar.
    const ratio = scale[0] > 0 && scale[1] > 0 ? Math.min(scale[0], scale[1]) / Math.max(scale[0], scale[1]) : 0;
    checks.push({
      id: "ring-not-flattened",
      description: "selection ring radius is uniform in the torus ring plane (local X and Y), so it cannot collapse into a bar",
      passes: ratio > 0.999,
      detail: `ring-plane scale ratio ${round(ratio)} for scale [${scale.map(round).join(", ")}]`
    });
    checks.push({
      id: "ring-thin-axis-is-tube-axis",
      description: "selection ring is thinned on Z, the torus tube axis",
      passes: scale[2] < scale[0] && scale[2] < scale[1],
      detail: `z scale ${round(scale[2])} vs ring radius ${round(scale[0])}`
    });
    checks.push({
      id: "ring-surrounds-target",
      description: "selection ring radius exceeds the target footprint radius",
      passes: input.ringRadius >= footprintRadius,
      detail: `ring radius ${round(input.ringRadius)} vs target footprint radius ${round(footprintRadius)}`
    });
    const degenerate = scale.some((value) => !(value > 0) || !Number.isFinite(value));
    checks.push({
      id: "no-degenerate-indicator-scale",
      description: "no indicator axis is zero, negative or non-finite",
      passes: !degenerate,
      detail: degenerate ? `degenerate scale [${scale.join(", ")}]` : "all axes positive and finite"
    });
  }

  if (input.calloutPosition) {
    const bounds = placedBounds({
      position: [input.target.center[0], input.target.center[1] - input.size[1] / 2, input.target.center[2]],
      size: input.size,
      floorY: input.target.center[1] - input.size[1] / 2
    });
    const outside = !containsPoint(bounds, input.calloutPosition);
    checks.push({
      id: "callout-outside-target",
      description: "callout label is anchored outside the target bounds so it is not hidden inside geometry",
      passes: outside,
      detail: outside
        ? `callout ${round(distanceOutsideBounds(bounds, input.calloutPosition))} units outside bounds`
        : "callout sits inside the target bounds"
    });
  }

  if (input.camera) {
    checks.push({
      id: "camera-contains-target",
      description: "focus camera frames the whole target",
      passes: input.camera.containsTarget,
      detail: input.camera.containsTarget ? "target bounding sphere inside frustum" : "target does not fit at the computed distance"
    });
  }

  return {
    schema: "aura3d-focus-invariants/1.0",
    checks,
    passes: checks.every((check) => check.passes)
  };
}

/**
 * Tube thickness for a focus ring of a given radius.
 *
 * Proportional to the radius so the ring reads as a ring at any scale, with a
 * floor so a ring around a tiny part is still visible on screen.
 */
function ringTubeScale(radius: number): number {
  return Math.max(0.004, radius * 0.09);
}

function normalizeSize(size: AuraVec3): AuraVec3 {
  return [
    Math.max(1e-6, Math.abs(size[0])),
    Math.max(1e-6, Math.abs(size[1])),
    Math.max(1e-6, Math.abs(size[2]))
  ];
}

function toVec3Scale(scale: number | AuraVec3 | undefined): [number, number, number] {
  if (scale === undefined) return [1, 1, 1];
  if (typeof scale === "number") return [scale, scale, scale];
  return [scale[0], scale[1], scale[2]];
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
