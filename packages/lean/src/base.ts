import {
  Geometry,
  PBRMaterial,
  type CameraLike,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering/lean-runtime";
import {
  composeMat4,
  lookAtMat4,
  multiplyMat4,
  perspectiveMat4,
  type Vec3
} from "@aura3d/scene/math";

export type AuraLeanVec3 = readonly [number, number, number];
export type AuraLeanColor = string;

export interface AuraLeanMaterialSpec {
  readonly color?: AuraLeanColor;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly metalness?: number;
  readonly clearcoat?: number;
}

export interface AuraLeanPrimitiveSpec {
  readonly kind: "primitive";
  readonly primitive: "box" | "sphere" | "plane";
  readonly name?: string;
  readonly material?: AuraLeanMaterialSpec;
  readonly position: AuraLeanVec3;
  readonly scale: AuraLeanVec3;
  readonly physics?: AuraLeanPhysicsSpec;
  readonly runtimeId?: string;
  readonly visible?: boolean;
}

export interface AuraLeanAssetDefinition {
  readonly type: "model" | "texture" | "audio" | "video" | "environment" | "navigation";
  readonly format: string;
  readonly url: string;
  readonly hash?: string;
  readonly bounds?: AuraLeanVec3;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AuraLeanModelAsset extends AuraLeanAssetDefinition {
  readonly id: string;
  readonly type: "model";
  readonly format: "glb" | "gltf";
}

export interface AuraLeanModelSpec {
  readonly kind: "model";
  readonly asset: AuraLeanModelAsset;
  readonly name?: string;
  readonly position: AuraLeanVec3;
  readonly scale: AuraLeanVec3;
  readonly runtimeId?: string;
  readonly visible?: boolean;
}

export interface AuraLeanPhysicsSpec {
  readonly type?: "static" | "dynamic" | "kinematic";
  readonly mass?: number;
}

export interface AuraLeanCameraSpec {
  readonly mode: "perspective" | "orbit";
  readonly position: AuraLeanVec3;
  readonly target: AuraLeanVec3;
  readonly fov: number;
}

interface AuraLeanIntentSpec {
  readonly kind: "light" | "environment" | "interaction";
}

type AuraLeanSceneNode = AuraLeanPrimitiveSpec | AuraLeanModelSpec | AuraLeanIntentSpec;

export interface AuraLeanSceneSnapshot {
  readonly background: AuraLeanColor;
  readonly camera: AuraLeanCameraSpec;
  readonly nodes: readonly AuraLeanSceneNode[];
}

export class AuraLeanNodeBuilder {
  private positionValue: AuraLeanVec3 = [0, 0, 0];
  private scaleValue: AuraLeanVec3 = [1, 1, 1];
  private physicsValue: AuraLeanPhysicsSpec | undefined;
  private runtimeIdValue: string | undefined;

  constructor(private readonly primitiveValue: Omit<AuraLeanPrimitiveSpec, "position" | "scale">) {}

  position(x: number, y: number, z: number): this {
    this.positionValue = [x, y, z];
    return this;
  }

  scale(value: number | AuraLeanVec3): this {
    this.scaleValue = typeof value === "number" ? [value, value, value] : value;
    return this;
  }

  physics(value: AuraLeanPhysicsSpec): this {
    this.physicsValue = value;
    return this;
  }

  runtime(id: string): this {
    this.runtimeIdValue = id;
    return this;
  }

  toJSON(): AuraLeanPrimitiveSpec {
    return {
      ...this.primitiveValue,
      position: this.positionValue,
      scale: this.scaleValue,
      ...(this.physicsValue ? { physics: this.physicsValue } : {}),
      ...(this.runtimeIdValue ? { runtimeId: this.runtimeIdValue } : {})
    };
  }
}

export class AuraLeanModelBuilder {
  private positionValue: AuraLeanVec3 = [0, 0, 0];
  private scaleValue: AuraLeanVec3 = [1, 1, 1];
  private runtimeIdValue: string | undefined;

  constructor(private readonly asset: AuraLeanModelAsset, private readonly name?: string) {}

  position(x: number, y: number, z: number): this {
    this.positionValue = [x, y, z];
    return this;
  }

  scale(value: number | AuraLeanVec3): this {
    this.scaleValue = typeof value === "number" ? [value, value, value] : value;
    return this;
  }

  runtime(id: string): this {
    this.runtimeIdValue = id;
    return this;
  }

  toJSON(): AuraLeanModelSpec {
    return {
      kind: "model",
      asset: this.asset,
      position: this.positionValue,
      scale: this.scaleValue,
      ...(this.name ? { name: this.name } : {}),
      ...(this.runtimeIdValue ? { runtimeId: this.runtimeIdValue } : {})
    };
  }
}

export class AuraLeanSceneBuilder {
  private backgroundValue: AuraLeanColor = "#070b12";
  private cameraValue: AuraLeanCameraSpec = camera.orbit();
  private readonly nodes: AuraLeanSceneNode[] = [];

  background(color: AuraLeanColor): this {
    this.backgroundValue = color;
    return this;
  }

  camera(value: AuraLeanCameraSpec): this {
    this.cameraValue = value;
    return this;
  }

  add(value: AuraLeanNodeBuilder | AuraLeanModelBuilder | AuraLeanIntentSpec): this {
    this.nodes.push(value instanceof AuraLeanNodeBuilder || value instanceof AuraLeanModelBuilder ? value.toJSON() : value);
    return this;
  }

  addMany(values: readonly (AuraLeanNodeBuilder | AuraLeanModelBuilder | AuraLeanIntentSpec)[]): this {
    for (const value of values) this.add(value);
    return this;
  }

  toJSON(): AuraLeanSceneSnapshot {
    return { background: this.backgroundValue, camera: this.cameraValue, nodes: [...this.nodes] };
  }
}

export const camera = {
  perspective(options: Partial<Omit<AuraLeanCameraSpec, "mode">> = {}): AuraLeanCameraSpec {
    return {
      mode: "perspective",
      position: options.position ?? [2.4, 1.8, 3.2],
      target: options.target ?? [0, 0, 0],
      fov: options.fov ?? 45
    };
  },
  orbit(options: { readonly target?: AuraLeanVec3; readonly distance?: number; readonly fov?: number } = {}): AuraLeanCameraSpec {
    const distance = options.distance ?? 4;
    return {
      mode: "orbit",
      position: [distance * 0.62, distance * 0.42, distance],
      target: options.target ?? [0, 0, 0],
      fov: options.fov ?? 45
    };
  }
} as const;

export const material = {
  pbr(options: AuraLeanMaterialSpec = {}): AuraLeanMaterialSpec {
    return options;
  },
  clearcoatPaint(options: AuraLeanMaterialSpec = {}): AuraLeanMaterialSpec {
    return { ...options, metallic: options.metallic ?? options.metalness ?? 0.15, clearcoat: options.clearcoat ?? 1 };
  }
} as const;

function primitive(primitiveKind: AuraLeanPrimitiveSpec["primitive"], options: { readonly name?: string; readonly material?: AuraLeanMaterialSpec } = {}): AuraLeanNodeBuilder {
  return new AuraLeanNodeBuilder({ kind: "primitive", primitive: primitiveKind, ...options });
}

export const primitives = {
  box: (options: { readonly name?: string; readonly material?: AuraLeanMaterialSpec } = {}) => primitive("box", options),
  sphere: (options: { readonly name?: string; readonly material?: AuraLeanMaterialSpec } = {}) => primitive("sphere", options),
  plane: (options: { readonly name?: string; readonly material?: AuraLeanMaterialSpec } = {}) => primitive("plane", options)
} as const;

export function model(asset: AuraLeanModelAsset, options: { readonly name?: string } = {}): AuraLeanModelBuilder {
  return new AuraLeanModelBuilder(asset, options.name);
}

export type AuraLeanAssetMap<T extends Record<string, AuraLeanAssetDefinition>> = {
  readonly [K in keyof T]: T[K] & { readonly id: Extract<K, string> };
};

/** Stable typed-asset contract shared with files generated by `@aura3d/cli`. */
export type AuraAssetDefinition = AuraLeanAssetDefinition;

/** Stable typed-asset map shared with files generated by `@aura3d/cli`. */
export type AuraAssetMap<T extends Record<string, AuraAssetDefinition>> = AuraLeanAssetMap<T>;

export function defineAuraAssets<const T extends Record<string, AuraLeanAssetDefinition>>(definitions: T): AuraLeanAssetMap<T> {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { ...definition, id }])
  ) as AuraLeanAssetMap<T>;
}

