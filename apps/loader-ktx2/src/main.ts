import {
  GLTFLoader,
  LoadContext,
  createGLTFRenderResources,
  evaluateGLTFExtensionSupport,
  type GLTFRenderResources
} from "@aura3d/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

declare global {
  interface Window {
    __a3dCurrentRoutesLoaderKtx2?: CurrentRoutesLoaderKtx2Runtime;
  }
}

interface CurrentRoutesLoaderKtx2Runtime {
  readonly appId: "loader-ktx2";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly meshCount: number;
  readonly textureCount: number;
  readonly compressedTextureCount: number;
  readonly textureFormat: string;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly textureMipLevels: number;
  readonly fallbackMipLevels: number;
  readonly compressedTextureBytes: number;
  readonly fallbackTextureBytes: number;
  readonly ktx2SourceBytes: number;
  readonly extensionsUsed: readonly string[];
  readonly unsupportedRequired: readonly string[];
  readonly elapsedMs: number;
  readonly renderer: "a3d-webgl2";
  readonly error?: string;
}

interface TextureEvidence {
  readonly textureCount: number;
  readonly compressedTextureCount: number;
  readonly textureFormat: string;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly textureMipLevels: number;
  readonly fallbackMipLevels: number;
  readonly compressedTextureBytes: number;
  readonly fallbackTextureBytes: number;
}

const APP_ID = "loader-ktx2" as const;
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
  let runtime = createRuntime("loading", "Loading KTX2 glTF fixture", startedAt);
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastNow = 0;
  let lastUi = 0;

  const publish = (): void => {
    window.__a3dCurrentRoutesLoaderKtx2 = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const ktx2Bytes = new Uint8Array(await fetchArrayBuffer("/tests/assets/corpus/ktx2/Rib_N.ktx2"));
    runtime = { ...runtime, ktx2SourceBytes: ktx2Bytes.byteLength, statusLabel: "Transcoding KTX2/Basis texture" };
    publish();

    const asset = await new GLTFLoader().load({ url: createKtx2FixtureDataUrl(ktx2Bytes) }, new LoadContext());
    const resources = await createGLTFRenderResources(asset, { ktx2BasisTargetFormat: "etc2-rgba8unorm" });
    const renderer = await A3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.01, 0.012, 0.016, 1]
    });
    const extensionSupport = evaluateGLTFExtensionSupport(asset.loaderDiagnostics.extensionsUsed, asset.loaderDiagnostics.extensionsRequired);
    const textureEvidence = inspectTextureEvidence(resources);
    runtime = createRuntime("ready", "Ready", startedAt, {
      meshCount: asset.loaderDiagnostics.meshCount,
      ktx2SourceBytes: ktx2Bytes.byteLength,
      ...textureEvidence,
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
          ktx2SourceBytes: ktx2Bytes.byteLength,
          ...textureEvidence,
          extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
          unsupportedRequired: extensionSupport.unsupportedRequired
        });
        window.__a3dCurrentRoutesLoaderKtx2 = runtime;
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

