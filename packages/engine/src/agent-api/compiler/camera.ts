// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraVec3, AuraModelNode, AuraPrimitiveNode, AuraCameraSpec, AuraSceneSnapshot, AuraRuntimeNodeRegistry } from "../nodes/types.js";
import { camera } from "../nodes/camera.js";
import { groups } from "../nodes/groups.js";
import { mix3 } from "./sceneMath.js";
import { model } from "../nodes/model.js";
import { primitive } from "../nodes/primitives.js";

interface RuntimeCameraTarget {
  readonly position: AuraVec3;
  readonly rotation: AuraVec3;
}

function findRuntimeCameraTarget(cameraSpec: AuraCameraSpec, runtimeNodes: AuraRuntimeNodeRegistry | undefined): RuntimeCameraTarget | undefined {
  if (cameraSpec.mode !== "follow" || !cameraSpec.targetNode || !runtimeNodes) return undefined;
  const targetNode = cameraSpec.targetNode;
  const directHandle = runtimeNodes.get(targetNode);
  // An explicitly named target remains a valid camera anchor while hidden.
  // Composition probes temporarily suppress the hero node to isolate its
  // pixels; dropping that target here would also drop target-yaw rotation and
  // move the camera between the visible and suppressed captures. Visibility
  // controls drawing, not whether the camera can follow the requested node.
  if (directHandle) return { position: directHandle.position, rotation: directHandle.rotation };
  const namedHandle = runtimeNodes.all().find((handle) =>
    handle.visible !== false && (handle.name === targetNode || handle.tags.includes(targetNode))
  );
  return namedHandle ? { position: namedHandle.position, rotation: namedHandle.rotation } : undefined;
}

function rotateVec3BySceneYaw(vector: AuraVec3, yaw: number): AuraVec3 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    vector[0] * cos + vector[2] * sin,
    vector[1],
    -vector[0] * sin + vector[2] * cos
  ];
}

function applyCameraOffset(cameraSpec: AuraCameraSpec, offset: AuraVec3, target?: RuntimeCameraTarget): AuraVec3 {
  if (cameraSpec.offsetMode !== "target-yaw" || !target) return offset;
  return rotateVec3BySceneYaw(offset, target.rotation[1]);
}

function add3(left: AuraVec3, right: AuraVec3): AuraVec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function resolveRuntimeCameraTarget(cameraSpec: AuraCameraSpec, runtimeNodes: AuraRuntimeNodeRegistry | undefined): RuntimeCameraTarget | undefined {
  return findRuntimeCameraTarget(cameraSpec, runtimeNodes);
}

function resolveCameraTarget(snapshot: AuraSceneSnapshot, cameraSpec: AuraCameraSpec, runtimeNodes?: AuraRuntimeNodeRegistry): AuraVec3 {
  const runtimeTarget = resolveRuntimeCameraTarget(cameraSpec, runtimeNodes);
  if (runtimeTarget) {
    const targetOffset = cameraSpec.targetOffset
      ? applyCameraOffset(cameraSpec, cameraSpec.targetOffset, runtimeTarget)
      : [0, 0, 0] as const;
    return add3(runtimeTarget.position, targetOffset);
  }
  if (cameraSpec.mode === "follow" && cameraSpec.targetNode) {
    const targetNode = groups.flatten(snapshot.nodes).find((node): node is AuraModelNode | AuraPrimitiveNode =>
      (node.kind === "model" || node.kind === "primitive") &&
      (
        node.name === cameraSpec.targetNode ||
        (node.kind === "model" && node.asset.id === cameraSpec.targetNode) ||
        node.runtime?.id === cameraSpec.targetNode
      )
    );
    if (targetNode?.position) {
      const targetOffset = cameraSpec.targetOffset ?? [0, 0, 0] as const;
      return add3(targetNode.position, targetOffset);
    }
  }
  return cameraSpec.target ?? [0, 0.7, 0];
}

