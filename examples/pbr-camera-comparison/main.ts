import { Renderable, Scene } from "@aura3d/scene";
import {
  Geometry,
  PBRMaterial,
  Renderer,
  Sampler,
  Texture,
  TextureBinding,
  generateApproximateBrdfLutPixels,
  generateRgba8EnvironmentMipLevels
} from "@aura3d/rendering";

declare global {
  interface Window {
    __AURA3D_PBR_CAMERA_COMPARISON__?: PbrCameraComparisonState;
  }
}

interface PbrCameraComparisonState {
  readonly id: "pbr-camera-comparison";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly referenceRenderer: "three";
  readonly visualClaim: "bounded-camera-pbr-reference-comparison";
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly cameraPath: "scene-perspective-camera";
  readonly environmentLighting: "sampled-environment-map-approximation";
  readonly lightingModel: "direct-lights-plus-sampled-environment-map";
  readonly claimBoundary: "bounded-camera-pbr-reference-comparison";
  readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly materialChecks?: Record<string, PbrMaterialCheck>;
  readonly error?: string;
}

interface PbrMaterialCheck {
  readonly aura3d: readonly number[];
  readonly reference: readonly number[];
  readonly aura3dPass: boolean;
  readonly referencePass: boolean;
}

const width = 480;
const height = 360;
const knownLimits = [
  "This is a bounded side-by-side material/camera comparison, not production PBR parity.",
  "HDR IBL, irradiance convolution, calibrated specular prefiltering, and loader parity are not claimed.",
  "The Three.js panel is a reference check for this scene only, not a broad engine benchmark.",
] as const;

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__AURA3D_PBR_CAMERA_COMPARISON__ = {
      id: "pbr-camera-comparison",
      status: "error",
      renderer: "webgl2",
      referenceRenderer: "three",
      visualClaim: "bounded-camera-pbr-reference-comparison",
      knownLimits,
      errors: [error instanceof Error ? error.message : String(error)],
      cameraPath: "scene-perspective-camera",
      environmentLighting: "sampled-environment-map-approximation",
      lightingModel: "direct-lights-plus-sampled-environment-map",
      claimBoundary: "bounded-camera-pbr-reference-comparison",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { aura3dCanvas, threeCanvas, status } = createShell();
  const environment = createSharedEnvironmentSource(64, 32);
  const aura3dResult = await renderAura3D(aura3dCanvas, environment);
  const threeResult = await renderThree(threeCanvas, environment);
  const materialChecks = {
    dielectric: {
      aura3d: aura3dResult.pixels.dielectric,
      reference: threeResult.pixels.dielectric,
      aura3dPass: isLitDielectric(aura3dResult.pixels.dielectric),
      referencePass: isLitDielectric(threeResult.pixels.dielectric)
    },
    metal: {
      aura3d: aura3dResult.pixels.metal,
      reference: threeResult.pixels.metal,
      aura3dPass: isWarmMetal(aura3dResult.pixels.metal),
      referencePass: isWarmMetal(threeResult.pixels.metal)
    },
    emissive: {
      aura3d: aura3dResult.pixels.emissive,
      reference: threeResult.pixels.emissive,
      aura3dPass: isEmissiveGreen(aura3dResult.pixels.emissive),
      referencePass: isEmissiveGreen(threeResult.pixels.emissive)
    }
  };

  window.__AURA3D_PBR_CAMERA_COMPARISON__ = {
    id: "pbr-camera-comparison",
    status: "ready",
    renderer: "webgl2",
    referenceRenderer: "three",
    visualClaim: "bounded-camera-pbr-reference-comparison",
    knownLimits,
    errors: [],
    cameraPath: "scene-perspective-camera",
    environmentLighting: "sampled-environment-map-approximation",
    lightingModel: "direct-lights-plus-sampled-environment-map",
    claimBoundary: "bounded-camera-pbr-reference-comparison",
    diagnostics: aura3dResult.diagnostics,
    canvasFrame: { width, height },
    materialChecks
  };
  status.textContent = JSON.stringify(window.__AURA3D_PBR_CAMERA_COMPARISON__, null, 2);
  window.addEventListener("beforeunload", () => aura3dResult.dispose(), { once: true });
}

