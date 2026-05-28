export type AuraVec3 = readonly [number, number, number];
export type AuraColor = `#${string}` | string;
export type AuraAssetType = "model" | "texture" | "environment" | "audio";
export type AuraModelFormat = "glb" | "gltf";
export type AuraTextureFormat = "png" | "jpg" | "jpeg" | "webp" | "ktx2";

export interface AuraAssetDefinition {
  readonly type: AuraAssetType;
  readonly format: string;
  readonly url: string;
  readonly hash?: string;
  readonly bounds?: AuraVec3;
  readonly sizeBytes?: number;
  readonly optional?: boolean;
  readonly metadata?: AuraAssetMetadata;
}

export interface AuraAssetMetadata {
  readonly materials?: readonly string[];
  readonly animations?: readonly string[];
  readonly textures?: readonly string[];
  readonly thumbnailUrl?: string;
  readonly license?: string;
}

const auraAssetRefBrand: unique symbol = Symbol("AuraAssetRef");

export type AuraAssetRef<
  TType extends AuraAssetType = AuraAssetType,
  TId extends string = string
> = AuraAssetDefinition & {
  readonly kind: "aura-asset-ref";
  readonly id: TId;
  readonly type: TType;
  readonly [auraAssetRefBrand]: {
    readonly type: TType;
    readonly id: TId;
  };
};

export type AuraAssetMap<T extends Record<string, AuraAssetDefinition>> = {
  readonly [K in keyof T]: AuraAssetRef<T[K]["type"], Extract<K, string>> & T[K];
};

export function defineAuraAssets<const T extends Record<string, AuraAssetDefinition>>(definitions: T): AuraAssetMap<T> {
  const refs: Record<string, AuraAssetRef> = {};
  for (const [id, definition] of Object.entries(definitions)) {
    refs[id] = {
      ...definition,
      kind: "aura-asset-ref",
      id,
      [auraAssetRefBrand]: {
        type: definition.type,
        id
      }
    } as AuraAssetRef;
  }
  return refs as AuraAssetMap<T>;
}

export interface AuraTransformSpec {
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
  readonly lookAt?: AuraVec3;
}

export interface AuraMaterialSpec {
  readonly name?: string;
  readonly color?: AuraColor;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly emissive?: AuraColor;
  readonly texture?: AuraAssetRef<"texture">;
}

export interface AuraModelOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly visible?: boolean;
}

export interface AuraPrimitiveOptions extends AuraTransformSpec {
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly size?: number | AuraVec3;
}

export interface AuraAnimationSpec {
  readonly clip?: string;
  readonly loop?: boolean;
  readonly speed?: number;
}

export interface AuraInteractionSpec {
  readonly cursor?: string;
  readonly onClick?: string;
  readonly onHover?: string;
}

export type AuraSceneNode =
  | AuraModelNode
  | AuraPrimitiveNode
  | AuraLightNode
  | AuraEffectNode
  | AuraInteractionNode;

export interface AuraModelNode extends AuraTransformSpec {
  readonly kind: "model";
  readonly name?: string;
  readonly asset: AuraAssetRef<"model">;
  readonly material?: AuraMaterialSpec;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly visible: boolean;
  readonly animation?: AuraAnimationSpec;
  readonly interaction?: AuraInteractionSpec;
}

export interface AuraPrimitiveNode extends AuraTransformSpec {
  readonly kind: "primitive";
  readonly primitive: "box" | "sphere" | "plane";
  readonly name?: string;
  readonly material?: AuraMaterialSpec;
  readonly size?: number | AuraVec3;
  readonly animation?: AuraAnimationSpec;
  readonly interaction?: AuraInteractionSpec;
}

export type AuraLightType = "ambient" | "directional" | "point" | "studio";

export interface AuraLightNode extends AuraTransformSpec {
  readonly kind: "light";
  readonly light: AuraLightType;
  readonly name?: string;
  readonly color?: AuraColor;
  readonly intensity: number;
}