const intent = (kind: AuraLeanIntentSpec["kind"]): AuraLeanIntentSpec => ({ kind });

export const lights = {
  directional: (_options: { readonly intensity?: number } = {}) => ({
    ...intent("light"),
    position: (_x: number, _y: number, _z: number): AuraLeanIntentSpec => intent("light")
  })
} as const;

export const environments = { studio: (): AuraLeanIntentSpec => intent("environment") } as const;
export const interactions = { orbit: (): AuraLeanIntentSpec => intent("interaction") } as const;
export function scene(): AuraLeanSceneBuilder { return new AuraLeanSceneBuilder(); }

export interface AuraLeanAppDiagnostics {
  readonly backend: "initializing" | "webgl2" | "error";
  /** Selected renderer owner; successful public lean entries mount the production runtime. */
  readonly runtimeBackend: "unmounted" | "production-runtime";
  readonly drawCalls: number;
  readonly errors: readonly string[];
}

export interface AuraLeanApp {
  ready(): Promise<void>;
  diagnostics(): AuraLeanAppDiagnostics;
  onFrame(callback: (deltaSeconds: number) => void): () => void;
  readonly nodes: AuraLeanNodeRegistry;
  dispose(): void;
}

export interface AuraLeanRuntimeNode {
  setPosition(x: number, y: number, z: number): void;
  setScale(value: number | AuraLeanVec3): void;
  setVisible(visible: boolean): void;
}