async function renderAura3D(canvas: HTMLCanvasElement, environment: RgbaEnvironmentSource) {
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width,
    height,
    clearColor: [0.015, 0.017, 0.02, 1],
    antialias: false
  });
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ fovYRadians: Math.PI / 4, aspect: width / height, near: 0.1, far: 40 });
  camera.transform.setPosition(0, 0, 6);
  scene.root.addChild(camera);

  const key = scene.createLight("directional", "comparison-key");
  key.intensity = 2.4;
  key.color = [1, 0.9, 0.72];
  scene.root.addChild(key);

  const fill = scene.createLight("point", "comparison-fill");
  fill.intensity = 1.1;
  fill.range = 9;
  fill.color = [0.35, 0.62, 1];
  fill.transform.setPosition(-2.2, 1.2, 2.5);
  scene.root.addChild(fill);

  const entries = [
    ["dielectric", -1.7, "material:dielectric"],
    ["metal", 0, "material:metal"],
    ["emissive", 1.7, "material:emissive"]
  ] as const;
  for (const [name, x, material] of entries) {
    const node = scene.createNode(`aura3d-${name}`);
    node.transform.setPosition(x, 0, 0);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:sphere", material }));
  }

  const diagnostics = renderer.render({
    scene,
    geometryLibrary: { "geometry:sphere": Geometry.uvSphere(0.62, 36, 18) },
    materialLibrary: {
      "material:dielectric": new PBRMaterial({ baseColor: [0.85, 0.79, 0.66, 1], metallic: 0, roughness: 0.32 }),
      "material:metal": new PBRMaterial({ baseColor: [1, 0.62, 0.24, 1], metallic: 1, roughness: 0.12 }),
      "material:emissive": new PBRMaterial({ baseColor: [0.12, 0.48, 0.24, 1], roughness: 0.48, emissiveColor: [0.03, 0.85, 0.28], emissiveStrength: 1.6 })
    },
    environmentLighting: {
      color: [0.42, 0.5, 0.64],
      intensity: 0.1,
      environmentMapTexture: new TextureBinding({
        name: "u_environmentMapTexture",
        texture: new Texture({
          width: environment.width,
          height: environment.height,
          colorSpace: "srgb",
          label: "pbr-comparison-equirectangular-environment",
          mipLevels: generateRgba8EnvironmentMipLevels(environment, { levels: 3, blurRadius: 1 })
        }),
        sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "repeat", addressV: "clamp-to-edge" }),
        expectedColorSpace: "srgb",
        required: true
      }),
      environmentMapIntensity: 0.46,
      environmentMapSpecularIntensity: 0.75,
      environmentMapRotation: 0.04,
      environmentMapMipCount: 3,
      environmentBrdfLutTexture: createBrdfLutBinding()
    }
  });

  const pixels = {
    dielectric: findPixel(renderer, { x: 105, y: 135, width: 80, height: 100 }, isLitDielectric),
    metal: findPixel(renderer, { x: 210, y: 135, width: 80, height: 100 }, isWarmMetal),
    emissive: findPixel(renderer, { x: 310, y: 135, width: 90, height: 100 }, isEmissiveGreen)
  };
  return { diagnostics, pixels, dispose: () => renderer.dispose() };
}

async function renderThree(canvas: HTMLCanvasElement, environment: RgbaEnvironmentSource) {
  const threeModuleUrl = "/node_modules/three/build/three.module.js";
  const THREE = await import(/* @vite-ignore */ threeModuleUrl);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x040506, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 40);
  camera.position.set(0, 0, 6);

  const texture = new THREE.DataTexture(environment.data, environment.width, environment.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  scene.environment = texture;

  const key = new THREE.DirectionalLight(0xffe6b8, 2.4);
  key.position.set(0, 2, 4);
  scene.add(key);
  const fill = new THREE.PointLight(0x599eff, 1.1, 9);
  fill.position.set(-2.2, 1.2, 2.5);
  scene.add(fill);
  const geometry = new THREE.SphereGeometry(0.62, 36, 18);
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0xd9c9a8, metalness: 0, roughness: 0.32 }),
    new THREE.MeshStandardMaterial({ color: 0xff9e3d, metalness: 1, roughness: 0.12, envMapIntensity: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x1f7a3d, roughness: 0.48, emissive: 0x08d947, emissiveIntensity: 1.6 })
  ];
  [-1.7, 0, 1.7].forEach((x, index) => {
    const mesh = new THREE.Mesh(geometry, materials[index]);
    mesh.position.x = x;
    scene.add(mesh);
  });
  renderer.render(scene, camera);
  const pixels = {
    dielectric: readThreePixel(renderer, { x: 105, y: 135, width: 80, height: 100 }, isLitDielectric),
    metal: readThreePixel(renderer, { x: 210, y: 135, width: 80, height: 100 }, isWarmMetal),
    emissive: readThreePixel(renderer, { x: 310, y: 135, width: 90, height: 100 }, isEmissiveGreen)
  };
  return { pixels };
}

function createBrdfLutBinding(): TextureBinding {
  const lut = generateApproximateBrdfLutPixels({ width: 32, height: 32 });
  return new TextureBinding({
    name: "u_environmentBrdfLutTexture",
    texture: new Texture({ width: lut.width, height: lut.height, colorSpace: "linear", data: lut.data }),
    sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
    expectedColorSpace: "linear",
    required: true
  });
}