export type AuraEffectType = "fog" | "bloom" | "rain";

export interface AuraEffectNode {
  readonly kind: "effect";
  readonly effect: AuraEffectType;
  readonly intensity?: number;
  readonly density?: number;
  readonly color?: AuraColor;
}

export interface AuraInteractionNode {
  readonly kind: "interaction";
  readonly mode: "orbit" | "pointer" | "keyboard";
  readonly target?: string;
}

export class AuraNodeBuilder<TNode extends AuraSceneNode> {
  constructor(private readonly value: TNode) {}

  position(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly position: AuraVec3 }> {
    return this.with({ position: [x, y, z] as const });
  }

  rotate(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly rotation: AuraVec3 }> {
    return this.with({ rotation: [x, y, z] as const });
  }

  scale(value: number | AuraVec3): AuraNodeBuilder<TNode & { readonly scale: number | AuraVec3 }> {
    return this.with({ scale: value });
  }

  lookAt(x: number, y: number, z: number): AuraNodeBuilder<TNode & { readonly lookAt: AuraVec3 }> {
    return this.with({ lookAt: [x, y, z] as const });
  }

  material(material: AuraMaterialSpec): AuraNodeBuilder<TNode & { readonly material: AuraMaterialSpec }> {
    return this.with({ material });
  }

  animate(animation: AuraAnimationSpec): AuraNodeBuilder<TNode & { readonly animation: AuraAnimationSpec }> {
    return this.with({ animation });
  }

  onPointer(interaction: AuraInteractionSpec): AuraNodeBuilder<TNode & { readonly interaction: AuraInteractionSpec }> {
    return this.with({ interaction });
  }

  toJSON(): TNode {
    return this.value;
  }

  private with<TPatch extends Partial<AuraSceneNode>>(patch: TPatch): AuraNodeBuilder<TNode & TPatch> {
    return new AuraNodeBuilder({ ...this.value, ...patch } as TNode & TPatch);
  }
}

export function model<TAsset extends AuraAssetRef<"model">>(
  asset: TAsset,
  options: AuraModelOptions = {}
): AuraNodeBuilder<AuraModelNode> {
  return new AuraNodeBuilder({
    kind: "model",
    asset,
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    material: options.material,
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true,
    visible: options.visible ?? true
  });
}

export function unsafeModelUrl(url: string, options: Omit<AuraAssetDefinition, "type" | "format" | "url"> = {}): AuraAssetRef<"model", "unsafe"> {
  const format = url.toLowerCase().endsWith(".gltf") ? "gltf" : "glb";
  return defineAuraAssets({
    unsafe: {
      ...options,
      type: "model",
      format,
      url,
      metadata: {
        ...(options.metadata ?? {}),
        license: options.metadata?.license ?? "unknown"
      }
    }
  }).unsafe;
}

function primitive(primitiveName: AuraPrimitiveNode["primitive"], options: AuraPrimitiveOptions = {}): AuraNodeBuilder<AuraPrimitiveNode> {
  return new AuraNodeBuilder({
    kind: "primitive",
    primitive: primitiveName,
    name: options.name,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale,
    lookAt: options.lookAt,
    material: options.material,
    size: options.size
  });
}

export const primitives = {
  box: (options?: AuraPrimitiveOptions) => primitive("box", options),
  sphere: (options?: AuraPrimitiveOptions) => primitive("sphere", options),
  plane: (options?: AuraPrimitiveOptions) => primitive("plane", options)
} as const;

export const material = {
  pbr: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: "#d7dee8",
    roughness: 0.55,
    metallic: 0,
    ...options
  }),
  emissive: (options: AuraMaterialSpec = {}): AuraMaterialSpec => ({
    color: options.color ?? "#111827",
    emissive: options.emissive ?? options.color ?? "#38d6ff",
    roughness: options.roughness ?? 0.35,
    metallic: options.metallic ?? 0,
    ...options
  })
} as const;

