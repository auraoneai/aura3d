import {
  Bounds3 as SceneBounds3,
  Camera,
  Scene,
  identityMat4,
  invertMat4,
  multiplyMat4,
  type Mat4,
  type SceneNode
} from "@galileo3d/scene";
import type { Ray } from "@galileo3d/math";
import { createRenderDevice, type RenderBackendOptions } from "./RenderBackend";
import { type RenderDevice, RenderDeviceError, type RenderDeviceDiagnostics } from "./RenderDevice";
import { ForwardPass, type EnvironmentLightingOptions, type RenderItem, type RenderMaterial } from "./ForwardPass";
import { type CollectedLight, LightCollector } from "./LightCollector";
import { Geometry } from "./Geometry";
import { type MorphTargetDelta } from "./MorphTarget";
import { RenderGraph } from "./RenderGraph";
import { createDefaultShaderLibrary, type ShaderLibrary } from "./ShaderLibrary";

export interface RendererOptions extends RenderBackendOptions {
  readonly width?: number;
  readonly height?: number;
  readonly clearColor?: readonly [number, number, number, number];
  readonly shaderLibrary?: ShaderLibrary;
}

export interface ResizeToDisplayOptions {
  readonly cssWidth?: number;
  readonly cssHeight?: number;
  readonly devicePixelRatio?: number;
}

export interface ResizeToDisplayResult {
  readonly resized: boolean;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly width: number;
  readonly height: number;
}

export interface RendererAnimationLoop {
  readonly running: boolean;
  stop(): void;
}

export interface RenderSource {
  collectRenderItems?(): Iterable<RenderItem>;
  readonly renderItems?: Iterable<RenderItem>;
  readonly scene?: Scene;
  readonly collectedLights?: Iterable<CollectedLight>;
  readonly environmentLighting?: EnvironmentLightingOptions;
  readonly geometryLibrary?: RenderResourceLookup<Geometry>;
  readonly materialLibrary?: RenderResourceLookup<RenderMaterial>;
  readonly morphTargetLibrary?: RenderResourceLookup<readonly MorphTargetDelta[]>;
  readonly frustumCulling?: boolean;
}

export type RenderResourceLookup<T> = ReadonlyMap<string, T> | Readonly<Record<string, T>>;

export interface CameraLike {
  readonly projectionMatrix?: Float32Array | readonly number[];
  readonly viewMatrix?: Float32Array | readonly number[];
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
  updateCameraMatrices?(): void;
}

export interface ScenePickHit {
  readonly node: SceneNode;
  readonly geometry: Geometry;
  readonly distance: number;
  readonly bounds: SceneBounds3;
}

export class Renderer {
  public readonly device: RenderDevice;
  private readonly graph = new RenderGraph();
  private readonly shaderLibrary: ShaderLibrary;
  private readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  private width: number;
  private height: number;
  private clearColor: readonly [number, number, number, number];
  private disposed = false;
  private animationLoop: RendererAnimationLoopImpl | null = null;

  private constructor(device: RenderDevice, options: RendererOptions) {
    this.device = device;
    this.canvas = options.canvas;
    this.width = options.width ?? options.canvas?.width ?? 1;
    this.height = options.height ?? options.canvas?.height ?? 1;
    this.clearColor = options.clearColor ?? [0, 0, 0, 1];
    this.shaderLibrary = options.shaderLibrary ?? createDefaultShaderLibrary();
    this.resizeCanvas(this.width, this.height);
  }

  static async create(options: RendererOptions = {}): Promise<Renderer> {
    const device = await createRenderDevice(options);
    return new Renderer(device, options);
  }

