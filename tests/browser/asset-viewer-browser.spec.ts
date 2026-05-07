import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const publicKhronosBoxGlb =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/Models/Box/glTF-Binary/Box.glb";

test.describe("asset viewer browser runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("loads a glTF model through public asset APIs and publishes viewer metadata", async ({ page }) => {
    await page.goto(`${server.origin}/examples/asset-viewer/?model=inline`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_ASSET_VIEWER__?.status === "ready" || window.__GALILEO3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("inline");
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBe(3);
    expect(result?.indexCount).toBe(3);
    expect(result?.materialCount).toBe(1);
    expect(result?.sceneCount).toBe(1);
    expect(result?.renderGeometryCount).toBe(1);
    expect(result?.renderMaterialCount).toBe(1);
    expect(result?.publicApis).toEqual(["AssetManager", "GLTFLoader", "createGLTFRenderResources"]);
    expect(result?.bounds?.min?.[0]).toBeCloseTo(-0.7);
    expect(result?.bounds?.min?.[1]).toBeCloseTo(-0.45);
    expect(result?.bounds?.min?.[2]).toBe(0);
    expect(result?.bounds?.max?.[0]).toBeCloseTo(0.7);
    expect(result?.bounds?.max?.[1]).toBeCloseTo(0.75);
    expect(result?.bounds?.max?.[2]).toBe(0);

    const status = await page.getByTestId("asset-viewer-status").textContent();
    expect(status).toContain("\"status\": \"ready\"");
    await expect(page.getByTestId("asset-viewer-canvas")).toBeVisible();
  });

  test("loads a deterministic external glTF URL with an external buffer through public asset APIs", async ({ page }) => {
    const fixture = createExternalTriangleFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/external-triangle.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/external-triangle.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer),
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/external-triangle.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_ASSET_VIEWER__?.status === "ready" || window.__GALILEO3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("custom");
    expect(result?.url).toBe(url);
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBe(3);
    expect(result?.indexCount).toBe(3);
    expect(result?.materialCount).toBe(1);
    expect(result?.publicApis).toEqual(["AssetManager", "GLTFLoader", "createGLTFRenderResources"]);
    expect(result?.bounds?.min).toEqual([-0.5, -0.5, 0]);
    expect(result?.bounds?.max).toEqual([0.5, 0.5, 0]);

    const status = await page.getByTestId("asset-viewer-status").textContent();
    expect(status).toContain("external-triangle.gltf");
    await expect(page.getByTestId("asset-viewer-canvas")).toBeVisible();
  });

  test("loads a pinned public Khronos GLB URL directly through the asset viewer", async ({ page }) => {
    await page.goto(`${server.origin}/examples/asset-viewer/?model=external&url=${encodeURIComponent(publicKhronosBoxGlb)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__GALILEO3D_ASSET_VIEWER__?.status === "ready" || window.__GALILEO3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 20_000 }
    );

    const result = await page.evaluate(() => window.__GALILEO3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("external");
    expect(result?.url).toBe(publicKhronosBoxGlb);
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBeGreaterThan(20);
    expect(result?.indexCount).toBeGreaterThan(30);
    expect(result?.materialCount).toBeGreaterThanOrEqual(1);
    expect(result?.renderGeometryCount).toBe(1);
    expect(result?.renderMaterialCount).toBeGreaterThanOrEqual(1);
    expect(result?.publicApis).toEqual(["AssetManager", "GLTFLoader", "createGLTFRenderResources"]);

    const status = await page.getByTestId("asset-viewer-status").textContent();
    expect(status).toContain("Box.glb");
    await expect(page.getByTestId("asset-viewer-canvas")).toBeVisible();
  });
});

function createExternalTriangleFixture(): {
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
} {
  const positions = floatBytes([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, indices);

  return {
    buffer,
    gltf: {
      asset: { version: "2.0", generator: "Galileo3D deterministic external viewer fixture" },
      buffers: [{ uri: "external-triangle.bin", byteLength: buffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
        { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      materials: [{ name: "external-fixture-material", extensions: { KHR_materials_unlit: {} } }],
      meshes: [{ name: "external-fixture-triangle", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      nodes: [{ name: "external-fixture-node", mesh: 0 }],
      scenes: [{ name: "external-fixture-scene", nodes: [0] }],
      scene: 0
    }
  };
}

function floatBytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  new Float32Array(bytes.buffer).set(values);
  return bytes;
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  new Uint16Array(bytes.buffer).set(values);
  return bytes;
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

declare global {
  interface Window {
    __GALILEO3D_ASSET_VIEWER__?: {
      readonly status: "ready" | "error";
      readonly sourceKind?: "inline" | "external" | "custom";
      readonly url?: string;
      readonly meshCount?: number;
      readonly vertexCount?: number;
      readonly indexCount?: number;
      readonly materialCount?: number;
      readonly sceneCount?: number;
      readonly renderGeometryCount?: number;
      readonly renderMaterialCount?: number;
      readonly bounds?: {
        readonly min: readonly [number, number, number];
        readonly max: readonly [number, number, number];
      };
      readonly publicApis?: readonly string[];
      readonly error?: string;
    };
  }
}
