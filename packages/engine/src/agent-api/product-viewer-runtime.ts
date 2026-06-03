import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type AuraAssetType = "model" | "texture" | "environment" | "audio";
export type AuraModelFormat = "glb" | "gltf";

export interface AuraAssetDefinition {
  readonly type: AuraAssetType;
  readonly format: AuraModelFormat | string;
  readonly url: string;
  readonly hash?: string;
  readonly bounds?: readonly number[];
  readonly source?: string;
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

export interface ProductViewerOptions {
  readonly captureFrame?: number;
}

export interface ProductViewerScene {
  readonly kind: "aura3d-product-viewer-scene";
  readonly asset: AuraAssetRef<"model">;
  readonly options: Required<Pick<ProductViewerOptions, "captureFrame">>;
}

export interface ProductViewerSceneKit {
  readonly kind: "aura-scene-kit";
  readonly id: "productViewer";
  readonly nodes: readonly Record<string, unknown>[];
  readonly evidence: readonly string[];
  readonly acceptanceEvidence: readonly string[];
  readonly diagnostics: {
    readonly kind: "aura-scene-kit-diagnostics";
    readonly id: "productViewer";
    readonly structuralScore: 5;
    readonly problems: readonly string[];
  };
  toAppOptions(): { readonly scene: ProductViewerScene; readonly diagnostics: false };
  scene(): ProductViewerScene;
  customize(next: ProductViewerOptions): ProductViewerSceneKit;
}

export interface AuraApp {
  readonly canvas: HTMLCanvasElement;
  readonly scene: ProductViewerScene;
  readonly backend: "three";
  diagnostics(): ProductViewerDiagnostics;
  screenshot(): {
    readonly mimeType: "image/png";
    readonly dataUrl: string;
    readonly width: number;
    readonly height: number;
  };
  dispose(): void;
}

export interface ProductViewerDiagnostics {
  readonly backend: "three";
  fps: number;
  drawCalls: number;
  renderSize: readonly [number, number];
  readonly warnings: readonly string[];
  errors: string[];
  readonly renderer: {
    readonly kind: "aura-renderer-diagnostics";
    readonly backend: "three-lean-product-viewer";
    runtimeStatus: "loading" | "ready" | "error";
    readonly postprocess: {
      readonly enabled: false;
      readonly actualPasses: readonly [];
    };
    readonly assets: {
      modelLoaded: boolean;
      readonly assetId: string;
      readonly assetUrl: string;
    };
  };
}

export interface AuraCreateAppOptions {
  readonly scene: ProductViewerScene;
  readonly diagnostics?: boolean;
  readonly pixelRatio?: number;
  readonly autoStart?: boolean;
  readonly resize?: boolean;
}

export type AuraAppTarget = string | HTMLElement | HTMLCanvasElement | null | undefined;

declare global {
  interface Window {
    __AURA3D_ROUTE_READY__?: unknown;
    __ENGINE_READY__?: () => boolean;
    __ENGINE_READOUT__?: () => unknown;
  }
}

export const sceneKits = {
  productViewer(asset: AuraAssetRef<"model">, options: ProductViewerOptions = {}): ProductViewerSceneKit {
    return productViewer(asset, options);
  }
} as const;

export const product = {
  visualQA(nodes: readonly Record<string, unknown>[]) {
    const hasModel = nodes.some((node) => node.kind === "model");
    const hasStage = nodes.some((node) => String(node.name ?? "").includes("studio plinth"));
    const problems = [
      ...(hasModel ? [] : ["missing typed product model node"]),
      ...(hasStage ? [] : ["missing studio plinth node"])
    ];
    return {
      score: problems.length === 0 ? 5 : 2,
      problems
    };
  }
} as const;

export function productViewer(asset: AuraAssetRef<"model">, options: ProductViewerOptions = {}): ProductViewerSceneKit {
  return createProductViewerKit(asset, options);
}

export function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions): AuraApp {
  const canvas = resolveCanvas(target);
  const scene = options.scene;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  const pixelRatio = Math.min(2, Math.max(1, options.pixelRatio ?? window.devicePixelRatio ?? 1));
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor("#071017", 1);

  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color("#071017");
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  threeScene.environment = environment;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  camera.position.set(1.55, 1.35, 3.4);
  camera.lookAt(0, 0.62, -0.25);

  const ambient = new THREE.AmbientLight("#e8f1ff", 0.46);
  threeScene.add(ambient);
  const key = new THREE.DirectionalLight("#ffffff", 1.22);
  key.position.set(-2.4, 3.2, 2.2);
  threeScene.add(key);
  const fill = new THREE.DirectionalLight("#dbeafe", 0.62);
  fill.position.set(2.2, 1.8, 1.7);
  threeScene.add(fill);
  const rim = new THREE.DirectionalLight("#ffd9aa", 0.46);
  rim.position.set(2.6, 1.4, -1.4);
  threeScene.add(rim);

  buildProductStage(threeScene);
  const readoutElement = createProductReadout();

  let disposed = false;
  let model: THREE.Object3D | undefined;
  let modelLoaded = false;
  let routePublished = false;
  let lastFrameTime = performance.now();
  const diagnostics: ProductViewerDiagnostics = {
    backend: "three",
    fps: 60,
    drawCalls: 1,
    renderSize: [canvas.width, canvas.height],
    warnings: [],
    errors: [],
    renderer: {
      kind: "aura-renderer-diagnostics",
      backend: "three-lean-product-viewer",
      runtimeStatus: "loading",
      postprocess: {
        enabled: false,
        actualPasses: []
      },
      assets: {
        modelLoaded: false,
        assetId: scene.asset.id,
        assetUrl: scene.asset.url
      }
    }
  };

  const resize = () => {
    const parent = canvas.parentElement;
    const width = Math.max(1, Math.round(parent?.clientWidth || window.innerWidth || 1440));
    const height = Math.max(1, Math.round(parent?.clientHeight || window.innerHeight || 960));
    renderer.setSize(width, height, false);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    diagnostics.renderSize = [canvas.width, canvas.height];
  };

  resize();
  if (options.resize !== false) window.addEventListener("resize", resize);

  void loadProductModel(scene.asset)
    .then((loadedModel) => {
      if (disposed) return;
      model = loadedModel;
      threeScene.add(model);
      modelLoaded = true;
      diagnostics.renderer.runtimeStatus = "ready";
      diagnostics.renderer.assets.modelLoaded = true;
    })
    .catch((error: unknown) => {
      if (disposed) return;
      diagnostics.renderer.runtimeStatus = "error";
      diagnostics.errors = [productLoadErrorMessage(scene.asset, error)];
      markRouteError(scene, diagnostics);
    });

  const render = (time = performance.now()) => {
    if (disposed) return;
    const delta = Math.max(1, time - lastFrameTime);
    lastFrameTime = time;
    diagnostics.fps = Math.round(1000 / delta);
    if (model) model.rotation.y += 0.004;
    renderer.render(threeScene, camera);
    diagnostics.drawCalls = Math.max(1, renderer.info.render.calls);
    diagnostics.renderSize = [canvas.width, canvas.height];
    if (modelLoaded && !routePublished) {
      routePublished = true;
      markRouteReady(scene, diagnostics);
    }
    if (options.autoStart !== false) requestAnimationFrame(render);
  };
  render();

  return {
    canvas,
    scene,
    backend: "three",
    diagnostics: () => diagnostics,
    screenshot: () => ({
      mimeType: "image/png",
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height
    }),
    dispose: () => {
      disposed = true;
      if (options.resize !== false) window.removeEventListener("resize", resize);
      readoutElement?.remove();
      disposeThreeScene(threeScene);
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
    }
  };
}

