import type { WebXRControllerSample, WebXRDepthSample, WebXRFrameSample, WebXRJointSample, WebXRLightSample, WebXRPlaneSample } from "@aura3d/input";
import type { AuraXRRuntime } from "./types.js";

/** A visual can be an Aura3D runtime node handle, or an adapter around another scene object. */
export interface AuraXRVisual {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation?(x: number, y: number, z: number): unknown;
  setScale?(scale: number): unknown;
  setVisible(visible: boolean): unknown;
  dispose?(): void;
}
export interface AuraXRSceneHelperOptions {
  readonly createController?: (controller: WebXRControllerSample) => AuraXRVisual;
  readonly createJoint?: (handId: number, jointName: string, joint: WebXRJointSample) => AuraXRVisual;
  /** Receives current tracked planes, including stable ids, poses and polygons in plane space. */
  readonly onPlanes?: (planes: readonly WebXRPlaneSample[]) => void;
  /** Depth buffers/textures are valid only according to the native frame's lifetime. */
  readonly onDepth?: (depth: readonly WebXRDepthSample[]) => void;
  readonly onLight?: (light: WebXRLightSample | null) => void;
}
export interface AuraXRSceneHelpers {
  update(sample: WebXRFrameSample): void;
  clear(): void;
  dispose(): void;
}

/**
 * Binds optional user-provided controller and hand visuals to native poses.
 * Visuals are created once per source/joint and disposed when it disappears.
 * Plane, depth and light adapters receive current frame data without claiming
 * hardware support when an injected session was used.
 */
export function createXRSceneHelpers(options: AuraXRSceneHelperOptions = {}): AuraXRSceneHelpers {
  const controllers = new Map<number, AuraXRVisual>();
  const joints = new Map<string, AuraXRVisual>();
  let disposed = false;
  let revision = 0;
  const clear = (): void => {
    ++revision;
    const visuals = [...controllers.values(), ...joints.values()];
    controllers.clear();
    joints.clear();
    for (const visual of visuals) {
      visual.setVisible(false);
      visual.dispose?.();
    }
    options.onPlanes?.([]);
    options.onDepth?.([]);
    options.onLight?.(null);
  };
  return {
    update(sample) {
      if (disposed) return;
      const updateRevision = revision;
      const current = (): boolean => !disposed && updateRevision === revision;
      const controllerIds = new Set<number>();
      if (options.createController) for (const controller of sample.controllers) {
        controllerIds.add(controller.id);
        let visual = controllers.get(controller.id);
        if (!visual) {
          visual = options.createController(controller);
          // A reset can occur inside the factory, before the visual is owned.
          if (!current()) { visual.setVisible(false); visual.dispose?.(); return; }
          controllers.set(controller.id, visual);
        }
        const matrix = controller.gripMatrix ?? controller.targetRayMatrix;
        if (matrix) {
          visual.setPosition(matrix[12]!, matrix[13]!, matrix[14]!);
          if (!current()) return;
          const q = quaternionFromMatrix(matrix);
          const euler = quaternionToEuler(q);
          visual.setRotation?.(...euler);
          if (!current()) return;
        }
        visual.setVisible(matrix !== null);
        if (!current()) return;
      }
      if (!removeMissing(controllers, controllerIds, current)) return;
      const jointIds = new Set<string>();
      if (options.createJoint) for (const hand of sample.hands) for (const [name, joint] of Object.entries(hand.joints)) {
        const key = `${hand.id}:${name}`;
        jointIds.add(key);
        let visual = joints.get(key);
        if (!visual) {
          visual = options.createJoint(hand.id, name, joint);
          if (!current()) { visual.setVisible(false); visual.dispose?.(); return; }
          joints.set(key, visual);
        }
        if (joint.position) visual.setPosition(...joint.position);
        if (!current()) return;
        if (joint.orientation) visual.setRotation?.(...quaternionToEuler(joint.orientation));
        if (!current()) return;
        if (joint.radius > 0) visual.setScale?.(joint.radius);
        if (!current()) return;
        visual.setVisible(hand.tracked && joint.position !== null);
        if (!current()) return;
      }
      if (!removeMissing(joints, jointIds, current)) return;
      options.onPlanes?.(sample.planes);
      if (!current()) return;
      options.onDepth?.(sample.depth);
      if (!current()) return;
      options.onLight?.(sample.light);
    },
    clear,
    dispose() { if (!disposed) { disposed = true; clear(); } }
  };
}

/** Clear old-space visuals on reset; a subsequent frame recreates tracked visuals. */
export function attachXRSceneHelpers(runtime: AuraXRRuntime, options: AuraXRSceneHelperOptions = {}): AuraXRSceneHelpers {
  const helpers = createXRSceneHelpers(options);
  const offFrame = runtime.on("frame", ({ sample }) => helpers.update(sample));
  const offEnd = runtime.on("sessionend", () => helpers.clear());
  const offReset = runtime.on("reset", () => helpers.clear());
  return {
    update: (sample) => helpers.update(sample),
    clear: () => helpers.clear(),
    dispose() { offFrame(); offEnd(); offReset(); helpers.dispose(); }
  };
}

function removeMissing<K>(visuals: Map<K, AuraXRVisual>, active: ReadonlySet<K>, current: () => boolean): boolean {
  for (const [key, visual] of visuals) if (!active.has(key)) {
    visuals.delete(key);
    visual.setVisible(false);
    visual.dispose?.();
    if (!current()) return false;
  }
  return true;
}
function quaternionFromMatrix(m: readonly number[]): readonly [number, number, number, number] {
  const trace = m[0]! + m[5]! + m[10]!;
  let x: number; let y: number; let z: number; let w: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = s / 4; x = (m[6]! - m[9]!) / s; y = (m[8]! - m[2]!) / s; z = (m[1]! - m[4]!) / s;
  } else if (m[0]! > m[5]! && m[0]! > m[10]!) {
    const s = Math.sqrt(1 + m[0]! - m[5]! - m[10]!) * 2;
    w = (m[6]! - m[9]!) / s; x = s / 4; y = (m[4]! + m[1]!) / s; z = (m[8]! + m[2]!) / s;
  } else if (m[5]! > m[10]!) {
    const s = Math.sqrt(1 + m[5]! - m[0]! - m[10]!) * 2;
    w = (m[8]! - m[2]!) / s; x = (m[4]! + m[1]!) / s; y = s / 4; z = (m[9]! + m[6]!) / s;
  } else {
    const s = Math.sqrt(1 + m[10]! - m[0]! - m[5]!) * 2;
    w = (m[1]! - m[4]!) / s; x = (m[8]! + m[2]!) / s; y = (m[9]! + m[6]!) / s; z = s / 4;
  }
  return [x, y, z, w];
}
function quaternionToEuler(q: readonly [number, number, number, number]): readonly [number, number, number] {
  const [x, y, z, w] = q;
  const sinY = Math.max(-1, Math.min(1, 2 * (w * y + z * x)));
  return [Math.atan2(2 * (w * x - y * z), 1 - 2 * (x * x + y * y)), Math.asin(sinY), Math.atan2(2 * (w * z - x * y), 1 - 2 * (y * y + z * z))];
}
