import {
  GLTFLoader,
  LoadContext,
  createGLTFRenderResources,
  evaluateGLTFExtensionSupport,
  type GLTFRenderResources
} from "@galileo3d/assets";
import { Material } from "@galileo3d/rendering";
import { G3DRenderer } from "@galileo3d/engine/v9";

declare global {
  interface Window {
    __g3dV8LoaderMaterialExtensions?: V8LoaderMaterialExtensionsRuntime;
  }
}

interface V8LoaderMaterialExtensionsRuntime {
  readonly appId: "v8-loader-material-extensions";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly clearcoatMaterials: number;
  readonly sheenMaterials: number;
  readonly transmissionMaterials: number;
  readonly transparentMaterials: number;
  readonly materialUniforms: readonly MaterialExtensionUniformEvidence[];
  readonly extensionsUsed: readonly string[];
  readonly unsupportedRequired: readonly string[];
  readonly elapsedMs: number;
  readonly renderer: "g3d-webgl2";
  readonly error?: string;
}

interface MaterialExtensionUniformEvidence {
  readonly material: string;
  readonly clearcoatFactor: number;
  readonly clearcoatRoughnessFactor: number;
  readonly sheenColorFactor: readonly [number, number, number];
  readonly sheenRoughnessFactor: number;
  readonly transmissionFactor: number;
  readonly blend: boolean;
}

const APP_ID = "v8-loader-material-extensions" as const;
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
  drawFallback(canvas);

  const startedAt = performance.now();
  let runtime = createRuntime("loading", "Loading physical glTF fixture", startedAt);
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastNow = 0;
  let lastUi = 0;

  const publish = (): void => {
    window.__g3dV8LoaderMaterialExtensions = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const asset = await new GLTFLoader().load({ url: createMaterialExtensionsFixtureDataUrl() }, new LoadContext());
    const resources = await createGLTFRenderResources(asset);
    const renderer = await G3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.01, 0.012, 0.016, 1]
    });
    const extensionSupport = evaluateGLTFExtensionSupport(asset.loaderDiagnostics.extensionsUsed, asset.loaderDiagnostics.extensionsRequired);
    const materialEvidence = inspectMaterialExtensions(resources);
    runtime = createRuntime("ready", "Ready", startedAt, {
      meshCount: asset.loaderDiagnostics.meshCount,
      materialCount: asset.loaderDiagnostics.materialCount,
      ...materialEvidence,
      extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
      unsupportedRequired: extensionSupport.unsupportedRequired
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
        const frame = createRendererInput(resources, now / 1000);
        const result = renderer.renderFrame(frame);
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          meshCount: asset.loaderDiagnostics.meshCount,
          materialCount: asset.loaderDiagnostics.materialCount,
          ...materialEvidence,
          extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
          unsupportedRequired: extensionSupport.unsupportedRequired
        });
        window.__g3dV8LoaderMaterialExtensions = runtime;
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
    postprocess: {
      targetFormat: "rgba8",
      toneMapping: { exposure: 1.05, operator: "filmic", inputColorSpace: "linear", outputColorSpace: "srgb" },
      bloom: { threshold: 0.86, intensity: 0.08, radius: 1 },
      fxaa: true
    },
    frame: {
      yawRadians: -0.12 + Math.sin(time * 0.35) * 0.04,
      pitchRadians: -0.12,
      paddingRatio: 0.18,
      nearPadding: 0.2,
      farPadding: 2.4
    }
  });
  return {
    source: input.source,
    camera: input.camera,
    metadata: {
      assetId: APP_ID,
      assetName: "V8 Loader Material Extensions",
      assetUri: "/apps/v8-loader-material-extensions/",
      meshCount: 3,
      primitiveCount: 3,
      materialCount: 3,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["KHR_materials_clearcoat", "KHR_materials_sheen", "KHR_materials_transmission"]
    }
  };
}

function inspectMaterialExtensions(resources: GLTFRenderResources): Pick<
  V8LoaderMaterialExtensionsRuntime,
  "clearcoatMaterials" | "sheenMaterials" | "transmissionMaterials" | "transparentMaterials" | "materialUniforms"
> {
  const materialUniforms = [...resources.materialLibrary.values()]
    .filter((material): material is Material => material instanceof Material)
    .map((material) => {
      const evidence: MaterialExtensionUniformEvidence = {
        material: material.name,
        clearcoatFactor: numberParameter(material, "u_clearcoatFactor"),
        clearcoatRoughnessFactor: numberParameter(material, "u_clearcoatRoughnessFactor"),
        sheenColorFactor: vec3Parameter(material, "u_sheenColorFactor"),
        sheenRoughnessFactor: numberParameter(material, "u_sheenRoughnessFactor"),
        transmissionFactor: numberParameter(material, "u_transmissionFactor"),
        blend: material.renderState.blend
      };
      return evidence;
    });
  return {
    clearcoatMaterials: materialUniforms.filter((material) => material.clearcoatFactor > 0).length,
    sheenMaterials: materialUniforms.filter((material) => Math.max(...material.sheenColorFactor) > 0 || material.sheenRoughnessFactor > 0).length,
    transmissionMaterials: materialUniforms.filter((material) => material.transmissionFactor > 0).length,
    transparentMaterials: materialUniforms.filter((material) => material.blend).length,
    materialUniforms
  };
}

