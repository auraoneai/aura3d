import { Renderable, Scene } from "@galileo3d/scene";
import {
  Geometry,
  PBRMaterial,
  Renderer,
  Sampler,
  Texture,
  TextureBinding,
  generateApproximateBrdfLutPixels,
  generateRgba8EnvironmentMipLevels
} from "@galileo3d/rendering";

declare global {
  interface Window {
    __GALILEO3D_PBR_MATERIAL_LAB__?: PbrLabState;
  }
}

interface PbrLabState {
  readonly id: "pbr-material-lab";
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: "bounded-pbr-material-lab";
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly environmentLighting: "sampled-environment-map-approximation";
  readonly lightingModel: "direct-lights-plus-sampled-environment-map";
  readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly pixels?: Record<string, readonly number[]>;
  readonly error?: string;
}

const knownLimits = [
  "This page shows the currently implemented PBR material slice, not production PBR parity.",
  "HDR IBL, irradiance convolution, calibrated specular prefiltering, reflection probes, and compressed material packs remain unclaimed.",
  "The visual checks are fixed-scene browser evidence for these generated materials only.",
] as const;

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__GALILEO3D_PBR_MATERIAL_LAB__ = {
      id: "pbr-material-lab",
      status: "error",
      renderer: "webgl2",
      visualClaim: "bounded-pbr-material-lab",
      knownLimits,
      errors: [error instanceof Error ? error.message : String(error)],
      environmentLighting: "sampled-environment-map-approximation",
      lightingModel: "direct-lights-plus-sampled-environment-map",
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const { canvas, status } = createShell();
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.02, 0.022, 0.026, 1],
    antialias: false
  });
  const { scene, geometryLibrary, materialLibrary } = createPbrScene(canvas.width / canvas.height);
  const environmentMapTexture = createPbrLabEnvironmentMapTexture();
  const environmentBrdfLutTexture = createPbrLabBrdfLutTexture();
  const diagnostics = renderer.render({
    scene,
    geometryLibrary,
    materialLibrary,
    environmentLighting: {
      color: [0.46, 0.56, 0.72],
      intensity: 0.12,
      proceduralMap: {
        skyColor: [0.22, 0.38, 0.82],
        horizonColor: [0.9, 0.7, 0.45],
        groundColor: [0.07, 0.075, 0.08],
        specularColor: [1, 0.9, 0.68],
        intensity: 0.58,
        specularIntensity: 0.34
      },
      environmentMapTexture,
      environmentMapIntensity: 0.42,
      environmentMapSpecularIntensity: 0.24,
      environmentMapRotation: 0.08,
      environmentMapMipCount: 3,
      environmentBrdfLutTexture
    }
  });
  const pixels = {
    dielectricSmooth: findPixel(renderer, { x: 245, y: 205, width: 110, height: 130 }, (r, g, b, a) => r > 45 && g > 40 && b > 35 && a === 255),
    dielectricRough: findPixel(renderer, { x: 365, y: 205, width: 110, height: 130 }, (r, g, b, a) => r > 45 && g > 40 && b > 35 && a === 255),
    metalSmooth: findPixel(renderer, { x: 485, y: 205, width: 110, height: 130 }, (r, g, b, a) => r > 70 && g > 40 && b < 90 && a === 255),
    emissive: findPixel(renderer, { x: 610, y: 205, width: 110, height: 130 }, (r, g, b, a) => g > 90 && r < 90 && a === 255)
  };
  window.__GALILEO3D_PBR_MATERIAL_LAB__ = {
    id: "pbr-material-lab",
    status: "ready",
    renderer: "webgl2",
    visualClaim: "bounded-pbr-material-lab",
    knownLimits,
    errors: [],
    environmentLighting: "sampled-environment-map-approximation",
    lightingModel: "direct-lights-plus-sampled-environment-map",
    diagnostics,
    canvasFrame: { width: canvas.width, height: canvas.height },
    pixels
  };
  status.textContent = JSON.stringify(window.__GALILEO3D_PBR_MATERIAL_LAB__, null, 2);
  window.addEventListener("beforeunload", () => renderer.dispose(), { once: true });
}

