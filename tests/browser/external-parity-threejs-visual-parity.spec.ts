import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { V4_THREEJS_PARITY_SCENES } from "../../benchmarks/external-parity/shared/threejs-visual-parity-scenes";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportDir = resolve("tests/reports/external-parity-threejs-visual-parity");
const captures: ComparisonCapture[] = [];

test.describe("V4 same-scene Three.js visual parity", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    mkdirSync(reportDir, { recursive: true });
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    const pass = captures.length === V4_THREEJS_PARITY_SCENES.length &&
      captures.every((capture) =>
        capture.a3d.bytes > 8_000 &&
        capture.threejs.bytes > 8_000 &&
        capture.diff.bytes > 2_000 &&
        capture.a3d.drawCalls > 0 &&
        capture.threejs.drawCalls > 0 &&
        Number.isFinite(capture.diff.meanDifference) &&
        capture.visualScore >= 58
      );
    writeFileSync(join(reportDir, "manifest.json"), `${JSON.stringify({
      schema: "a3d-external-parity-threejs-visual-parity-browser/v1",
      generatedAt: new Date().toISOString(),
      pass,
      requiredSceneCount: V4_THREEJS_PARITY_SCENES.length,
      scenes: V4_THREEJS_PARITY_SCENES.map((scene) => scene.id),
      captures,
      productBoundary: "V4 same-scene visual parity proof for supported workflows including large-scene/performance. This is not broad Three.js API replacement."
    }, null, 2)}\n`);
  });

  for (const scene of V4_THREEJS_PARITY_SCENES) {
    test(`${scene.id} captures A3D, Three.js, and diff images`, async ({ page }) => {
      await page.goto(server.origin, { waitUntil: "domcontentloaded" });
      const metrics = await page.evaluate(async ({ origin, scene }) => {
        const productUrl = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/Models/BoomBox/glTF-Binary/BoomBox.glb";
        const a3d = await renderA3D(origin, scene, productUrl);
        const threejs = await renderThree(origin, scene, productUrl);
        const diff = createDiffCanvas(scene.id, a3d.canvas, threejs.canvas);
        document.body.style.margin = "0";
        document.body.style.background = "#111413";
        document.body.style.display = "grid";
        document.body.style.gridTemplateColumns = "720px 720px 720px";
        document.body.replaceChildren(a3d.canvas, threejs.canvas, diff);
        return {
          sceneId: scene.id,
          a3d: {
            drawCalls: a3d.drawCalls,
            itemCount: a3d.itemCount,
            setupLines: scene.a3dSetupLines,
            lastError: a3d.lastError,
            workflowKind: a3d.workflowKind
          },
          threejs: {
            drawCalls: threejs.drawCalls,
            itemCount: threejs.itemCount,
            setupLines: scene.threeSetupLines,
            rendererInfo: threejs.rendererInfo
          },
          diff: {
            meanDifference: Number(diff.dataset.meanDifference),
            visualScore: Number(diff.dataset.visualScore)
          }
        };

        async function renderA3D(origin: string, scene: typeof V4_THREEJS_PARITY_SCENES[number], productUrl: string) {
          const module = await import(`${origin}/packages/engine/src/index.ts`);
          const canvas = document.createElement("canvas");
          canvas.dataset.testid = `${scene.id}-a3d`;
          canvas.width = 720;
          canvas.height = 450;
          canvas.style.width = "720px";
          canvas.style.height = "450px";
          const app = await module.createA3DApp({ canvas, quality: "production", width: 720, height: 450 });
          let workflow;
          if (scene.a3dWorkflow === "product-configurator") {
            workflow = await app.renderWorkflow("product-configurator", {
              asset: {
                id: "premium-boom-box",
                title: "Premium Boom Box",
                category: "consumer-audio",
                url: productUrl,
                manifestUrl: `${origin}/fixtures/external-parity/products/premium-product/manifest.json`
              },
              lighting: "catalog-softbox",
              camera: "front-three-quarter",
              materialMode: "asset",
              viewport: { width: 720, height: 450 }
            });
          } else if (scene.a3dWorkflow === "asset-viewer") {
            workflow = await app.renderWorkflow("asset-viewer", { url: productUrl, type: "gltf" });
          } else if (scene.a3dWorkflow === "material-studio") {
            workflow = await app.renderWorkflow("material-studio", { mode: scene.threeScene === "material-transparent" ? "transparent" : "metals" });
          } else if (scene.a3dWorkflow === "scene-showcase") {
            workflow = await app.renderWorkflow("scene-showcase", { preset: "gallery" });
          } else {
            workflow = await app.renderWorkflow("interactive-scene", { preset: "orbiting-products" });
          }
          const diagnostics = app.diagnostics();
          return {
            canvas,
            drawCalls: diagnostics.lastRender?.drawCalls ?? 0,
            itemCount: workflow.renderItems?.length ?? workflow.diagnostics.asset?.meshCount ?? 1,
            lastError: diagnostics.lastRender?.lastError ?? null,
            workflowKind: workflow.kind
          };
        }

        async function renderThree(origin: string, scene: typeof V4_THREEJS_PARITY_SCENES[number], productUrl: string) {
          const THREE = await import(`${origin}/node_modules/three/build/three.module.js`);
          const { GLTFLoader } = await import(`${origin}/node_modules/three/examples/jsm/loaders/GLTFLoader.js`);
          const canvas = document.createElement("canvas");
          canvas.dataset.testid = `${scene.id}-threejs`;
          canvas.width = 720;
          canvas.height = 450;
          canvas.style.width = "720px";
          canvas.style.height = "450px";
          const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
          renderer.setSize(720, 450, false);
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.12;
          const threeScene = new THREE.Scene();
          threeScene.background = new THREE.Color(0x15181c);
          const camera = new THREE.PerspectiveCamera(35, 720 / 450, 0.05, 100);
          camera.position.set(3.2, 2.0, 4.5);
          camera.lookAt(0, 0.25, 0);
          addLights(THREE, threeScene);
          let itemCount = 0;
          if (scene.threeScene === "product-gltf" || scene.threeScene === "asset-gltf") {
            const loader = new GLTFLoader();
            const gltf = await new Promise<any>((resolveLoad, rejectLoad) => loader.load(productUrl, resolveLoad, undefined, rejectLoad));
            const model = gltf.scene;
            frameObject(THREE, model, scene.threeScene === "asset-gltf" ? 2.2 : 2.5);
            threeScene.add(model);
            itemCount = model.children.length || 1;
          } else {
            itemCount = addProceduralScene(THREE, threeScene, scene.threeScene);
          }
          renderer.render(threeScene, camera);
          return {
            canvas,
            drawCalls: renderer.info.render.calls,
            itemCount,
            rendererInfo: {
              geometries: renderer.info.memory.geometries,
              textures: renderer.info.memory.textures,
              triangles: renderer.info.render.triangles
            }
          };
        }

        function addLights(THREE: any, scene: any): void {
          scene.add(new THREE.HemisphereLight(0xcfdcff, 0x242018, 1.15));
          const key = new THREE.DirectionalLight(0xffead1, 3.2);
          key.position.set(4, 5, 3);
          scene.add(key);
          const rim = new THREE.DirectionalLight(0x8fb8ff, 1.1);
          rim.position.set(-3, 2.5, -4);
          scene.add(rim);
        }

        function frameObject(THREE: any, object: any, targetSize: number): void {
          const box = new THREE.Box3().setFromObject(object);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          object.position.sub(center);
          const maxAxis = Math.max(size.x, size.y, size.z) || 1;
          const scale = targetSize / maxAxis;
          object.scale.setScalar(scale);
          object.rotation.y = -0.35;
        }

        function addProceduralScene(THREE: any, scene: any, kind: string): number {
          const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(7, 4),
            new THREE.MeshStandardMaterial({ color: 0x25282d, roughness: 0.72, metalness: 0.02 })
          );
          floor.rotation.x = -Math.PI / 2;
          floor.position.y = -0.76;
          scene.add(floor);
          const materialA = new THREE.MeshStandardMaterial({ color: 0xd2b575, metalness: 1, roughness: kind === "material-transparent" ? 0.08 : 0.18 });
          const materialB = new THREE.MeshStandardMaterial({ color: 0xdce7f2, metalness: 0.15, roughness: 0.34 });
          const materialC = new THREE.MeshPhysicalMaterial({
            color: kind === "material-transparent" ? 0x9ecbff : 0x3477d8,
            metalness: 0.04,
            roughness: 0.24,
            transmission: kind === "material-transparent" ? 0.45 : 0,
            transparent: kind === "material-transparent",
            opacity: kind === "material-transparent" ? 0.72 : 1
          });
          const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.58, 48, 24), materialA);
          sphere.position.set(-1.15, 0, 0);
          const center = new THREE.Mesh(new THREE.SphereGeometry(0.58, 48, 24), materialB);
          center.position.set(0, kind === "interactive-orbit" ? 0.18 : 0, 0);
          const cube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), materialC);
          cube.position.set(1.15, -0.02, 0);
          cube.rotation.set(0.2, -0.35, 0.08);
          if (kind === "gallery-scene") {
            sphere.position.set(-1.4, -0.15, -0.2);
            center.material = new THREE.MeshStandardMaterial({ color: 0xe54f2b, metalness: 0.35, roughness: 0.32 });
            cube.position.set(1.35, -0.18, -0.12);
          }
          if (kind === "interactive-orbit") {
            sphere.position.set(Math.cos(0.85) * 0.95, 0, Math.sin(0.85) * 0.35);
            cube.position.set(Math.cos(0.85 + Math.PI) * 0.95, 0, Math.sin(0.85 + Math.PI) * 0.35);
          }
          scene.add(sphere, center, cube);
          return 4;
        }

        function createDiffCanvas(id: string, left: HTMLCanvasElement, right: HTMLCanvasElement): HTMLCanvasElement {
          const width = left.width;
          const height = left.height;
          const diffCanvas = document.createElement("canvas");
          diffCanvas.dataset.testid = `${id}-diff`;
          diffCanvas.width = width;
          diffCanvas.height = height;
          diffCanvas.style.width = `${width}px`;
          diffCanvas.style.height = `${height}px`;
          const leftContext = copyCanvas(left).getContext("2d");
          const rightContext = copyCanvas(right).getContext("2d");
          const diffContext = diffCanvas.getContext("2d");
          if (!leftContext || !rightContext || !diffContext) throw new Error("Could not create comparison diff canvas.");
          const leftPixels = leftContext.getImageData(0, 0, width, height);
          const rightPixels = rightContext.getImageData(0, 0, width, height);
          const output = diffContext.createImageData(width, height);
          let total = 0;
          let closePixels = 0;
          for (let index = 0; index < output.data.length; index += 4) {
            const dr = Math.abs(leftPixels.data[index] - rightPixels.data[index]);
            const dg = Math.abs(leftPixels.data[index + 1] - rightPixels.data[index + 1]);
            const db = Math.abs(leftPixels.data[index + 2] - rightPixels.data[index + 2]);
            const value = Math.max(dr, dg, db);
            output.data[index] = value;
            output.data[index + 1] = Math.round(value * 0.5);
            output.data[index + 2] = 255 - value;
            output.data[index + 3] = 255;
            total += value;
            if (value < 96) closePixels += 1;
          }
          diffContext.putImageData(output, 0, 0);
          const meanDifference = total / (width * height);
          diffCanvas.dataset.meanDifference = String(meanDifference);
          diffCanvas.dataset.visualScore = String(Math.max(0, Math.round((closePixels / (width * height)) * 100 - meanDifference / 6)));
          return diffCanvas;
        }

        function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          const context = copy.getContext("2d");
          if (!context) throw new Error("Could not copy WebGL canvas.");
          context.drawImage(source, 0, 0);
          return copy;
        }
      }, { origin: server.origin, scene });

      expect(metrics.a3d.drawCalls).toBeGreaterThan(0);
      expect(metrics.threejs.drawCalls).toBeGreaterThan(0);
      expect(metrics.a3d.lastError).toBeNull();
      const a3d = await screenshotScene(page, scene.id, "a3d", metrics.a3d);
      const threejs = await screenshotScene(page, scene.id, "threejs", metrics.threejs);
      const diff = await screenshotScene(page, scene.id, "diff", { drawCalls: 1, itemCount: 1, setupLines: 0 });
      captures.push({
        sceneId: scene.id,
        title: scene.title,
        visualIntent: scene.visualIntent,
        a3d,
        threejs,
        diff: { ...diff, meanDifference: metrics.diff.meanDifference },
        visualScore: metrics.diff.visualScore,
        ergonomicWin: metrics.a3d.setupLines < metrics.threejs.setupLines,
        runtimeStats: {
          a3dDrawCalls: metrics.a3d.drawCalls,
          threejsDrawCalls: metrics.threejs.drawCalls,
          threejsTriangles: metrics.threejs.rendererInfo.triangles
        },
        gaps: scene.requiredGaps
      });
    });
  }
});

