import { GPUProfiler, type GPUProfilerSnapshot } from "@aura3d/debug";
import { Renderable, Scene } from "@aura3d/scene";
import { Geometry, PBRMaterial, Renderer, type RenderDeviceDiagnostics } from "@aura3d/rendering";

declare global {
  interface Window {
    __AURA3D_RENDERER_STRESS_LAB__?: RendererStressLabState;
  }
}

interface RendererStressLabState {
  readonly status: "ready" | "error";
  readonly renderer: "webgl2";
  readonly visualClaim: "bounded-webgl2-renderer-stress-lab";
  readonly objectCount?: number;
  readonly materialCount?: number;
  readonly lightCount?: number;
  readonly visibleObjects?: number;
  readonly culledObjects?: number;
  readonly drawCalls?: number;
  readonly frameMs?: number;
  readonly memoryEstimateBytes?: number;
  readonly resourceLifetime?: RendererResourceLifetimeMetrics;
  readonly timing?: RendererTimingMetrics;
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly canvasFrame?: { readonly width: number; readonly height: number };
  readonly centerPixel?: readonly number[];
  readonly controls?: { readonly minObjects: number; readonly maxObjects: number; readonly minMaterials: number; readonly maxMaterials: number; readonly minLights: number; readonly maxLights: number };
  readonly knownLimits: readonly string[];
  readonly errors: readonly string[];
  readonly error?: string;
}

interface RendererResourceLifetimeMetrics {
  readonly liveBuffers: number;
  readonly liveShaders: number;
  readonly liveTextures: number;
  readonly liveRenderTargets: number;
  readonly disposedBuffers: number;
  readonly disposedShaders: number;
  readonly disposedTextures: number;
  readonly disposedRenderTargets: number;
  readonly contextLost: boolean;
}

interface RendererTimingMetrics {
  readonly cpuFrameMs: number;
  readonly gpuTimingSupported: boolean;
  readonly gpuUnavailableReason?: string;
  readonly samples: GPUProfilerSnapshot["samples"];
}

const canvasWidth = 960;
const canvasHeight = 540;

if (typeof document !== "undefined") {
  void run().catch((error) => {
    window.__AURA3D_RENDERER_STRESS_LAB__ = {
      status: "error",
      renderer: "webgl2",
      visualClaim: "bounded-webgl2-renderer-stress-lab",
      knownLimits: knownLimits(),
      errors: [error instanceof Error ? error.message : String(error)],
      error: error instanceof Error ? error.stack ?? error.message : String(error)
    };
    throw error;
  });
}

async function run(): Promise<void> {
  installStyles();
  const shell = createShell();
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas: shell.canvas,
    width: shell.canvas.width,
    height: shell.canvas.height,
    clearColor: [0.032, 0.038, 0.045, 1],
    antialias: false,
    preserveDrawingBuffer: true
  });

  const render = () => {
    const objectCount = Number(shell.objectInput.value);
    const materialCount = Number(shell.materialInput.value);
    const lightCount = Number(shell.lightInput.value);
    const result = renderStressScene(renderer, objectCount, materialCount, lightCount);
    window.__AURA3D_RENDERER_STRESS_LAB__ = result;
    shell.status.textContent = JSON.stringify(result, null, 2);
  };
  shell.objectInput.addEventListener("input", render);
  shell.materialInput.addEventListener("input", render);
  shell.lightInput.addEventListener("input", render);
  render();
  window.addEventListener("beforeunload", () => renderer.dispose(), { once: true });
}