function createPbrScene(aspect: number) {
  const scene = new Scene();
  const camera = scene.createOrthographicCamera({ left: -3.35 * aspect, right: 3.35 * aspect, bottom: -2.1, top: 2.1, near: 0.1, far: 20 });
  camera.transform.setPosition(0, 0, 5);
  scene.root.addChild(camera);

  const warmKey = scene.createLight("directional", "pbr-warm-key");
  warmKey.intensity = 2.1;
  warmKey.color = [1, 0.88, 0.74];
  warmKey.transform.setRotation(0, 1, 0, 0);
  scene.root.addChild(warmKey);

  const coolFill = scene.createLight("point", "pbr-cool-fill");
  coolFill.intensity = 0.9;
  coolFill.range = 8;
  coolFill.color = [0.35, 0.62, 1];
  coolFill.transform.setPosition(-1.8, 1.4, 2.3);
  scene.root.addChild(coolFill);

  const entries = [
    ["dielectric-smooth", -2.25, "material:dielectric-smooth"],
    ["dielectric-rough", -0.75, "material:dielectric-rough"],
    ["metal-smooth", 0.75, "material:metal-smooth"],
    ["emissive", 2.25, "material:emissive"]
  ] as const;
  for (const [name, x, material] of entries) {
    const node = scene.createNode(`pbr-lab-${name}`);
    node.transform.setPosition(x, 0, 0);
    node.transform.setScale(1.15, 1.15, 1.15);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry: "geometry:sphere", material }));
  }

  return {
    scene,
    geometryLibrary: { "geometry:sphere": Geometry.uvSphere(0.68, 36, 18) },
    materialLibrary: {
      "material:dielectric-smooth": new PBRMaterial({ baseColor: [0.92, 0.88, 0.78, 1], metallic: 0, roughness: 0.18 }),
      "material:dielectric-rough": new PBRMaterial({ baseColor: [0.48, 0.62, 0.82, 1], metallic: 0, roughness: 0.9 }),
      "material:metal-smooth": new PBRMaterial({ baseColor: [0.95, 0.63, 0.23, 1], metallic: 1, roughness: 0.18 }),
      "material:emissive": new PBRMaterial({ baseColor: [0.18, 0.55, 0.34, 1], roughness: 0.5, emissiveColor: [0.05, 0.85, 0.36], emissiveStrength: 1.8 })
    }
  };
}

function createShell(): { readonly canvas: HTMLCanvasElement; readonly status: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <canvas data-testid="pbr-material-lab-canvas" width="960" height="540"></canvas>
    <section>
      <h1>PBR Material Lab</h1>
      <p>WebGL2 PBR comparisons for roughness, metalness, emissive response, and a bounded sampled environment-map approximation. HDR maps, irradiance/specular probes, production BRDF LUT integration, reflection probes, and physically correct IBL are not implemented in this lab.</p>
      <pre data-testid="pbr-material-lab-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return { canvas: shell.querySelector("canvas")!, status: shell.querySelector("pre")! };
}

function createPbrLabEnvironmentMapTexture(): TextureBinding {
  const width = 64;
  const height = 32;
  const source = createEnvironmentSourcePixels(width, height);
  const mipLevels = generateRgba8EnvironmentMipLevels(source, { levels: 3, blurRadius: 1 });
  return new TextureBinding({
    name: "u_environmentMapTexture",
    texture: new Texture({
      width,
      height,
      label: "pbr-lab-equirectangular-environment",
      colorSpace: "srgb",
      mipLevels
    }),
    sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "repeat", addressV: "clamp-to-edge" }),
    expectedColorSpace: "srgb",
    required: true
  });
}

function createEnvironmentSourcePixels(width: number, height: number): { readonly width: number; readonly height: number; readonly data: Uint8Array } {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const vertical = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const horizontal = x / Math.max(1, width - 1);
      const horizon = 1 - Math.abs(vertical - 0.5) * 2;
      const index = (y * width + x) * 4;
      data[index] = Math.round(lerp(42, 230, horizon) + Math.sin(horizontal * Math.PI * 2) * 16);
      data[index + 1] = Math.round(lerp(74, 178, horizon) + Math.cos(horizontal * Math.PI * 2) * 10);
      data[index + 2] = Math.round(lerp(178, 86, horizon));
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function createPbrLabBrdfLutTexture(): TextureBinding {
  const lut = generateApproximateBrdfLutPixels({ width: 32, height: 32 });
  return new TextureBinding({
    name: "u_environmentBrdfLutTexture",
    texture: new Texture({
      width: lut.width,
      height: lut.height,
      label: "pbr-lab-brdf-lut",
      colorSpace: "linear",
      data: lut.data
    }),
    sampler: new Sampler({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
    expectedColorSpace: "linear",
    required: true
  });
}

function findPixel(
  renderer: Renderer,
  region: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  predicate: (r: number, g: number, b: number, a: number) => boolean
): readonly number[] {
  const pixels = renderer.device.readPixels(region.x, region.y, region.width, region.height);
  for (let index = 0; index < pixels.length; index += 4) {
    const pixel = [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!] as const;
    if (predicate(pixel[0], pixel[1], pixel[2], pixel[3])) {
      return pixel;
    }
  }
  return Array.from(renderer.device.readPixels(region.x + Math.floor(region.width / 2), region.y + Math.floor(region.height / 2), 1, 1));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #101214; color: #edf3f5; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    canvas { width: 100%; height: min(72vh, 620px); display: block; background: #060709; }
    section { border-top: 1px solid #30383e; background: #171c20; padding: 1rem 1.25rem; display: grid; grid-template-columns: 14rem 1fr minmax(18rem, 28rem); gap: 1rem; align-items: start; }
    h1, p, pre { margin: 0; }
    h1 { font-size: 1rem; }
    p { color: #cad3d8; line-height: 1.45; font-size: 0.875rem; }
    pre { color: #b6e6b1; font-size: 0.78rem; line-height: 1.35; overflow: auto; }
    @media (max-width: 760px) { section { grid-template-columns: 1fr; } canvas { height: 62vh; } }
  `;
  document.head.append(style);
}