interface RgbaEnvironmentSource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

function createSharedEnvironmentSource(sourceWidth: number, sourceHeight: number): RgbaEnvironmentSource {
  const data = new Uint8Array(sourceWidth * sourceHeight * 4);
  for (let y = 0; y < sourceHeight; y += 1) {
    const v = y / Math.max(1, sourceHeight - 1);
    for (let x = 0; x < sourceWidth; x += 1) {
      const u = x / Math.max(1, sourceWidth - 1);
      const horizon = 1 - Math.abs(v - 0.5) * 2;
      const index = (y * sourceWidth + x) * 4;
      data[index] = Math.round(lerp(42, 235, horizon) + Math.sin(u * Math.PI * 2) * 18);
      data[index + 1] = Math.round(lerp(76, 182, horizon) + Math.cos(u * Math.PI * 2) * 10);
      data[index + 2] = Math.round(lerp(170, 88, horizon));
      data[index + 3] = 255;
    }
  }
  return { width: sourceWidth, height: sourceHeight, data };
}

function findPixel(
  renderer: Renderer,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  predicate: (pixel: readonly number[]) => boolean
): readonly number[] {
  const pixels = renderer.device.readPixels(region.x, region.y, region.width, region.height);
  for (let index = 0; index < pixels.length; index += 4) {
    const pixel = [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!] as const;
    if (predicate(pixel)) {
      return pixel;
    }
  }
  return Array.from(renderer.device.readPixels(region.x + Math.floor(region.width / 2), region.y + Math.floor(region.height / 2), 1, 1));
}

function readThreePixel(
  renderer: { getContext(): WebGLRenderingContext | WebGL2RenderingContext },
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  predicate: (pixel: readonly number[]) => boolean
): readonly number[] {
  const pixels = new Uint8Array(region.width * region.height * 4);
  const gl = renderer.getContext();
  gl.readPixels(region.x, region.y, region.width, region.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  for (let index = 0; index < pixels.length; index += 4) {
    const pixel = [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!] as const;
    if (predicate(pixel)) {
      return pixel;
    }
  }
  return [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0, pixels[3] ?? 0];
}

function channel(pixel: readonly number[] | undefined, index: number): number {
  return pixel?.[index] ?? 0;
}

function isLitDielectric(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 35 && channel(pixel, 1) > 30 && channel(pixel, 2) > 25 && channel(pixel, 3) === 255;
}

function isWarmMetal(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 0) > 28 && channel(pixel, 1) > 18 && channel(pixel, 2) < 130 && channel(pixel, 3) === 255;
}

function isEmissiveGreen(pixel: readonly number[] | undefined): boolean {
  return channel(pixel, 1) > 75 && channel(pixel, 0) < 120 && channel(pixel, 3) === 255;
}

function createShell(): { readonly aura3dCanvas: HTMLCanvasElement; readonly threeCanvas: HTMLCanvasElement; readonly status: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <section class="viewport">
      <canvas data-testid="pbr-comparison-aura3d-canvas" width="${width}" height="${height}"></canvas>
      <canvas data-testid="pbr-comparison-three-canvas" width="${width}" height="${height}"></canvas>
    </section>
    <section class="status">
      <h1>PBR Camera Comparison</h1>
      <p>Aura3D WebGL2 and Three.js render the same bounded perspective-camera material scene. The evidence covers camera-backed scene rendering and sampled environment lighting, not production PBR parity.</p>
      <pre data-testid="pbr-camera-comparison-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return {
    aura3dCanvas: shell.querySelector("[data-testid='pbr-comparison-aura3d-canvas']")!,
    threeCanvas: shell.querySelector("[data-testid='pbr-comparison-three-canvas']")!,
    status: shell.querySelector("pre")!
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #101316; color: #edf3f5; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    .viewport { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: #27313a; }
    canvas { width: 100%; height: min(72vh, 620px); display: block; background: #050607; }
    .status { border-top: 1px solid #30383e; background: #171c20; padding: 1rem 1.25rem; display: grid; grid-template-columns: 15rem 1fr minmax(18rem, 36rem); gap: 1rem; align-items: start; }
    h1, p, pre { margin: 0; }
    h1 { font-size: 1rem; }
    p { color: #cad3d8; line-height: 1.45; font-size: 0.875rem; }
    pre { color: #b6e6b1; font-size: 0.74rem; line-height: 1.35; overflow: auto; max-height: 18rem; }
    @media (max-width: 760px) { .viewport, .status { grid-template-columns: 1fr; } canvas { height: 42vh; } }
  `;
  document.head.append(style);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