  resize(width: number, height: number): void {
    this.assertAlive();
    if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
      throw new RenderDeviceError("Renderer dimensions must be positive integers", "INVALID_FRAME_SIZE", { width, height });
    }
    this.width = width;
    this.height = height;
    this.resizeCanvas(width, height);
  }

  resizeToDisplay(options: ResizeToDisplayOptions = {}): ResizeToDisplayResult {
    this.assertAlive();
    if (!this.canvas) {
      throw new RenderDeviceError("resizeToDisplay requires a canvas-backed renderer", "CANVAS_REQUIRED");
    }
    const cssWidth = options.cssWidth ?? readCanvasCssSize(this.canvas, "width");
    const cssHeight = options.cssHeight ?? readCanvasCssSize(this.canvas, "height");
    const devicePixelRatio = options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
    if (![cssWidth, cssHeight, devicePixelRatio].every(Number.isFinite) || cssWidth <= 0 || cssHeight <= 0 || devicePixelRatio <= 0) {
      throw new RenderDeviceError("Display size and DPR must be finite positive values", "INVALID_DISPLAY_SIZE", {
        cssWidth,
        cssHeight,
        devicePixelRatio
      });
    }
    const width = Math.max(1, Math.round(cssWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(cssHeight * devicePixelRatio));
    const resized = width !== this.width || height !== this.height;
    if (resized) {
      this.resize(width, height);
    }
    return { resized, cssWidth, cssHeight, devicePixelRatio, width, height };
  }

  startAnimationLoop(callback: (timeMs: number, renderer: Renderer) => void): RendererAnimationLoop {
    this.assertAlive();
    this.animationLoop?.stop();
    const loop = new RendererAnimationLoopImpl(this, callback);
    this.animationLoop = loop;
    loop.start();
    return loop;
  }

  render(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics {
    this.assertAlive();
    sceneFromSource(source)?.updateWorldTransforms();
    const resolvedCamera = resolveCamera(source, camera);
    const cameraViewProjection = resolvedCamera?.viewProjectionMatrix ?? identityMat4();
    const items = collectRenderItems(source, cameraViewProjection, resolvedCamera?.camera);
    const lights = collectRenderLights(source);
    const environmentLighting = collectEnvironmentLighting(source);
    this.graph.clear();
    this.graph.addPass(new ForwardPass({ items, lights, environmentLighting, shaderLibrary: this.shaderLibrary }));
    this.device.beginFrame(this.width, this.height);
    try {
      this.device.clear(this.clearColor);
      this.graph.execute({ device: this.device, width: this.width, height: this.height });
    } finally {
      this.device.endFrame();
    }
    return this.device.getDiagnostics();
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.device.getDiagnostics();
  }

  dispose(): void {
    this.animationLoop?.stop();
    this.animationLoop = null;
    this.device.dispose();
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed || this.device.disposed) {
      throw new RenderDeviceError("Renderer is disposed", "DISPOSED_DEVICE");
    }
  }

  private resizeCanvas(width: number, height: number): void {
    if (!this.canvas) return;
    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }
  }
}

export function pickSceneRenderables(
  source: Pick<RenderSource, "geometryLibrary" | "scene">,
  ray: Ray
): ScenePickHit | undefined {
  const scene = source.scene;
  if (!scene) {
    throw new RenderDeviceError("Scene picking requires a scene", "SCENE_PICKING_SCENE_MISSING");
  }
  if (!source.geometryLibrary) {
    throw new RenderDeviceError("Scene picking requires a geometryLibrary resource lookup", "SCENE_PICKING_RESOURCES_MISSING");
  }

  scene.updateWorldTransforms();
  const hits: ScenePickHit[] = [];
  for (const { node, renderable } of scene.collectRenderables()) {
    const geometry = lookupRenderResource(source.geometryLibrary, renderable.geometry);
    if (!geometry) {
      throw new RenderDeviceError("Scene pick target references missing geometry", "SCENE_PICK_GEOMETRY_MISSING", {
        node: node.name,
        geometry: renderable.geometry
      });
    }
    const bounds = renderableWorldBounds(geometry, node.transform.worldMatrix, renderable.instanceTransforms);
    const hitPoint = ray.intersectBox(bounds.toMathBox());
    if (hitPoint) {
      hits.push({ node, geometry, bounds, distance: hitPoint.distanceTo(ray.origin) });
    }
  }
  return hits.sort((left, right) => left.distance - right.distance)[0];
}

class RendererAnimationLoopImpl implements RendererAnimationLoop {
  private requestId: number | null = null;
  public running = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly callback: (timeMs: number, renderer: Renderer) => void
  ) {}

  start(): void {
    if (typeof requestAnimationFrame !== "function" || typeof cancelAnimationFrame !== "function") {
      throw new RenderDeviceError("Renderer animation loops require requestAnimationFrame", "ANIMATION_LOOP_UNAVAILABLE");
    }
    this.running = true;
    this.requestId = requestAnimationFrame((timeMs) => this.tick(timeMs));
  }

  stop(): void {
    this.running = false;
    if (this.requestId !== null) {
      cancelAnimationFrame(this.requestId);
      this.requestId = null;
    }
  }

  private tick(timeMs: number): void {
    if (!this.running) {
      return;
    }
    this.callback(timeMs, this.renderer);
    if (this.running) {
      this.requestId = requestAnimationFrame((nextTimeMs) => this.tick(nextTimeMs));
    }
  }
}

