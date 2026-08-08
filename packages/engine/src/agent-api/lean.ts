import {
  Geometry,
  PBRMaterial,
  ProductionRuntimeRenderer,
  type CameraLike,
  type RenderItem,
  type RenderSource
} from "@aura3d/rendering/lean-runtime";

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
}

export interface AuraLeanModelAsset {
  readonly id: string;
  readonly url: string;
  readonly type: "model";
  readonly format: "glb" | "gltf";
  readonly hash?: string;
  readonly bounds?: AuraLeanVec3;
}

export interface AuraLeanModelSpec {
  readonly kind: "model";
  readonly asset: AuraLeanModelAsset;
  readonly name?: string;
  readonly position: AuraLeanVec3;
  readonly scale: AuraLeanVec3;
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

  toJSON(): AuraLeanPrimitiveSpec {
    return {
      ...this.primitiveValue,
      position: this.positionValue,
      scale: this.scaleValue,
      ...(this.physicsValue ? { physics: this.physicsValue } : {})
    };
  }
}

export class AuraLeanModelBuilder {
  private positionValue: AuraLeanVec3 = [0, 0, 0];
  private scaleValue: AuraLeanVec3 = [1, 1, 1];

  constructor(private readonly asset: AuraLeanModelAsset, private readonly name?: string) {}

  position(x: number, y: number, z: number): this {
    this.positionValue = [x, y, z];
    return this;
  }

  scale(value: number | AuraLeanVec3): this {
    this.scaleValue = typeof value === "number" ? [value, value, value] : value;
    return this;
  }

  toJSON(): AuraLeanModelSpec {
    return { kind: "model", asset: this.asset, position: this.positionValue, scale: this.scaleValue, ...(this.name ? { name: this.name } : {}) };
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
  readonly drawCalls: number;
  readonly errors: readonly string[];
}

export interface AuraLeanApp {
  ready(): Promise<void>;
  diagnostics(): AuraLeanAppDiagnostics;
  onFrame(callback: (deltaSeconds: number) => void): () => void;
  dispose(): void;
}

export interface AuraLeanModelRuntime {
  initialize(canvas: HTMLCanvasElement, snapshot: AuraLeanSceneSnapshot): Promise<void>;
  renderItems(): readonly RenderItem[];
  dispose(): void;
}

export interface AuraLeanCreateAppOptions {
  readonly scene: AuraLeanSceneBuilder | AuraLeanSceneSnapshot;
  readonly autoStart?: boolean;
  /** Adapter seam used by `@aura3d/engine/lean-product`; absent from core/game downloads. */
  readonly modelRuntime?: AuraLeanModelRuntime;
}

export type AuraLeanAppTarget = HTMLCanvasElement | HTMLElement | string;

export function createAuraApp(target: AuraLeanAppTarget, options: AuraLeanCreateAppOptions): AuraLeanApp {
  const canvas = resolveCanvas(target);
  const snapshot = options.scene instanceof AuraLeanSceneBuilder ? options.scene.toJSON() : options.scene;
  const entries = snapshot.nodes
    .filter((node): node is AuraLeanPrimitiveSpec => node.kind === "primitive")
    .map(createPrimitiveEntry);
  let renderer: ProductionRuntimeRenderer | undefined;
  let frameHandle = 0;
  let disposed = false;
  let previousFrameTime = 0;
  const frameCallbacks = new Set<(deltaSeconds: number) => void>();
  let state: AuraLeanAppDiagnostics = { backend: "initializing", drawCalls: 0, errors: [] };

  const readyPromise = initialize();

  async function initialize(): Promise<void> {
    resizeCanvas(canvas);
    try {
      renderer = await ProductionRuntimeRenderer.create({
        canvas,
        width: canvas.width,
        height: canvas.height,
        backend: "webgl2",
        antialias: true,
        preserveDrawingBuffer: true,
        clearColor: color4(snapshot.background)
      });
      await options.modelRuntime?.initialize(canvas, snapshot);
      renderFrame();
      if (options.autoStart !== false) frameHandle = requestAnimationFrame(loop);
    } catch (error) {
      state = { backend: "error", drawCalls: 0, errors: [error instanceof Error ? error.message : String(error)] };
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
    const items: RenderItem[] = entries.map((entry) => ({
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
    state = { backend: "webgl2", drawCalls: result.diagnostics.drawCalls, errors: [] };
  }

  return {
    ready: () => readyPromise,
    diagnostics: () => state,
    onFrame(callback) {
      frameCallbacks.add(callback);
      return () => frameCallbacks.delete(callback);
    },
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

function resolveCanvas(target: AuraLeanAppTarget): HTMLCanvasElement {
  const element = typeof target === "string" ? document.querySelector(target) : target;
  if (!element) throw new Error(`Aura3D lean entry could not find target "${String(target)}".`);
  if (element instanceof HTMLCanvasElement) return element;
  const canvas = document.createElement("canvas");
  canvas.dataset.aura3dCanvas = "true";
  element.append(canvas);
  return canvas;
}

function createPrimitiveEntry(node: AuraLeanPrimitiveSpec): { readonly node: AuraLeanPrimitiveSpec; readonly geometry: Geometry; readonly material: PBRMaterial } {
  const spec = node.material ?? {};
  return {
    node,
    geometry: node.primitive === "sphere" ? Geometry.uvSphere(0.5, 32, 16) : Geometry.litCube(1),
    material: new PBRMaterial({
      baseColor: color4(spec.color ?? "#d7dee8"),
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

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }

export function createAuraLeanModelMatrix(position: AuraLeanVec3, scale: AuraLeanVec3): Float32Array {
  return new Float32Array([
    scale[0], 0, 0, 0,
    0, scale[1], 0, 0,
    0, 0, scale[2], 0,
    position[0], position[1], position[2], 1
  ]);
}

function viewProjection(cameraSpec: AuraLeanCameraSpec, aspect: number): Float32Array {
  const view = lookAt(cameraSpec.position, cameraSpec.target);
  const f = 1 / Math.tan(cameraSpec.fov * Math.PI / 360);
  const near = 0.05;
  const far = 100;
  const projection = new Float32Array([
    f / Math.max(0.01, aspect), 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ]);
  return multiply(projection, view);
}

function lookAt(eye: AuraLeanVec3, target: AuraLeanVec3): Float32Array {
  const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize(cross([0, 1, 0], z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}

function normalize(value: AuraLeanVec3): AuraLeanVec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}
function cross(a: AuraLeanVec3, b: AuraLeanVec3): AuraLeanVec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a: AuraLeanVec3, b: AuraLeanVec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      result[column * 4 + row] = a[row]! * b[column * 4]! + a[4 + row]! * b[column * 4 + 1]! + a[8 + row]! * b[column * 4 + 2]! + a[12 + row]! * b[column * 4 + 3]!;
    }
  }
  return result;
}
