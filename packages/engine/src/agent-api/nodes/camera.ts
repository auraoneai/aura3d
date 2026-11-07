// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraBoundsSpec, AuraCameraFrameAssetOptions, AuraCameraSpec, AuraVec3 } from "../nodes/types.js";
import { resolveFrameAssetRenderScale } from "../nodes/scene.js";
import { gameCameraRigs } from "../GameCameraRigs.js";
import { resolveCameraClipping } from "../RootRuntimeSupport.js";
import { boundsFromAsset, boundsSize } from "../SceneGroundingUtils.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { stubCameraRigFactories, type AuraCameraRig, type AuraCameraRigFactories } from "../../contracts/camera.js";
import { rigFactory } from "../camera/rigs/registry.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import { smoothingToHalflife } from "../camera/Spring.js";
import { frameCameraPose, type AuraFrameBounds, type AuraFramePose } from "../camera/frameSubject.js";
import { isGroundLikeNode, worldBoundsOfNodes, type AuraCameraFrameOptions, type AuraFrameSubject } from "../camera/frameNodes.js";

function frameBoundsOf(subject: AuraFrameSubject | readonly AuraFrameSubject[] | AuraFrameBounds, options: AuraCameraFrameOptions, scene: boolean): AuraFrameBounds {
  const isBounds = !Array.isArray(subject) && Array.isArray((subject as AuraFrameBounds).min) && Array.isArray((subject as AuraFrameBounds).max) && (subject as { kind?: unknown }).kind === undefined;
  if (isBounds) return subject as AuraFrameBounds;
  const bounds = worldBoundsOfNodes(subject as AuraFrameSubject | readonly AuraFrameSubject[], { exclude: options.exclude ?? (scene ? isGroundLikeNode : undefined) } as never);
  if (!bounds) throw new RangeError("camera.frame: the subject has no model or primitive nodes to frame.");
  return bounds;
}

// X-1: `smoothing` is a legacy scalar; under A3D_QR_CAMERA damping is
// expressed as a half-life. Warn once per spec object with the equivalent.
const smoothingWarned = new WeakSet<object>();
function warnSmoothingDeprecated(options: object | undefined): void {
  if (!options || smoothingWarned.has(options)) return;
  const smoothing = (options as { smoothing?: number }).smoothing;
  if (smoothing === undefined || !resolveQrFlags({}).on("A3D_QR_CAMERA")) return;
  smoothingWarned.add(options);
  console.warn(
    `[aura3d] camera spec 'smoothing' is deprecated under A3D_QR_CAMERA; ` +
    `it maps to a half-life of ${smoothingToHalflife(smoothing).toFixed(3)}s ` +
    `(use rig halflife options on app.camera rigs instead).`
  );
}

/**
 * P-61 (lane-08 review of #173/#276): `camera.rigs` shipped as the PR 0a stub
 * factories, so `app.camera.use(camera.rigs.shoulder({ target: "hero" }))`
 * (create-aura3d templates) always got a static pose that never followed the
 * subject. Resolve each factory through the S19 rig registry instead — the
 * same lookup `app.camera.rigs` uses, so no rig module is imported here and
 * the S19 tree-shake still holds. A rig module that was never imported falls
 * back to its stub. `static` stays the stub's (already real); `fromSpec`
 * needs a controller's spec deps, so the namespace keeps the stub and real
 * spec rigs come from `app.camera.rigs.fromSpec`. Flag-off is unchanged in
 * effect: the stub controller's `use()` ignores the rig.
 */
