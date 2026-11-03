/**
 * threejs-parity L7 (SC-01 `cameras.cube` + AD-15 `surfaces.mirror`).
 *
 * Per-mount runtime that turns authored `cube-camera` / `surface mirror` spec
 * nodes into renderer-owned captures:
 *
 * - `cameras.cube` → `CubeCameraReflectionCapture` renders the frame's items
 *   through `Renderer.renderProbeFace` into six faces every `updateEvery`
 *   frames; the resulting cube `TextureBinding` is bound as
 *   `RenderItem.environmentCube` for items whose material spec carries
 *   `envMap: { cubeCamera: <name> }` (three's `material.envMap`).
 * - `surfaces.mirror` → `PlanarReflectionCapture` renders the frame's items
 *   through the mirror camera (oblique near-plane clip); the mirror surface
 *   itself is appended to the frame as a reflector item sampling the capture
 *   (three's `Reflector`).
 *
 * Captures run inside `render()`/`renderAsync()` before the main submit so the
 * produced items/bindings are fresh for the frame that consumes them.
 */

import type { Renderer, RenderItem, RenderSource, RendererView, TextureBinding } from "@aura3d/rendering";
import { CubeCameraReflectionCapture, Geometry, PlanarReflectionCapture, TexturedUnlitMaterial, createReflectionProbe } from "@aura3d/rendering";
import type { AuraCameraSpec, AuraRuntimeNodeRegistry, AuraSceneSnapshot } from "../nodes/types.js";
import { groups } from "../nodes/groups.js";
import { colorToLinearRgba } from "../colorUtils.js";
import { cameraFollowTargetIdentity, resolveCameraFrame, sampleCameraFrame, type SmoothedCameraFrame } from "./camera.js";
import { productionCameraProjectionMetadata, resolveProductionCameraDepth } from "./cameraDepth.js";
import { createCameraProjection } from "../RootRuntimeSupport.js";
import { invertMat4, lookAtMat4, multiplyMat4, type Mat4 } from "@aura3d/scene/math";
import { computeStereoEyes } from "../stereoMath.js";
import { isAuraCameraArrayNode, isAuraCameraStereoNode, isAuraCubeCameraNode, type AuraCameraArrayNode, type AuraCameraStereoNode, type AuraCubeCameraNode } from "../nodes/cameras.js";
import { isAuraMirrorSurfaceNode, type AuraMirrorSurfaceNode } from "../nodes/surfaces.js";

export interface ProductionParitySurfaces {
  /**
   * Runs this frame's cube-camera and mirror captures and returns the source
   * to submit — the original source unless a capture produced extra items or
   * env-cube bindings.
   */
  prepare(
    source: RenderSource,
    snapshot: AuraSceneSnapshot,
    runtimeNodes: AuraRuntimeNodeRegistry | undefined,
    time: number,
    aspect: number,
    size?: { readonly width: number; readonly height: number }
  ): RenderSource;
  /** Validate and lower authored views without capturing or submitting a frame. */
  prepareViews(
    snapshot: AuraSceneSnapshot,
    runtimeNodes: AuraRuntimeNodeRegistry | undefined,
    time: number,
    size?: { readonly width: number; readonly height: number }
  ): readonly RendererView[] | undefined;
  /** Latest cube-camera texture bindings, keyed by camera node name. */
  cubeBindings(): ReadonlyMap<string, TextureBinding>;
  dispose(): void;
}

interface MirrorState {
  readonly node: AuraMirrorSurfaceNode;
  readonly capture: PlanarReflectionCapture;
}

interface CubeCameraState {
  readonly node: AuraCubeCameraNode;
  readonly capture: CubeCameraReflectionCapture;
  readonly position: readonly [number, number, number];
  framesSinceCapture: number;
}

interface ViewSmoothingHistory {
  readonly registry: AuraRuntimeNodeRegistry;
  readonly targetNode: string | undefined;
  readonly targetIdentity: object | undefined;
  readonly frame: SmoothedCameraFrame;
}

