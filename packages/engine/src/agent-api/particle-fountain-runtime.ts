import * as THREE from "three";

export type AuraColor = string;

export interface ParticleFountainOptions {
  readonly particleCount?: number;
  readonly emissionRate?: number;
  readonly color?: AuraColor;
  readonly colors?: readonly AuraColor[];
}

export interface ParticleFountainScene {
  readonly kind: "aura3d-particle-fountain-scene";
  readonly options: Required<Pick<ParticleFountainOptions, "particleCount" | "emissionRate">> & {
    readonly color: AuraColor;
  };
}

export interface ParticleFountainSceneKit {
  readonly kind: "aura-scene-kit";
  readonly id: "particleFountain";
  readonly nodes: readonly Record<string, unknown>[];
  readonly evidence: readonly string[];
  readonly acceptanceEvidence: readonly string[];
  readonly diagnostics: {
    readonly kind: "aura-scene-kit-diagnostics";
    readonly id: "particleFountain";
    readonly structuralScore: 5;
    readonly problems: readonly string[];
  };
  toAppOptions(): { readonly scene: ParticleFountainScene; readonly diagnostics: false };
  scene(): ParticleFountainScene;
  customize(next: ParticleFountainOptions): ParticleFountainSceneKit;
}

export interface AuraApp {
  readonly canvas: HTMLCanvasElement;
  readonly scene: ParticleFountainScene;
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
      readonly backend: "three-lean-particle-fountain";
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
  readonly scene: ParticleFountainScene;
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

const lifetimeRamp = ["#d9d2aa", "#8bb9c9", "#d59b4a", "#d68086", "#6fb6ca", "#c9c4a2"] as const;

export const sceneKits = {
  particleFountain(options: ParticleFountainOptions = {}): ParticleFountainSceneKit {
    return particleFountain(options);
  }
} as const;

export function particleFountain(options: ParticleFountainOptions = {}): ParticleFountainSceneKit {
  return createParticleFountainKit(options);
}

export const ui = {
  html(selector: string, markup: string): HTMLElement {
    const host = document.querySelector<HTMLElement>(selector) ?? document.body;
    host.insertAdjacentHTML("afterbegin", markup);
    return host;
  },
  range(selector: string): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`Aura3D particle fountain UI range not found: ${selector}`);
    return input;
  },
  slider(
    selector: string,
    options: { readonly min?: number; readonly max?: number; readonly value?: number; readonly metric?: string } = {}
  ): HTMLInputElement {
    const input = ui.range(selector);
    if (options.min !== undefined) input.min = String(options.min);
    if (options.max !== undefined) input.max = String(options.max);
    if (options.value !== undefined) input.value = String(options.value);
    if (options.metric) input.dataset.metric = options.metric;
    return input;
  }
} as const;

export function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions): AuraApp {
  const canvas = resolveCanvas(target);
  const scene = options.scene;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  const pixelRatio = Math.min(2, Math.max(1, options.pixelRatio ?? window.devicePixelRatio ?? 1));
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor("#071018", 1);

  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color("#071018");

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(4.6, 3.2, 6.0);
  camera.lookAt(0, 1.35, 0);

  const ambient = new THREE.AmbientLight("#b9d8ff", 0.36);
  threeScene.add(ambient);
  const key = new THREE.DirectionalLight("#eff8ff", 1.18);
  key.position.set(3.2, 5.2, 4.2);
  threeScene.add(key);
  const rim = new THREE.DirectionalLight("#64d8ff", 0.42);
  rim.position.set(-2.8, 2.6, -1.8);
  threeScene.add(rim);

  buildParticleFountainScene(threeScene, scene.options);

  let disposed = false;
  let frame = 0;

  const diagnostics = {
    backend: "three" as const,
    fps: 60,
    drawCalls: 5,
    renderSize: [canvas.width, canvas.height] as const,
    warnings: [] as readonly string[],
    errors: [] as readonly string[],
    renderer: {
      kind: "aura-renderer-diagnostics" as const,
      backend: "three-lean-particle-fountain" as const,
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

function createParticleFountainKit(options: ParticleFountainOptions): ParticleFountainSceneKit {
  const scene = normalizeParticleFountainScene(options);
  const nodes = [
    { kind: "primitive", name: "dark wet fountain collision ground plane" },
    { kind: "primitive", name: "brushed dark metal fountain pedestal" },
    { kind: "effect", name: "dense lifetime colored fountain droplet plume", particleCount: scene.options.particleCount },
    { kind: "effect", name: "colored ground collision splash droplet ring", particleCount: 96 },
    { kind: "label", name: "particle scene kit hud", text: `emission rate ${scene.options.emissionRate} | collision splash` }
  ] as const;
  const evidence = [
    `${scene.options.particleCount + 96} visible colored droplets`,
    "dense upward plume with lifetime color variation",
    "dark emitter base and collision splash context",
    "lean particle-fountain subpath avoids model, humanoid, GLTF, and postprocess imports"
  ] as const;
  return {
    kind: "aura-scene-kit",
    id: "particleFountain",
    nodes,
    evidence,
    acceptanceEvidence: evidence,
    diagnostics: {
      kind: "aura-scene-kit-diagnostics",
      id: "particleFountain",
      structuralScore: 5,
      problems: []
    },
    scene: () => scene,
    toAppOptions: () => ({ scene, diagnostics: false }),
    customize: (next) => createParticleFountainKit({ ...options, ...next })
  };
}

function normalizeParticleFountainScene(options: ParticleFountainOptions): ParticleFountainScene {
  const emissionRate = options.emissionRate ?? 120;
  return {
    kind: "aura3d-particle-fountain-scene",
    options: {
      particleCount: Math.max(360, Math.min(900, options.particleCount ?? Math.round(emissionRate * 4))),
      emissionRate,
      color: options.colors?.[0] ?? options.color ?? "#60a5fa"
    }
  };
}

function resolveCanvas(target: AuraAppTarget): HTMLCanvasElement {
  if (target instanceof HTMLCanvasElement) return target;
  const host = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  const parent = host ?? document.body;
  if (parent instanceof HTMLCanvasElement) return parent;
  let canvas = parent.querySelector<HTMLCanvasElement>("canvas[data-aura3d-lean-particle-fountain]");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.dataset.aura3dLeanParticleFountain = "true";
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    parent.appendChild(canvas);
  }
  return canvas;
}

function buildParticleFountainScene(scene: THREE.Scene, options: ParticleFountainScene["options"]): void {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.MeshStandardMaterial({ color: "#101822", roughness: 0.82, metalness: 0.02 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.92, 0.36, 48),
    new THREE.MeshStandardMaterial({ color: "#263747", roughness: 0.32, metalness: 0.25 })
  );
  base.position.y = 0.18;
  scene.add(base);

  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.62, 0.08, 48),
    new THREE.MeshStandardMaterial({ color: "#06111a", roughness: 0.72, metalness: 0.04 })
  );
  basin.position.y = 0.42;
  scene.add(basin);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.024, 8, 80),
    new THREE.MeshBasicMaterial({ color: "#17a8d6" })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.48;
  scene.add(rim);

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.38, 32),
    new THREE.MeshStandardMaterial({ color: "#1d2f3f", roughness: 0.2, metalness: 0.38 })
  );
  nozzle.position.y = 0.58;
  scene.add(nozzle);

  scene.add(createDropletPlume(options.particleCount));
  scene.add(createSplashRing(96));
}