export const lights = {
  ambient: (options: { readonly name?: string; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "ambient",
      name: options.name,
      intensity: options.intensity ?? 0.28,
      color: options.color ?? "#ffffff"
    }),
  directional: (options: { readonly name?: string; readonly position?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "directional",
      name: options.name,
      position: options.position ?? [3, 4, 3],
      intensity: options.intensity ?? 1.5,
      color: options.color ?? "#ffffff"
    }),
  point: (options: { readonly name?: string; readonly position?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "point",
      name: options.name,
      position: options.position ?? [2, 2.5, 1.5],
      intensity: options.intensity ?? 2,
      color: options.color ?? "#ffffff"
    }),
  studio: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "studio",
      name: "studio-key-fill-rim",
      intensity: options.intensity ?? 1,
      color: "#ffffff",
      position: [0, 3, 4]
    })
} as const;

export type AuraCameraMode = "perspective" | "orbit" | "dolly" | "follow";

export interface AuraCameraSpec {
  readonly mode: AuraCameraMode;
  readonly position?: AuraVec3;
  readonly target?: AuraVec3;
  readonly fov?: number;
  readonly distance?: number;
  readonly from?: AuraVec3;
  readonly to?: AuraVec3;
  readonly seconds?: number;
  readonly targetNode?: string;
}

export const camera = {
  perspective: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => ({
    mode: "perspective",
    position: options.position ?? [0, 1.4, 4],
    target: options.target ?? [0, 0.8, 0],
    fov: options.fov ?? 45
  }),
  orbit: (options: Omit<AuraCameraSpec, "mode"> = {}): AuraCameraSpec => ({
    mode: "orbit",
    distance: options.distance ?? 4,
    target: options.target ?? [0, 0.8, 0],
    fov: options.fov ?? 45
  }),
  dolly: (options: Omit<AuraCameraSpec, "mode"> & { readonly from: AuraVec3; readonly to: AuraVec3 }): AuraCameraSpec => ({
    mode: "dolly",
    from: options.from,
    to: options.to,
    target: options.target ?? [0, 0.8, 0],
    seconds: options.seconds ?? 6,
    fov: options.fov ?? 45
  }),
  follow: (options: Omit<AuraCameraSpec, "mode"> & { readonly targetNode: string }): AuraCameraSpec => ({
    mode: "follow",
    targetNode: options.targetNode,
    distance: options.distance ?? 5,
    target: options.target ?? [0, 1, 0],
    fov: options.fov ?? 50
  })
} as const;

export interface AuraTimelineSpec {
  readonly mode: "loop" | "once";
  readonly seconds?: number;
}

export const timeline = {
  loop: (options: Omit<AuraTimelineSpec, "mode"> = {}): AuraTimelineSpec => ({
    mode: "loop",
    seconds: options.seconds ?? 8
  }),
  once: (options: Omit<AuraTimelineSpec, "mode"> = {}): AuraTimelineSpec => ({
    mode: "once",
    seconds: options.seconds ?? 4
  })
} as const;

export const effects = {
  fog: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "fog",
      density: options.density ?? 0.12,
      color: options.color ?? "#9fb7d9"
    }),
  bloom: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "bloom",
      intensity: options.intensity ?? 0.35,
      color: options.color ?? "#ffffff"
    }),
  rain: (options: Omit<AuraEffectNode, "kind" | "effect"> = {}) =>
    new AuraNodeBuilder<AuraEffectNode>({
      kind: "effect",
      effect: "rain",
      intensity: options.intensity ?? 0.4,
      color: options.color ?? "#bcd7ff"
    })
} as const;

export const interactions = {
  orbit: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "orbit",
      target: options.target
    }),
  pointer: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "pointer",
      target: options.target
    }),
  keyboard: (options: { readonly target?: string } = {}): AuraNodeBuilder<AuraInteractionNode> =>
    new AuraNodeBuilder({
      kind: "interaction",
      mode: "keyboard",
      target: options.target
    })
} as const;

