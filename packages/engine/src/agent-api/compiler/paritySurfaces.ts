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
import type { AuraRuntimeNodeRegistry, AuraSceneSnapshot } from "../nodes/types.js";
import { groups } from "../nodes/groups.js";
import { colorToLinearRgba } from "../colorUtils.js";
import { resolveCameraFrame } from "./camera.js";
import { createCameraProjection, resolveCameraClipping } from "../RootRuntimeSupport.js";
import { lookAtMat4, multiplyMat4 } from "@aura3d/scene/math";
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

  return {
    prepare(source, snapshot, runtimeNodes, time, aspect, size) {
      if (disposed) return source;
      const flattened = groups.flatten(snapshot.nodes);
      const mirrorNodes = flattened.filter(isAuraMirrorSurfaceNode);
      const cubeNodes = flattened.filter(isAuraCubeCameraNode);
      // L7/SC-01: ArrayCamera / StereoCamera — the frame renders once per view into its viewport.
      const views = size ? createCameraViews(flattened.filter(isAuraCameraArrayNode), flattened.filter(isAuraCameraStereoNode), snapshot, runtimeNodes, time, size, warn) : undefined;
      const withViews = (result: RenderSource): RenderSource => (views ? { ...result, views } : result);
      if (mirrorNodes.length === 0 && cubeNodes.length === 0) return withViews(source);

      const baseItems = (): readonly RenderItem[] => [
        ...(source.collectRenderItems?.() ?? source.renderItems ?? [])
      ];
      const { eye, target } = resolveCameraFrame(snapshot, snapshot.camera, time, runtimeNodes);
      const projection = createCameraProjection(snapshot.camera, aspect);
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
  return {
    x,
    y,
    width: Math.max(1, Math.min(size.width - x, Math.round(viewport.width * size.width))),
    height: Math.max(1, Math.min(size.height - y, Math.round(viewport.height * size.height)))
  };
};

/**
 * Builds `RenderSource.views` from authored `cameras.array` / `cameras.stereo`
 * nodes. Only one multi-view node is honoured per scene (the first); extras warn.
 */
function createCameraViews(
  arrayNodes: readonly AuraCameraArrayNode[],
  stereoNodes: readonly AuraCameraStereoNode[],
  snapshot: AuraSceneSnapshot,
  runtimeNodes: AuraRuntimeNodeRegistry | undefined,
  time: number,
  size: { readonly width: number; readonly height: number },
  warn: (message: string) => void
): readonly RendererView[] | undefined {
  if (arrayNodes.length + stereoNodes.length === 0) return undefined;
  if (arrayNodes.length + stereoNodes.length > 1) {
    warn("CAMERA_VIEWS_MULTIPLE: only the first cameras.array / cameras.stereo node is honoured per scene");
  }
  const layerMask = (layers: number | undefined) => (layers !== undefined ? { layerMask: layers >>> 0 } : {});
  const arrayNode = arrayNodes[0];
  const stereoNode = arrayNode ? undefined : stereoNodes[0];

  if (arrayNode) {
    return arrayNode.cameras.map((entry): RendererView => {
      const spec = { ...snapshot.camera, ...(entry.camera ?? {}) };
      const viewport = toPixelRect(entry.viewport, size);
      const { eye, target } = resolveCameraFrame(snapshot, spec, time, runtimeNodes);
      const view = lookAtMat4([...eye], [...target], [0, 1, 0]);
      const projection = createCameraProjection(spec, viewport.width / Math.max(1, viewport.height));
      return {
        viewport,
        cameraPosition: [eye[0], eye[1], eye[2]],
        camera: {
          viewMatrix: new Float32Array(view),
          projectionMatrix: new Float32Array(projection),
          viewProjectionMatrix: new Float32Array(multiplyMat4(projection, view)),
          ...layerMask(spec.layers)
        }
      };
    });
  }

  if (!stereoNode) return undefined;
  const spec = snapshot.camera;
  if (spec.mode === "orthographic" || spec.mode === "isometric") {
    warn("CAMERA_STEREO_ORTHOGRAPHIC: cameras.stereo requires a perspective camera; rendering the single scene camera");
    return undefined;
  }
  const canvasAspect = size.width / Math.max(1, size.height);
  const fov = stereoNode.fov ?? spec.fov ?? 45;
  const { near } = resolveCameraClipping(spec);
  const { eye, target } = resolveCameraFrame(snapshot, spec, time, runtimeNodes);
  const view = lookAtMat4([...eye], [...target], [0, 1, 0]);
  const projection = createCameraProjection({ ...spec, mode: "perspective", fov }, canvasAspect);
  const sideBySide = stereoNode.layout === "side-by-side";
  const eyes = computeStereoEyes({
    viewMatrix: view,
    projectionMatrix: projection,
    cameraPosition: [eye[0], eye[1], eye[2]],
    fov,
    aspect: canvasAspect,
    near,
    focus: stereoNode.focus,
    zoom: stereoNode.zoom,
    eyeSeparation: stereoNode.eyeSeparation,
    aspectScale: stereoNode.aspect ?? (sideBySide ? 0.5 : 2)
  });
  const halfWidth = Math.floor(size.width / 2);
  const halfHeight = Math.floor(size.height / 2);
  const leftViewport = sideBySide
    ? { x: 0, y: 0, width: halfWidth, height: size.height }
    : { x: 0, y: halfHeight, width: size.width, height: size.height - halfHeight };
  const rightViewport = sideBySide
    ? { x: halfWidth, y: 0, width: size.width - halfWidth, height: size.height }
    : { x: 0, y: 0, width: size.width, height: halfHeight };
  if (leftViewport.width < 1 || leftViewport.height < 1 || rightViewport.width < 1 || rightViewport.height < 1) {
    warn("CAMERA_STEREO_TOO_SMALL: render target is too small to split into two eye viewports");
    return undefined;
  }
  const eyeView = (frame: typeof eyes.left, viewport: typeof leftViewport): RendererView => ({
    viewport,
    cameraPosition: frame.cameraPosition,
    camera: {
      viewMatrix: frame.viewMatrix,
      projectionMatrix: frame.projectionMatrix,
      viewProjectionMatrix: frame.viewProjectionMatrix,
      ...layerMask(spec.layers)
    }
  });
  return [eyeView(eyes.left, leftViewport), eyeView(eyes.right, rightViewport)];
}
