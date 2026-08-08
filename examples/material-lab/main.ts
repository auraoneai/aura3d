import { Renderable, Scene } from "@aura3d/scene";
import { Geometry, IndexBuffer, NormalMappedPBRMaterial, PBRMaterial, Renderer, Sampler, Texture, TexturedPBRMaterial, TexturedUnlitMaterial, UnlitMaterial, VertexBuffer, VertexFormat } from "@aura3d/rendering";

declare global {
  interface Window {
    __AURA3D_MATERIAL_LAB__?: LabState;
  }
}

interface LabState {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly diagnostics?: { readonly drawCalls: number; readonly lastError: string | null };
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly pixels?: Record<string, readonly number[]>;
  readonly materials?: readonly string[];
  readonly error?: string;
}

const canvasWidth = 960;
const canvasHeight = 540;

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__AURA3D_MATERIAL_LAB__ = {
      status: "error",
      renderer: "webgl2",
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
    clearColor: [0.015, 0.018, 0.022, 1],
    antialias: false
  });

  const { scene, geometryLibrary, materialLibrary } = createScene(canvas.width / canvas.height);
  const diagnostics = renderer.render({ scene, geometryLibrary, materialLibrary });
  const pixels = {
    baseColor: findPixel(renderer, { x: 0, y: 185, width: 160, height: 150 }, (r, g, b, a) => r > 180 && g < 85 && b < 70 && a === 255),
    vertexColor: findPixel(renderer, { x: 165, y: 185, width: 150, height: 150 }, (r, g, b, a) => g > 145 && r < 90 && b < 120 && a === 255),
    normalMap: findPixel(renderer, { x: 320, y: 185, width: 155, height: 150 }, (r, g, b, a) => b > 95 && r < 190 && a === 255),
    metallic: findPixel(renderer, { x: 480, y: 185, width: 155, height: 150 }, (r, g, b, a) => r > 80 && g > 45 && b < 95 && a === 255),
    alphaMask: findPixel(renderer, { x: 635, y: 185, width: 60, height: 150 }, (r, g, b, a) => g > 145 && b > 120 && r < 80 && a === 255),
    alphaBlend: findPixel(renderer, { x: 795, y: 185, width: 150, height: 150 }, (r, g, b, a) => r > 65 && b > 70 && g < 170 && a === 255)
  };

  window.__AURA3D_MATERIAL_LAB__ = {
    status: "ready",
    renderer: "webgl2",
    diagnostics,
    canvasFrame: { width: canvas.width, height: canvas.height },
    pixels,
    materials: Object.keys(materialLibrary)
  };
  status.textContent = JSON.stringify(window.__AURA3D_MATERIAL_LAB__, null, 2);

  window.addEventListener("beforeunload", () => renderer.dispose(), { once: true });
}

function createScene(aspect: number) {
  const scene = new Scene();
  const camera = scene.createOrthographicCamera({ left: -3.4 * aspect, right: 3.4 * aspect, bottom: -2.2, top: 2.2, near: 0.1, far: 20 });
  camera.transform.setPosition(0, 0, 5);
  scene.root.addChild(camera);

  const key = scene.createLight("directional", "material-lab-key");
  key.intensity = 2.4;
  key.color = [1, 0.94, 0.86];
  key.transform.setRotation(0, 0, 0, 1);
  scene.root.addChild(key);

  const fill = scene.createLight("point", "material-lab-fill");
  fill.intensity = 1.2;
  fill.color = [0.3, 0.7, 1];
  fill.transform.setPosition(0, 1.3, 2);
  scene.root.addChild(fill);

  const entries = [
    ["base", -3.25, "geometry:lit-triangle", "material:base-color"],
    ["vertex-color", -1.95, "geometry:vertex-color-triangle", "material:vertex-color"],
    ["normal", -0.65, "geometry:textured-cube", "material:normal-map"],
    ["metal", 0.65, "geometry:textured-cube", "material:metallic-roughness"],
    ["alpha-mask", 1.95, "geometry:textured-cube", "material:alpha-mask"],
    ["alpha", 3.25, "geometry:lit-triangle", "material:alpha-blend"]
  ] as const;
  for (const [name, x, geometry, material] of entries) {
    const node = scene.createNode(`material-lab-${name}`);
    node.transform.setPosition(x, 0, 0);
    node.transform.setScale(1.2, 1.2, 1.2);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({ geometry, material }));
  }

  const geometryLibrary = {
    "geometry:lit-triangle": Geometry.litTriangle(),
    "geometry:vertex-color-triangle": createVertexColorTriangle(),
    "geometry:textured-cube": Geometry.texturedCube(1.05),
    "geometry:lit-sphere": Geometry.uvSphere(0.64, 32, 16)
  };
  const alphaMaskMaterial = new TexturedUnlitMaterial({
    texture: createAlphaMaskTexture(),
    textureTransform: { offset: [0.25, 0], scale: [1.5, 1], rotation: 0 },
    color: [0.2, 0.95, 0.9, 1],
    renderState: { depthTest: false, depthWrite: false, cullMode: "none" }
  });
  alphaMaskMaterial.setParameter("u_alphaCutoff", 0.5);
  const materialLibrary = {
    "material:base-color": new UnlitMaterial({ color: [0.95, 0.18, 0.08, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
    "material:vertex-color": new UnlitMaterial({ color: [1, 1, 1, 1], renderState: { depthTest: false, depthWrite: false, cullMode: "none" } }),
    "material:normal-map": new NormalMappedPBRMaterial({
      baseColor: [0.34, 0.62, 0.95, 1],
      roughness: 0.35,
      normalTexture: createNormalTexture(),
      normalSampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }),
      normalScale: 1,
      renderState: { cullMode: "none" }
    }),
    "material:metallic-roughness": new TexturedPBRMaterial({
      baseColor: [0.95, 0.7, 0.28, 1],
      metallic: 1,
      roughness: 0.22,
      metallicRoughnessTexture: createMetallicRoughnessTexture(),
      occlusionTexture: createOcclusionTexture(),
      occlusionStrength: 0.25,
      emissiveColor: [0, 0, 0],
      emissiveTexture: createSolidTexture("material-lab-emissive-off", [0, 0, 0, 255], "srgb"),
      renderState: { cullMode: "none" }
    }),
    "material:alpha-mask": alphaMaskMaterial,
    "material:alpha-blend": new PBRMaterial({
      baseColor: [0.8, 0.22, 0.92, 0.62],
      roughness: 0.75,
      emissiveColor: [0.28, 0.05, 0.38],
      renderState: { blend: true, depthWrite: false, cullMode: "none" }
    })
  };

  return { scene, geometryLibrary, materialLibrary };
}