type ViewFrameResolver = (
  kind: "array" | "stereo",
  nodeName: string,
  id: string | undefined,
  index: number,
  camera: AuraCameraSpec
) => SmoothedCameraFrame;

type CameraViewNode = AuraCameraArrayNode | AuraCameraStereoNode;
const MAX_CAMERA_VIEW_GROUPS = 16;
const MAX_COMBINED_CAMERA_VIEWS = 32;

const cameraViewId = (name: string, id: string | undefined, index: number): string =>
  `${name}:${id === undefined ? `index:${index}` : `id:${id}`}`;

/** Validate identities and bound allocations before any capture or frame history changes. */
function validateCameraViewGroups(nodes: readonly CameraViewNode[]): void {
  if (nodes.length > MAX_CAMERA_VIEW_GROUPS) {
    throw new RangeError(`CAMERA_VIEWS_LIMIT: at most ${MAX_CAMERA_VIEW_GROUPS} camera groups are supported`);
  }
  const names = new Set<string>();
  const ids = new Set<string>();
  let count = 0;
  for (const node of nodes) {
    if (nodes.length > 1 && (typeof node.name !== "string" || !node.name.trim() || names.has(node.name))) {
      throw new RangeError("CAMERA_VIEWS_GROUP_ID: multiple camera groups require distinct non-empty names");
    }
    names.add(node.name);
    const entries: readonly { readonly id?: string }[] = node.kind === "camera-array" ? node.cameras : (node.views ?? [{}, {}]);
    if (nodes.length > 1 && entries.length === 0) {
      throw new RangeError("CAMERA_VIEWS_EMPTY: each camera group must contain at least one view");
    }
    count += entries.length;
    // Keep the existing single-group capacity, but bound the new composition path.
    if (nodes.length > 1 && count > MAX_COMBINED_CAMERA_VIEWS) {
      throw new RangeError(`CAMERA_VIEWS_LIMIT: at most ${MAX_COMBINED_CAMERA_VIEWS} combined camera views are supported`);
    }
    entries.forEach((entry, index) => {
      const id = cameraViewId(node.name, entry.id, index);
      if (ids.has(id)) throw new RangeError(`CAMERA_VIEWS_ID_COLLISION: duplicate renderer view id ${JSON.stringify(id)}`);
      ids.add(id);
    });
  }
}

const mirrorPosition = (node: AuraMirrorSurfaceNode, runtimeNodes: AuraRuntimeNodeRegistry | undefined): readonly [number, number, number] => {
  const id = node.runtime?.id;
  const handle = id ? runtimeNodes?.get(id) : undefined;
  return handle?.position ?? node.position ?? [0, 0, 0];
};

const cubeCameraPosition = (node: AuraCubeCameraNode, runtimeNodes: AuraRuntimeNodeRegistry | undefined): readonly [number, number, number] => {
  const id = node.runtime?.id;
  const handle = id ? runtimeNodes?.get(id) : undefined;
  return (handle?.position ?? node.position ?? [0, 0, 0]) as readonly [number, number, number];
};