const NAMESPACE_STUB_ONLY = new Set<string>(["static", "fromSpec"]);
// Built inside the lazy namespace init: `stubCameraRigFactories` can still be
// uninitialised while this module evaluates inside the barrel's import cycle.
function createCameraRigFactories(): AuraCameraRigFactories {
  return new Proxy(stubCameraRigFactories, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !NAMESPACE_STUB_ONLY.has(prop)) {
        const factory = rigFactory(prop);
        if (factory) return (options: unknown) => factory(options) as AuraCameraRig;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function perspectiveProjectionOptions(options: Omit<AuraCameraSpec, "mode">): Pick<AuraCameraSpec, "viewOffset" | "focalLength" | "filmGauge" | "filmOffset"> {
  return {
    ...(options.viewOffset !== undefined ? { viewOffset: options.viewOffset } : {}),
    ...(options.focalLength !== undefined ? { focalLength: options.focalLength } : {}),
    ...(options.filmGauge !== undefined ? { filmGauge: options.filmGauge } : {}),
    ...(options.filmOffset !== undefined ? { filmOffset: options.filmOffset } : {})
  };
}

function cameraViewOptions(options: Omit<AuraCameraSpec, "mode">): Pick<AuraCameraSpec, "up" | "layers"> {
  return {
    ...(options.up !== undefined ? { up: options.up } : {}),
    ...(options.layers !== undefined ? { layers: options.layers } : {})
  };
}

export const camera = lazyNamespace(() => ({
  perspective: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => ({
    mode: "perspective",
    ...resolveCameraClipping({ ...options, mode: "perspective" }),
    position: options.position ?? [0, 1.4, 4],
    target: options.target ?? [0, 0.8, 0],
    fov: options.fov ?? 45,
    ...(options.up !== undefined ? { up: options.up } : {}),
    ...perspectiveProjectionOptions(options),
    ...(options.depth !== undefined ? { depth: options.depth } : {}),
    ...(options.layers !== undefined ? { layers: options.layers } : {})
  }),
  orbit: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => {
    const distance = options.distance ?? 4;
    const target = options.target ?? [0, 0.8, 0];
    return {
      mode: "orbit",
      ...resolveCameraClipping({ ...options, mode: "orbit" }),
      distance,
      target,
      position: options.position ?? [
        target[0] + distance * 0.62,
        target[1] + distance * 0.42,
        target[2] + distance * 0.78
      ],
      fov: options.fov ?? 45,
      ...(options.autoRotate !== undefined ? { autoRotate: options.autoRotate } : {}),
      ...(options.captureTime !== undefined ? { captureTime: options.captureTime } : {}),
      ...cameraViewOptions(options),
      ...perspectiveProjectionOptions(options),
      ...(options.depth !== undefined ? { depth: options.depth } : {})
    };
  },
  dolly: (options: Omit<AuraCameraSpec, "mode"> & { readonly from: AuraVec3; readonly to: AuraVec3 }): AuraCameraSpec => ({
    mode: "dolly",
    ...resolveCameraClipping({ ...options, mode: "dolly" }),
    from: options.from,
    to: options.to,
    target: options.target ?? [0, 0.8, 0],
    seconds: options.seconds ?? 6,
    fov: options.fov ?? 45,
    captureTime: options.captureTime,
    ...cameraViewOptions(options),
    ...perspectiveProjectionOptions(options),
    ...(options.depth !== undefined ? { depth: options.depth } : {})
  }),
  follow: (options: Omit<AuraCameraSpec, "mode"> & { readonly targetNode: string }): AuraCameraSpec => {
    warnSmoothingDeprecated(options);
    return {
      mode: "follow",
      ...resolveCameraClipping({ ...options, mode: "follow" }),
      targetNode: options.targetNode,
      distance: options.distance ?? 5,
      position: options.position,
      target: options.target ?? [0, 1, 0],
      offset: options.offset,
      targetOffset: options.targetOffset,
      offsetMode: options.offsetMode,
      fov: options.fov ?? 50,
      easing: options.easing,
      captureTime: options.captureTime,
      smoothing: options.smoothing ?? 0.18,
      subjectEmphasis: options.subjectEmphasis ?? 0.62,
      ...cameraViewOptions(options),
      ...perspectiveProjectionOptions(options),
      ...(options.depth !== undefined ? { depth: options.depth } : {})
    };
  },
  path: (options: Omit<AuraCameraSpec, "mode"> & { readonly from: AuraVec3; readonly to: AuraVec3 }): AuraCameraSpec => ({
    mode: "path",
    ...resolveCameraClipping({ ...options, mode: "path" }),
    from: options.from,
    to: options.to,
    target: options.target ?? [0, 0.8, 0],
    seconds: options.seconds ?? 6,
    fov: options.fov ?? 45,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime,
    ...cameraViewOptions(options),
    ...perspectiveProjectionOptions(options),
    ...(options.depth !== undefined ? { depth: options.depth } : {})
  }),
  flythrough: (options: Omit<AuraCameraSpec, "mode"> & { readonly from?: AuraVec3; readonly to?: AuraVec3 } = {}): AuraCameraSpec => ({
    mode: "flythrough",
    ...resolveCameraClipping({ ...options, mode: "flythrough" }),
    from: options.from ?? [0, 0.36, 1.6],
    to: options.to ?? [0, 0.36, -4.4],
    target: options.target ?? [0, 0.28, -5.8],
    seconds: options.seconds ?? 8,
    fov: options.fov ?? 54,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime,
    ...cameraViewOptions(options),
    ...perspectiveProjectionOptions(options),
    ...(options.depth !== undefined ? { depth: options.depth } : {})
  }),
  /**
   * A parallel-projection camera: no foreshortening, so equal world lengths
   * occupy equal screen lengths wherever they sit in depth.
   *
   * Reach for this when the projection is part of the meaning rather than a
   * stylistic choice — CAD and engineering views, floor plans, technical
   * diagrams, sprite and texture bakes, chart axes, and product shots that must
   * read as measurable. A long-lens perspective camera approximates it but
   * still converges, which is visible on long straight edges.
   */
  orthographic: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => ({
    mode: "orthographic",
    ...resolveCameraClipping({ ...options, mode: "orthographic" }),
    position: options.position ?? [0, 1.4, 4],
    target: options.target ?? [0, 0.8, 0],
    orthographicSize: options.orthographicSize ?? 1.4,
    ...(options.up !== undefined ? { up: options.up } : {}),
    ...(options.viewOffset !== undefined ? { viewOffset: options.viewOffset } : {}),
    ...(options.depth !== undefined ? { depth: options.depth } : {}),
    ...(options.layers !== undefined ? { layers: options.layers } : {})
  }),
  /**
   * The conventional isometric view: an orthographic camera on a 45-degree
   * azimuth and a ~35.264-degree elevation.
   *
   * That elevation is `atan(1 / sqrt(2))`, the angle at which the three world
   * axes project to equal screen lengths and 120 degrees apart. Authoring it as
   * a preset matters because the value is not memorable and an approximation
   * such as 30 or 45 degrees produces the subtly-wrong grid alignment that
   * isometric tile art immediately reveals.
   */
  isometric: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => {
    const target = options.target ?? [0, 0, 0];
    const distance = options.distance ?? 12;
    const elevation = Math.atan(1 / Math.SQRT2);
    const azimuth = Math.PI / 4;
    const horizontal = Math.cos(elevation) * distance;
    return {
      mode: "isometric",
      ...resolveCameraClipping({ ...options, mode: "isometric" }),
      target,
      distance,
      orthographicSize: options.orthographicSize ?? 6,
      position: options.position ?? [
        target[0] + Math.sin(azimuth) * horizontal,
        target[1] + Math.sin(elevation) * distance,
        target[2] + Math.cos(azimuth) * horizontal
      ],
      ...(options.up !== undefined ? { up: options.up } : {}),
      ...(options.viewOffset !== undefined ? { viewOffset: options.viewOffset } : {}),
      ...(options.depth !== undefined ? { depth: options.depth } : {}),
      ...(options.layers !== undefined ? { layers: options.layers } : {})
    };
  },
  autoFrame: (options: { readonly bounds?: AuraBoundsSpec; readonly target?: AuraVec3; readonly padding?: number; readonly fov?: number } = {}): AuraCameraSpec => {
    const bounds = options.bounds ?? { min: [-1, 0, -1], max: [1, 1.6, 1] } as const;
    const center: AuraVec3 = options.target ?? [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2
    ];
    const extent = Math.max(
      bounds.max[0] - bounds.min[0],
      bounds.max[1] - bounds.min[1],
      bounds.max[2] - bounds.min[2],
      0.1
    );
    const distance = extent * (options.padding ?? 2.15);
    return camera.orbit({ target: center, distance, fov: options.fov ?? 42 });
  },
  /**
   * Frame a subject: a node, an array of nodes, a group, or a world-bounds box.
   * Returns an orbit camera (perspective, `target` + `distance` set, so orbit
   * controls start framed) whose eye is placed so the subject occupies
   * `fill` (default 0.6) of the limiting frame axis. Exact perspective fit over
   * the node's real world bounds (size, scale, rotation, model fit), centred.
   *
   * The returned spec is static: it is solved for `options.aspect` (default 16/9).
   * For a different or changing canvas, pass the aspect you render at, or call
   * `camera.framePose(subject, { aspect })` in a resize handler and apply it with
   * `app.camera.setPose`.
   */
  frame: (subject: AuraFrameSubject | readonly AuraFrameSubject[] | AuraFrameBounds, options: AuraCameraFrameOptions = {}): AuraCameraSpec => {
    const pose = frameCameraPose(frameBoundsOf(subject, options, false), options);
    return camera.orbit({ target: pose.target, position: pose.position, distance: pose.distance, fov: pose.fov, near: pose.near, far: pose.far });
  },
  /**
   * Frame everything in a scene (a `scene()` builder or node array). Ground
   * planes and nodes named like ground/floor/terrain are left out of the box
   * unless you pass your own `exclude`.
   */
  frameScene: (subject: AuraFrameSubject | readonly AuraFrameSubject[], options: AuraCameraFrameOptions = {}): AuraCameraSpec => {
    const pose = frameCameraPose(frameBoundsOf(subject, options, true), options);
    return camera.orbit({ target: pose.target, position: pose.position, distance: pose.distance, fov: pose.fov, near: pose.near, far: pose.far });
  },
  /** The pose `camera.frame` would use, without building a spec: `app.camera?.setPose({ position, target, fov })`. */
  framePose: (subject: AuraFrameSubject | readonly AuraFrameSubject[] | AuraFrameBounds, options: AuraCameraFrameOptions = {}): AuraFramePose =>
    frameCameraPose(frameBoundsOf(subject, options, false), options),
  frameAsset: (asset: AuraAssetRef<"model">, options: AuraCameraFrameAssetOptions = {}): AuraCameraSpec => {
    const bounds = boundsFromAsset(asset);
    const size = boundsSize(bounds);
    const renderedScale = resolveFrameAssetRenderScale(bounds, options);
    const renderedSize = [
      Math.max(0.001, size[0] * renderedScale),
      Math.max(0.001, size[1] * renderedScale),
      Math.max(0.001, size[2] * renderedScale)
    ] as const;
    const position = options.position ?? [0, options.floorY ?? 0, 0] as const;
    const target: AuraVec3 = options.target ?? [
      position[0],
      position[1] + renderedSize[1] * 0.28,
      position[2]
    ];
    const fov = options.fov ?? 36;
    const fovRadians = Math.max(1, Math.min(120, fov)) * Math.PI / 180;
    const radius = Math.hypot(renderedSize[0], renderedSize[1], renderedSize[2]) / 2;
    const verticalFitDistance = renderedSize[1] / (2 * Math.tan(fovRadians / 2));
    const horizontalFitDistance = Math.max(renderedSize[0], renderedSize[2]) / (2 * Math.tan(fovRadians / 2));
    const distance = Math.max(
      options.minDistance ?? 0.85,
      verticalFitDistance * (options.padding ?? 1.42),
      horizontalFitDistance * (options.padding ?? 1.42),
      radius / Math.tan(fovRadians / 2) * (options.padding ?? 1.42)
    );
    const azimuth = options.azimuth ?? 0.62;
    const elevation = options.elevation ?? 0.28;
    const horizontal = Math.max(0.001, Math.cos(elevation));
    const eye: AuraVec3 = [
      target[0] + Math.sin(azimuth) * horizontal * distance,
      target[1] + Math.sin(elevation) * distance,
      target[2] + Math.cos(azimuth) * horizontal * distance
    ];
    return camera.orbit({ target, position: eye, distance, fov });
  },
  physics: (): AuraCameraSpec => camera.orbit({ target: [0, 0.58, -0.35], distance: 5.8, fov: 43 }),
  charts: (): AuraCameraSpec => camera.orbit({ target: [0, 0.78, 0], distance: 6.4, fov: 40 }),
  materials: (): AuraCameraSpec => camera.perspective({ position: [0, 2.08, 7.35], target: [0, 0.9, -0.72], fov: 40 }),
  city: (): AuraCameraSpec => camera.orbit({ target: [0, 0.82, 0], distance: 8.4, fov: 44 }),
  product: (): AuraCameraSpec => camera.perspective({ position: [1.28, 1.02, 3.08], target: [0, 0.7, -0.65], fov: 32 }),
  solar: (): AuraCameraSpec => camera.orbit({ target: [0, 0, 0], distance: 7.2, fov: 46 }),
  humanoid: (): AuraCameraSpec => camera.perspective({ position: [1.2, 1.12, 3.45], target: [0, 0.78, -0.55], fov: 36 }),
  miniGolf: (): AuraCameraSpec => camera.follow({ targetNode: "white physics golf ball", distance: 4.2, fov: 48 }),
  neon: (): AuraCameraSpec => camera.flythrough({ from: [0, 0.36, 1.6], to: [0, 0.36, -5.8], target: [0, 0.26, -6.8], fov: 54, captureTime: 0.16 }),
  /**
   * C-22 rig factories (`chase`, `shoulder`, `topDown`, `fromSpec`, …) —
   * `AuraCameraRig` values for `app.camera.use(rig)` + `app.camera.setPose`,
   * as distinct from the `AuraCameraSpec` builders above that mount through
   * the scene camera slot. Real PRD-08 rigs resolved through the S19 rig
   * registry (see `createCameraRigFactories` above); `static`/`fromSpec` and any
   * unimported rig module fall back to the PR 0a stubs.
   */
  rigs: createCameraRigFactories(),
  ...gameCameraRigs
} as const));