function numberParameter(material: Material, name: string): number {
  const value = material.getParameter(name);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function vec3Parameter(material: Material, name: string): readonly [number, number, number] {
  const value = material.getParameter(name);
  if (Array.isArray(value) && value.length >= 3) {
    return [
      finiteNumber(value[0]),
      finiteNumber(value[1]),
      finiteNumber(value[2])
    ];
  }
  if (ArrayBuffer.isView(value) && value.length >= 3) {
    return [
      finiteNumber(value[0]),
      finiteNumber(value[1]),
      finiteNumber(value[2])
    ];
  }
  return [0, 0, 0];
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function createRuntime(
  status: V8LoaderMaterialExtensionsRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<V8LoaderMaterialExtensionsRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): V8LoaderMaterialExtensionsRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    meshCount: patch.meshCount ?? 0,
    materialCount: patch.materialCount ?? 0,
    clearcoatMaterials: patch.clearcoatMaterials ?? 0,
    sheenMaterials: patch.sheenMaterials ?? 0,
    transmissionMaterials: patch.transmissionMaterials ?? 0,
    transparentMaterials: patch.transparentMaterials ?? 0,
    materialUniforms: patch.materialUniforms ?? [],
    extensionsUsed: patch.extensionsUsed ?? [],
    unsupportedRequired: patch.unsupportedRequired ?? [],
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "g3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function createMaterialExtensionsFixtureDataUrl(): string {
  const positions = floatBytes([-0.42, -0.36, 0, 0.42, -0.36, 0, 0.42, 0.36, 0, -0.42, 0.36, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = uint16Bytes([0, 1, 2, 0, 2, 3]);
  const binary = concatAligned([positions, normals, indices], 4);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D V9 V8 loader material extensions fixture" },
    extensionsUsed: ["KHR_materials_clearcoat", "KHR_materials_sheen", "KHR_materials_transmission"],
    extensionsRequired: ["KHR_materials_clearcoat", "KHR_materials_sheen", "KHR_materials_transmission"],
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(binary.buffer)}`, byteLength: binary.buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: binary.offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: binary.offsets[1], byteLength: normals.byteLength },
      { buffer: 0, byteOffset: binary.offsets[2], byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-0.42, -0.36, 0], max: [0.42, 0.36, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" }
    ],
    materials: [
      {
        name: "clearcoat-panel",
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0.86, 0.12, 0.08, 1], roughnessFactor: 0.22, metallicFactor: 0.22 },
        extensions: {
          KHR_materials_clearcoat: { clearcoatFactor: 0.9, clearcoatRoughnessFactor: 0.12 }
        }
      },
      {
        name: "sheen-panel",
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0.38, 0.22, 0.86, 1], roughnessFactor: 0.72, metallicFactor: 0 },
        extensions: {
          KHR_materials_sheen: { sheenColorFactor: [0.82, 0.62, 1], sheenRoughnessFactor: 0.28 }
        }
      },
      {
        name: "transmission-panel",
        doubleSided: true,
        alphaMode: "BLEND",
        pbrMetallicRoughness: { baseColorFactor: [0.62, 0.92, 1, 0.56], roughnessFactor: 0.08, metallicFactor: 0 },
        extensions: {
          KHR_materials_transmission: { transmissionFactor: 0.82 }
        }
      }
    ],
    meshes: [0, 1, 2].map((material) => ({
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material }]
    })),
    nodes: [
      { name: "clearcoat-panel-node", mesh: 0, translation: [-1.08, 0, 0] },
      { name: "sheen-panel-node", mesh: 1, translation: [0, 0, 0] },
      { name: "transmission-panel-node", mesh: 2, translation: [1.08, 0, 0] }
    ],
    scenes: [{ name: "v8-loader-material-extensions-scene", nodes: [0, 1, 2] }],
    scene: 0
  };
  return `data:model/gltf+json;base64,${base64(new TextEncoder().encode(JSON.stringify(gltf)))}`;
}

function floatBytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Uint16Array(values).buffer);
}

function concatAligned(parts: readonly Uint8Array[], alignment: number): { readonly buffer: Uint8Array; readonly offsets: readonly number[] } {
  const offsets: number[] = [];
  let cursor = 0;
  for (const part of parts) {
    cursor = Math.ceil(cursor / alignment) * alignment;
    offsets.push(cursor);
    cursor += part.byteLength;
  }
  const buffer = new Uint8Array(cursor);
  parts.forEach((part, index) => buffer.set(part, offsets[index] ?? 0));
  return { buffer, offsets };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function renderUi(root: HTMLElement, runtime: V8LoaderMaterialExtensionsRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Loader Material Extensions</h1>
        <p>Required glTF physical material extensions imported into G3D PBR uniforms.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.statusLabel)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Meshes", runtime.meshCount)}
      ${metric("Materials", runtime.materialCount)}
      ${metric("Clearcoat", runtime.clearcoatMaterials)}
      ${metric("Sheen", runtime.sheenMaterials)}
      ${metric("Transmission", runtime.transmissionMaterials)}
      ${metric("Transparent", runtime.transparentMaterials)}
      ${metric("Extensions", runtime.extensionsUsed.join(", ") || "pending")}
      ${metric("Unsupported required", runtime.unsupportedRequired.length)}
    </section>
    <section class="panel">
      <pre>${escapeHtml(JSON.stringify(runtime.materialUniforms, null, 2))}</pre>
    </section>
    ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
  `;
}

function metric(label: string, value: string | number): string {
  return `<span>${escapeHtml(label)}<br><strong>${escapeHtml(String(value))}</strong></span>`;
}

function drawFallback(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.01, 0.012, 0.016, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