export function createProductionParitySurfaces(
  renderer: Renderer,
  warn: (message: string) => void
): ProductionParitySurfaces {
  const mirrors = new Map<string, MirrorState>();
  const cubeCameras = new Map<string, CubeCameraState>();
  const cubeBindings = new Map<string, TextureBinding>();
  // A mount owns its own view history. Effective camera specs are rebuilt on
  // each preparation and must never be retained as registry-global map keys.
  let viewSmoothingHistory = new Map<string, ViewSmoothingHistory>();
  let disposed = false;

  const mirrorKey = (node: AuraMirrorSurfaceNode): string => node.runtime?.id ?? node.name ?? "mirror";
  const cubeKey = (node: AuraCubeCameraNode): string => node.runtime?.id ?? node.name ?? "cube-camera";

  const ensureMirror = (node: AuraMirrorSurfaceNode): MirrorState => {
    const key = mirrorKey(node);
    let state = mirrors.get(key);
    if (!state) {
      state = {
        node,
        capture: new PlanarReflectionCapture(renderer.device, node.position?.[1] ?? 0, {
          resolution: node.resolution,
          label: `${key}-mirror`
        })
      };
      mirrors.set(key, state);
    }
    return state;
  };

  const ensureCubeCamera = (node: AuraCubeCameraNode, position: readonly [number, number, number]): CubeCameraState => {
    const key = cubeKey(node);
    let state = cubeCameras.get(key);
    // The capture owns a fixed-position probe; a moved camera needs a fresh one.
    if (state && state.position.some((component, index) => Math.abs(component - position[index]!) > 1e-6)) {
      state.capture.dispose();
      cubeCameras.delete(key);
      state = undefined;
    }
    if (!state) {
      state = {
        node,
        capture: new CubeCameraReflectionCapture(renderer.device, createReflectionProbe({
          id: key,
          position,
          radius: node.far,
          intensity: 1
        }), {
          resolution: node.resolution,
          near: node.near,
          far: node.far
        }),
        position,
        framesSinceCapture: node.updateEvery
      };
      cubeCameras.set(key, state);
    }
    return state;
  };

  const preflightViews = (
    snapshot: AuraSceneSnapshot,
    runtimeNodes: AuraRuntimeNodeRegistry | undefined,
    time: number,
    size: { readonly width: number; readonly height: number } | undefined,
    flattened = groups.flatten(snapshot.nodes)
  ): { readonly views: readonly RendererView[] | undefined; readonly commit: () => void } => {
    // Preserve the flattened scene's order, including cameras inside groups.
    const viewNodes: CameraViewNode[] = [];
    for (const node of flattened) {
      if (isAuraCameraArrayNode(node) || isAuraCameraStereoNode(node)) viewNodes.push(node);
    }
    validateCameraViewGroups(viewNodes);
    const first = viewNodes[0];
    const depthCode = first?.kind === "camera-array" ? "CAMERA_ARRAY_DEPTH_UNSUPPORTED"
      : first ? "CAMERA_STEREO_DEPTH_UNSUPPORTED" : "CAMERA_DEPTH_UNSUPPORTED";
    // Preflight every view and the source camera before any capture
    // or warmup, even when a render size has not yet been supplied.
    for (const node of viewNodes) {
      const entries = node.kind === "camera-array" ? node.cameras : (node.views ?? []);
      const nodeDepthCode = node.kind === "camera-array" ? "CAMERA_ARRAY_DEPTH_UNSUPPORTED" : "CAMERA_STEREO_DEPTH_UNSUPPORTED";
      for (const entry of entries) {
        productionCameraProjectionMetadata({ ...snapshot.camera, ...(entry.camera ?? {}) }, nodeDepthCode);
      }
    }
    productionCameraProjectionMetadata(snapshot.camera, depthCode);
    // No render size means no view frame was observed; do not retire the last
    // rendered views just because an early preflight lacked dimensions.
    if (!size) return { views: undefined, commit: () => {} };
    const staged = new Map<string, ViewSmoothingHistory>();
    const resolveViewFrame: ViewFrameResolver = (kind, nodeName, id, index, cameraSpec) => {
      // A tuple encoding distinguishes node kinds and explicit IDs from index
      // fallbacks even when names or IDs contain punctuation.
      const key = JSON.stringify([kind, nodeName, id === undefined ? "index" : "id", id ?? index]);
      const targetIdentity = cameraFollowTargetIdentity(cameraSpec, runtimeNodes);
      const prior = viewSmoothingHistory.get(key);
      const previous = prior && prior.registry === runtimeNodes
        && prior.targetNode === cameraSpec.targetNode && prior.targetIdentity === targetIdentity
        ? prior.frame : undefined;
      const frame = sampleCameraFrame(snapshot, cameraSpec, time, runtimeNodes, previous);
      if (runtimeNodes && cameraSpec.mode === "follow" && (cameraSpec.smoothing ?? 0) > 0) {
        // Do not retain caller-owned position/target tuples as history: mutating
        // an authored tuple later must not rewrite the prior frame's pose.
        staged.set(key, {
          registry: runtimeNodes,
          targetNode: cameraSpec.targetNode,
          targetIdentity,
          frame: {
            time: frame.time,
            target: [frame.target[0], frame.target[1], frame.target[2]],
            eye: [frame.eye[0], frame.eye[1], frame.eye[2]]
          }
        });
      }
      return frame;
    };
    const views = createCameraViews(viewNodes, snapshot, size, warn, resolveViewFrame);
    return {
      views,
      // Retire absent/disabled views only after the entire live preparation has
      // succeeded. A precompile reads the result without calling this function.
      commit: () => { if (!disposed) viewSmoothingHistory = staged; }
    };
  };

  return {
    prepareViews(snapshot, runtimeNodes, time, size) {
      return disposed ? undefined : preflightViews(snapshot, runtimeNodes, time, size).views;
    },
    prepare(source, snapshot, runtimeNodes, time, aspect, size) {
      if (disposed) return source;
      const flattened = groups.flatten(snapshot.nodes);
      const mirrorNodes = flattened.filter(isAuraMirrorSurfaceNode);
      const cubeNodes = flattened.filter(isAuraCubeCameraNode);
      if (source.views !== undefined && flattened.some((node) => isAuraCameraArrayNode(node) || isAuraCameraStereoNode(node))) {
        throw new RangeError("CAMERA_VIEWS_SOURCE_CONFLICT: authored camera groups cannot replace existing source views");
      }
      const preparedViews = preflightViews(snapshot, runtimeNodes, time, size, flattened);
      const { views } = preparedViews;
      const withViews = (result: RenderSource): RenderSource => {
        const prepared = views ? { ...result, views } : result;
        preparedViews.commit();
        return prepared;
      };
      if (mirrorNodes.length === 0 && cubeNodes.length === 0) return withViews(source);

      const baseItems = (): readonly RenderItem[] => [
        ...(source.collectRenderItems?.() ?? source.renderItems ?? [])
      ];
      const { eye, target } = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes);
      const projection = createCameraProjection(resolveProductionCameraDepth(snapshot.camera).projectionCamera, aspect);
      const extraItems: RenderItem[] = [];

      // SC-01: six-face cube captures feed `material.*({ envMap })` items.
      for (const node of cubeNodes) {
        const state = ensureCubeCamera(node, cubeCameraPosition(node, runtimeNodes));
        const due = state.framesSinceCapture + 1 >= Math.max(1, node.updateEvery);
        if (due) {
          state.framesSinceCapture = 0;
          try {
            const result = state.capture.capture((face) => {
              renderer.renderProbeFace(
                {
                  renderItems: baseItems(),
                  cameraPolicy: "require",
                  cameraPosition: [...face.position] as [number, number, number],
                  environmentLighting: source.environmentLighting,
                  environmentFog: source.environmentFog,
                  frustumCulling: source.frustumCulling
                },
                face.index as 0 | 1 | 2 | 3 | 4 | 5,
                face.renderTarget,
                face.viewProjectionMatrix
              );
            });
            cubeBindings.set(cubeKey(node), result.binding);
          } catch (error) {
            warn(`cube camera "${cubeKey(node)}" capture failed (${error instanceof Error ? error.message : String(error)})`);
          }
        } else {
          state.framesSinceCapture += 1;
        }
      }

      // AD-15: planar mirror capture + reflector item appended to the frame.
      for (const node of mirrorNodes) {
        const state = ensureMirror(node);
        const position = mirrorPosition(node, runtimeNodes);
        // The capture owns a fixed-plane target; a moved mirror needs a fresh one.
        if (Math.abs(state.capture.planeY - position[1]) > 1e-6) {
          state.capture.dispose();
          mirrors.set(mirrorKey(node), {
            node,
            capture: new PlanarReflectionCapture(renderer.device, position[1], {
              resolution: node.resolution,
              label: `${mirrorKey(node)}-mirror`
            })
          });
        }
        const active = mirrors.get(mirrorKey(node))!;
        try {
          const result = active.capture.capture(
            (frame) => {
              renderer.render(
                {
                  renderItems: baseItems(),
                  renderTarget: frame.renderTarget,
                  cameraPolicy: "require",
                  cameraPosition: [...frame.mirror.eye] as [number, number, number],
                  environmentLighting: source.environmentLighting,
                  environmentFog: source.environmentFog,
                  frustumCulling: source.frustumCulling
                },
                { viewProjectionMatrix: frame.viewProjectionMatrix }
              );
            },
            eye,
            target,
            [0, 1, 0],
            projection
          );
          const tint = node.tint !== undefined ? colorToLinearRgba(node.tint) : undefined;
          const modelMatrix = new Float32Array([
            node.size[0], 0, 0, 0,
            0, 0.035, 0, 0,
            0, 0, node.size[1], 0,
            position[0], position[1], position[2], 1
          ]);
          extraItems.push({
            geometry: Geometry.texturedCube(1),
            material: new TexturedUnlitMaterial({
              name: `${mirrorKey(node)} planar mirror`,
              texture: result.texture,
              ...(tint ? { color: tint } : {})
            }),
            modelMatrix,
            includeInAutoFrame: false,
            label: `${mirrorKey(node)} planar mirror sampling live mirror target r${result.revision}`
          });
        } catch (error) {
          warn(`mirror "${mirrorKey(node)}" capture failed (${error instanceof Error ? error.message : String(error)})`);
        }
      }

      if (extraItems.length === 0 && cubeBindings.size === 0) return withViews(source);
      const bindings = cubeBindings;
      return withViews({
        ...source,
        collectRenderItems: () => [
          ...baseItems().map((item) => {
            const ref = item.cubeCameraEnvMap;
            const binding = ref ? bindings.get(ref) : undefined;
            return binding && item.environmentCube !== binding ? { ...item, environmentCube: binding } : item;
          }),
          ...extraItems
        ]
      });
    },

    cubeBindings() {
      return cubeBindings;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      viewSmoothingHistory.clear();
      for (const state of mirrors.values()) state.capture.dispose();
      for (const state of cubeCameras.values()) state.capture.dispose();
      mirrors.clear();
      cubeCameras.clear();
      cubeBindings.clear();
    }
  };
}