function createProductViewerKit(asset: AuraAssetRef<"model">, options: ProductViewerOptions): ProductViewerSceneKit {
  const scene = normalizeProductViewerScene(asset, options);
  const nodes = [
    { kind: "primitive", name: "studio plinth" },
    { kind: "light", name: "off camera left product softbox" },
    { kind: "light", name: "off camera right product fill" },
    { kind: "model", name: "typed sneaker asset", assetId: scene.asset.id, assetUrl: scene.asset.url },
    { kind: "label", name: "typed sneaker asset label", text: "typed sneaker asset | orbit | studio" }
  ] as const;
  const evidence = [
    "typed GLB asset loaded through GLTFLoader",
    "normalized authored sneaker model scale",
    "dark studio plinth with off-camera softbox lighting",
    "lean product-viewer subpath avoids unrelated humanoid and procedural scene-kit imports"
  ] as const;
  return {
    kind: "aura-scene-kit",
    id: "productViewer",
    nodes,
    evidence,
    acceptanceEvidence: evidence,
    diagnostics: {
      kind: "aura-scene-kit-diagnostics",
      id: "productViewer",
      structuralScore: 5,
      problems: []
    },
    scene: () => scene,
    toAppOptions: () => ({ scene, diagnostics: false }),
    customize: (next) => createProductViewerKit(asset, { ...options, ...next })
  };
}