function createRendererInput(resources: GLTFRenderResources, time: number): Parameters<A3DRenderer["renderFrame"]>[0] {
  const input = resources.toRendererInput({ width: WIDTH, height: HEIGHT }, {
    qualityPreset: "studio-preview",
    postprocess: false,
    frame: {
      yawRadians: -0.24 + Math.sin(time * 0.55) * 0.06,
      pitchRadians: -0.16,
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
      assetName: "CurrentRoutes Loader KTX2",
      assetUri: "/apps/loader-ktx2/",
      meshCount: 1,
      primitiveCount: 1,
      materialCount: 1,
      textureCount: 1,
      imageCount: 1,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["KHR_texture_basisu"]
    }
  };
}

function inspectTextureEvidence(resources: GLTFRenderResources): TextureEvidence {
  const textures = [...resources.textureLibrary.values()];
  const texture = textures[0];
  return {
    textureCount: textures.length,
    compressedTextureCount: textures.filter((entry) => entry.format !== "rgba8" && entry.format !== "rgba16f" && entry.format !== "rgba32f").length,
    textureFormat: texture?.format ?? "none",
    textureWidth: texture?.width ?? 0,
    textureHeight: texture?.height ?? 0,
    textureMipLevels: texture?.textureLevels.length ?? 0,
    fallbackMipLevels: texture?.fallbackTextureLevels.length ?? 0,
    compressedTextureBytes: texture?.byteLength ?? 0,
    fallbackTextureBytes: texture?.fallbackByteLength ?? 0
  };
}

function createRuntime(
  status: CurrentRoutesLoaderKtx2Runtime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<CurrentRoutesLoaderKtx2Runtime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): CurrentRoutesLoaderKtx2Runtime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    meshCount: patch.meshCount ?? 0,
    textureCount: patch.textureCount ?? 0,
    compressedTextureCount: patch.compressedTextureCount ?? 0,
    textureFormat: patch.textureFormat ?? "pending",
    textureWidth: patch.textureWidth ?? 0,
    textureHeight: patch.textureHeight ?? 0,
    textureMipLevels: patch.textureMipLevels ?? 0,
    fallbackMipLevels: patch.fallbackMipLevels ?? 0,
    compressedTextureBytes: patch.compressedTextureBytes ?? 0,
    fallbackTextureBytes: patch.fallbackTextureBytes ?? 0,
    ktx2SourceBytes: patch.ktx2SourceBytes ?? 0,
    extensionsUsed: patch.extensionsUsed ?? [],
    unsupportedRequired: patch.unsupportedRequired ?? [],
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "a3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function createKtx2FixtureDataUrl(ktx2Bytes: Uint8Array): string {
  const positions = floatBytes([-0.72, -0.5, 0, 0.72, -0.5, 0, 0, 0.62, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const indices = padChunk(uint16Bytes([0, 1, 2]), 0);
  const binary = concatAligned([positions, normals, texcoords, indices, ktx2Bytes], 4);
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D ThreejsParity CurrentRoutes loader KTX2/Basis fixture" },
    extensionsUsed: ["KHR_texture_basisu"],
    extensionsRequired: ["KHR_texture_basisu"],
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(binary.buffer)}`, byteLength: binary.buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: binary.offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: binary.offsets[1], byteLength: normals.byteLength },
      { buffer: 0, byteOffset: binary.offsets[2], byteLength: texcoords.byteLength },
      { buffer: 0, byteOffset: binary.offsets[3], byteLength: indices.byteLength },
      { buffer: 0, byteOffset: binary.offsets[4], byteLength: ktx2Bytes.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.72, -0.5, 0], max: [0.72, 0.62, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    images: [{ name: "ktx2-basis-source", bufferView: 4, mimeType: "image/ktx2" }],
    textures: [{ name: "ktx2-basis-texture", extensions: { KHR_texture_basisu: { source: 0 } } }],
    materials: [{
      name: "ktx2-basis-material",
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        roughnessFactor: 0.54,
        metallicFactor: 0.02
      }
    }],
    meshes: [{ name: "ktx2-basis-triangle", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    nodes: [{ name: "ktx2-basis-node", mesh: 0 }],
    scenes: [{ name: "ktx2-basis-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json;base64,${base64(new TextEncoder().encode(JSON.stringify(gltf)))}`;
}

async function fetchArrayBuffer(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`KTX2 fixture fetch failed with ${response.status}: ${path}`);
  }
  return response.arrayBuffer();
}

function floatBytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Uint16Array(values).buffer);
}

function padChunk(bytes: Uint8Array, fill: number): Uint8Array {
  const remainder = bytes.byteLength % 4;
  if (remainder === 0) return bytes;
  const padded = new Uint8Array(bytes.byteLength + (4 - remainder));
  padded.set(bytes);
  padded.fill(fill, bytes.byteLength);
  return padded;
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

function renderUi(root: HTMLElement, runtime: CurrentRoutesLoaderKtx2Runtime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>CurrentRoutes Loader KTX2</h1>
        <p>KHR_texture_basisu texture imported, transcoded, and rendered through A3D WebGL2.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.statusLabel)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Meshes", runtime.meshCount)}
      ${metric("Textures", runtime.textureCount)}
      ${metric("Compressed", runtime.compressedTextureCount)}
      ${metric("Format", runtime.textureFormat)}
      ${metric("Dimensions", `${runtime.textureWidth}x${runtime.textureHeight}`)}
      ${metric("Mip levels", runtime.textureMipLevels)}
      ${metric("Fallback mips", runtime.fallbackMipLevels)}
      ${metric("Compressed bytes", runtime.compressedTextureBytes)}
      ${metric("Fallback bytes", runtime.fallbackTextureBytes)}
      ${metric("KTX2 source", runtime.ktx2SourceBytes)}
      ${metric("Unsupported required", runtime.unsupportedRequired.length)}
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