function readCanvasCssSize(canvas: HTMLCanvasElement | OffscreenCanvas, axis: "width" | "height"): number {
  if ("getBoundingClientRect" in canvas) {
    const bounds = canvas.getBoundingClientRect();
    const value = axis === "width" ? bounds.width : bounds.height;
    if (value > 0) {
      return value;
    }
  }
  return axis === "width" ? canvas.width : canvas.height;
}

function collectEnvironmentLighting(source: RenderSource | Iterable<RenderItem> | Scene): EnvironmentLightingOptions | undefined {
  return source instanceof Scene || isIterable(source) ? undefined : source.environmentLighting;
}

function collectRenderItems(
  source: RenderSource | Iterable<RenderItem> | Scene,
  cameraViewProjection?: Mat4,
  camera?: Camera
): readonly RenderItem[] {
  if (isIterable(source)) {
    return applyViewProjection([...source], cameraViewProjection);
  }
  if (source instanceof Scene) {
    return collectSceneRenderItems(source, {}, cameraViewProjection, camera);
  }
  if (source.collectRenderItems) {
    return applyViewProjection([...source.collectRenderItems()], cameraViewProjection);
  }
  if (source.renderItems) {
    return applyViewProjection([...source.renderItems], cameraViewProjection);
  }
  if (source.scene) {
    return collectSceneRenderItems(source.scene, source, cameraViewProjection, source.frustumCulling === false ? undefined : camera);
  }
  return [];
}