function renderStressScene(renderer: Renderer, objectCount: number, materialCount: number, lightCount: number): RendererStressLabState {
  const start = performance.now();
  const profiler = new GPUProfiler(false, "EXT_disjoint_timer_query_webgl2 unavailable; using CPU frame timing fallback.");
  const frameTimer = profiler.begin("renderer-stress-frame");
  const resources = createStressScene(objectCount, materialCount, lightCount);
  const diagnostics = renderer.render({
    scene: resources.scene,
    geometryLibrary: resources.geometryLibrary,
    materialLibrary: resources.materialLibrary,
    frustumCulling: true
  });
  const frameMs = Number((performance.now() - start).toFixed(3));
  frameTimer.end(frameMs);
  const gpuSnapshot = profiler.snapshot();
  const centerPixel = Array.from(renderer.device.readPixels(Math.floor(canvasWidth / 2), Math.floor(canvasHeight / 2), 1, 1));
  const visibleObjects = diagnostics.drawCalls;
  return {
    status: "ready",
    renderer: "webgl2",
    visualClaim: "bounded-webgl2-renderer-stress-lab",
    objectCount,
    materialCount,
    lightCount,
    visibleObjects,
    culledObjects: Math.max(0, objectCount - visibleObjects),
    drawCalls: diagnostics.drawCalls,
    frameMs,
    memoryEstimateBytes: estimateGeometryBytes(resources.geometryLibrary) + (diagnostics.textureBytes ?? 0),
    resourceLifetime: {
      liveBuffers: diagnostics.buffers,
      liveShaders: diagnostics.shaders,
      liveTextures: diagnostics.textures ?? 0,
      liveRenderTargets: diagnostics.renderTargets ?? 0,
      disposedBuffers: diagnostics.disposedBuffers ?? 0,
      disposedShaders: diagnostics.disposedShaders ?? 0,
      disposedTextures: diagnostics.disposedTextures ?? 0,
      disposedRenderTargets: diagnostics.disposedRenderTargets ?? 0,
      contextLost: diagnostics.contextLost
    },
    timing: {
      cpuFrameMs: frameMs,
      gpuTimingSupported: gpuSnapshot.supported,
      gpuUnavailableReason: gpuSnapshot.unavailableReason,
      samples: gpuSnapshot.samples
    },
    diagnostics,
    canvasFrame: { width: canvasWidth, height: canvasHeight },
    centerPixel,
    controls: { minObjects: 12, maxObjects: 240, minMaterials: 1, maxMaterials: 12, minLights: 1, maxLights: 8 },
    knownLimits: knownLimits(),
    errors: []
  };
}

function estimateGeometryBytes(geometryLibrary: Record<string, Geometry>): number {
  return Object.values(geometryLibrary).reduce((total, geometry) => total + geometry.vertexBuffer.byteLength + (geometry.indexBuffer?.byteLength ?? 0), 0);
}

function createStressScene(objectCount: number, materialCount: number, lightCount: number) {
  const scene = new Scene();
  const camera = scene.createPerspectiveCamera({ fovYRadians: Math.PI / 4, aspect: canvasWidth / canvasHeight, near: 0.1, far: 34 });
  camera.transform.setPosition(0, 0, 14);
  scene.root.addChild(camera);

  for (let index = 0; index < lightCount; index += 1) {
    const light = scene.createLight(index === 0 ? "directional" : "point", `stress-light-${index}`);
    light.intensity = index === 0 ? 2.2 : 0.45 + index * 0.08;
    light.color = palette(index).slice(0, 3) as [number, number, number];
    if (light.kind === "point") {
      light.transform.setPosition(Math.cos(index) * 5.2, 2.2 + (index % 3) * 0.4, 4.2 + Math.sin(index) * 1.6);
      light.range = 13;
    }
    scene.root.addChild(light);
  }

  for (let index = 0; index < objectCount; index += 1) {
    const node = scene.createNode(`stress-object-${index}`);
    const row = Math.floor(index / 20);
    const column = index % 20;
    const hiddenBand = index >= Math.floor(objectCount * 0.72);
    const x = hiddenBand ? 42 + (index % 8) * 1.4 : (column - 9.5) * 0.72;
    const y = hiddenBand ? 0 : 2.5 - row * 0.58;
    const z = hiddenBand ? -8 : -((row % 6) * 0.16);
    node.transform.setPosition(x, y, z);
    node.transform.setScale(0.45, 0.45, 0.45);
    scene.root.addChild(node);
    scene.addRenderable(node, new Renderable({
      geometry: index % 5 === 0 ? "geometry:cube" : "geometry:sphere",
      material: `material:${index % materialCount}`
    }));
  }

  return {
    scene,
    geometryLibrary: {
      "geometry:sphere": Geometry.uvSphere(0.46, 18, 9),
      "geometry:cube": Geometry.litCube(0.72)
    },
    materialLibrary: Object.fromEntries(Array.from({ length: materialCount }, (_, index) => {
      const color = palette(index);
      return [`material:${index}`, new PBRMaterial({
        name: `stress-material-${index}`,
        baseColor: color,
        metallic: index % 3 === 0 ? 0.85 : 0.05,
        roughness: 0.22 + (index % 5) * 0.14,
        emissiveColor: index % 7 === 0 ? [0.02, 0.08, 0.04] : [0, 0, 0],
        emissiveStrength: 1
      })];
    }))
  };
}

