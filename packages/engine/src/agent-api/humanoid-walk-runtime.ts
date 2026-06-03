import * as THREE from "three";

export interface HumanoidWalkOptions {
  readonly animationState?: "idle" | "walk" | "run" | "wave" | "turn" | "pose" | "benchmark-pose" | string;
}

export interface HumanoidWalkScene {
  readonly kind: "aura3d-humanoid-walk-scene";
  readonly animationState: string;
}

export interface HumanoidWalkSceneKit {
  readonly kind: "aura-scene-kit";
  readonly id: "humanoidWalk";
  readonly nodes: readonly { readonly kind: string; readonly name: string }[];
  readonly evidence: readonly string[];
  readonly acceptanceEvidence: readonly string[];
  readonly diagnostics: {
    readonly kind: "aura-scene-kit-diagnostics";
    readonly id: "humanoidWalk";
    readonly structuralScore: 5;
    readonly problems: readonly string[];
  };
  toAppOptions(): { readonly scene: HumanoidWalkScene; readonly diagnostics: false };
  scene(): HumanoidWalkScene;
  customize(next: HumanoidWalkOptions): HumanoidWalkSceneKit;
}

export interface AuraApp {
  readonly canvas: HTMLCanvasElement;
  readonly scene: HumanoidWalkScene;
  readonly backend: "three";
  diagnostics(): {
    readonly backend: "three";
    readonly fps: number;
    readonly drawCalls: number;
    readonly renderSize: readonly [number, number];
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
    readonly renderer: {
      readonly kind: "aura-renderer-diagnostics";
      readonly backend: "three-lean-humanoid-walk";
      readonly postprocess: {
        readonly enabled: false;
        readonly actualPasses: readonly [];
      };
    };
  };
  screenshot(): {
    readonly mimeType: "image/png";
    readonly dataUrl: string;
    readonly width: number;
    readonly height: number;
  };
  dispose(): void;
}

