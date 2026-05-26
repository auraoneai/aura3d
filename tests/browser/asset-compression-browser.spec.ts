import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { MeshoptEncoder } from "meshoptimizer/encoder";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const reportPath = "tests/reports/external-parity-asset-compression.json";
const screenshotDirectory = "tests/reports/external-parity-asset-compression";
const validations: AssetCompressionValidation[] = [];

test.describe("asset viewer compression decode evidence", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    writeCompressionReport();
  });

  test("opens an EXT_meshopt_compression fixture and reports browser decode timings", async ({ page }) => {
    const fixture = await createMeshoptCompressedTriangleFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/meshopt-triangle.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf)
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/meshopt-triangle.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer)
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/meshopt-triangle.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("custom");
    expect(result?.url).toBe(url);
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBe(3);
    expect(result?.indexCount).toBe(3);
    expect(result?.bounds?.min).toEqual([-0.5, -0.5, 0]);
    expect(result?.bounds?.max).toEqual([0.5, 0.5, 0]);
    expect(result?.diagnostics?.drawCalls).toBeGreaterThan(0);

    const meshopt = result?.compressionDecoders?.meshopt;
    expect(meshopt?.status, meshopt?.reason).toBe("available");
    expect(meshopt?.decodeCount).toBe(1);
    expect(meshopt?.compressedBytes).toBe(fixture.compressedByteLength);
    expect(meshopt?.decodedBytes).toBe(36);
    expect(meshopt?.decodeMs).toBeGreaterThanOrEqual(0);
    expect(meshopt?.timings).toHaveLength(1);
    expect(meshopt?.timings[0]).toMatchObject({
      bufferViewIndex: 0,
      mode: "ATTRIBUTES",
      filter: "NONE",
      count: 3,
      byteStride: 12,
      compressedBytes: fixture.compressedByteLength,
      decodedBytes: 36
    });
    expect(meshopt?.timings[0]?.decodeMs).toBeGreaterThanOrEqual(0);

    const draco = result?.compressionDecoders?.draco;
    expect(draco?.status, draco?.reason).toBe("available");
    expect(draco?.decodeCount).toBe(0);

    const status = await page.getByTestId("asset-viewer-status").textContent();
    expect(status).toContain("\"compressionDecoders\"");
    expect(status).toContain("\"decodeCount\": 1");
    await expect(page.getByTestId("asset-viewer-canvas")).toBeVisible();

    const screenshotPath = `${screenshotDirectory}/meshopt-browser.png`;
    const pixels = await canvasPixelStats(page, "[data-testid='asset-viewer-canvas']");
    mkdirSync(join(process.cwd(), screenshotDirectory), { recursive: true });
    writePngDataUrl(screenshotPath, pixels.pngDataUrl);
    validations.push({
      name: "browser-meshopt-compression-decode",
      extension: "EXT_meshopt_compression",
      ok: true,
      screenshotPath,
      checks: {
        statusReady: result?.status === "ready",
        decodeCount: meshopt?.decodeCount === 1,
        renderedPixels: pixels.nonBlankPixels > 1000,
        colorBuckets: pixels.colorBuckets > 1
      },
      metrics: {
        compressedBytes: fixture.compressedByteLength,
        decodedBytes: Number(meshopt?.decodedBytes ?? 0),
        decodeMs: Number(meshopt?.decodeMs ?? 0),
        nonBlankPixels: pixels.nonBlankPixels,
        colorBuckets: pixels.colorBuckets
      }
    });
  });

  test("opens a KHR_draco_mesh_compression fixture and reports browser decode timings", async ({ page }) => {
    const fixture = await createDracoCompressedTriangleFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/draco-triangle.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf)
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/draco-triangle.drc`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer)
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/draco-triangle.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("custom");
    expect(result?.url).toBe(url);
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBe(3);
    expect(result?.indexCount).toBe(3);
    expect(result?.bounds?.min?.[0]).toBeCloseTo(-0.5, 2);
    expect(result?.bounds?.min?.[1]).toBeCloseTo(-0.5, 2);
    expect(result?.bounds?.max?.[0]).toBeCloseTo(0.5, 2);
    expect(result?.bounds?.max?.[1]).toBeCloseTo(0.5, 2);
    expect(result?.diagnostics?.drawCalls).toBeGreaterThan(0);

    const draco = result?.compressionDecoders?.draco;
    expect(draco?.status, draco?.reason).toBe("available");
    expect(draco?.decodeCount).toBe(1);
    expect(draco?.compressedBytes).toBe(fixture.buffer.byteLength);
    expect(draco?.decodedBytes).toBeGreaterThanOrEqual(84);
    expect(draco?.decodeMs).toBeGreaterThanOrEqual(0);
    expect(draco?.timings).toHaveLength(1);
    expect(draco?.timings[0]).toMatchObject({
      bufferViewIndex: 0,
      meshIndex: 0,
      primitiveIndex: 0,
      compressedBytes: fixture.buffer.byteLength
    });
    expect(draco?.timings[0]?.decodedBytes).toBeGreaterThanOrEqual(84);
    expect(draco?.timings[0]?.decodeMs).toBeGreaterThanOrEqual(0);

    const meshopt = result?.compressionDecoders?.meshopt;
    expect(meshopt?.status, meshopt?.reason).toBe("available");
    expect(meshopt?.decodeCount).toBe(0);

    const status = await page.getByTestId("asset-viewer-status").textContent();
    expect(status).toContain("\"draco\"");
    expect(status).toContain("\"decodeCount\": 1");
    await expect(page.getByTestId("asset-viewer-canvas")).toBeVisible();

    const screenshotPath = `${screenshotDirectory}/draco-browser.png`;
    const pixels = await canvasPixelStats(page, "[data-testid='asset-viewer-canvas']");
    mkdirSync(join(process.cwd(), screenshotDirectory), { recursive: true });
    writePngDataUrl(screenshotPath, pixels.pngDataUrl);
    validations.push({
      name: "browser-draco-compression-decode",
      extension: "KHR_draco_mesh_compression",
      ok: true,
      screenshotPath,
      checks: {
        statusReady: result?.status === "ready",
        decodeCount: draco?.decodeCount === 1,
        renderedPixels: pixels.nonBlankPixels > 1000,
        colorBuckets: pixels.colorBuckets > 1
      },
      metrics: {
        compressedBytes: fixture.buffer.byteLength,
        decodedBytes: Number(draco?.decodedBytes ?? 0),
        decodeMs: Number(draco?.decodeMs ?? 0),
        nonBlankPixels: pixels.nonBlankPixels,
        colorBuckets: pixels.colorBuckets
      }
    });
  });

  test("opens a KHR_texture_basisu fixture and reports browser texture transcode evidence", async ({ page }) => {
    const fixture = createKtx2BasisTextureFixture(readFileSync("tests/assets/corpus/ktx2/Rib_N.ktx2"));
    await page.route(`${server.origin}/fixtures/asset-viewer/ktx2-basis-texture.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf)
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/ktx2-basis-texture.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer)
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/ktx2-basis-texture.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);
    const texture = result?.decodedTextures?.[0];
    const runtimeTexture = result?.inspection?.textures[0]?.runtime;

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("custom");
    expect(result?.url).toBe(url);
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBe(3);
    expect(result?.indexCount).toBe(3);
    expect(result?.diagnostics?.drawCalls).toBeGreaterThan(0);
    expect(texture).toMatchObject({
      name: "ktx2-basis-texture",
      width: 32,
      height: 32,
      colorSpace: "srgb",
      mipLevels: 6
    });
    expect(texture?.format).toMatch(/^(etc2|bc|astc|rgba8)/);
    expect(runtimeTexture?.format).toBe(texture?.format);
    expect(runtimeTexture?.fallbackByteLength).toBeGreaterThan(0);
    expect(result?.errors).toEqual([]);

    const screenshotPath = `${screenshotDirectory}/basisu-browser.png`;
    const pixels = await canvasPixelStats(page, "[data-testid='asset-viewer-canvas']");
    mkdirSync(join(process.cwd(), screenshotDirectory), { recursive: true });
    writePngDataUrl(screenshotPath, pixels.pngDataUrl);
    validations.push({
      name: "browser-ktx2-basisu-texture-transcode",
      extension: "KHR_texture_basisu",
      ok: true,
      screenshotPath,
      checks: {
        statusReady: result?.status === "ready",
        decodedTexture: texture?.width === 32 && texture.height === 32 && texture.mipLevels >= 1,
        runtimeTexture: runtimeTexture?.format === texture?.format && Number(runtimeTexture?.fallbackByteLength ?? 0) > 0,
        renderedPixels: pixels.nonBlankPixels > 1000,
        colorBuckets: pixels.colorBuckets > 1
      },
      metrics: {
        compressedBytes: fixture.ktx2ByteLength,
        decodedBytes: Number(runtimeTexture?.byteLength ?? 0),
        fallbackByteLength: Number(runtimeTexture?.fallbackByteLength ?? 0),
        mipLevels: Number(texture?.mipLevels ?? 0),
        nonBlankPixels: pixels.nonBlankPixels,
        colorBuckets: pixels.colorBuckets
      }
    });
  });
});