export interface AuraSceneSnapshot {
  readonly schema: "aura3d-scene-snapshot/1.0";
  readonly background: AuraColor;
  readonly camera: AuraCameraSpec;
  readonly timeline?: AuraTimelineSpec;
  readonly nodes: readonly AuraSceneNode[];
  readonly diagnostics: {
    readonly enabled: boolean;
  };
}

export class AuraSceneBuilder {
  private readonly nodes: AuraSceneNode[] = [];
  private backgroundColor: AuraColor = "#070b12";
  private cameraSpec: AuraCameraSpec = camera.orbit();
  private timelineSpec: AuraTimelineSpec | undefined;
  private diagnosticsEnabled = false;

  background(color: AuraColor): this {
    this.backgroundColor = color;
    return this;
  }

  add(node: AuraNodeBuilder<AuraSceneNode> | AuraSceneNode): this {
    this.nodes.push(node instanceof AuraNodeBuilder ? node.toJSON() : node);
    return this;
  }

  camera(next: AuraCameraSpec): this {
    this.cameraSpec = next;
    return this;
  }

  timeline(next: AuraTimelineSpec): this {
    this.timelineSpec = next;
    return this;
  }

  diagnostics(enabled = true): this {
    this.diagnosticsEnabled = enabled;
    return this;
  }

  toJSON(): AuraSceneSnapshot {
    return {
      schema: "aura3d-scene-snapshot/1.0",
      background: this.backgroundColor,
      camera: this.cameraSpec,
      timeline: this.timelineSpec,
      nodes: [...this.nodes],
      diagnostics: {
        enabled: this.diagnosticsEnabled
      }
    };
  }
}

export function scene(): AuraSceneBuilder {
  return new AuraSceneBuilder();
}

export type AuraBackend = "canvas2d" | "headless";