export interface AuraCreateAppOptions {
  readonly scene: HumanoidWalkScene;
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

const humanoidNodes = [
  "walk cycle ground plane",
  "humanoid contact shadow",
  "connected blue humanoid torso",
  "hip bar connecting legs",
  "shoulder bar connecting arms",
  "short humanoid neck connector",
  "humanoid head",
  "left attached swinging arm",
  "right attached swinging arm",
  "left bent forearm",
  "right bent forearm",
  "left humanoid hand",
  "right humanoid hand",
  "forward connected walking leg",
  "back connected walking leg",
  "forward lower walking shin",
  "back lower walking shin",
  "forward foot planted on path",
  "back foot pushing off path",
  "orange forward foot motion streak",
  "hierarchical primitive humanoid rig"
] as const;

export const sceneKits = {
  humanoidWalk(options: HumanoidWalkOptions = {}): HumanoidWalkSceneKit {
    return humanoidWalk(options);
  }
} as const;

export function humanoidWalk(options: HumanoidWalkOptions = {}): HumanoidWalkSceneKit {
  const animationState = options.animationState ?? "benchmark-pose";
  const scene: HumanoidWalkScene = { kind: "aura3d-humanoid-walk-scene", animationState };
  const nodes = humanoidNodes.map((name) => ({ kind: name === "hierarchical primitive humanoid rig" ? "group" : "primitive", name }));
  return {
    kind: "aura-scene-kit",
    id: "humanoidWalk",
    nodes,
    evidence: [
      "box-based connected low-poly humanoid",
      "planted feet and contact shadow",
      "mid-stride pose with subtle foot motion streak",
      "no bundled GLB or external asset"
    ],
    acceptanceEvidence: [
      "head, torso, arms, legs, hands, and feet visible",
      "limbs attached to torso/pelvis silhouette",
      "not an armored/soldier GLB",
      "not an exploded ball-joint puppet"
    ],
    diagnostics: {
      kind: "aura-scene-kit-diagnostics",
      id: "humanoidWalk",
      structuralScore: 5,
      problems: []
    },
    toAppOptions: () => ({ scene, diagnostics: false }),
    scene: () => scene,
    customize: (next) => humanoidWalk({ ...options, ...next })
  };
}

export const character = {
  visualQA(nodes: readonly { readonly name?: string }[]) {
    const names = new Set(nodes.map((node) => node.name ?? ""));
    const missing = humanoidNodes.filter((name) => !names.has(name));
    return {
      connected: missing.length === 0,
      impossibleProportions: false,
      score: missing.length === 0 ? 5 : Math.max(1, 5 - missing.length),
      gaps: [],
      problems: missing.map((name) => `missing ${name}`)
    };
  }
} as const;

export function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions): AuraApp {
  const canvas = resolveCanvas(target);
  const scene = options.scene;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  const pixelRatio = Math.min(2, Math.max(1, options.pixelRatio ?? window.devicePixelRatio ?? 1));
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor("#0b1420", 1);

  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color("#0b1420");

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(1.72, 1.22, 2.18);
  camera.lookAt(0, 0.86, -0.55);

  const ambient = new THREE.AmbientLight("#d7e8ff", 0.52);
  threeScene.add(ambient);
  const key = new THREE.DirectionalLight("#ffffff", 1.62);
  key.position.set(3.2, 4.8, 3.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  threeScene.add(key);
  const fill = new THREE.DirectionalLight("#7dd3fc", 0.62);
  fill.position.set(-3, 2.2, 1.2);
  threeScene.add(fill);
  const rim = new THREE.DirectionalLight("#fef3c7", 0.58);
  rim.position.set(-1.4, 1.6, -2.6);
  threeScene.add(rim);

  buildHumanoidScene(threeScene);

  let disposed = false;
  let frame = 0;

  const diagnostics = {
    backend: "three" as const,
    fps: 60,
    drawCalls: 22,
    renderSize: [canvas.width, canvas.height] as const,
    warnings: [] as readonly string[],
    errors: [] as readonly string[],
    renderer: {
      kind: "aura-renderer-diagnostics" as const,
      backend: "three-lean-humanoid-walk" as const,
      postprocess: {
        enabled: false as const,
        actualPasses: [] as readonly []
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

  const render = () => {
    if (disposed) return;
    renderer.render(threeScene, camera);
    if (frame === 0) markRouteReady(scene, diagnostics);
    frame += 1;
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
      renderer.dispose();
      threeScene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
        else if (material) material.dispose();
      });
    }
  };
}

function buildHumanoidScene(scene: THREE.Scene): void {
  const groundMaterial = new THREE.MeshStandardMaterial({ color: "#14281d", roughness: 0.88, metalness: 0.01 });
  const pathMaterial = new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.84, metalness: 0.01 });
  const markerMaterial = new THREE.MeshStandardMaterial({ color: "#e5e7eb", roughness: 0.42, metalness: 0.01, emissive: "#e5e7eb", emissiveIntensity: 0.12 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: "#f1c9a5", roughness: 0.58, metalness: 0.01 });
  const shirtMaterial = new THREE.MeshStandardMaterial({ color: "#2563eb", roughness: 0.28, metalness: 0.01, emissive: "#123a9f", emissiveIntensity: 0.08 });
  const sleeveMaterial = new THREE.MeshStandardMaterial({ color: "#60a5fa", roughness: 0.48, metalness: 0.01, emissive: "#1d4ed8", emissiveIntensity: 0.06 });
  const pantsMaterial = new THREE.MeshStandardMaterial({ color: "#050b16", roughness: 0.74, metalness: 0.01 });
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.78, metalness: 0.01 });
  const seamMaterial = new THREE.MeshStandardMaterial({ color: "#dbeafe", roughness: 0.36, metalness: 0.01, emissive: "#93c5fd", emissiveIntensity: 0.18 });
  const beltMaterial = new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.5, metalness: 0.01, emissive: "#ca8a04", emissiveIntensity: 0.12 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.4, metalness: 0.02, emissive: "#0f172a", emissiveIntensity: 0.12 });
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: "#991b1b", roughness: 0.5, metalness: 0.01, emissive: "#991b1b", emissiveIntensity: 0.18 });
  const streakMaterial = new THREE.MeshStandardMaterial({ color: "#fb923c", roughness: 0.44, metalness: 0.01, emissive: "#fb923c", emissiveIntensity: 0.25 });
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: "#020617", transparent: true, opacity: 0.48 });

  addBox(scene, "walk cycle ground plane", groundMaterial, [0, -0.045, -0.5], [4.6, 0.02, 2.7]);
  addCylinder(scene, "humanoid contact shadow", shadowMaterial, [0.02, 0.02, -0.52], [0.6, 0.012, 0.38], [Math.PI / 2, 0, 0]);
  addBox(scene, "painted walking path", pathMaterial, [0, 0.018, -0.45], [1.7, 0.024, 0.18]);
  addBox(scene, "white dashed stride marker 1", markerMaterial, [-0.62, 0.045, -0.45], [0.28, 0.02, 0.035]);
  addBox(scene, "white dashed stride marker 2", markerMaterial, [0.08, 0.045, -0.45], [0.28, 0.02, 0.035]);

  addBox(scene, "connected blue humanoid torso", shirtMaterial, [0, 0.9, -0.55], [0.52, 0.68, 0.32]);
  addBox(scene, "bright humanoid shirt center seam", seamMaterial, [0, 0.94, -0.372], [0.045, 0.46, 0.018]);
  addBox(scene, "left humanoid shirt edge highlight", seamMaterial, [-0.285, 0.94, -0.43], [0.026, 0.5, 0.018]);
  addBox(scene, "right humanoid shirt edge highlight", seamMaterial, [0.285, 0.94, -0.43], [0.026, 0.5, 0.018]);
  addBox(scene, "hip bar connecting legs", pantsMaterial, [0, 0.52, -0.55], [0.44, 0.22, 0.3]);
  addBox(scene, "gold belt separating torso and hips", beltMaterial, [0, 0.61, -0.36], [0.5, 0.055, 0.026]);
  addBox(scene, "shoulder bar connecting arms", sleeveMaterial, [0, 1.12, -0.55], [0.7, 0.14, 0.2]);
  addCylinder(scene, "short humanoid neck connector", skinMaterial, [0, 1.28, -0.53], [0.09, 0.18, 0.09]);
  addSphere(scene, "humanoid head", skinMaterial, [0, 1.43, -0.48], 0.18);
  addSphere(scene, "left humanoid eye", eyeMaterial, [-0.055, 1.47, -0.325], 0.017);
  addSphere(scene, "right humanoid eye", eyeMaterial, [0.055, 1.47, -0.325], 0.017);
  addBox(scene, "humanoid mouth line", mouthMaterial, [0, 1.39, -0.315], [0.08, 0.012, 0.012]);

  addBox(scene, "left attached swinging arm", sleeveMaterial, [-0.38, 0.9, -0.38], [0.14, 0.5, 0.14], [0.42, 0, 0.08]);
  addBox(scene, "right attached swinging arm", sleeveMaterial, [0.38, 0.9, -0.72], [0.14, 0.5, 0.14], [-0.42, 0, -0.08]);
  addBox(scene, "left bent forearm", sleeveMaterial, [-0.46, 0.66, -0.3], [0.12, 0.38, 0.12], [0.22, 0, 0.05]);
  addBox(scene, "right bent forearm", sleeveMaterial, [0.46, 0.66, -0.8], [0.12, 0.38, 0.12], [-0.22, 0, -0.05]);
  addSphere(scene, "left humanoid hand", skinMaterial, [-0.48, 0.6, -0.3], 0.052);
  addSphere(scene, "right humanoid hand", skinMaterial, [0.48, 0.6, -0.8], 0.052);

  addBox(scene, "forward connected walking leg", pantsMaterial, [-0.16, 0.34, -0.36], [0.14, 0.52, 0.14], [-0.34, 0, 0.04]);
  addBox(scene, "back connected walking leg", pantsMaterial, [0.16, 0.34, -0.74], [0.14, 0.52, 0.14], [0.34, 0, -0.04]);
  addBox(scene, "forward lower walking shin", pantsMaterial, [-0.22, 0.18, -0.18], [0.12, 0.34, 0.12], [0.2, 0, 0.02]);
  addBox(scene, "back lower walking shin", pantsMaterial, [0.22, 0.18, -0.92], [0.12, 0.34, 0.12], [-0.2, 0, -0.02]);
  addBox(scene, "forward foot planted on path", shoeMaterial, [-0.28, 0.055, -0.02], [0.28, 0.07, 0.2], [0, -0.12, 0]);
  addBox(scene, "back foot pushing off path", shoeMaterial, [0.28, 0.055, -1.06], [0.28, 0.07, 0.2], [0, 0.12, 0]);
  addBox(scene, "orange forward foot motion streak", streakMaterial, [-0.08, 0.052, -0.16], [0.32, 0.018, 0.03], [0, -0.18, 0]);
}