export interface AuraLeanNodeRegistry {
  require(id: string): AuraLeanRuntimeNode;
}

export interface AuraLeanModelRuntime {
  initialize(canvas: HTMLCanvasElement, snapshot: AuraLeanSceneSnapshot): Promise<void>;
  renderItems(): readonly RenderItem[];
  dispose(): void;
}

export interface AuraLeanCreateAppOptions {
  readonly scene: AuraLeanSceneBuilder | AuraLeanSceneSnapshot;
  readonly autoStart?: boolean;
  /** Adapter seam used by `@aura3d/lean/product`; absent from the core entry. */
  readonly modelRuntime?: AuraLeanModelRuntime;
}

export interface AuraLeanCreateAppRuntimeOptions extends AuraLeanCreateAppOptions {
  /** Internal renderer seam supplied by the core, product, or game entry wrapper. */
  readonly rendererFactory: AuraLeanRendererFactory;
}

export interface AuraLeanRenderer {
  renderInteractiveFrame(input: {
    readonly source: RenderSource;
    readonly camera?: CameraLike;
    readonly metadata: {
      readonly assetId: string;
      readonly assetUri: string;
      readonly meshCount: number;
      readonly primitiveCount: number;
      readonly materialCount: number;
      readonly textureCount: number;
      readonly imageCount: number;
      readonly animationCount: number;
      readonly skinCount: number;
      readonly morphTargetCount: number;
      readonly extensionsUsed: readonly string[];
    };
  }): { readonly diagnostics: { readonly drawCalls: number } };
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface AuraLeanRendererFactory {
  create(options: {
    readonly canvas: HTMLCanvasElement | OffscreenCanvas;
    readonly width: number;
    readonly height: number;
    readonly clearColor?: readonly [number, number, number, number];
    readonly antialias?: boolean;
    readonly preserveDrawingBuffer?: boolean;
  }): Promise<AuraLeanRenderer>;
}

export type AuraLeanAppTarget = HTMLCanvasElement | HTMLElement | string;

export function createAuraAppWithRenderer(target: AuraLeanAppTarget, options: AuraLeanCreateAppRuntimeOptions): AuraLeanApp {
  const canvas = resolveCanvas(target);
  const snapshot = options.scene instanceof AuraLeanSceneBuilder ? options.scene.toJSON() : options.scene;
  const entries = snapshot.nodes
    .filter((node): node is AuraLeanPrimitiveSpec => node.kind === "primitive")
    .map(createPrimitiveEntry);
  let renderer: AuraLeanRenderer | undefined;
  let frameHandle = 0;
  let disposed = false;
  let previousFrameTime = 0;
  const frameCallbacks = new Set<(deltaSeconds: number) => void>();
  let state: AuraLeanAppDiagnostics = { backend: "initializing", runtimeBackend: "unmounted", drawCalls: 0, errors: [] };

  const readyPromise = initialize();

  async function initialize(): Promise<void> {
    resizeCanvas(canvas);
    try {
      renderer = await options.rendererFactory.create({
        canvas,
        width: canvas.width,
        height: canvas.height,
        antialias: true,
        preserveDrawingBuffer: true,
        clearColor: color4(snapshot.background)
      });
      await options.modelRuntime?.initialize(canvas, snapshot);
      renderFrame();
      if (options.autoStart !== false) frameHandle = requestAnimationFrame(loop);
    } catch (error) {
      state = { backend: "error", runtimeBackend: "unmounted", drawCalls: 0, errors: [error instanceof Error ? error.message : String(error)] };
      throw error;
    }
  }

  function loop(time = 0): void {
    if (disposed) return;
    const deltaSeconds = previousFrameTime === 0 ? 1 / 60 : Math.min(0.1, Math.max(0, (time - previousFrameTime) / 1000));
    previousFrameTime = time;
    for (const callback of frameCallbacks) callback(deltaSeconds);
    renderFrame();
    frameHandle = requestAnimationFrame(loop);
  }

  function renderFrame(): void {
    if (!renderer) return;
    const items: RenderItem[] = entries.filter((entry) => entry.node.visible !== false).map((entry) => ({
      geometry: entry.geometry,
      material: entry.material,
      modelMatrix: createAuraLeanModelMatrix(entry.node.position, entry.node.scale),
      label: entry.node.name ?? `aura-lean-${entry.node.primitive}`,
      includeInAutoFrame: false
    }));
    items.push(...(options.modelRuntime?.renderItems() ?? []));
    const source: RenderSource = { collectRenderItems: () => items, cameraPolicy: "require" };
    const result = renderer.renderInteractiveFrame({
      source,
      camera: { viewProjectionMatrix: viewProjection(snapshot.camera, canvas.width / Math.max(1, canvas.height)) } satisfies CameraLike,
      metadata: {
        assetId: "aura-lean-scene",
        assetUri: "aura3d://lean-scene",
        meshCount: items.length,
        primitiveCount: items.length,
        materialCount: items.length,
        textureCount: 0,
        imageCount: 0,
        animationCount: 0,
        skinCount: 0,
        morphTargetCount: 0,
        extensionsUsed: []
      }
    });
    state = { backend: "webgl2", runtimeBackend: "production-runtime", drawCalls: result.diagnostics.drawCalls, errors: [] };
  }

  return {
    ready: () => readyPromise,
    diagnostics: () => state,
    onFrame(callback) {
      frameCallbacks.add(callback);
      return () => frameCallbacks.delete(callback);
    },
    nodes: createNodeRegistry(snapshot),
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameHandle);
      renderer?.dispose();
      frameCallbacks.clear();
      for (const entry of entries) {
        entry.geometry.dispose();
        entry.material.dispose();
      }
      options.modelRuntime?.dispose();
    }
  };
}