export interface AuraDiagnostics {
  readonly backend: AuraBackend;
  readonly fps: number;
  readonly drawCalls: number;
  readonly renderSize: readonly [number, number];
  readonly assets: readonly AuraAssetLoadState[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface AuraAssetLoadState {
  readonly id: string;
  readonly type: AuraAssetType;
  readonly url: string;
  readonly status: "ready" | "optional-missing" | "error";
  readonly message?: string;
}

export interface AuraApp {
  readonly canvas?: HTMLCanvasElement;
  readonly scene: AuraSceneSnapshot;
  readonly backend: AuraBackend;
  diagnostics(): AuraDiagnostics;
  screenshot(): AuraScreenshot;
  dispose(): void;
}

export interface AuraCreateAppOptions {
  readonly scene: AuraSceneBuilder | AuraSceneSnapshot;
  readonly diagnostics?: boolean | AuraDiagnosticsOptions;
  readonly pixelRatio?: number;
  readonly autoStart?: boolean;
  readonly resize?: boolean;
}

export interface AuraDiagnosticsOptions {
  readonly overlay?: boolean;
  readonly assetPanel?: boolean;
  readonly performancePanel?: boolean;
}

export interface AuraScreenshot {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export class AuraRuntimeError extends Error {
  readonly code:
    | "missing-canvas"
    | "missing-asset"
    | "failed-glb-load"
    | "unsupported-texture"
    | "backend-fallback";

  constructor(code: AuraRuntimeError["code"], message: string) {
    super(message);
    this.name = "AuraRuntimeError";
    this.code = code;
  }
}

export function createAuraApp(target: string | HTMLElement | HTMLCanvasElement, options: AuraCreateAppOptions): AuraApp {
  const snapshot = normalizeSceneSnapshot(options.scene);
  const diagnosticsState = createInitialDiagnostics(snapshot);
  const canvas = resolveCanvas(target);
  const backend: AuraBackend = canvas ? "canvas2d" : "headless";
  const warnings = collectGeneratedCodeWarnings(snapshot);
  validateSceneAssets(snapshot, diagnosticsState.assets);
  diagnosticsState.warnings.push(...warnings);
  diagnosticsState.backend = backend;
  if (canvas) {
    configureCanvas(canvas, options.pixelRatio ?? devicePixelRatioSafe(), options.resize ?? true);
  }
  const overlay = canvas && shouldRenderOverlay(options.diagnostics, snapshot) ? createDiagnosticsOverlay(canvas, diagnosticsState) : undefined;
  let disposed = false;
  let animationHandle = 0;
  let lastTime = 0;
  const render = (time = performanceNow()) => {
    if (disposed) return;
    const delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67;
    lastTime = time;
    diagnosticsState.fps = Math.round(1000 / delta);
    diagnosticsState.drawCalls = renderSceneToCanvas(canvas, snapshot, time);
    if (canvas) diagnosticsState.renderSize = [canvas.width, canvas.height];
    overlay?.update();
    if (options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
      animationHandle = requestAnimationFrame(render);
    }
  };
  render();
  markRouteReady(snapshot, diagnosticsState);
  return {
    canvas,
    scene: snapshot,
    backend,
    diagnostics() {
      return snapshotDiagnostics(diagnosticsState);
    },
    screenshot() {
      return captureAuraScreenshot(canvas);
    },
    dispose() {
      disposed = true;
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      overlay?.dispose();
    }
  };
}

export function createAuraRouteHealthSnapshot(app: AuraApp): {
  readonly status: "ready" | "error";
  readonly diagnostics: AuraDiagnostics;
  readonly scene: AuraSceneSnapshot;
} {
  const diagnostics = app.diagnostics();
  return {
    status: diagnostics.errors.length === 0 ? "ready" : "error",
    diagnostics,
    scene: app.scene
  };
}

export function captureAuraScreenshot(target?: HTMLCanvasElement): AuraScreenshot {
  if (!target) {
    return {
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,",
      width: 0,
      height: 0
    };
  }
  if (typeof target.toDataURL !== "function") {
    throw new AuraRuntimeError(
      "missing-canvas",
      "Aura3D screenshot failed because the target is not a canvas. Suggested fix: pass the app returned by createAuraApp or its canvas."
    );
  }
  return {
    mimeType: "image/png",
    dataUrl: target.toDataURL("image/png"),
    width: target.width,
    height: target.height
  };
}

export function createAuraAssetLoadError(asset: AuraAssetRef<"model">, reason: string): AuraRuntimeError {
  return new AuraRuntimeError(
    "failed-glb-load",
    `Aura3D failed to load GLB asset "${asset.id}" from "${asset.url}": ${reason}. Suggested fix: run npx @aura3d/cli@latest assets validate and confirm the URL is served by your app.`
  );
}

function normalizeSceneSnapshot(value: AuraSceneBuilder | AuraSceneSnapshot): AuraSceneSnapshot {
  return value instanceof AuraSceneBuilder ? value.toJSON() : value;
}

function resolveCanvas(target: string | HTMLElement | HTMLCanvasElement): HTMLCanvasElement {
  if (typeof target === "string") {
    if (typeof document === "undefined") {
      throw new AuraRuntimeError(
        "missing-canvas",
        `Aura3D could not find canvas target "${target}" because document is unavailable. Suggested fix: run createAuraApp in a browser or pass an HTMLCanvasElement.`
      );
    }
    const element = document.querySelector(target);
    if (!element) {
      throw new AuraRuntimeError(
        "missing-canvas",
        `Aura3D could not find canvas target "${target}". Suggested fix: add <canvas id="${target.replace(/^#/, "")}"></canvas> or pass an existing element.`
      );
    }
    if (element instanceof HTMLCanvasElement) return element;
    if (element instanceof HTMLElement) return appendCanvas(element);
    throw new AuraRuntimeError(
      "missing-canvas",
      `Aura3D target "${target}" is not an HTMLElement. Suggested fix: pass a canvas or container element.`
    );
  }
  return target instanceof HTMLCanvasElement ? target : appendCanvas(target);
}

function appendCanvas(target: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.dataset.aura3dCanvas = "true";
  target.append(canvas);
  return canvas;
}

function configureCanvas(canvas: HTMLCanvasElement, pixelRatio: number, resize: boolean): void {
  canvas.style.width ||= "100%";
  canvas.style.height ||= "100%";
  canvas.style.display ||= "block";
  const rect = canvas.getBoundingClientRect();
  const parent = canvas.parentElement;
  const cssWidth = rect.width || canvas.clientWidth || parent?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 960) || 960;
  const cssHeight = rect.height || canvas.clientHeight || parent?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 540) || 540;
  const width = Math.max(320, Math.round(cssWidth * pixelRatio));
  const height = Math.max(220, Math.round(cssHeight * pixelRatio));
  canvas.width = resize ? width : canvas.width || width;
  canvas.height = resize ? height : canvas.height || height;
}

function validateSceneAssets(snapshot: AuraSceneSnapshot, assets: AuraAssetLoadState[]): void {
  for (const node of snapshot.nodes) {
    if (node.kind !== "model") continue;
    const asset = node.asset;
    if (!asset.url && !asset.optional) {
      throw new AuraRuntimeError(
        "missing-asset",
        `Aura3D asset "${asset.id}" is missing a URL. Suggested fix: run npx @aura3d/cli@latest assets add ./asset.glb --name ${asset.id}.`
      );
    }
    if (asset.type === "model" && !["glb", "gltf"].includes(asset.format)) {
      throw new AuraRuntimeError(
        "failed-glb-load",
        `Aura3D model "${asset.id}" uses unsupported format "${asset.format}". Suggested fix: export GLB/glTF or add an explicit loader before using model(assets.${asset.id}).`
      );
    }
    assets.push({
      id: asset.id,
      type: asset.type,
      url: asset.url,
      status: asset.url ? "ready" : "optional-missing",
      message: asset.url ? undefined : "Optional placeholder asset has no URL yet."
    });
    validateMaterialTexture(node.material);
  }
}

function validateMaterialTexture(materialSpec?: AuraMaterialSpec): void {
  const texture = materialSpec?.texture;
  if (!texture) return;
  if (!["png", "jpg", "jpeg", "webp", "ktx2"].includes(texture.format)) {
    throw new AuraRuntimeError(
      "unsupported-texture",
      `Aura3D texture asset "${texture.id}" uses unsupported format "${texture.format}". Suggested fix: use png, jpg, jpeg, webp, or ktx2 textures.`
    );
  }
}

interface MutableDiagnostics {
  backend: AuraBackend;
  fps: number;
  drawCalls: number;
  renderSize: [number, number];
  assets: AuraAssetLoadState[];
  warnings: string[];
  errors: string[];
}

function createInitialDiagnostics(snapshot: AuraSceneSnapshot): MutableDiagnostics {
  return {
    backend: "headless",
    fps: 0,
    drawCalls: 0,
    renderSize: [0, 0],
    assets: [],
    warnings: snapshot.nodes.length === 0 ? ["Scene contains no renderable nodes. Add model(assets.assetId) or primitives.box()."] : [],
    errors: []
  };
}

function snapshotDiagnostics(value: MutableDiagnostics): AuraDiagnostics {
  return {
    backend: value.backend,
    fps: value.fps,
    drawCalls: value.drawCalls,
    renderSize: value.renderSize,
    assets: [...value.assets],
    warnings: [...value.warnings],
    errors: [...value.errors]
  };
}

function collectGeneratedCodeWarnings(snapshot: AuraSceneSnapshot): string[] {
  const warnings: string[] = [];
  if (!snapshot.nodes.some((node) => node.kind === "light")) {
    warnings.push("Scene has no lights. Suggested fix: add lights.studio() or lights.ambient().");
  }
  if (!snapshot.nodes.some((node) => node.kind === "interaction")) {
    warnings.push("Scene has no interactions. Suggested fix: add interactions.orbit() for product/viewer scenes.");
  }
  for (const node of snapshot.nodes) {
    if (node.kind === "model" && node.asset.id === "unsafe-url") {
      warnings.push(`Model uses unsafeModelUrl("${node.asset.url}"). Suggested fix: run assets add and use typed assets.`);
    }
  }
  return warnings;
}

function renderSceneToCanvas(canvas: HTMLCanvasElement | undefined, snapshot: AuraSceneSnapshot, time: number): number {
  if (!canvas) return 0;
  const context = canvas.getContext("2d");
  if (!context) return 0;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, snapshot.background);
  gradient.addColorStop(1, shadeColor(snapshot.background, -32));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height);
  let drawCalls = 1;
  snapshot.nodes.forEach((node, index) => {
    if (node.kind === "model" || node.kind === "primitive") {
      drawRenderableNode(context, width, height, node, index, time);
      drawCalls += 1;
    }
    if (node.kind === "effect") {
      drawEffect(context, width, height, node, time);
      drawCalls += 1;
    }
  });
  return drawCalls;
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  const horizon = height * 0.68;
  for (let i = 0; i < 12; i += 1) {
    const y = horizon + i * 18;
    context.beginPath();
    context.moveTo(width * 0.12, y);
    context.lineTo(width * 0.88, y);
    context.stroke();
  }
  for (let i = -6; i <= 6; i += 1) {
    context.beginPath();
    context.moveTo(width * 0.5 + i * 38, horizon);
    context.lineTo(width * 0.5 + i * 80, height);
    context.stroke();
  }
  context.restore();
}