function writeCompressionReport(): void {
  const screenshotPaths = validations.map((validation) => validation.screenshotPath);
  writeJson(reportPath, {
    ok: validations.length >= 3 && validations.every((validation) => validation.ok && Object.values(validation.checks).every(Boolean)),
    generatedAt: new Date().toISOString(),
    commit: currentCommit(),
    runId: `v4-asset-compression-${new Date().toISOString().replace(/[^0-9A-Za-z]/g, "-")}`,
    command: "pnpm exec playwright test tests/browser/asset-compression-browser.spec.ts",
    sourceFileHashes: sourceFileHashes([
      "tests/browser/asset-compression-browser.spec.ts",
      "examples/asset-viewer/main.ts",
      "packages/assets/src/GLTFLoader.ts",
      "packages/assets/src/GLTFRenderResources.ts",
    ]),
    blockedClaims: [
      "complete glTF support",
      "production texture-compression parity",
    ],
    screenshotPaths,
    violations: [],
    validations,
  });
}

async function canvasPixelStats(page: import("@playwright/test").Page, selector: string): Promise<{ readonly nonBlankPixels: number; readonly colorBuckets: number; readonly pngDataUrl: string }> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!canvas || !gl) return { nonBlankPixels: 0, colorBuckets: 0, pngDataUrl: "" };
    const width = canvas.width;
    const height = canvas.height;
    const x = 0;
    const y = 0;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const topLeftPixels = new Uint8ClampedArray(pixels.length);
    const buckets = new Set<string>();
    let nonBlankPixels = 0;
    for (let row = 0; row < height; row += 1) {
      const sourceRow = height - row - 1;
      for (let column = 0; column < width; column += 1) {
        const sourceIndex = (sourceRow * width + column) * 4;
        const targetIndex = (row * width + column) * 4;
        const r = pixels[sourceIndex] ?? 0;
        const g = pixels[sourceIndex + 1] ?? 0;
        const b = pixels[sourceIndex + 2] ?? 0;
        topLeftPixels[targetIndex] = r;
        topLeftPixels[targetIndex + 1] = g;
        topLeftPixels[targetIndex + 2] = b;
        topLeftPixels[targetIndex + 3] = pixels[sourceIndex + 3] ?? 255;
        if (r > 8 || g > 8 || b > 8) {
          nonBlankPixels += 1;
          buckets.add(`${r >> 5}:${g >> 5}:${b >> 5}`);
        }
      }
    }
    const readbackCanvas = document.createElement("canvas");
    readbackCanvas.width = width;
    readbackCanvas.height = height;
    const context = readbackCanvas.getContext("2d");
    context?.putImageData(new ImageData(topLeftPixels, width, height), 0, 0);
    return { nonBlankPixels, colorBuckets: buckets.size, pngDataUrl: context ? readbackCanvas.toDataURL("image/png") : "" };
  }, selector);
}