function collectSceneRenderItems(
  scene: Scene,
  source: Pick<RenderSource, "geometryLibrary" | "materialLibrary" | "morphTargetLibrary">,
  cameraViewProjection?: Mat4,
  camera?: Camera
): readonly RenderItem[] {
  scene.updateWorldTransforms();
  const renderables = scene.collectRenderables();
  if (renderables.length === 0) {
    return [];
  }
  if (!source.geometryLibrary || !source.materialLibrary) {
    throw new RenderDeviceError("Scene rendering requires geometryLibrary and materialLibrary resource lookups", "SCENE_RENDER_RESOURCES_MISSING", {
      renderables: renderables.length
    });
  }
  const items: RenderItem[] = [];
  for (const { node, renderable } of renderables) {
    const geometry = lookupRenderResource(source.geometryLibrary!, renderable.geometry);
    const material = lookupRenderResource(source.materialLibrary!, renderable.material);
    if (!geometry) {
      throw new RenderDeviceError("Scene renderable references missing geometry", "SCENE_GEOMETRY_MISSING", {
        node: node.name,
        geometry: renderable.geometry
      });
    }
    if (!material) {
      throw new RenderDeviceError("Scene renderable references missing material", "SCENE_MATERIAL_MISSING", {
        node: node.name,
        material: renderable.material
      });
    }
    const morphTargets = source.morphTargetLibrary ? lookupRenderResource(source.morphTargetLibrary, renderable.geometry) : undefined;
    if (renderable.morphWeights.length > 0 && !morphTargets) {
      throw new RenderDeviceError("Scene renderable has morph weights but no morph target resource entry", "SCENE_MORPH_TARGETS_MISSING", {
        node: node.name,
        geometry: renderable.geometry,
        morphWeights: renderable.morphWeights.length
      });
    }
    const modelMatrix = node.transform.worldMatrix;
    const bounds = renderableWorldBounds(geometry, modelMatrix, renderable.instanceTransforms);
    if (camera && !camera.frustum.intersectsBox(bounds.toMathBox())) {
      continue;
    }
    items.push({
      geometry,
      material,
      label: node.name,
      modelMatrix,
      normalMatrix: normalMatrixFromModel(modelMatrix),
      modelViewProjectionMatrix: multiplyMat4(cameraViewProjection ?? identityMat4(), modelMatrix),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
}

function renderableWorldBounds(geometry: Geometry, modelMatrix: Mat4, instanceTransforms?: Float32Array): SceneBounds3 {
  const local = new SceneBounds3(
    [geometry.bounds.min[0], geometry.bounds.min[1], geometry.bounds.min[2]],
    [geometry.bounds.max[0], geometry.bounds.max[1], geometry.bounds.max[2]]
  );
  if (!instanceTransforms) {
    return local.transform(modelMatrix);
  }

  let bounds = new SceneBounds3();
  for (let offset = 0; offset < instanceTransforms.length; offset += 16) {
    const instanceMatrix = toMat4(instanceTransforms.slice(offset, offset + 16), "instanceTransforms");
    bounds = bounds.union(local.transform(multiplyMat4(modelMatrix, instanceMatrix)));
  }
  return bounds;
}

function applyViewProjection(items: readonly RenderItem[], cameraViewProjection?: Mat4): readonly RenderItem[] {
  if (!cameraViewProjection) {
    return items;
  }
  return items.map((item) => {
    const modelMatrix = toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label);
    return {
      ...item,
      modelMatrix,
      normalMatrix: item.normalMatrix ? toMat4(item.normalMatrix, "normalMatrix", item.label) : normalMatrixFromModel(modelMatrix),
      modelViewProjectionMatrix: multiplyMat4(cameraViewProjection, modelMatrix)
    };
  });
}

function resolveCamera(
  source: RenderSource | Iterable<RenderItem> | Scene,
  camera?: CameraLike
): { readonly viewProjectionMatrix: Mat4; readonly camera?: Camera } | undefined {
  const resolved = camera ?? resolveSceneCamera(source);
  if (!resolved) {
    return undefined;
  }
  resolved.updateCameraMatrices?.();
  if (resolved.viewProjectionMatrix) {
    return {
      viewProjectionMatrix: toMat4(resolved.viewProjectionMatrix, "viewProjectionMatrix"),
      ...(resolved instanceof Camera ? { camera: resolved } : {})
    };
  }
  if (resolved.projectionMatrix && resolved.viewMatrix) {
    return {
      viewProjectionMatrix: multiplyMat4(toMat4(resolved.projectionMatrix, "projectionMatrix"), toMat4(resolved.viewMatrix, "viewMatrix")),
      ...(resolved instanceof Camera ? { camera: resolved } : {})
    };
  }
  throw new RenderDeviceError(
    "Renderer camera must expose a viewProjectionMatrix or projectionMatrix plus viewMatrix",
    "CAMERA_VIEW_PROJECTION_MISSING"
  );
}

function resolveSceneCamera(source: RenderSource | Iterable<RenderItem> | Scene): Camera | undefined {
  return sceneFromSource(source)?.collectCameras()[0];
}

function sceneFromSource(source: RenderSource | Iterable<RenderItem> | Scene): Scene | undefined {
  return source instanceof Scene ? source : isIterable(source) ? undefined : source.scene;
}

function normalMatrixFromModel(modelMatrix: Mat4): Mat4 {
  return transposeMat4(invertMat4(modelMatrix));
}

function transposeMat4(matrix: Mat4): Mat4 {
  return [
    matrix[0], matrix[4], matrix[8], matrix[12],
    matrix[1], matrix[5], matrix[9], matrix[13],
    matrix[2], matrix[6], matrix[10], matrix[14],
    matrix[3], matrix[7], matrix[11], matrix[15]
  ];
}

function toMat4(value: Float32Array | readonly number[], field: string, label?: string): Mat4 {
  const values = Array.from(value);
  if (values.length !== 16 || !values.every(Number.isFinite)) {
    throw new RenderDeviceError("Renderer matrix inputs must be finite mat4 values", "RENDERER_MATRIX_CONTRACT", {
      field,
      label,
      scalars: values.length
    });
  }
  return values as Mat4;
}

function lookupRenderResource<T>(lookup: RenderResourceLookup<T>, key: string): T | undefined {
  if (isReadonlyMap(lookup)) {
    return lookup.get(key);
  }
  return lookup[key];
}

function isReadonlyMap<T>(lookup: RenderResourceLookup<T>): lookup is ReadonlyMap<string, T> {
  return typeof (lookup as ReadonlyMap<string, T>).get === "function";
}

function collectRenderLights(source: RenderSource | Iterable<RenderItem> | Scene): readonly CollectedLight[] {
  if (source instanceof Scene) {
    return new LightCollector().collect(source);
  }
  if (isIterable(source)) {
    return [];
  }
  if (source.collectedLights) {
    return [...source.collectedLights];
  }
  if (source.scene) {
    return new LightCollector().collect(source.scene);
  }
  return [];
}

function isIterable(value: unknown): value is Iterable<RenderItem> {
  return typeof (value as Iterable<RenderItem>)[Symbol.iterator] === "function";
}