function drawRenderableNode(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  node: AuraModelNode | AuraPrimitiveNode,
  index: number,
  time: number
): void {
  const x = width * 0.5 + ((node.position?.[0] ?? index - 1) * width) / 8;
  const y = height * 0.58 - ((node.position?.[1] ?? 0) * height) / 7;
  const phase = Math.sin(time / 900 + index) * 8;
  const primitiveSize = node.kind === "primitive" ? node.size : undefined;
  const size = typeof primitiveSize === "number" ? primitiveSize * 80 : typeof node.scale === "number" ? node.scale * 80 : 92;
  const color = node.material?.color ?? (node.kind === "model" ? "#77a7ff" : "#d7dee8");
  context.save();
  context.shadowColor = "rgba(56,214,255,0.34)";
  context.shadowBlur = 24;
  context.fillStyle = color;
  if (node.kind === "primitive" && node.primitive === "sphere") {
    context.beginPath();
    context.arc(x, y + phase, size * 0.46, 0, Math.PI * 2);
    context.fill();
  } else if (node.kind === "primitive" && node.primitive === "plane") {
    context.fillRect(x - size * 0.7, y - size * 0.16, size * 1.4, size * 0.32);
  } else {
    context.beginPath();
    context.moveTo(x, y - size * 0.58 + phase);
    context.lineTo(x + size * 0.54, y - size * 0.18 + phase);
    context.lineTo(x + size * 0.34, y + size * 0.55 + phase);
    context.lineTo(x - size * 0.42, y + size * 0.48 + phase);
    context.lineTo(x - size * 0.58, y - size * 0.16 + phase);
    context.closePath();
    context.fill();
  }
  context.shadowBlur = 0;
  context.fillStyle = "rgba(255,255,255,0.78)";
  context.font = `${Math.max(12, width / 72)}px system-ui, sans-serif`;
  context.textAlign = "center";
  const label = node.kind === "model" ? node.asset.id : node.name ?? node.primitive;
  context.fillText(label, x, y + size * 0.76 + phase);
  context.restore();
}

