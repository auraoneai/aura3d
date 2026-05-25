import {
  Geometry,
  InstancedUnlitMaterial,
  MAX_GPU_INSTANCES,
  Renderer,
  Texture,
  TexturedUnlitMaterial,
  type RenderItem
} from "@galileo3d/rendering";

interface V6BrowserPerformanceReport {
  readonly status: "ready" | "error";
  readonly error?: string;
  readonly realWebGL2: boolean;
  readonly frameMs: number;
  readonly readyMs: number;
  readonly drawCalls: number;
  readonly buffers: number;
  readonly shaders: number;
  readonly textures: number;
  readonly textureBytes: number;
  readonly candidateInstances: number;
  readonly renderedInstances: number;
  readonly culledInstances: number;
  readonly instancedBatches: number;
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly memory?: {
    readonly usedJSHeapSize: number;
    readonly totalJSHeapSize: number;
    readonly jsHeapSizeLimit: number;
  };
}

declare global {
  interface Window {
    __g3dV6Performance?: V6BrowserPerformanceReport;
  }
}

void run();

async function run(): Promise<void> {
  const pageStart = performance.now();
  try {
    const canvas = document.getElementById("viewport");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing canvas#viewport.");
    const candidateInstances = 4096;
    const renderedInstances = 2048;
    const culledInstances = candidateInstances - renderedInstances;
    const triangle = Geometry.triangle();
    const texture = createTexture();
    const material = new InstancedUnlitMaterial({ name: "production-runtime-browser-instanced", color: [0.95, 0.52, 0.15, 1] });
    const textured = new TexturedUnlitMaterial({ name: "production-runtime-browser-textured", texture });
    const renderItems: RenderItem[] = [
      { geometry: Geometry.texturedCube(0.12), material: textured, label: "production-runtime-browser-textured-probe" }
    ];
    for (let start = 0; start < renderedInstances; start += MAX_GPU_INSTANCES) {
      const count = Math.min(MAX_GPU_INSTANCES, renderedInstances - start);
      renderItems.push({
        geometry: triangle,
        material,
        instanceTransforms: buildInstanceMatrices(start, count),
        label: `production-runtime-browser-instance-${start}`
      });
    }

    const renderer = await Renderer.create({
      backend: "webgl2",
      canvas,
      width: canvas.width,
      height: canvas.height,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    const frameStart = performance.now();
    const diagnostics = renderer.render(renderItems);
    const frameMs = Number((performance.now() - frameStart).toFixed(3));
    const pixels = analyzePixels(renderer.device.readPixels(0, 0, canvas.width, canvas.height));
    window.__g3dV6Performance = {
      status: "ready",
      realWebGL2: renderer.device.kind === "webgl2",
      frameMs,
      readyMs: Number((performance.now() - pageStart).toFixed(3)),
      drawCalls: diagnostics.drawCalls,
      buffers: diagnostics.buffers,
      shaders: diagnostics.shaders,
      textures: diagnostics.textures ?? 0,
      textureBytes: diagnostics.textureBytes ?? texture.byteLength,
      candidateInstances,
      renderedInstances,
      culledInstances,
      instancedBatches: Math.ceil(renderedInstances / MAX_GPU_INSTANCES),
      nonBlackPixels: pixels.nonBlackPixels,
      uniqueColorBuckets: pixels.uniqueColorBuckets,
      ...readMemory()
    };
  } catch (error) {
    window.__g3dV6Performance = {
      status: "error",
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      realWebGL2: false,
      frameMs: 0,
      readyMs: Number((performance.now() - pageStart).toFixed(3)),
      drawCalls: 0,
      buffers: 0,
      shaders: 0,
      textures: 0,
      textureBytes: 0,
      candidateInstances: 0,
      renderedInstances: 0,
      culledInstances: 0,
      instancedBatches: 0,
      nonBlackPixels: 0,
      uniqueColorBuckets: 0
    };
  }
}

function createTexture(): Texture {
  const data = new Uint8Array(16 * 16 * 4);
  for (let pixel = 0; pixel < 256; pixel += 1) {
    data.set([(pixel * 5) % 255, (96 + pixel * 7) % 255, (180 + pixel * 11) % 255, 255], pixel * 4);
  }
  return new Texture({ width: 16, height: 16, data, colorSpace: "srgb", label: "production-runtime-browser-performance-texture" });
}

function buildInstanceMatrices(start: number, count: number): Float32Array {
  const matrices = new Float32Array(count * 16);
  for (let index = 0; index < count; index += 1) {
    const instance = start + index;
    const column = instance % 64;
    const row = Math.floor(instance / 64);
    matrices.set([
      0.022, 0, 0, 0,
      0, 0.022, 0, 0,
      0, 0, 0.022, 0,
      -0.92 + column * 0.029, -0.86 + row * 0.052, 0, 1
    ], index * 16);
  }
  return matrices;
}

function analyzePixels(pixels: Uint8Array): { readonly nonBlackPixels: number; readonly uniqueColorBuckets: number } {
  let nonBlackPixels = 0;
  const buckets = new Set<number>();
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    if (r + g + b > 12) nonBlackPixels += 1;
    buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  return { nonBlackPixels, uniqueColorBuckets: buckets.size };
}

function readMemory(): { readonly memory?: V6BrowserPerformanceReport["memory"] } {
  const memory = (performance as Performance & { readonly memory?: V6BrowserPerformanceReport["memory"] }).memory;
  return memory ? { memory } : {};
}