function createVertexColorTriangle(): Geometry {
  const format = new VertexFormat([
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "color", components: 4, offset: 12 }
  ], 28);
  const vertices = new VertexBuffer(format, 3);
  vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
  vertices.setAttribute(0, "color", [0.1, 0.95, 0.25, 1]);
  vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
  vertices.setAttribute(1, "color", [0.1, 0.75, 0.4, 1]);
  vertices.setAttribute(2, "position", [0, 0.5, 0]);
  vertices.setAttribute(2, "color", [0.1, 0.95, 0.75, 1]);
  return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
}

function createNormalTexture(): Texture {
  return new Texture({
    width: 2,
    height: 2,
    label: "material-lab-normal",
    data: new Uint8Array([
      128, 128, 255, 255,
      210, 128, 210, 255,
      128, 210, 210, 255,
      80, 160, 240, 255
    ])
  });
}

function createMetallicRoughnessTexture(): Texture {
  return new Texture({
    width: 2,
    height: 2,
    label: "material-lab-metallic-roughness",
    data: new Uint8Array([
      0, 62, 255, 255,
      0, 128, 255, 255,
      0, 38, 255, 255,
      0, 92, 255, 255
    ])
  });
}

function createOcclusionTexture(): Texture {
  return new Texture({
    width: 2,
    height: 2,
    label: "material-lab-occlusion",
    data: new Uint8Array([
      230, 230, 230, 255,
      190, 190, 190, 255,
      255, 255, 255, 255,
      210, 210, 210, 255
    ])
  });
}

function createAlphaMaskTexture(): Texture {
  return new Texture({
    width: 2,
    height: 2,
    label: "material-lab-alpha-mask",
    colorSpace: "srgb",
    data: new Uint8Array([
      20, 240, 220, 255,
      20, 240, 220, 32,
      20, 240, 220, 255,
      20, 240, 220, 32
    ])
  });
}

function createSolidTexture(label: string, color: readonly [number, number, number, number], colorSpace: "linear" | "srgb" = "linear"): Texture {
  return new Texture({ width: 1, height: 1, label, colorSpace, data: new Uint8Array(color) });
}

function createShell(): { readonly canvas: HTMLCanvasElement; readonly status: HTMLElement } {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <canvas data-testid="material-lab-canvas" width="${canvasWidth}" height="${canvasHeight}"></canvas>
    <section>
      <h1>Material Lab</h1>
      <p>WebGL2 renderer material matrix covering base color, vertex colors, normal map, metallic-roughness texture, occlusion texture, emissive parameters, alpha mask, alpha blend, double-sided state, and UV transforms.</p>
      <pre data-testid="material-lab-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return { canvas: shell.querySelector("canvas")!, status: shell.querySelector("pre")! };
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

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #0f1214; color: #edf4f7; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    canvas { width: 100%; height: min(72vh, 620px); display: block; background: #050608; }
    section { border-top: 1px solid #2d363c; background: #161b1f; padding: 1rem 1.25rem; display: grid; grid-template-columns: 14rem 1fr minmax(18rem, 28rem); gap: 1rem; align-items: start; }
    h1, p, pre { margin: 0; }
    h1 { font-size: 1rem; }
    p { color: #c7d2d8; line-height: 1.45; font-size: 0.875rem; }
    pre { color: #b6e6b1; font-size: 0.78rem; line-height: 1.35; overflow: auto; }
    @media (max-width: 760px) { section { grid-template-columns: 1fr; } canvas { height: 62vh; } }
  `;
  document.head.append(style);
}