const toPixelRect = (viewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, size: { readonly width: number; readonly height: number }) => {
  const x = Math.min(size.width - 1, Math.max(0, Math.round(viewport.x * size.width)));
  const y = Math.min(size.height - 1, Math.max(0, Math.round(viewport.y * size.height)));
  const right = Math.min(size.width, Math.max(x + 1, Math.round((viewport.x + viewport.width) * size.width)));
  const top = Math.min(size.height, Math.max(y + 1, Math.round((viewport.y + viewport.height) * size.height)));
  return {
    x,
    y,
    width: right - x,
    height: top - y
  };
};

/**
 * Builds `RenderSource.views` from authored `cameras.array` / `cameras.stereo`
 * nodes. The renderer composites in this order; later views cover earlier
 * views wherever their viewport and scissor intersect.
 */
function createCameraViews(
  nodes: readonly CameraViewNode[],
  snapshot: AuraSceneSnapshot,
  size: { readonly width: number; readonly height: number },
  warn: (message: string) => void,
  resolveViewFrame: ViewFrameResolver
): readonly RendererView[] | undefined {
  if (nodes.length === 0) return undefined;
  const result: RendererView[] = [];
  for (const node of nodes) {
    const views = createCameraViewGroup(node, snapshot, size, warn, resolveViewFrame, nodes.length > 1);
    if (!views) return undefined;
    result.push(...views);
  }
  return result;
}