function palette(index: number): [number, number, number, number] {
  const colors: readonly [number, number, number, number][] = [
    [0.94, 0.34, 0.22, 1],
    [0.18, 0.62, 0.94, 1],
    [0.24, 0.78, 0.46, 1],
    [0.95, 0.72, 0.25, 1],
    [0.72, 0.36, 0.92, 1],
    [0.88, 0.88, 0.8, 1],
    [0.26, 0.86, 0.84, 1],
    [0.96, 0.48, 0.68, 1],
    [0.56, 0.74, 0.36, 1],
    [0.98, 0.56, 0.24, 1],
    [0.42, 0.46, 0.96, 1],
    [0.78, 0.82, 0.9, 1]
  ];
  return colors[index % colors.length]!;
}

function knownLimits(): readonly string[] {
  return [
    "This lab measures bounded WebGL2 draw submission and frustum-culling behavior; it is not a production benchmark.",
    "Static batching, GPU timer queries, LOD, and hardware memory residency are not implemented in this example.",
    "The object-count slider is capped to keep browser test runtime stable."
  ];
}

function createShell(): {
  readonly canvas: HTMLCanvasElement;
  readonly objectInput: HTMLInputElement;
  readonly materialInput: HTMLInputElement;
  readonly lightInput: HTMLInputElement;
  readonly status: HTMLElement;
} {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();
  const shell = document.createElement("main");
  shell.innerHTML = `
    <canvas data-testid="renderer-stress-lab-canvas" width="${canvasWidth}" height="${canvasHeight}"></canvas>
    <section>
      <div class="control"><label for="objects">Objects</label><input id="objects" data-testid="stress-objects" type="range" min="12" max="240" step="12" value="96" /></div>
      <div class="control"><label for="materials">Materials</label><input id="materials" data-testid="stress-materials" type="range" min="1" max="12" step="1" value="8" /></div>
      <div class="control"><label for="lights">Lights</label><input id="lights" data-testid="stress-lights" type="range" min="1" max="8" step="1" value="4" /></div>
      <pre data-testid="renderer-stress-lab-status">booting</pre>
    </section>
  `;
  root.append(shell);
  return {
    canvas: shell.querySelector("canvas")!,
    objectInput: shell.querySelector("[data-testid='stress-objects']")!,
    materialInput: shell.querySelector("[data-testid='stress-materials']")!,
    lightInput: shell.querySelector("[data-testid='stress-lights']")!,
    status: shell.querySelector("pre")!
  };
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #101316; color: #edf3f5; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
    canvas { width: 100%; height: min(72vh, 620px); display: block; background: #080a0d; }
    section { border-top: 1px solid #2c363b; background: #171d21; padding: 1rem 1.25rem; display: grid; grid-template-columns: repeat(3, minmax(9rem, 14rem)) minmax(20rem, 1fr); gap: 1rem; align-items: start; }
    .control { display: grid; gap: 0.45rem; }
    label { font-size: 0.78rem; color: #cbd5da; }
    input { width: 100%; accent-color: #4fb4df; }
    pre { margin: 0; color: #b6e6b1; font-size: 0.78rem; line-height: 1.35; overflow: auto; max-height: 11rem; }
    @media (max-width: 860px) { section { grid-template-columns: 1fr; } canvas { height: 62vh; } }
  `;
  document.head.append(style);
}
