import { Geometry, Renderer, UnlitMaterial, buildStaticBoundsBvh, queryStaticBoundsBvh } from "@aura3d/rendering";
import { PerspectiveCamera, Renderable, Scene } from "@aura3d/scene";

declare global { interface Window { __AURA3D_LARGE_SCENE_CULLING__?: any } }

const WIDTH = 256;
const HEIGHT = 192;
const COLUMNS = 40;
const ROWS = 40;
const SPACING = 1.25;
const DEPTH = -12;

void run();

async function run(): Promise<void> {
  const geometry = Geometry.cube(0.72);
  const material = new UnlitMaterial({ name: "large-scene-visible-cube", color: [0.2, 0.75, 1, 1] });
  const { scene, spatialItems } = createLargeScene();
  const camera = new PerspectiveCamera({ name: "large-scene-camera", fovYRadians: Math.PI / 3, aspect: WIDTH / HEIGHT, near: 0.1, far: 60 });
  camera.updateCameraMatrices();
  const geometryLibrary = new Map([["cube", geometry]]);
  const materialLibrary = new Map([["material", material]]);

  try {
    const culled = await renderScene(requiredCanvas("culled"), true);
    const unculled = await renderScene(requiredCanvas("unculled"), false);
    const bvh = buildStaticBoundsBvh(spatialItems, { maxLeafSize: 8 });
    const bvhQuery = queryStaticBoundsBvh(bvh, { frustum: camera.frustum });
    window.__AURA3D_LARGE_SCENE_CULLING__ = {
      status: "ready",
      renderer: "webgl2",
      objectCount: spatialItems.length,
      culled,
      unculled,
      bvh: { build: bvh.diagnostics, query: bvhQuery.diagnostics },
      occlusionStrategy: {
        implemented: false,
        mode: "none-no-gpu-occlusion-query-or-hiz",
        boundary: "Aura3D currently proves CPU camera-frustum culling and an integrated static-bounds BVH broad phase. It does not implement or claim GPU occlusion queries, hierarchical-Z occlusion culling, portals, or software occluder rasterization. Depth testing prevents hidden fragments from replacing nearer pixels but is not object-level occlusion culling."
      }
    };
  } catch (error) {
    window.__AURA3D_LARGE_SCENE_CULLING__ = { status: "error", error: error instanceof Error ? error.stack ?? error.message : String(error) };
  } finally {
    geometry.dispose();
    material.dispose();
  }

  async function renderScene(canvas: HTMLCanvasElement, frustumCulling: boolean) {
    const renderer = await Renderer.create({ backend: "webgl2", canvas, width: WIDTH, height: HEIGHT, preserveDrawingBuffer: true, clearColor: [0.01, 0.015, 0.025, 1] });
    try {
      const source = { scene, geometryLibrary, materialLibrary, frustumCulling };
      renderer.render(source, camera);
      const startedAt = performance.now();
      const diagnostics = renderer.render(source, camera);
      const frameMs = performance.now() - startedAt;
      renderer.device.setRenderTarget(null);
      const pixels = renderer.device.readPixels(0, 0, WIDTH, HEIGHT);
      return {
        frustumCulling,
        frameMs,
        drawCalls: diagnostics.drawCalls,
        scene: {
          submittedObjects: diagnostics.submittedObjects,
          visibleObjects: diagnostics.visibleObjects,
          culledObjects: diagnostics.culledObjects,
          frustumTestedObjects: diagnostics.frustumTestedObjects
        },
        nonBackgroundPixels: countNonBackground(pixels),
        dataUrl: canvas.toDataURL("image/png")
      };
    } finally {
      renderer.dispose();
    }
  }
}

function createLargeScene() {
  const scene = new Scene();
  const spatialItems: Array<{ id: string; bounds: { min: [number, number, number]; max: [number, number, number] } }> = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const x = (column - (COLUMNS - 1) / 2) * SPACING;
      const y = (row - (ROWS - 1) / 2) * SPACING;
      const z = DEPTH - ((row + column) % 3) * 0.08;
      const id = `large-scene-cube-${row}-${column}`;
      const node = scene.createNode(id);
      node.transform.setPosition(x, y, z);
      scene.root.addChild(node);
      scene.addRenderable(node, new Renderable({ geometry: "cube", material: "material" }));
      spatialItems.push({ id, bounds: { min: [x - 0.36, y - 0.36, z - 0.36], max: [x + 0.36, y + 0.36, z + 0.36] } });
    }
  }
  return { scene, spatialItems };
}

function requiredCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing ${id} canvas.`);
  return canvas;
}

function countNonBackground(pixels: Uint8Array): number {
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if ((pixels[offset] ?? 0) > 8 || (pixels[offset + 1] ?? 0) > 10 || (pixels[offset + 2] ?? 0) > 14) count += 1;
  }
  return count;
}

export {};