function writeJson(path: string, value: unknown): void {
  const fullPath = join(process.cwd(), path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

function writePngDataUrl(path: string, dataUrl: string): void {
  const marker = "data:image/png;base64,";
  if (!dataUrl.startsWith(marker)) {
    throw new Error("Expected PNG data URL from compression readback.");
  }
  const fullPath = join(process.cwd(), path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, Buffer.from(dataUrl.slice(marker.length), "base64"));
}

function sourceFileHashes(paths: readonly string[]): readonly { readonly path: string; readonly sha256: string }[] {
  return paths.map((path) => ({
    path,
    sha256: createHash("sha256").update(readFileSync(join(process.cwd(), path))).digest("hex")
  }));
}

function currentCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

interface AssetCompressionValidation {
  readonly name: string;
  readonly extension: string;
  readonly ok: boolean;
  readonly screenshotPath: string;
  readonly checks: Record<string, boolean>;
  readonly metrics: Record<string, number>;
}

async function createMeshoptCompressedTriangleFixture(): Promise<{
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
  readonly compressedByteLength: number;
}> {
  await MeshoptEncoder.ready;
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = uint16Bytes([0, 1, 2]);
  const compressedPositions = MeshoptEncoder.encodeGltfBuffer(positions, 3, 12, "ATTRIBUTES");
  const binary = concatAligned([compressedPositions, normals, indices], 4);

  return {
    buffer: binary.buffer,
    compressedByteLength: compressedPositions.byteLength,
    gltf: {
      asset: { version: "2.0", generator: "Aura3D browser Meshopt compression evidence fixture" },
      extensionsUsed: ["EXT_meshopt_compression", "KHR_materials_unlit"],
      extensionsRequired: ["EXT_meshopt_compression"],
      buffers: [{ uri: "meshopt-triangle.bin", byteLength: binary.buffer.byteLength }],
      bufferViews: [
        {
          buffer: 0,
          byteOffset: 0,
          byteLength: positions.byteLength,
          byteStride: 12,
          extensions: {
            EXT_meshopt_compression: {
              buffer: 0,
              byteOffset: binary.offsets[0],
              byteLength: compressedPositions.byteLength,
              byteStride: 12,
              count: 3,
              mode: "ATTRIBUTES",
              filter: "NONE"
            }
          }
        },
        { buffer: 0, byteOffset: binary.offsets[1], byteLength: normals.byteLength },
        { buffer: 0, byteOffset: binary.offsets[2], byteLength: indices.byteLength }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      materials: [
        {
          name: "meshopt-browser-material",
          pbrMetallicRoughness: { baseColorFactor: [0.95, 0.35, 0.08, 1], roughnessFactor: 0.55, metallicFactor: 0.05 },
          extensions: { KHR_materials_unlit: {} }
        }
      ],
      meshes: [{
        name: "meshopt-browser-triangle",
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }]
      }],
      nodes: [{ name: "meshopt-browser-node", mesh: 0 }],
      scenes: [{ name: "meshopt-browser-scene", nodes: [0] }],
      scene: 0
    }
  };
}

function floatBytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Uint16Array(values).buffer);
}

