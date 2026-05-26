import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

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
      () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("inline");
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBe(3);
    expect(result?.indexCount).toBe(3);
    expect(result?.materialCount).toBe(1);
    expect(result?.sceneCount).toBe(1);
    expect(result?.renderGeometryCount).toBe(1);
    expect(result?.renderMaterialCount).toBe(1);
    expect(result?.publicApis).toEqual(["AssetManager", "AssetBundleCacheEvidence", "GLTFLoader", "GLTFSceneAnalysisEvidence", "createGLTFRenderResources", "inspectGLTFAsset"]);
    expect(result?.inspection?.meshes[0]?.topology).toBe("triangles");
    expect(result?.inspection?.sceneHierarchy.some((node) => node.hasRenderable)).toBe(true);
    expect(result?.warnings).toEqual([]);
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
    expect(result?.materialCount).toBe(1);
    expect(result?.publicApis).toEqual(["AssetManager", "AssetBundleCacheEvidence", "GLTFLoader", "GLTFSceneAnalysisEvidence", "createGLTFRenderResources", "inspectGLTFAsset"]);
    expect(result?.inspection?.meshes[0]?.name).toBe("external-fixture-triangle");
    expect(result?.inspection?.materials[0]?.name).toBe("external-fixture-material");
    expect(result?.bounds?.min).toEqual([-0.5, -0.5, 0]);
    expect(result?.bounds?.max).toEqual([0.5, 0.5, 0]);

    const status = await page.getByTestId("asset-viewer-status").textContent();
    expect(status).toContain("external-triangle.gltf");
    await expect(page.getByTestId("asset-viewer-canvas")).toBeVisible();
  });

  test("renders multi-node, multi-mesh, multi-material glTF scenes in the asset viewer", async ({ page }) => {
    const fixture = createMultiNodeMaterialFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/multi-node-material.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/multi-node-material.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer),
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/multi-node-material.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 10_000 },
    );

    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.meshCount).toBe(2);
    expect(result?.materialCount).toBe(2);
    expect(result?.renderGeometryCount).toBe(2);
    expect(result?.renderMaterialCount).toBe(2);
    expect(result?.inspection?.sceneHierarchy.map((node) => node.name)).toEqual(expect.arrayContaining([
      "multi-red-node",
      "multi-blue-node",
    ]));
    expect(result?.inspection?.materials.map((material) => material.name)).toEqual(expect.arrayContaining([
      "multi-red-material",
      "multi-blue-material",
    ]));
    expect(await nonBlankWebGLPixels(page, "[data-testid='asset-viewer-canvas']")).toBeGreaterThan(1000);
  });

  test("loads interleaved bufferView byteStride glTF geometry in the asset viewer", async ({ page }) => {
    const fixture = createInterleavedStrideFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/interleaved-stride.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/interleaved-stride.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer),
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/interleaved-stride.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.status === "ready", undefined, { timeout: 10_000 });

    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.inspection?.meshes[0]?.name).toBe("interleaved-stride-triangle");
    expect(result?.vertexCount).toBe(3);
    expect(result?.bounds?.min?.[0]).toBeCloseTo(-0.72);
    expect(result?.bounds?.min?.[1]).toBeCloseTo(-0.5);
    expect(result?.bounds?.min?.[2]).toBe(0);
    expect(result?.bounds?.max?.[0]).toBeCloseTo(0.72);
    expect(result?.bounds?.max?.[1]).toBeCloseTo(0.62);
    expect(result?.bounds?.max?.[2]).toBe(0);
    expect(await nonBlankWebGLPixels(page, "[data-testid='asset-viewer-canvas']")).toBeGreaterThan(1000);
  });

  test("switches glTF material variants through asset viewer render resources", async ({ page }) => {
    const fixture = createMaterialVariantFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/material-variant.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/material-variant.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer),
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/material-variant.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.status === "ready", undefined, { timeout: 10_000 });

    await expect(page.getByTestId("asset-viewer-material-variant")).toBeVisible();
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.materialVariants)).toEqual(["blue-finish"]);
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.activeRenderMaterials)).toContain("variant-default-red");
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.variantSwitching)).toEqual({
      available: true,
      applied: false,
    });
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.warnings?.map((warning) => String((warning as { code?: string }).code)))).toContain("ASSET_VIEWER_VARIANTS_SWITCHING_BOUNDED");

    await page.getByTestId("asset-viewer-material-variant").selectOption("blue-finish");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.selectedMaterialVariant)).toBe("blue-finish");
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.activeRenderMaterials)).toContain("variant-blue-finish");
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.variantSwitching)).toEqual({
      available: true,
      applied: true,
    });
    expect(await nonBlankWebGLPixels(page, "[data-testid='asset-viewer-canvas']")).toBeGreaterThan(1000);
  });

  test("drives glTF morph target weights through asset viewer sliders", async ({ page }) => {
    const fixture = createMorphTargetFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/morph-target.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/morph-target.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer),
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/morph-target.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.status === "ready", undefined, { timeout: 10_000 });

    await expect(page.getByTestId("asset-viewer-morph-controls")).toBeVisible();
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.morphControls)).toMatchObject({
      available: true,
      meshName: "morph-fixture-triangle",
      targetCount: 1,
      activeWeights: [0],
      renderApplied: true,
    });
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.warnings?.map((warning) => String((warning as { code?: string }).code)))).toContain("ASSET_VIEWER_MORPH_PLAYBACK_BOUNDED");

    await page.getByTestId("asset-viewer-morph-weight-0").evaluate((input) => {
      const slider = input as HTMLInputElement;
      slider.value = "1";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.morphControls?.activeWeights?.[0])).toBe(1);
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.morphControls?.renderApplied)).toBe(true);
    expect(await nonBlankWebGLPixels(page, "[data-testid='asset-viewer-canvas']")).toBeGreaterThan(1000);
  });

  test("loads a deterministic local GLB fixture through the external URL mode", async ({ page }) => {
    const localExternalGlb = `${server.origin}/fixtures/asset-viewer/local-box.glb`;
    await page.route(localExternalGlb, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf-binary",
        body: Buffer.from(createTriangleGlbFixture()),
      });
    });

    await page.goto(`${server.origin}/examples/asset-viewer/?model=external&url=${encodeURIComponent(localExternalGlb)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("external");
    expect(result?.url).toBe(localExternalGlb);
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBe(3);
    expect(result?.indexCount).toBe(3);
    expect(result?.materialCount).toBeGreaterThanOrEqual(1);
    expect(result?.renderGeometryCount).toBe(1);
    expect(result?.renderMaterialCount).toBeGreaterThanOrEqual(1);
    expect(result?.publicApis).toEqual(["AssetManager", "AssetBundleCacheEvidence", "GLTFLoader", "GLTFSceneAnalysisEvidence", "createGLTFRenderResources", "inspectGLTFAsset"]);

    const status = await page.getByTestId("asset-viewer-status").textContent();
    expect(status).toContain("local-box.glb");
    await expect(page.getByTestId("asset-viewer-canvas")).toBeVisible();
  });

  test("loads and renders multiple real checked-in corpus GLB assets", async ({ page }) => {
    const corpusAssets = [
      { name: "Fox", path: "/tests/assets/corpus/khronos/Fox/Fox.glb" },
      { name: "CesiumMan", path: "/tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb" },
    ] as const;

    for (const asset of corpusAssets) {
      const url = `${server.origin}${asset.path}`;
      await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
        undefined,
        { timeout: 15_000 }
      );
      const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);
      expect(result?.status, result?.error).toBe("ready");
      expect(result?.sourceKind).toBe("custom");
      expect(result?.url).toBe(url);
      expect(Number(result?.meshCount ?? 0), `${asset.name} mesh count`).toBeGreaterThan(0);
      expect(Number(result?.vertexCount ?? 0), `${asset.name} vertex count`).toBeGreaterThan(0);
      expect(Number(result?.renderGeometryCount ?? 0), `${asset.name} render geometry count`).toBeGreaterThan(0);
      expect(Number(result?.renderMaterialCount ?? 0), `${asset.name} render material count`).toBeGreaterThan(0);
      expect(result?.inspection?.sceneHierarchy.some((node) => node.hasRenderable)).toBe(true);
      expect(await nonBlankWebGLPixels(page, "[data-testid='asset-viewer-canvas']")).toBeGreaterThan(1000);
    }
  });

  test("decodes real browser texture dimensions instead of placeholder pixels", async ({ page }) => {
    const fixture = createTexturedTriangleFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/textured-triangle.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/textured-triangle.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/two-pixel.png`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(twoPixelPngBase64, "base64"),
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/textured-triangle.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 10_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.decodedTextures?.[0]).toMatchObject({
      name: "two-pixel-texture",
      width: 2,
      height: 1,
      format: "rgba8",
      colorSpace: "srgb",
      mipLevels: 1,
    });
    expect(result?.inspection?.textures[0]?.runtime?.width).toBe(2);
    expect(await page.getByTestId("asset-viewer-inspector").textContent()).toContain("two-pixel-texture");
  });

  test("decodes a KTX2/Basis texture fixture in the browser asset viewer", async ({ page }) => {
    const ktx2Bytes = readFileSync("tests/assets/corpus/ktx2/Rib_N.ktx2");
    const fixture = createKtx2BasisTextureFixture(ktx2Bytes);
    const url = `${server.origin}/fixtures/asset-viewer/ktx2-basis-texture.gltf`;
    await page.route(url, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/ktx2-basis-texture.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer),
      });
    });

    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__AURA3D_ASSET_VIEWER__?.status === "ready" || window.__AURA3D_ASSET_VIEWER__?.status === "error",
      undefined,
      { timeout: 30_000 }
    );

    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("custom");
    expect(result?.errors).toEqual([]);
    expect(result?.decodedTextures?.[0]).toMatchObject({
      name: "ktx2-basis-texture",
      width: 32,
      height: 32,
      colorSpace: "srgb",
      mipLevels: 6,
    });
    expect(result?.inspection?.textures[0]?.runtime?.format).toBe(result?.decodedTextures?.[0]?.format);
    expect(result?.inspection?.textures[0]?.runtime?.fallbackByteLength).toBeGreaterThan(0);
    expect(await page.getByTestId("asset-viewer-status").textContent()).toContain("ktx2-basis-texture");
    expect(await nonBlankWebGLPixels(page, "[data-testid='asset-viewer-canvas']")).toBeGreaterThan(1000);
  });

  test("exposes inspection panels, render modes, animation controls, warnings, and screenshot capture", async ({ page }) => {
    const fixture = createAnimatedTexturedTriangleFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/animated-textured-triangle.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/animated-textured-triangle.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer),
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/two-pixel.png`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(twoPixelPngBase64, "base64"),
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/animated-textured-triangle.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.status === "ready", undefined, { timeout: 10_000 });
    expect(await nonBlankWebGLPixels(page, "[data-testid='asset-viewer-canvas']")).toBeGreaterThan(1000);
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.warnings?.map((warning) => String((warning as { code?: string }).code)))).toContain("ASSET_VIEWER_ROOT_MOTION_ACTIVE");

    const inspector = page.getByTestId("asset-viewer-inspector");
    await expect(inspector).toContainText("Hierarchy");
    await expect(inspector).toContainText("animated-fixture-triangle");
    await expect(inspector).toContainText("animated-fixture-material");
    await expect(inspector).toContainText("two-pixel-texture");
    await expect(inspector).toContainText("animated-fixture-clip");
    await expect(inspector).toContainText("ASSET_VIEWER_ROOT_MOTION_ACTIVE");

    await expect(page.getByTestId("asset-viewer-animation-controls")).toBeVisible();
    await expect(page.getByTestId("asset-viewer-animation-clip")).toContainText("animated-fixture-clip");
    await page.getByTestId("asset-viewer-animation-play").dispatchEvent("click");
    await expect.poll(async () => Number(await page.getByTestId("asset-viewer-animation-time").inputValue())).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.animationPlayback?.renderApplied)).toBe(true);
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.animationPlayback)).toMatchObject({
      clipName: "animated-fixture-clip",
      appliedTargets: ["animated-fixture-node.translation"],
      sampledNodeTransforms: 1,
      rootMotion: {
        available: true,
        applied: true,
        sampleCount: expect.any(Number),
      },
      applyErrors: []
    });
    await page.getByTestId("asset-viewer-animation-play").dispatchEvent("click");

    await page.getByTestId("asset-viewer-render-mode").selectOption("wireframe");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.renderMode)).toBe("wireframe");
    expect(await nonBlankCanvasPixels(page, "[data-testid='asset-viewer-overlay']")).toBeGreaterThan(100);

    await page.getByTestId("asset-viewer-render-mode").selectOption("bounds");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.renderMode)).toBe("bounds");
    expect(await nonBlankCanvasPixels(page, "[data-testid='asset-viewer-overlay']")).toBeGreaterThan(100);

    await page.locator("button[data-view-control='pan']").click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.cameraControls?.panX)).toBeGreaterThan(0);

    await page.getByTestId("asset-viewer-canvas").focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.cameraControls?.lastInput)).toBe("keyboard");

    const beforeYaw = await page.evaluate(() => Number(window.__AURA3D_ASSET_VIEWER__?.cameraControls?.orbitYaw ?? 0));
    await dispatchSyntheticPointerDrag(page, "[data-testid='asset-viewer-canvas']", "touch", false);
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.cameraControls?.lastInput)).toBe("touch");
    await expect.poll(() => page.evaluate(() => Number(window.__AURA3D_ASSET_VIEWER__?.cameraControls?.orbitYaw ?? 0))).not.toBe(beforeYaw);

    await page.locator("button[data-view-control='focus']").click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.cameraControls?.focused)).toBe(true);
    await page.locator("button[data-view-control='reset']").click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.cameraControls?.panX)).toBe(0);
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.cameraControls)).toMatchObject({
      fitToBounds: true,
      resetView: true,
      pointerControls: true,
      keyboardControls: true,
      touchControls: true,
      selectionDiagnostics: true,
      selectedMesh: "animated-fixture-triangle"
    });

    await page.getByTestId("asset-viewer-screenshot").click();
    await expect.poll(() => page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.screenshot?.captured)).toBe(true);
    expect(await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__?.screenshot?.byteLength ?? 0)).toBeGreaterThan(1000);
  });

  test("loads dropped multi-file glTF with local buffer dependencies", async ({ page }) => {
    const fixture = createExternalTriangleFixture();
    await page.goto(`${server.origin}/examples/asset-viewer/?model=inline`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.status === "ready", undefined, { timeout: 10_000 });

    await page.evaluate(
      ({ gltfText, bufferBytes }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([gltfText], "external-triangle.gltf", { type: "model/gltf+json" }));
        transfer.items.add(new File([Uint8Array.from(bufferBytes)], "external-triangle.bin", { type: "application/octet-stream" }));
        const dropzone = document.querySelector<HTMLElement>("[data-testid='asset-viewer-dropzone']");
        if (!dropzone) throw new Error("asset-viewer-dropzone missing");
        dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      },
      { gltfText: JSON.stringify(fixture.gltf), bufferBytes: [...fixture.buffer] },
    );

    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.sourceKind === "local", undefined, { timeout: 10_000 });
    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.sourceKind).toBe("local");
    expect(result?.dependencyResolution).toEqual(expect.arrayContaining([
      expect.objectContaining({ uri: "external-triangle.gltf", fileName: "external-triangle.gltf", kind: "document" }),
      expect.objectContaining({ uri: "external-triangle.bin", fileName: "external-triangle.bin", kind: "buffer" }),
    ]));
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBe(3);
  });

  test("loads dropped local GLB document", async ({ page }) => {
    const glb = createTriangleGlbFixture();
    await page.goto(`${server.origin}/examples/asset-viewer/?model=inline`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.status === "ready", undefined, { timeout: 10_000 });

    await page.evaluate((glbBytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(glbBytes)], "drop-triangle.glb", { type: "model/gltf-binary" }));
      const dropzone = document.querySelector<HTMLElement>("[data-testid='asset-viewer-dropzone']");
      if (!dropzone) throw new Error("asset-viewer-dropzone missing");
      dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, [...glb]);

    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.sourceKind === "local", undefined, { timeout: 10_000 });
    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.dependencyResolution).toEqual([
      expect.objectContaining({ uri: "drop-triangle.glb", fileName: "drop-triangle.glb", kind: "document" }),
    ]);
    expect(result?.meshCount).toBe(1);
    expect(result?.vertexCount).toBe(3);
  });

  test("loads dropped multi-file glTF with local image dependencies", async ({ page }) => {
    const fixture = createTexturedTriangleFixture();
    await page.goto(`${server.origin}/examples/asset-viewer/?model=inline`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.status === "ready", undefined, { timeout: 10_000 });

    await page.evaluate(
      ({ gltfText, bufferBytes, imageBytes }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([gltfText], "textured-triangle.gltf", { type: "model/gltf+json" }));
        transfer.items.add(new File([Uint8Array.from(bufferBytes)], "textured-triangle.bin", { type: "application/octet-stream" }));
        transfer.items.add(new File([Uint8Array.from(imageBytes)], "two-pixel.png", { type: "image/png" }));
        const dropzone = document.querySelector<HTMLElement>("[data-testid='asset-viewer-dropzone']");
        if (!dropzone) throw new Error("asset-viewer-dropzone missing");
        dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      },
      {
        gltfText: JSON.stringify(fixture.gltf),
        bufferBytes: [...fixture.buffer],
        imageBytes: [...Buffer.from(twoPixelPngBase64, "base64")]
      },
    );

    await page.waitForFunction(() => window.__AURA3D_ASSET_VIEWER__?.sourceKind === "local", undefined, { timeout: 10_000 });
    const result = await page.evaluate(() => window.__AURA3D_ASSET_VIEWER__);

    expect(result?.status, result?.error).toBe("ready");
    expect(result?.dependencyResolution).toEqual(expect.arrayContaining([
      expect.objectContaining({ uri: "textured-triangle.bin", fileName: "textured-triangle.bin", kind: "buffer" }),
      expect.objectContaining({ uri: "two-pixel.png", fileName: "two-pixel.png", kind: "image" }),
    ]));
    expect(result?.decodedTextures?.[0]?.width).toBe(2);
    expect(result?.decodedTextures?.[0]?.height).toBe(1);
  });
});

const twoPixelPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=";

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
      asset: { version: "2.0", generator: "Aura3D deterministic external viewer fixture" },
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

function createMultiNodeMaterialFixture(): {
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
} {
  const redPositions = floatBytes([-0.8, -0.45, 0, -0.2, -0.45, 0, -0.5, 0.45, 0]);
  const bluePositions = floatBytes([0.2, -0.45, 0, 0.8, -0.45, 0, 0.5, 0.45, 0]);
  const redNormals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const blueNormals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const redIndices = uint16Bytes([0, 1, 2]);
  const blueIndices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(redPositions, bluePositions, redNormals, blueNormals, redIndices, blueIndices);
  const offsets = byteOffsets([redPositions, bluePositions, redNormals, blueNormals, redIndices, blueIndices]);

  return {
    buffer,
    gltf: {
      asset: { version: "2.0", generator: "Aura3D multi-node material viewer fixture" },
      buffers: [{ uri: "multi-node-material.bin", byteLength: buffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: offsets[0], byteLength: redPositions.byteLength },
        { buffer: 0, byteOffset: offsets[1], byteLength: bluePositions.byteLength },
        { buffer: 0, byteOffset: offsets[2], byteLength: redNormals.byteLength },
        { buffer: 0, byteOffset: offsets[3], byteLength: blueNormals.byteLength },
        { buffer: 0, byteOffset: offsets[4], byteLength: redIndices.byteLength },
        { buffer: 0, byteOffset: offsets[5], byteLength: blueIndices.byteLength }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.8, -0.45, 0], max: [-0.2, 0.45, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC3", min: [0.2, -0.45, 0], max: [0.8, 0.45, 0] },
        { bufferView: 2, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 3, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 4, componentType: 5123, count: 3, type: "SCALAR" },
        { bufferView: 5, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      materials: [
        { name: "multi-red-material", pbrMetallicRoughness: { baseColorFactor: [1, 0.18, 0.12, 1], roughnessFactor: 0.42, metallicFactor: 0.02 } },
        { name: "multi-blue-material", pbrMetallicRoughness: { baseColorFactor: [0.1, 0.42, 1, 1], roughnessFactor: 0.34, metallicFactor: 0.04 } }
      ],
      meshes: [
        { name: "multi-red-mesh", primitives: [{ attributes: { POSITION: 0, NORMAL: 2 }, indices: 4, material: 0 }] },
        { name: "multi-blue-mesh", primitives: [{ attributes: { POSITION: 1, NORMAL: 3 }, indices: 5, material: 1 }] }
      ],
      nodes: [
        { name: "multi-red-node", mesh: 0 },
        { name: "multi-blue-node", mesh: 1 }
      ],
      scenes: [{ name: "multi-node-material-scene", nodes: [0, 1] }],
      scene: 0
    }
  };
}

function createInterleavedStrideFixture(): {
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
} {
  const vertexStride = 32;
  const vertices = [
    [-0.72, -0.5, 0, 0, 0, 1, 0, 1],
    [0.72, -0.5, 0, 0, 0, 1, 1, 1],
    [0, 0.62, 0, 0, 0, 1, 0.5, 0],
  ];
  const vertexBytes = new Uint8Array(vertices.length * vertexStride);
  const view = new DataView(vertexBytes.buffer);
  vertices.forEach((vertex, vertexIndex) => {
    vertex.forEach((value, valueIndex) => {
      view.setFloat32(vertexIndex * vertexStride + valueIndex * 4, value, true);
    });
  });
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(vertexBytes, indices);

  return {
    buffer,
    gltf: {
      asset: { version: "2.0", generator: "Aura3D interleaved byteStride viewer fixture" },
      buffers: [{ uri: "interleaved-stride.bin", byteLength: buffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: vertexBytes.byteLength, byteStride: vertexStride },
        { buffer: 0, byteOffset: vertexBytes.byteLength, byteLength: indices.byteLength }
      ],
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.72, -0.5, 0], max: [0.72, 0.62, 0] },
        { bufferView: 0, byteOffset: 12, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 0, byteOffset: 24, componentType: 5126, count: 3, type: "VEC2" },
        { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      materials: [{
        name: "interleaved-stride-material",
        pbrMetallicRoughness: { baseColorFactor: [0.18, 0.78, 0.96, 1], roughnessFactor: 0.42, metallicFactor: 0.02 }
      }],
      meshes: [{
        name: "interleaved-stride-triangle",
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }]
      }],
      nodes: [{ name: "interleaved-stride-node", mesh: 0 }],
      scenes: [{ name: "interleaved-stride-scene", nodes: [0] }],
      scene: 0
    }
  };
}

function createKtx2BasisTextureFixture(ktx2Bytes: Uint8Array): {
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
} {
  const positions = floatBytes([-0.72, -0.5, 0, 0.72, -0.5, 0, 0, 0.62, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const indices = padChunk(uint16Bytes([0, 1, 2]), 0);
  const buffer = concatBytes(positions, normals, texcoords, indices, ktx2Bytes);
  const offsets = byteOffsets([positions, normals, texcoords, indices, ktx2Bytes]);

  return {
    buffer,
    gltf: {
      asset: { version: "2.0", generator: "Aura3D asset viewer KTX2/Basis browser fixture" },
      extensionsUsed: ["KHR_texture_basisu"],
      buffers: [{ uri: "ktx2-basis-texture.bin", byteLength: buffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
        { buffer: 0, byteOffset: offsets[1], byteLength: normals.byteLength },
        { buffer: 0, byteOffset: offsets[2], byteLength: texcoords.byteLength },
        { buffer: 0, byteOffset: offsets[3], byteLength: indices.byteLength },
        { buffer: 0, byteOffset: offsets[4], byteLength: ktx2Bytes.byteLength }
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

function createMaterialVariantFixture(): {
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
} {
  const positions = floatBytes([-0.65, -0.5, 0, 0.65, -0.5, 0, 0, 0.65, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, normals, indices);
  const offsets = byteOffsets([positions, normals, indices]);

  return {
    buffer,
    gltf: {
      asset: { version: "2.0", generator: "Aura3D material variant viewer fixture" },
      extensionsUsed: ["KHR_materials_variants"],
      extensions: {
        KHR_materials_variants: {
          variants: [{ name: "blue-finish" }]
        }
      },
      buffers: [{ uri: "material-variant.bin", byteLength: buffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
        { buffer: 0, byteOffset: offsets[1], byteLength: normals.byteLength },
        { buffer: 0, byteOffset: offsets[2], byteLength: indices.byteLength }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.65, -0.5, 0], max: [0.65, 0.65, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      materials: [
        { name: "variant-default-red", pbrMetallicRoughness: { baseColorFactor: [1, 0.14, 0.1, 1], roughnessFactor: 0.45, metallicFactor: 0.08 } },
        { name: "variant-blue-finish", pbrMetallicRoughness: { baseColorFactor: [0.05, 0.35, 1, 1], roughnessFactor: 0.28, metallicFactor: 0.12 } }
      ],
      meshes: [{
        name: "variant-fixture-triangle",
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1 },
          indices: 2,
          material: 0,
          extensions: {
            KHR_materials_variants: {
              mappings: [{ material: 1, variants: [0] }]
            }
          }
        }]
      }],
      nodes: [{ name: "variant-fixture-node", mesh: 0 }],
      scenes: [{ name: "material-variant-scene", nodes: [0] }],
      scene: 0
    }
  };
}

function createMorphTargetFixture(): {
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
} {
  const positions = floatBytes([-0.62, -0.48, 0, 0.62, -0.48, 0, 0, 0.55, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const morphPositions = floatBytes([0, 0, 0, 0, 0, 0, 0, 0.42, 0.24]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, normals, morphPositions, indices);
  const offsets = byteOffsets([positions, normals, morphPositions, indices]);

  return {
    buffer,
    gltf: {
      asset: { version: "2.0", generator: "Aura3D morph target viewer fixture" },
      buffers: [{ uri: "morph-target.bin", byteLength: buffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
        { buffer: 0, byteOffset: offsets[1], byteLength: normals.byteLength },
        { buffer: 0, byteOffset: offsets[2], byteLength: morphPositions.byteLength },
        { buffer: 0, byteOffset: offsets[3], byteLength: indices.byteLength }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.62, -0.48, 0], max: [0.62, 0.55, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 2, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [0, 0.42, 0.24] },
        { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      materials: [{
        name: "morph-fixture-material",
        pbrMetallicRoughness: { baseColorFactor: [0.96, 0.42, 0.14, 1], roughnessFactor: 0.46, metallicFactor: 0.03 }
      }],
      meshes: [{
        name: "morph-fixture-triangle",
        weights: [0],
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1 },
          targets: [{ POSITION: 2 }],
          indices: 3,
          material: 0
        }]
      }],
      nodes: [{ name: "morph-fixture-node", mesh: 0 }],
      scenes: [{ name: "morph-target-scene", nodes: [0] }],
      scene: 0
    }
  };
}

function createTexturedTriangleFixture(): {
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
} {
  const positions = floatBytes([-0.65, -0.5, 0, 0.65, -0.5, 0, 0, 0.65, 0]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, texcoords, indices);

  return {
    buffer,
    gltf: {
      asset: { version: "2.0", generator: "Aura3D deterministic textured viewer fixture" },
      buffers: [{ uri: "textured-triangle.bin", byteLength: buffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: texcoords.byteLength },
        { buffer: 0, byteOffset: positions.byteLength + texcoords.byteLength, byteLength: indices.byteLength }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.65, -0.5, 0], max: [0.65, 0.65, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
        { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      images: [{ name: "two-pixel-image", uri: "two-pixel.png", mimeType: "image/png" }],
      textures: [{ name: "two-pixel-texture", source: 0 }],
      materials: [{
        name: "textured-fixture-material",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 1
        }
      }],
      meshes: [{
        name: "textured-fixture-triangle",
        primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }]
      }],
      nodes: [{ name: "textured-fixture-node", mesh: 0 }],
      scenes: [{ name: "textured-fixture-scene", nodes: [0] }],
      scene: 0
    }
  };
}

function createAnimatedTexturedTriangleFixture(): {
  readonly buffer: Uint8Array;
  readonly gltf: Record<string, unknown>;
} {
  const positions = floatBytes([-0.65, -0.5, 0, 0.65, -0.5, 0, 0, 0.65, 0]);
  const texcoords = floatBytes([0, 1, 1, 1, 0.5, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const times = floatBytes([0, 1]);
  const translations = floatBytes([0, 0, 0, 0.2, 0.1, 0]);
  const buffer = concatBytes(positions, texcoords, indices, times, translations);
  const offsets = byteOffsets([positions, texcoords, indices, times, translations]);

  return {
    buffer,
    gltf: {
      asset: { version: "2.0", generator: "Aura3D deterministic animated viewer fixture" },
      buffers: [{ uri: "animated-textured-triangle.bin", byteLength: buffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength },
        { buffer: 0, byteOffset: offsets[1], byteLength: texcoords.byteLength },
        { buffer: 0, byteOffset: offsets[2], byteLength: indices.byteLength },
        { buffer: 0, byteOffset: offsets[3], byteLength: times.byteLength },
        { buffer: 0, byteOffset: offsets[4], byteLength: translations.byteLength }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.65, -0.5, 0], max: [0.65, 0.65, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
        { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" },
        { bufferView: 3, componentType: 5126, count: 2, type: "SCALAR" },
        { bufferView: 4, componentType: 5126, count: 2, type: "VEC3" }
      ],
      images: [{ name: "two-pixel-image", uri: "two-pixel.png", mimeType: "image/png" }],
      textures: [{ name: "two-pixel-texture", source: 0 }],
      materials: [{
        name: "animated-fixture-material",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 1
        }
      }],
      meshes: [{
        name: "animated-fixture-triangle",
        primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }]
      }],
      nodes: [{ name: "animated-fixture-node", mesh: 0 }],
      animations: [{
        name: "animated-fixture-clip",
        samplers: [{ input: 3, output: 4, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
      }],
      scenes: [{ name: "animated-fixture-scene", nodes: [0] }],
      scene: 0
    }
  };
}

function createTriangleGlbFixture(): Uint8Array {
  const positions = floatBytes([-0.4, -0.4, 0, 0.4, -0.4, 0, 0, 0.4, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const bin = concatBytes(positions, indices);
  const gltf = {
    asset: { version: "2.0", generator: "Aura3D dropped GLB fixture" },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.4, -0.4, 0], max: [0.4, 0.4, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    materials: [{ name: "dropped-glb-material", extensions: { KHR_materials_unlit: {} } }],
    meshes: [{ name: "dropped-glb-triangle", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [{ name: "dropped-glb-node", mesh: 0 }],
    scenes: [{ name: "dropped-glb-scene", nodes: [0] }],
    scene: 0
  };
  return createGlb(gltf, bin);
}

function createGlb(gltf: Record<string, unknown>, bin: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonChunk = padChunk(json, 0x20);
  const binChunk = padChunk(bin, 0);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonChunk.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.set(jsonChunk, 20);
  const binHeader = 20 + jsonChunk.byteLength;
  view.setUint32(binHeader, binChunk.byteLength, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  output.set(binChunk, binHeader + 8);
  return output;
}

function padChunk(bytes: Uint8Array, padValue: number): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
  padded.fill(padValue);
  padded.set(bytes);
  return padded;
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

function byteOffsets(chunks: readonly Uint8Array[]): readonly number[] {
  let offset = 0;
  return chunks.map((chunk) => {
    const current = offset;
    offset += chunk.byteLength;
    return current;
  });
}

async function nonBlankCanvasPixels(page: import("@playwright/test").Page, selector: string): Promise<number> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!data) return 0;
    let pixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
    }
    return pixels;
  }, selector);
}

async function nonBlankWebGLPixels(page: import("@playwright/test").Page, selector: string): Promise<number> {
  return page.evaluate((canvasSelector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    const gl = canvas?.getContext("webgl2", { preserveDrawingBuffer: true }) ?? canvas?.getContext("webgl", { preserveDrawingBuffer: true });
    if (!canvas || !gl) return 0;
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let pixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 20 || data[index + 1] > 20 || data[index + 2] > 20) pixels += 1;
    }
    return pixels;
  }, selector);
}

async function dispatchSyntheticPointerDrag(
  page: import("@playwright/test").Page,
  selector: string,
  pointerType: "mouse" | "touch",
  shiftKey: boolean,
): Promise<void> {
  await page.evaluate(
    ({ selector: targetSelector, pointerType: inputPointerType, shiftKey: inputShiftKey }) => {
      const canvas = document.querySelector<HTMLElement>(targetSelector);
      if (!canvas) throw new Error(`Missing canvas ${targetSelector}`);
      const rect = canvas.getBoundingClientRect();
      const base = {
        bubbles: true,
        cancelable: true,
        pointerId: inputPointerType === "touch" ? 51 : 9,
        pointerType: inputPointerType,
        shiftKey: inputShiftKey,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        ...base,
        clientX: rect.left + rect.width * 0.48,
        clientY: rect.top + rect.height * 0.48,
      }));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        ...base,
        clientX: rect.left + rect.width * 0.63,
        clientY: rect.top + rect.height * 0.43,
      }));
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        ...base,
        clientX: rect.left + rect.width * 0.63,
        clientY: rect.top + rect.height * 0.43,
      }));
    },
    { selector, pointerType, shiftKey },
  );
}

declare global {
  interface Window {
    __AURA3D_ASSET_VIEWER__?: {
      readonly status: "ready" | "error";
      readonly sourceKind?: "inline" | "external" | "custom" | "local";
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
      readonly renderMode?: "shaded" | "wireframe" | "bounds" | "material";
      readonly activeRenderMaterials?: readonly string[];
      readonly materialVariants?: readonly string[];
      readonly selectedMaterialVariant?: string;
      readonly variantSwitching?: {
        readonly available: boolean;
        readonly applied: boolean;
      };
      readonly morphControls?: {
        readonly available: boolean;
        readonly meshName?: string;
        readonly targetCount: number;
        readonly activeWeights: readonly number[];
        readonly renderApplied: boolean;
      };
      readonly inspection?: {
        readonly sceneHierarchy: readonly { readonly hasRenderable: boolean }[];
        readonly meshes: readonly { readonly name: string; readonly topology: string }[];
        readonly materials: readonly { readonly name: string }[];
        readonly textures: readonly { readonly runtime?: { readonly width: number } }[];
      };
      readonly warnings?: readonly unknown[];
      readonly dependencyResolution?: readonly {
        readonly uri: string;
        readonly fileName: string;
        readonly kind: string;
        readonly byteLength: number;
      }[];
      readonly decodedTextures?: readonly {
        readonly name: string;
        readonly width: number;
        readonly height: number;
        readonly format: string;
        readonly colorSpace: string;
        readonly mipLevels: number;
      }[];
      readonly screenshot?: {
        readonly captured: boolean;
        readonly byteLength: number;
      };
      readonly error?: string;
    };
  }
}