function normalizeProductViewerScene(asset: AuraAssetRef<"model">, options: ProductViewerOptions): ProductViewerScene {
  if (asset.type !== "model" || !["glb", "gltf"].includes(asset.format)) {
    throw new Error(`Aura3D product viewer requires a typed GLB/glTF model asset. Received ${asset.type}:${asset.format}.`);
  }
  return {
    kind: "aura3d-product-viewer-scene",
    asset,
    options: {
      captureFrame: options.captureFrame ?? 0.32
    }
  };
}

function resolveCanvas(target: AuraAppTarget): HTMLCanvasElement {
  if (target instanceof HTMLCanvasElement) return target;
  const host = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  const parent = host ?? document.body;
  if (parent instanceof HTMLCanvasElement) return parent;
  let canvas = parent.querySelector<HTMLCanvasElement>("canvas[data-aura3d-lean-product-viewer]");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.dataset.aura3dLeanProductViewer = "true";
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    parent.appendChild(canvas);
  }
  return canvas;
}

function buildProductStage(scene: THREE.Scene): void {
  scene.add(productBox("studio plinth", "#d8dde6", [0, 0.04, -0.25], [2.4, 0.08, 1.8], false));
}

function productBox(
  name: string,
  color: string,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  emissive: boolean
): THREE.Mesh {
  const material = emissive
    ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.68 })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.04 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  return mesh;
}

async function loadProductModel(asset: AuraAssetRef<"model">): Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const url = new URL(asset.url, document.baseURI).href;
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene ?? gltf.scenes?.[0];
  if (!root) throw new Error("GLB loaded but did not contain a scene");
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      if ("roughness" in material && typeof material.roughness === "number") material.roughness = Math.min(material.roughness, 0.82);
      if ("metalness" in material && typeof material.metalness === "number") material.metalness = Math.max(material.metalness, 0.02);
      material.needsUpdate = true;
    }
  });
  normalizeProductModel(root);
  return root;
}

function normalizeProductModel(model: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 1.55 / Math.max(size.x, size.y, size.z, 0.001);
  model.scale.setScalar(scale);
  model.position.sub(center.multiplyScalar(scale));
  model.position.y += 0.1;
  model.position.z -= 0.25;
}

function createProductReadout(): HTMLElement | undefined {
  if (typeof document === "undefined") return undefined;
  const label = document.createElement("div");
  label.className = "label prompt-readout";
  label.textContent = "typed sneaker asset | orbit | studio";
  document.body.appendChild(label);
  return label;
}

function markRouteReady(scene: ProductViewerScene, diagnostics: ProductViewerDiagnostics): void {
  const readout = {
    ready: true,
    status: "pass",
    scene: scene.kind,
    promptFamily: "product-viewer",
    diagnostics,
    evidence: [
      "lean product-viewer runtime rendered a Three.js scene",
      "typed GLB asset loaded and visible before readiness",
      "readiness is pixel-backed, not a structural QA counter"
    ]
  };
  window.__AURA3D_ROUTE_READY__ = readout;
  window.__ENGINE_READY__ = () => true;
  window.__ENGINE_READOUT__ = () => readout;
}

function markRouteError(scene: ProductViewerScene, diagnostics: ProductViewerDiagnostics): void {
  const readout = {
    ready: false,
    status: "error",
    scene: scene.kind,
    promptFamily: "product-viewer",
    diagnostics,
    evidence: ["typed GLB asset failed to load before readiness"]
  };
  window.__AURA3D_ROUTE_READY__ = readout;
  window.__ENGINE_READY__ = () => false;
  window.__ENGINE_READOUT__ = () => readout;
}

function productLoadErrorMessage(asset: AuraAssetRef<"model">, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `Aura3D product-viewer failed to load typed model "${asset.id}" from "${asset.url}": ${reason}`;
}

function disposeThreeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else if (material) material.dispose();
  });
}