async function screenshotScene(
  page: import("@playwright/test").Page,
  sceneId: string,
  engine: "a3d" | "threejs" | "diff",
  metrics: { readonly drawCalls: number; readonly itemCount: number; readonly setupLines: number }
): Promise<CaptureImage> {
  const path = join(reportDir, `${sceneId}-${engine}.png`);
  await page.locator(`[data-testid='${sceneId}-${engine}']`).screenshot({ path });
  const bytes = statSync(path).size;
  expect(bytes).toBeGreaterThan(engine === "diff" ? 2_000 : 8_000);
  return {
    path: path.replace(`${process.cwd()}/`, ""),
    bytes,
    drawCalls: metrics.drawCalls,
    itemCount: metrics.itemCount,
    setupLines: metrics.setupLines
  };
}

interface CaptureImage {
  readonly path: string;
  readonly bytes: number;
  readonly drawCalls: number;
  readonly itemCount: number;
  readonly setupLines: number;
}

interface ComparisonCapture {
  readonly sceneId: string;
  readonly title: string;
  readonly visualIntent: readonly string[];
  readonly a3d: CaptureImage;
  readonly threejs: CaptureImage;
  readonly diff: CaptureImage & { readonly meanDifference: number };
  readonly visualScore: number;
  readonly ergonomicWin: boolean;
  readonly runtimeStats: {
    readonly a3dDrawCalls: number;
    readonly threejsDrawCalls: number;
    readonly threejsTriangles: number;
  };
  readonly gaps: readonly string[];
}