function createCameraViewGroup(
  node: CameraViewNode,
  snapshot: AuraSceneSnapshot,
  size: { readonly width: number; readonly height: number },
  warn: (message: string) => void,
  resolveViewFrame: ViewFrameResolver,
  multiple: boolean
): readonly RendererView[] | undefined {
  const layerMask = (layers: number | undefined) => (layers !== undefined ? { layerMask: layers >>> 0 } : {});
  const arrayNode = node.kind === "camera-array" ? node : undefined;
  const stereoNode = node.kind === "camera-stereo" ? node : undefined;

  if (arrayNode) {
    return arrayNode.cameras.map((entry, index): RendererView => {
      const spec = { ...snapshot.camera, ...(entry.camera ?? {}) };
      const { projectionCamera, projectionMetadata, depthConvention } = resolveProductionCameraDepth(spec, "CAMERA_ARRAY_DEPTH_UNSUPPORTED");
      const viewport = toPixelRect(entry.viewport, size);
      const { eye, target } = resolveViewFrame("array", arrayNode.name, entry.id, index, spec);
      const view = lookAtMat4([...eye], [...target], [...(spec.up ?? [0, 1, 0])]);
      const projection = createCameraProjection(projectionCamera, viewport.width / Math.max(1, viewport.height));
      return {
        id: cameraViewId(arrayNode.name, entry.id, index),
        viewport,
        ...(entry.scissor ? { scissor: toPixelRect(entry.scissor, size) } : {}),
        ...(entry.postprocess !== undefined ? { postprocess: entry.postprocess } : {}),
        cameraPosition: [eye[0], eye[1], eye[2]],
        camera: {
          viewMatrix: new Float32Array(view),
          projectionMatrix: new Float32Array(projection),
          viewProjectionMatrix: new Float32Array(multiplyMat4(projection, view)),
          projectionMetadata,
          depthConvention,
          ...layerMask(spec.layers)
        }
      };
    });
  }

  if (!stereoNode) return undefined;
  const spec = snapshot.camera;
  const eyeSpec = (index: 0 | 1) => ({
    ...spec,
    ...(stereoNode.fov !== undefined ? { fov: stereoNode.fov } : {}),
    ...(stereoNode.views?.[index].camera ?? {})
  });
  const eyeSpecs = [eyeSpec(0), eyeSpec(1)] as const;
  const isOrthographic = (mode: typeof spec.mode) => mode === "orthographic" || mode === "isometric";
  const orthographicEyes = eyeSpecs.map((eye) => isOrthographic(eye.mode));
  if (orthographicEyes[0] !== orthographicEyes[1]) {
    throw new RangeError("CAMERA_STEREO_PROJECTION_MIXED: both stereo eyes must use the same projection kind");
  }
  if (!Number.isFinite(stereoNode.focus) || stereoNode.focus <= 0
    || !Number.isFinite(stereoNode.eyeSeparation) || stereoNode.eyeSeparation <= 0
    || !Number.isFinite(stereoNode.zoom) || stereoNode.zoom <= 0) {
    throw new RangeError("CAMERA_STEREO_INVALID: eye separation, focus and zoom must be finite and positive");
  }
  if (orthographicEyes[0]) {
    if (stereoNode.fov !== undefined || stereoNode.views?.some((view) => view.camera?.fov !== undefined)) {
      throw new RangeError("CAMERA_STEREO_FOV_UNSUPPORTED: orthographic stereo uses orthographicSize and zoom rather than fov");
    }
  }
  const sideBySide = stereoNode.layout === "side-by-side";
  const halfWidth = Math.floor(size.width / 2);
  const halfHeight = Math.floor(size.height / 2);
  const leftViewport = sideBySide
    ? { x: 0, y: 0, width: halfWidth, height: size.height }
    : { x: 0, y: halfHeight, width: size.width, height: size.height - halfHeight };
  const rightViewport = sideBySide
    ? { x: halfWidth, y: 0, width: size.width - halfWidth, height: size.height }
    : { x: 0, y: 0, width: size.width, height: halfHeight };
  if (leftViewport.width < 1 || leftViewport.height < 1 || rightViewport.width < 1 || rightViewport.height < 1) {
    if (multiple) throw new RangeError("CAMERA_STEREO_TOO_SMALL: render target is too small to split into two eye viewports");
    warn("CAMERA_STEREO_TOO_SMALL: render target is too small to split into two eye viewports");
    return undefined;
  }
  const eyeView = (index: 0 | 1, defaultViewport: typeof leftViewport): RendererView => {
    const settings = stereoNode.views?.[index];
    const viewport = settings?.viewport ? toPixelRect(settings.viewport, size) : defaultViewport;
    const cameraSpec = eyeSpecs[index];
    const { projectionCamera, projectionMetadata, depthConvention } = resolveProductionCameraDepth(cameraSpec, "CAMERA_STEREO_DEPTH_UNSUPPORTED");
    const { near, far } = projectionMetadata;
    const { eye, target } = resolveViewFrame("stereo", stereoNode.name, settings?.id, index, cameraSpec);
    const view = lookAtMat4([...eye], [...target], [...(cameraSpec.up ?? [0, 1, 0])]);
    const aspect = stereoNode.aspect === undefined
      ? viewport.width / viewport.height
      : (size.width / size.height) * stereoNode.aspect;
    if (orthographicEyes[index]) {
      // Parallel eye axes, with a horizontal depth shear. In camera space a
      // point (x, y, z) projects as x - e - e*z/f; eye displacement cancels on
      // the focus plane z=-f while nearer and farther points gain disparity.
      const offset = (index === 0 ? -0.5 : 0.5) * stereoNode.eyeSeparation;
      const projection = createCameraProjection({
        ...projectionCamera,
        orthographicSize: (cameraSpec.orthographicSize ?? 1.4) / stereoNode.zoom
      }, aspect);
      const eyeProjection = new Float32Array(projection);
      eyeProjection[8] = projection[8] - offset / stereoNode.focus * projection[0];
      const eyeView = new Float32Array(view);
      eyeView[12] = view[12] - offset;
      const position: [number, number, number] = [
        eye[0] + offset * view[0],
        eye[1] + offset * view[4],
        eye[2] + offset * view[8]
      ];
      if (![...position, ...eyeView, ...eyeProjection].every(Number.isFinite)) {
        throw new RangeError("CAMERA_STEREO_INVALID: orthographic eye matrices and positions must be finite");
      }
      if (offset === 0 || eyeView[12] === Math.fround(view[12]) || eyeProjection[8] === Math.fround(projection[8])) {
        throw new RangeError("CAMERA_STEREO_PRECISION_UNSUPPORTED: eye separation or focus is below projection precision");
      }
      let inverse: Mat4;
      try {
        inverse = invertMat4(Array.from(eyeProjection) as Mat4);
      } catch {
        throw new RangeError("CAMERA_STEREO_INVALID: orthographic eye projection must be invertible");
      }
      const projectionMatrixInverse = new Float32Array(inverse);
      const viewProjectionMatrix = new Float32Array(multiplyMat4(Array.from(eyeProjection) as Mat4, Array.from(eyeView) as Mat4));
      if (![...projectionMatrixInverse, ...viewProjectionMatrix].every(Number.isFinite)) {
        throw new RangeError("CAMERA_STEREO_INVALID: orthographic eye matrices must be finite and invertible");
      }
      return {
        id: cameraViewId(stereoNode.name, settings?.id, index),
        viewport,
        ...(settings?.scissor ? { scissor: toPixelRect(settings.scissor, size) } : {}),
        ...(settings?.postprocess !== undefined ? { postprocess: settings.postprocess } : {}),
        cameraPosition: position,
        camera: {
          viewMatrix: eyeView,
          projectionMatrix: eyeProjection,
          projectionMatrixInverse,
          viewProjectionMatrix,
          projectionMetadata,
          depthConvention,
          ...layerMask(cameraSpec.layers)
        }
      };
    }
    const projection = createCameraProjection(projectionCamera, aspect);
    // Use the stereo helper for eye poses. Keep the authored projection (including
    // film and view offsets), and add just the eye's off-axis convergence shift.
    const eyes = computeStereoEyes({
      viewMatrix: view,
      projectionMatrix: projection,
      cameraPosition: [eye[0], eye[1], eye[2]],
      // For a physical lens the projection has already been validated above.
      // The helper's FOV only feeds its discarded projection, not the eye pose.
      fov: cameraSpec.focalLength !== undefined ? 45 : (cameraSpec.fov ?? 45),
      aspect,
      near,
      focus: stereoNode.focus,
      eyeSeparation: stereoNode.eyeSeparation
    });
    const frame = index === 0 ? eyes.left : eyes.right;
    const eyeProjection = new Float32Array(projection);
    eyeProjection[0] = eyeProjection[0]! * stereoNode.zoom;
    eyeProjection[5] = eyeProjection[5]! * stereoNode.zoom;
    const unshiftedProjectionOffset = eyeProjection[8]!;
    eyeProjection[8] = eyeProjection[8]! + (index === 0 ? 1 : -1) * stereoNode.eyeSeparation * 0.5 / stereoNode.focus * eyeProjection[0]!;
    if (![...frame.viewMatrix, ...eyeProjection].every(Number.isFinite)
      || !frame.cameraPosition.every((coordinate) => Number.isFinite(coordinate) && Number.isFinite(Math.fround(coordinate)))) {
      throw new RangeError("CAMERA_STEREO_INVALID: perspective eye matrices and positions must be finite");
    }
    let inverse: Mat4;
    try {
      inverse = invertMat4(Array.from(eyeProjection) as Mat4);
    } catch {
      throw new RangeError("CAMERA_STEREO_INVALID: perspective eye projection must be invertible");
    }
    const projectionMatrixInverse = new Float32Array(inverse);
    const viewProjectionMatrix = new Float32Array(multiplyMat4(Array.from(eyeProjection) as typeof projection, Array.from(frame.viewMatrix) as typeof view));
    if (![...projectionMatrixInverse, ...viewProjectionMatrix].every(Number.isFinite)) {
      throw new RangeError("CAMERA_STEREO_INVALID: perspective eye matrices must be finite and invertible");
    }
    // Eye translation is applied in camera space, so it changes element 12
    // for any camera orientation. Compare against the same Float32 baselines
    // used to construct each final matrix, including an asymmetric tile.
    if (frame.viewMatrix[12] === Math.fround(view[12]) || eyeProjection[8] === unshiftedProjectionOffset) {
      throw new RangeError("CAMERA_STEREO_PRECISION_UNSUPPORTED: eye separation or focus is below projection precision");
    }
    return {
      id: cameraViewId(stereoNode.name, settings?.id, index),
      viewport,
      ...(settings?.scissor ? { scissor: toPixelRect(settings.scissor, size) } : {}),
      ...(settings?.postprocess !== undefined ? { postprocess: settings.postprocess } : {}),
      cameraPosition: frame.cameraPosition,
      camera: {
        viewMatrix: frame.viewMatrix,
        projectionMatrix: eyeProjection,
        viewProjectionMatrix,
        projectionMetadata,
        depthConvention,
        ...layerMask(cameraSpec.layers)
      }
    };
  };
  return [eyeView(0, leftViewport), eyeView(1, rightViewport)];
}