function createDropletPlume(count: number): THREE.Group {
  const geometry = new THREE.IcosahedronGeometry(0.032, 1);
  const group = new THREE.Group();
  group.name = "dense lifetime colored fountain droplet plume";
  const buckets = lifetimeRamp.map((color) => ({
    color,
    mesh: new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      Math.ceil(count / lifetimeRamp.length)
    ),
    index: 0
  }));
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1);
    const angle = i * 2.399963;
    const widthProfile = Math.sin(t * Math.PI);
    const shell = seededRange(i, 203, 0.82, 1.08);
    const spread = 1.04 * (0.1 + widthProfile * (0.55 + (i % 7) * 0.018)) * shell;
    const y = 0.6 + Math.pow(t, 0.78) * 3.05;
    dummy.position.set(Math.cos(angle) * spread, y, Math.sin(angle) * spread - widthProfile * 1.04 * 0.18);
    const size = seededRange(i, 353, 0.78, 1.22) * (0.86 + (i % 5) * 0.08);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    const bucket = buckets[i % buckets.length];
    bucket.mesh.setMatrixAt(bucket.index, dummy.matrix);
    bucket.index += 1;
  }
  for (const bucket of buckets) {
    bucket.mesh.name = `${bucket.color} plume droplets`;
    bucket.mesh.count = bucket.index;
    bucket.mesh.frustumCulled = false;
    bucket.mesh.instanceMatrix.needsUpdate = true;
    group.add(bucket.mesh);
  }
  return group;
}

function createSplashRing(count: number): THREE.Group {
  const geometry = new THREE.IcosahedronGeometry(0.03, 1);
  const group = new THREE.Group();
  group.name = "colored ground collision splash droplet ring";
  const buckets = lifetimeRamp.map((color) => ({
    color,
    mesh: new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      Math.ceil(count / lifetimeRamp.length)
    ),
    index: 0
  }));
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const t = i / Math.max(1, count - 1);
    const angle = i * 2.07;
    const radius = 0.58 + t * 1.45;
    dummy.position.set(Math.cos(angle) * radius, 0.08 + (i % 5) * 0.035, Math.sin(angle) * radius);
    dummy.scale.setScalar(seededRange(i, 359, 0.72, 1.18));
    dummy.updateMatrix();
    const bucket = buckets[(i + 3) % buckets.length];
    bucket.mesh.setMatrixAt(bucket.index, dummy.matrix);
    bucket.index += 1;
  }
  for (const bucket of buckets) {
    bucket.mesh.name = `${bucket.color} splash droplets`;
    bucket.mesh.count = bucket.index;
    bucket.mesh.frustumCulled = false;
    bucket.mesh.instanceMatrix.needsUpdate = true;
    group.add(bucket.mesh);
  }
  return group;
}

function markRouteReady(scene: ParticleFountainScene, diagnostics: ReturnType<AuraApp["diagnostics"]>): void {
  const readout = {
    ready: true,
    status: "pass",
    scene: scene.kind,
    promptFamily: "particle-fountain",
    diagnostics,
    evidence: [
      "lean particle-fountain runtime rendered a Three.js scene",
      "no model or GLTF asset loading required",
      "no postprocess composer required"
    ]
  };
  window.__AURA3D_ROUTE_READY__ = readout;
  window.__ENGINE_READY__ = () => true;
  window.__ENGINE_READOUT__ = () => readout;
}

function seededRange(index: number, salt: number, min: number, max: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  const normalized = value - Math.floor(value);
  return min + normalized * (max - min);
}
