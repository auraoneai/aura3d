import {
  LoadContext,
  OBJLoader,
  createGLTFRenderResources,
  type GLTFRenderResources
} from "@galileo3d/assets";
import { G3DRenderer } from "@galileo3d/engine/advanced-runtime";

declare global {
  interface Window {
    __g3dV8LoaderOBJ?: V8LoaderOBJRuntime;
  }
}

interface V8LoaderOBJRuntime {
  readonly appId: "loader-obj";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly objNativeImport: boolean;
  readonly objTriangulatedFaces: boolean;
  readonly objGeneratedNormals: boolean;
  readonly objTexcoords: boolean;
  readonly featureCount: number;
  readonly elapsedMs: number;
  readonly renderer: "g3d-webgl2";
  readonly error?: string;
}

const APP_ID = "loader-obj" as const;
const WIDTH = 1280;
const HEIGHT = 720;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const startedAt = performance.now();
  let runtime = createRuntime("loading", "Loading OBJ fixture", startedAt);
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastNow = 0;
  let lastUi = 0;

  const publish = (): void => {
    window.__g3dV8LoaderOBJ = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const asset = await new OBJLoader().load({
      url: createOBJFixtureDataUrl(),
      type: "obj"
    }, new LoadContext());
    const resources = await createGLTFRenderResources(asset);
    const renderer = await G3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.014, 0.016, 0.02, 1]
    });
    const featureSet = new Set(asset.loaderDiagnostics.features);
    runtime = createRuntime("ready", "Ready", startedAt, {
      meshCount: asset.loaderDiagnostics.meshCount,
      vertexCount: asset.loaderDiagnostics.vertexCount,
      indexCount: asset.loaderDiagnostics.indexCount,
      objNativeImport: featureSet.has("obj-native-import"),
      objTriangulatedFaces: featureSet.has("obj-triangulated-faces"),
      objGeneratedNormals: featureSet.has("obj-generated-normals"),
      objTexcoords: featureSet.has("obj-texcoords"),
      featureCount: featureSet.size
    });
    publish();

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const delta = Math.max(0, (now - lastNow) / 1000);
        lastNow = now;
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        const result = renderer.renderFrame(createRendererInput(resources, now / 1000));
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          meshCount: asset.loaderDiagnostics.meshCount,
          vertexCount: asset.loaderDiagnostics.vertexCount,
          indexCount: asset.loaderDiagnostics.indexCount,
          objNativeImport: featureSet.has("obj-native-import"),
          objTriangulatedFaces: featureSet.has("obj-triangulated-faces"),
          objGeneratedNormals: featureSet.has("obj-generated-normals"),
          objTexcoords: featureSet.has("obj-texcoords"),
          featureCount: featureSet.size
        });
        window.__g3dV8LoaderOBJ = runtime;
        if (frameCount === 1 || now - lastUi > 220 || delta === 0) {
          publish();
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish();
  }
}

function createRendererInput(resources: GLTFRenderResources, time: number): Parameters<G3DRenderer["renderFrame"]>[0] {
  const input = resources.toRendererInput({ width: WIDTH, height: HEIGHT }, {
    qualityPreset: "studio-preview",
    postprocess: { fxaa: true },
    frame: {
      yawRadians: -0.64 + Math.sin(time * 0.65) * 0.08,
      pitchRadians: -0.16,
      paddingRatio: 0.16,
      nearPadding: 0.25,
      farPadding: 2.4
    }
  });
  return {
    source: input.source,
    camera: input.camera,
    metadata: {
      assetId: APP_ID,
      assetName: "V8 Loader OBJ",
      assetUri: "/apps/loader-obj/",
      meshCount: 1,
      primitiveCount: 1,
      materialCount: 1,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["OBJ"]
    }
  };
}

function createRuntime(
  status: V8LoaderOBJRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<V8LoaderOBJRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): V8LoaderOBJRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    meshCount: patch.meshCount ?? 0,
    vertexCount: patch.vertexCount ?? 0,
    indexCount: patch.indexCount ?? 0,
    objNativeImport: patch.objNativeImport ?? false,
    objTriangulatedFaces: patch.objTriangulatedFaces ?? false,
    objGeneratedNormals: patch.objGeneratedNormals ?? false,
    objTexcoords: patch.objTexcoords ?? false,
    featureCount: patch.featureCount ?? 0,
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "g3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function createOBJFixtureDataUrl(): string {
  const obj = [
    "o G3D_OBJ_Parity_Crate",
    "v -1.0 -0.6 -0.7",
    "v 1.0 -0.6 -0.7",
    "v 1.0 0.6 -0.7",
    "v -1.0 0.6 -0.7",
    "v -1.0 -0.6 0.7",
    "v 1.0 -0.6 0.7",
    "v 1.0 0.6 0.7",
    "v -1.0 0.6 0.7",
    "v -0.55 0.6 -0.25",
    "v 0.55 0.6 -0.25",
    "v 0.55 1.25 0.25",
    "v -0.55 1.25 0.25",
    "vt 0 0",
    "vt 1 0",
    "vt 1 1",
    "vt 0 1",
    "f 1/1 2/2 3/3 4/4",
    "f 5/1 8/4 7/3 6/2",
    "f 1/1 5/2 6/3 2/4",
    "f 2/1 6/2 7/3 3/4",
    "f 3/1 7/2 8/3 4/4",
    "f 4/1 8/2 5/3 1/4",
    "f 9/1 10/2 11/3 12/4",
    "f 4/1 3/2 10/3 9/4",
    "f 8/1 12/4 11/3 7/2",
    "f 9/1 12/2 8/3 4/4",
    "f 10/1 3/2 7/3 11/4"
  ].join("\n");
  return `data:text/plain;base64,${btoa(obj)}`;
}

function renderUi(root: HTMLElement, runtime: V8LoaderOBJRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h1>V8 Loader OBJ</h1>
          <p>Native OBJ import routed through G3D GLTF render resources.</p>
        </div>
        <span id="runtime-state" class="status is-${runtime.status}">${runtime.statusLabel}</span>
      </div>
      <div class="metrics">
        ${metric("frames", runtime.frameCount)}
        ${metric("draw calls", runtime.drawCalls)}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("meshes", runtime.meshCount)}
        ${metric("vertices", runtime.vertexCount)}
        ${metric("indices", runtime.indexCount)}
        ${metric("features", runtime.featureCount)}
        ${metric("renderer", runtime.renderer)}
      </div>
      <div class="metrics">
        ${metric("native OBJ", runtime.objNativeImport ? "yes" : "no")}
        ${metric("triangulated", runtime.objTriangulatedFaces ? "yes" : "no")}
        ${metric("normals", runtime.objGeneratedNormals ? "generated" : "source")}
        ${metric("uvs", runtime.objTexcoords ? "present" : "none")}
      </div>
      <p class="note">${runtime.error ? escapeHtml(runtime.error) : "OBJ quads are parsed, triangulated, wrapped as glTF, and rendered by G3D WebGL2."}</p>
    </section>
  `;
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