function resolveCameraEye(snapshot: AuraSceneSnapshot, cameraSpec: AuraCameraSpec, time: number, runtimeNodes?: AuraRuntimeNodeRegistry): AuraVec3 {
  const target = resolveCameraTarget(snapshot, cameraSpec, runtimeNodes);
  const runtimeTarget = resolveRuntimeCameraTarget(cameraSpec, runtimeNodes);
  let eye: AuraVec3 = cameraSpec.position ?? [0, 1.4, cameraSpec.distance ?? 4];
  if (cameraSpec.mode === "orbit") {
    const distance = cameraSpec.distance ?? 4;
    eye = cameraSpec.position ?? [target[0] + distance * 0.62, target[1] + distance * 0.42, target[2] + distance * 0.78];
  }
  if (cameraSpec.mode === "follow") {
    const distance = cameraSpec.distance ?? 4;
    const offset = cameraSpec.offset ? applyCameraOffset(cameraSpec, cameraSpec.offset, runtimeTarget) : undefined;
    eye = cameraSpec.position
      ?? (offset
        ? [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]]
        : [target[0] - distance * 0.38, target[1] + distance * 0.52, target[2] + distance * 0.82]);
  }
  if (cameraSpec.mode === "dolly") {
    const seconds = cameraSpec.seconds ?? 6;
    const phase = (time / 1000 % seconds) / seconds;
    const eased = 0.5 - Math.cos(phase * Math.PI * 2) * 0.5;
    const from = cameraSpec.from ?? [0, 1.4, 5];
    const to = cameraSpec.to ?? [0, 1.2, 3.4];
    eye = mix3(from, to, eased);
  }
  if (cameraSpec.mode === "path" || cameraSpec.mode === "flythrough") {
    const seconds = Math.max(0.001, cameraSpec.seconds ?? 6);
    const sourceTime = cameraSpec.captureTime !== undefined ? cameraSpec.captureTime * 1000 : time;
    const phase = ((sourceTime / 1000) % seconds) / seconds;
    const eased = cameraSpec.easing === "linear" ? phase : 0.5 - Math.cos(phase * Math.PI) * 0.5;
    const from = cameraSpec.from ?? [0, 1.4, 5];
    const to = cameraSpec.to ?? [0, 1.2, 3.4];
    eye = mix3(from, to, eased);
  }
  return eye;
}

interface SmoothedCameraFrame {
  readonly time: number;
  readonly target: AuraVec3;
  readonly eye: AuraVec3;
}

const smoothedCameraFrames = new WeakMap<object, Map<AuraCameraSpec, SmoothedCameraFrame>>();

function mixCameraVector(from: AuraVec3, to: AuraVec3, amount: number): AuraVec3 {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount
  ];
}

/** Resolve one coherent camera frame and honor the public follow-camera smoothing contract. */
export function resolveCameraFrame(
  snapshot: AuraSceneSnapshot,
  cameraSpec: AuraCameraSpec,
  time: number,
  runtimeNodes?: AuraRuntimeNodeRegistry
): SmoothedCameraFrame {
  const rawTarget = resolveCameraTarget(snapshot, cameraSpec, runtimeNodes);
  const rawEye = resolveCameraEye(snapshot, cameraSpec, time, runtimeNodes);
  const smoothing = Math.max(0, Math.min(0.98, cameraSpec.smoothing ?? 0));
  if (!runtimeNodes || cameraSpec.mode !== "follow" || smoothing <= 0) {
    return { time, target: rawTarget, eye: rawEye };
  }

  const key = runtimeNodes as object;
  let cameraMap = smoothedCameraFrames.get(key);
  if (!cameraMap) {
    cameraMap = new Map();
    smoothedCameraFrames.set(key, cameraMap);
  }
  const previous = cameraMap.get(cameraSpec);
  if (previous && time === previous.time) return previous;
  if (!previous || time < previous.time || time - previous.time > 250) {
    const frame = { time, target: rawTarget, eye: rawEye };
    cameraMap.set(cameraSpec, frame);
    return frame;
  }

  // Treat smoothing as the intended blend fraction at 60 Hz, then convert it
  // to an exponential response so the camera feels identical at every refresh rate.
  const deltaSeconds = (time - previous.time) / 1000;
  const responsePerSecond = -Math.log(1 - smoothing) * 60;
  const amount = 1 - Math.exp(-responsePerSecond * deltaSeconds);
  const frame = {
    time,
    target: mixCameraVector(previous.target, rawTarget, amount),
    eye: mixCameraVector(previous.eye, rawEye, amount)
  };
  cameraMap.set(cameraSpec, frame);
  return frame;
}