function createNodeRegistry(snapshot: AuraLeanSceneSnapshot): AuraLeanNodeRegistry {
  const nodes = snapshot.nodes.filter(
    (node): node is AuraLeanPrimitiveSpec | AuraLeanModelSpec => node.kind === "primitive" || node.kind === "model"
  );
  return {
    require(id) {
      const node = nodes.find((candidate) => candidate.runtimeId === id || candidate.name === id);
      if (!node) {
        throw new Error(`Aura3D lean runtime node "${id}" was not found. Expected a primitive or model with .runtime("${id}") or name "${id}".`);
      }
      const mutable = node as {
        position: AuraLeanVec3;
        scale: AuraLeanVec3;
        visible?: boolean;
      };
      return {
        setPosition(x, y, z) { mutable.position = [x, y, z]; },
        setScale(value) { mutable.scale = typeof value === "number" ? [value, value, value] : value; },
        setVisible(visible) { mutable.visible = visible; }
      };
    }
  };
}

function resolveCanvas(target: AuraLeanAppTarget): HTMLCanvasElement {
  const element = typeof target === "string" ? document.querySelector(target) : target;
  if (!element) throw new Error(`Aura3D lean entry could not find target "${String(target)}".`);
  if (element instanceof HTMLCanvasElement) return element;
  const canvas = document.createElement("canvas");
  canvas.dataset.aura3dCanvas = "true";
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  element.append(canvas);
  return canvas;
}

