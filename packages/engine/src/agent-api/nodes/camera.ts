// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraBoundsSpec, AuraCameraFrameAssetOptions, AuraCameraSpec, AuraVec3 } from "../nodes/types.js";
import { charts } from "../nodes/charts.js";
import { city } from "../nodes/city.js";
import { neon } from "../nodes/neon.js";
import { physics } from "../nodes/physics.js";
import { product } from "../nodes/product.js";
import { resolveFrameAssetRenderScale } from "../nodes/scene.js";
import { solar } from "../nodes/solar.js";
import { gameCameraRigs } from "../GameCameraRigs.js";
import { resolveCameraClipping } from "../RootRuntimeSupport.js";
import { boundsFromAsset, boundsSize } from "../SceneGroundingUtils.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { stubCameraRigFactories } from "../../contracts/camera.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import { smoothingToHalflife } from "../camera/Spring.js";

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



export const camera = lazyNamespace(() => ({
  perspective: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => ({
    mode: "perspective",
    ...resolveCameraClipping(options),
    position: options.position ?? [0, 1.4, 4],
    target: options.target ?? [0, 0.8, 0],
    fov: options.fov ?? 45
  }),
  orbit: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => {
    const distance = options.distance ?? 4;
    const target = options.target ?? [0, 0.8, 0];
    return {
      mode: "orbit",
      ...resolveCameraClipping(options),
      distance,
      target,
      position: options.position ?? [
        target[0] + distance * 0.62,
        target[1] + distance * 0.42,
        target[2] + distance * 0.78
      ],
      fov: options.fov ?? 45
    };
  },
  dolly: (options: Omit<AuraCameraSpec, "mode"> & { readonly from: AuraVec3; readonly to: AuraVec3 }): AuraCameraSpec => ({
    mode: "dolly",
    ...resolveCameraClipping(options),
    from: options.from,
    to: options.to,
    target: options.target ?? [0, 0.8, 0],
    seconds: options.seconds ?? 6,
    fov: options.fov ?? 45,
    captureTime: options.captureTime
  }),
  follow: (options: Omit<AuraCameraSpec, "mode"> & { readonly targetNode: string }): AuraCameraSpec => {
    warnSmoothingDeprecated(options);
    return {
      mode: "follow",
      ...resolveCameraClipping(options),
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
      subjectEmphasis: options.subjectEmphasis ?? 0.62
    };
  },
  path: (options: Omit<AuraCameraSpec, "mode"> & { readonly from: AuraVec3; readonly to: AuraVec3 }): AuraCameraSpec => ({
    mode: "path",
    ...resolveCameraClipping(options),
    from: options.from,
    to: options.to,
    target: options.target ?? [0, 0.8, 0],
    seconds: options.seconds ?? 6,
    fov: options.fov ?? 45,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime
  }),
  flythrough: (options: Omit<AuraCameraSpec, "mode"> & { readonly from?: AuraVec3; readonly to?: AuraVec3 } = {}): AuraCameraSpec => ({
    mode: "flythrough",
    ...resolveCameraClipping(options),
    from: options.from ?? [0, 0.36, 1.6],
    to: options.to ?? [0, 0.36, -4.4],
    target: options.target ?? [0, 0.28, -5.8],
    seconds: options.seconds ?? 8,
    fov: options.fov ?? 54,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime
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
    ...resolveCameraClipping(options),
    position: options.position ?? [0, 1.4, 4],
    target: options.target ?? [0, 0.8, 0],
    orthographicSize: options.orthographicSize ?? 1.4
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
      ...resolveCameraClipping(options),
      target,
      distance,
      orthographicSize: options.orthographicSize ?? 6,
      position: options.position ?? [
        target[0] + Math.sin(azimuth) * horizontal,
        target[1] + Math.sin(elevation) * distance,
        target[2] + Math.cos(azimuth) * horizontal
      ]
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
   * the scene camera slot. Stub factories until PRD 08 lands the real rigs:
   * each returns a static rig carrying its authored pose.
   */
  rigs: stubCameraRigFactories,
  ...gameCameraRigs
} as const));
