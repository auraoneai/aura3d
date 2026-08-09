// @ts-nocheck -- this is an executable compatibility probe against the installed Three.js JS surface.
import {
  Color,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  RenderPipeline,
  Scene,
  WebGPURenderer
} from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "/node_modules/three/examples/jsm/tsl/display/BloomNode.js";

declare global { interface Window { __THREE_NODE_POSTPROCESS__?: any } }

void run();

async function run(): Promise<void> {
  try {
    const canvas = document.querySelector<HTMLCanvasElement>("#three-node");
    if (!canvas) throw new Error("Missing Three node canvas.");
    const renderer = new WebGPURenderer({ canvas, forceWebGL: true, antialias: false });
    renderer.setPixelRatio(1);
    renderer.setSize(320, 180, false);
    renderer.setClearColor(new Color(0x03050a), 1);
    await renderer.init();
    const scene = new Scene();
    const camera = new OrthographicCamera(-1.6, 1.6, 0.9, -0.9, 0.1, 10);
    camera.position.z = 2;
    const colors = [0xffd12f, 0x1b8cff, 0xffffff];
    const positions = [[-0.52, 0.02, 0], [0.5, -0.2, 0], [0.05, 0.38, 0]];
    const sizes = [[0.7, 0.7], [0.58, 0.5], [0.22, 0.18]];
    for (let index = 0; index < colors.length; index += 1) {
      const mesh = new Mesh(new PlaneGeometry(sizes[index][0], sizes[index][1]), new MeshBasicNodeMaterial({ color: colors[index] }));
      mesh.position.set(...positions[index]);
      scene.add(mesh);
    }
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode("output");
    const bloomPass = bloom(sceneColor, 0.82, 0.42, 0.08);
    const pipeline = new RenderPipeline(renderer);
    pipeline.outputNode = sceneColor.add(bloomPass);
    pipeline.render();
    const gl = renderer.backend.getContext() as WebGL2RenderingContext;
    if (!gl || !(gl instanceof WebGL2RenderingContext)) throw new Error("Three WebGPU renderer did not use its explicit WebGL2 backend.");
    const timings: number[] = [];
    for (let index = 0; index < 14; index += 1) {
      const started = performance.now();
      for (let batch = 0; batch < 20; batch += 1) pipeline.render();
      gl.finish();
      timings.push((performance.now() - started) / 20);
    }
    const pixels = new Uint8Array(320 * 180 * 4);
    gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const metrics = analyze(pixels);
    const horizontal = bloomPass._renderTargetsHorizontal?.length ?? 0;
    const vertical = bloomPass._renderTargetsVertical?.length ?? 0;
    window.__THREE_NODE_POSTPROCESS__ = {
      status: "ready",
      schema: "aura3d.current-three-node-postprocess/1.0",
      currentThreeRevision: "r185",
      renderer: "WebGPURenderer",
      backend: "WebGLBackend",
      composition: "RenderPipeline + TSL pass() + BloomNode",
      actual: {
        webgpuRenderer: renderer instanceof WebGPURenderer,
        renderPipeline: pipeline instanceof RenderPipeline,
        nodeBloom: bloomPass.constructor.name === "BloomNode",
        webgl2Backend: true
      },
      renderTargets: { scenePass: 1, bloomHorizontal: horizontal, bloomVertical: vertical, minimumTotal: 1 + horizontal + vertical },
      frameCost: summarize(timings.slice(3)),
      pixels: metrics,
      dataUrl: canvas.toDataURL("image/png")
    };
  } catch (error) {
    window.__THREE_NODE_POSTPROCESS__ = { status: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) };
  }
}

function analyze(pixels: Uint8Array) {
  let nonBlackPixels = 0;
  let brightPixels = 0;
  let haloPixels = 0;
  const buckets = new Set<number>();
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index]!, g = pixels[index + 1]!, b = pixels[index + 2]!;
    const luma = (r + g + b) / 3;
    if (r + g + b > 15) nonBlackPixels += 1;
    if (luma > 180) brightPixels += 1;
    if (luma > 25 && luma < 180) haloPixels += 1;
    buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }
  return { nonBlackPixels, brightPixels, haloPixels, uniqueColorBuckets: buckets.size };
}

function summarize(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: values.length, medianMs: Number((sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(4)), p95Ms: Number((sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(4)) };
}

export {};