function drawEffect(context: CanvasRenderingContext2D, width: number, height: number, node: AuraEffectNode, time: number): void {
  context.save();
  if (node.effect === "fog") {
    context.fillStyle = toAlphaColor(node.color ?? "#9fb7d9", node.density ?? 0.12);
    context.fillRect(0, height * 0.2, width, height * 0.8);
  }
  if (node.effect === "bloom") {
    const gradient = context.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, width * 0.46);
    gradient.addColorStop(0, toAlphaColor(node.color ?? "#ffffff", (node.intensity ?? 0.35) * 0.3));
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  if (node.effect === "rain") {
    context.strokeStyle = toAlphaColor(node.color ?? "#bcd7ff", Math.min(0.6, node.intensity ?? 0.4));
    context.lineWidth = 1;
    for (let i = 0; i < 80; i += 1) {
      const x = (i * 47 + time * 0.08) % width;
      const y = (i * 89 + time * 0.42) % height;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 9, y + 28);
      context.stroke();
    }
  }
  context.restore();
}

function shouldRenderOverlay(diagnostics: AuraCreateAppOptions["diagnostics"], snapshot: AuraSceneSnapshot): boolean {
  if (typeof diagnostics === "boolean") return diagnostics;
  if (diagnostics?.overlay || diagnostics?.assetPanel || diagnostics?.performancePanel) return true;
  return snapshot.diagnostics.enabled;
}