function createPrimitiveEntry(node: AuraLeanPrimitiveSpec): { readonly node: AuraLeanPrimitiveSpec; readonly geometry: Geometry; readonly material: PBRMaterial } {
  const spec = node.material ?? {};
  return {
    node,
    geometry: node.primitive === "sphere"
      ? Geometry.uvSphere(0.5, 32, 16)
      : node.primitive === "plane"
        ? Geometry.litPlane()
        : Geometry.litCube(1),
    material: new PBRMaterial({
      baseColor: linearColor4(spec.color ?? "#d7dee8"),
      roughness: clamp(spec.roughness ?? 0.58),
      metallic: clamp(spec.metallic ?? spec.metalness ?? 0),
      clearcoatFactor: clamp(spec.clearcoat ?? 0)
    })
  };
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const ratio = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const width = canvas.clientWidth || canvas.width || 960;
  const height = canvas.clientHeight || canvas.height || 540;
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
}

function color4(value: string): readonly [number, number, number, number] {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    const number = Number.parseInt(value.slice(1), 16);
    return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255, 1];
  }
  return [0.1, 0.1, 0.1, 1];
}

function linearColor4(value: string): readonly [number, number, number, number] {
  const [red, green, blue, alpha] = color4(value);
  return [srgbToLinear(red), srgbToLinear(green), srgbToLinear(blue), alpha];
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

export function createAuraLeanModelMatrix(position: AuraLeanVec3, scale: AuraLeanVec3): Float32Array {
  return new Float32Array(composeMat4(vec3(position), [0, 0, 0, 1], vec3(scale)));
}

function viewProjection(cameraSpec: AuraLeanCameraSpec, aspect: number): Float32Array {
  const view = lookAtMat4(vec3(cameraSpec.position), vec3(cameraSpec.target), [0, 1, 0]);
  const projection = perspectiveMat4(cameraSpec.fov * Math.PI / 180, Math.max(0.01, aspect), 0.05, 100);
  return new Float32Array(multiplyMat4(projection, view));
}

function vec3(value: AuraLeanVec3): Vec3 { return [value[0], value[1], value[2]]; }