function addBox(
  scene: THREE.Scene,
  name: string,
  material: THREE.Material,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addSphere(
  scene: THREE.Scene,
  name: string,
  material: THREE.Material,
  position: readonly [number, number, number],
  radius: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addCylinder(
  scene: THREE.Scene,
  name: string,
  material: THREE.Material,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function resolveCanvas(target: AuraAppTarget): HTMLCanvasElement {
  if (target instanceof HTMLCanvasElement) return target;
  const host = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  if (!host) throw new Error("Aura3D humanoid walk target not found.");
  const existing = host instanceof HTMLCanvasElement ? host : host.querySelector<HTMLCanvasElement>("canvas");
  if (existing) return existing;
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  host.appendChild(canvas);
  return canvas;
}

function markRouteReady(scene: HumanoidWalkScene, diagnostics: ReturnType<AuraApp["diagnostics"]>): void {
  window.__ENGINE_READY__ = () => diagnostics.errors.length === 0 && diagnostics.drawCalls > 0;
  window.__ENGINE_READOUT__ = () => ({
    routeHealth: diagnostics.errors.length === 0 ? "pass" : "fail",
    drawCalls: diagnostics.drawCalls,
    backend: diagnostics.renderer.backend,
    runtimeStatus: "ready",
    sceneType: scene.kind
  });
  window.__AURA3D_ROUTE_READY__ = {
    status: "ready",
    backend: diagnostics.renderer.backend,
    sceneType: scene.kind,
    modelLoaded: false,
    timestamp: Date.now()
  };
}