function createDiagnosticsOverlay(canvas: HTMLCanvasElement, diagnosticsState: MutableDiagnostics): { update(): void; dispose(): void } {
  const parent = canvas.parentElement ?? document.body;
  const overlay = document.createElement("div");
  overlay.className = "aura-diagnostics-overlay";
  overlay.style.cssText = [
    "position:absolute",
    "right:12px",
    "top:12px",
    "z-index:10",
    "font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
    "color:#ecf7ff",
    "background:rgba(6,10,18,0.82)",
    "border:1px solid rgba(146,176,210,0.36)",
    "border-radius:8px",
    "padding:10px 12px",
    "min-width:190px",
    "pointer-events:none"
  ].join(";");
  const computed = getComputedStyle(parent);
  if (computed.position === "static") parent.style.position = "relative";
  parent.append(overlay);
  const update = () => {
    const diagnostics = snapshotDiagnostics(diagnosticsState);
    overlay.innerHTML = [
      `<b>Aura3D diagnostics</b>`,
      `<div>backend: ${escapeHtml(diagnostics.backend)}</div>`,
      `<div>fps: ${diagnostics.fps}</div>`,
      `<div>draw calls: ${diagnostics.drawCalls}</div>`,
      `<div>render size: ${diagnostics.renderSize[0]} x ${diagnostics.renderSize[1]}</div>`,
      `<div>assets: ${diagnostics.assets.map((asset) => `${asset.id}:${asset.status}`).join(", ") || "none"}</div>`,
      diagnostics.warnings.length ? `<div>warnings: ${diagnostics.warnings.length}</div>` : ""
    ].join("");
  };
  update();
  return {
    update,
    dispose() {
      overlay.remove();
    }
  };
}

function markRouteReady(snapshot: AuraSceneSnapshot, diagnostics: MutableDiagnostics): void {
  if (typeof document !== "undefined") {
    document.body.dataset.aura3dReady = "true";
    document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  }
  if (typeof window !== "undefined") {
    (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = {
      status: "ready",
      scene: snapshot,
      diagnostics: snapshotDiagnostics(diagnostics)
    };
  }
}

function devicePixelRatioSafe(): number {
  return typeof window === "undefined" ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function shadeColor(color: string, amount: number): string {
  if (!color.startsWith("#") || color.length < 7) return color;
  const value = Number.parseInt(color.slice(1, 7), 16);
  const red = clampChannel((value >> 16) + amount);
  const green = clampChannel(((value >> 8) & 0xff) + amount);
  const blue = clampChannel((value & 0xff) + amount);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function toAlphaColor(color: string, alpha: number): string {
  if (!color.startsWith("#") || color.length < 7) return `rgba(255,255,255,${alpha})`;
  const value = Number.parseInt(color.slice(1, 7), 16);
  return `rgba(${value >> 16},${(value >> 8) & 0xff},${value & 0xff},${alpha})`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