function createKtx2BasisTextureFixture(ktx2Bytes: Uint8Array): {
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
  readonly ktx2ByteLength: number;
} {
  const positions = floatBytes([-0.72, -0.5, 0, 0.72, -0.5, 0, 0, 0.62, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const indices = padChunk(uint16Bytes([0, 1, 2]), 0);
  const binary = concatAligned([positions, normals, texcoords, indices, ktx2Bytes], 4);

  return {
    buffer: binary.buffer,
    ktx2ByteLength: ktx2Bytes.byteLength,
    gltf: {
      asset: { version: "2.0", generator: "Aura3D browser KTX2/BasisU texture evidence fixture" },
      extensionsUsed: ["KHR_texture_basisu"],
      buffers: [{ uri: "ktx2-basis-texture.bin", byteLength: binary.buffer.byteLength }],
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
    }
  };
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
    cursor = align(cursor, alignment);
    offsets.push(cursor);
    cursor += part.byteLength;
  }

  const buffer = new Uint8Array(cursor);
  parts.forEach((part, index) => {
    buffer.set(part, offsets[index]);
  });
  return { buffer, offsets };
}

function align(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

async function createDracoCompressedTriangleFixture(): Promise<{
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
}> {
  const dracoModule = await import("draco3d") as unknown as {
    readonly default?: { readonly createEncoderModule?: (options: Record<string, never>) => Promise<DracoEncoderModule> };
    readonly createEncoderModule?: (options: Record<string, never>) => Promise<DracoEncoderModule>;
  };
  const createEncoderModule = dracoModule.createEncoderModule ?? dracoModule.default?.createEncoderModule;
  if (!createEncoderModule) {
    throw new Error("draco3d package did not expose createEncoderModule");
  }
  const encoderModule = await createEncoderModule({});
  const positions = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const faces = new Int32Array([0, 1, 2]);
  const mesh = new encoderModule.Mesh();
  const builder = new encoderModule.MeshBuilder();
  const encoder = new encoderModule.Encoder();
  const encoded = new encoderModule.DracoInt8Array();
  try {
    if (!builder.AddFacesToMesh(mesh, 1, faces)) {
      throw new Error("Failed to add Draco fixture triangle face");
    }
    const positionAttributeId = builder.AddFloatAttributeToMesh(mesh, encoderModule.POSITION, 3, 3, positions);
    const normalAttributeId = builder.AddFloatAttributeToMesh(mesh, encoderModule.NORMAL, 3, 3, normals);
    encoder.SetSpeedOptions(5, 5);
    encoder.SetAttributeQuantization(encoderModule.POSITION, 14);
    encoder.SetAttributeQuantization(encoderModule.NORMAL, 8);
    const byteLength = encoder.EncodeMeshToDracoBuffer(mesh, encoded);
    if (byteLength <= 0) {
      throw new Error("Draco encoder returned an empty fixture buffer");
    }
    const buffer = new Uint8Array(byteLength);
    for (let index = 0; index < byteLength; index += 1) {
      buffer[index] = encoded.GetValue(index) & 0xff;
    }
    return {
      buffer,
      gltf: {
        asset: { version: "2.0", generator: "Aura3D browser Draco compression evidence fixture" },
        extensionsUsed: ["KHR_draco_mesh_compression", "KHR_materials_unlit"],
        extensionsRequired: ["KHR_draco_mesh_compression"],
        buffers: [{ uri: "draco-triangle.drc", byteLength: buffer.byteLength }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: buffer.byteLength }],
        accessors: [
          { componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
          { componentType: 5126, count: 3, type: "VEC3" }
        ],
        materials: [
          {
            name: "draco-browser-material",
            pbrMetallicRoughness: { baseColorFactor: [0.1, 0.56, 0.88, 1], roughnessFactor: 0.5, metallicFactor: 0.04 },
            extensions: { KHR_materials_unlit: {} }
          }
        ],
        meshes: [{
          name: "draco-browser-triangle",
          primitives: [{
            attributes: { POSITION: 0, NORMAL: 1 },
            material: 0,
            extensions: {
              KHR_draco_mesh_compression: {
                bufferView: 0,
                attributes: { POSITION: positionAttributeId, NORMAL: normalAttributeId }
              }
            }
          }]
        }],
        nodes: [{ name: "draco-browser-node", mesh: 0 }],
        scenes: [{ name: "draco-browser-scene", nodes: [0] }],
        scene: 0
      }
    };
  } finally {
    encoderModule.destroy(encoded);
    encoderModule.destroy(encoder);
    encoderModule.destroy(builder);
    encoderModule.destroy(mesh);
  }
}

interface DracoEncoderModule {
  readonly POSITION: number;
  readonly NORMAL: number;
  readonly Mesh: new () => DracoEncoderMesh;
  readonly MeshBuilder: new () => DracoEncoderMeshBuilder;
  readonly Encoder: new () => DracoEncoder;
  readonly DracoInt8Array: new () => DracoEncoderInt8Array;
  destroy(object: unknown): void;
}

interface DracoEncoderMesh {}

interface DracoEncoderMeshBuilder {
  AddFacesToMesh(mesh: DracoEncoderMesh, faceCount: number, indices: Int32Array): boolean;
  AddFloatAttributeToMesh(
    mesh: DracoEncoderMesh,
    attribute: number,
    pointCount: number,
    componentCount: number,
    values: Float32Array
  ): number;
}

interface DracoEncoder {
  SetSpeedOptions(encodingSpeed: number, decodingSpeed: number): void;
  SetAttributeQuantization(attribute: number, quantizationBits: number): void;
  EncodeMeshToDracoBuffer(mesh: DracoEncoderMesh, output: DracoEncoderInt8Array): number;
}

interface DracoEncoderInt8Array {
  GetValue(index: number): number;
}
