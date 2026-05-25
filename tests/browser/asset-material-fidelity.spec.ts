import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

declare global {
  interface Window {
    __GALILEO3D_ASSET_VIEWER__?: {
      readonly status: "ready" | "error";
      readonly renderer: "webgl2";
      readonly inspection?: {
        readonly materials: ReadonlyArray<{
          readonly name: string;
          readonly baseColorFactor: readonly number[];
          readonly metallicFactor: number;
          readonly roughnessFactor: number;
          readonly emissiveFactor: readonly number[];
          readonly emissiveStrength: number;
          readonly alphaMode: string;
          readonly alphaCutoff: number;
          readonly doubleSided: boolean;
          readonly textures: ReadonlyArray<{ readonly slot: string; readonly texture: number; readonly image: number; readonly texCoord: number }>;
          readonly features?: Record<string, unknown>;
          readonly extensions: readonly string[];
        }>;
        readonly textures: ReadonlyArray<{
          readonly name: string;
          readonly runtime?: {
            readonly width: number;
            readonly height: number;
            readonly format: string;
            readonly colorSpace: "linear" | "srgb";
            readonly mipLevels: number;
            readonly byteLength: number;
          };
        }>;
      };
      readonly materialVariants?: readonly string[];
      readonly variantSwitching?: { readonly available: boolean; readonly applied: boolean };
      readonly decodedTextures?: ReadonlyArray<{
        readonly name: string;
        readonly width: number;
        readonly height: number;
        readonly format: string;
        readonly colorSpace: "linear" | "srgb";
        readonly mipLevels: number;
        readonly fallbackByteLength?: number;
      }>;
      readonly diagnostics?: { readonly drawCalls: number; readonly textures?: number; readonly textureBytes?: number; readonly lastError: string | null };
      readonly error?: string;
    };
  }
}

test.describe("asset material fidelity browser evidence", () => {
  let server: ExampleDevServer;
  const report: MaterialFidelityReport = {
    ok: false,
    generatedAt: new Date().toISOString(),
    command: "pnpm exec playwright test tests/browser/asset-material-fidelity.spec.ts",
    validations: [],
    completedTaskEvidence: [],
    blockedTasks: []
  };

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
    report.ok = report.validations.every((validation) => validation.ok);
    report.generatedAt = new Date().toISOString();
    report.completedTaskEvidence = [{
      task: "Add material fidelity tests for base color, normal, metallic-roughness, emissive, occlusion, alpha, double-sided, clearcoat, transmission, sheen, specular, and variants where supported.",
      evidence: [
        "packages/assets/src/AssetInspection.ts",
        "tests/browser/asset-material-fidelity.spec.ts",
        "tests/reports/foundation-asset-material-fidelity.json"
      ]
    }, {
      task: "Add browser visual tests for KHR_texture_transform, alpha blend/mask ordering, and double-sided rendering.",
      evidence: [
        "packages/assets/src/GLTFRenderResources.ts",
        "packages/rendering/src/ShaderLibrary.ts",
        "tests/browser/asset-material-fidelity.spec.ts",
        "tests/reports/foundation-asset-material-fidelity.json"
      ]
    }];
    report.blockedTasks = [
      "This validates loader, inspection, texture decode, render-resource, and asset-viewer reporting for material features; it is not a pixel-perfect renderer parity claim.",
      "KTX2/Basis, Draco, and Meshopt browser evidence are not added by this material-fidelity test."
    ];
    const reportPath = resolve("tests/reports/foundation-asset-material-fidelity.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  });

  test("loads and reports a glTF material fidelity fixture through the asset viewer", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    const fixture = createMaterialFidelityFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/material-fidelity.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf)
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/material-fidelity.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer)
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/fidelity-pixel.png`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(twoPixelPngBase64, "base64")
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/material-fidelity.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => window.__GALILEO3D_ASSET_VIEWER__?.status === "ready" || window.__GALILEO3D_ASSET_VIEWER__?.status === "error",
        undefined,
        { timeout: 15_000 }
      );
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nPage errors:\n${pageErrors.join("\n")}`);
    }

    const result = await page.evaluate(() => window.__GALILEO3D_ASSET_VIEWER__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.renderer).toBe("webgl2");
    expect(result?.diagnostics?.drawCalls).toBe(1);
    expect(result?.diagnostics?.lastError).toBeNull();
    expect(result?.materialVariants).toEqual(["alternate-blue-finish"]);
    expect(result?.variantSwitching).toEqual({ available: true, applied: false });

    const material = result?.inspection?.materials.find((candidate) => candidate.name === "fidelity-material");
    expect(material).toBeDefined();
    expect(material?.baseColorFactor).toEqual([0.8, 0.25, 0.15, 0.72]);
    expect(material?.metallicFactor).toBe(0.65);
    expect(material?.roughnessFactor).toBe(0.35);
    expect(material?.emissiveFactor).toEqual([0.05, 0.4, 0.12]);
    expect(material?.emissiveStrength).toBe(2.5);
    expect(material?.alphaMode).toBe("BLEND");
    expect(material?.alphaCutoff).toBe(0.43);
    expect(material?.doubleSided).toBe(true);

    const slots = material?.textures.map((slot) => slot.slot).sort();
    expect(slots).toEqual([
      "baseColor",
      "clearcoat",
      "clearcoatNormal",
      "clearcoatRoughness",
      "emissive",
      "metallicRoughness",
      "normal",
      "occlusion",
      "sheenColor",
      "sheenRoughness",
      "specular",
      "specularColor",
      "transmission"
    ]);
    expect(material?.extensions.sort()).toEqual([
      "KHR_materials_clearcoat",
      "KHR_materials_emissive_strength",
      "KHR_materials_sheen",
      "KHR_materials_specular",
      "KHR_materials_transmission"
    ]);

    const features = material?.features as MaterialFeatureSnapshot | undefined;
    expect(features?.normalScale).toBe(0.75);
    expect(features?.occlusionStrength).toBe(0.6);
    expect(features?.clearcoat).toEqual({ factor: 0.9, roughnessFactor: 0.22, normalScale: 0.5 });
    expect(features?.transmission).toEqual({ factor: 0.4 });
    expect(features?.specular).toEqual({ factor: 0.7, colorFactor: [0.9, 0.8, 0.7] });
    expect(features?.sheen).toEqual({ colorFactor: [0.15, 0.25, 0.8], roughnessFactor: 0.33 });

    const decoded = result?.decodedTextures ?? [];
    const runtimeTextureObjects = result?.diagnostics?.textures ?? 0;
    const runtimeTextureBytes = result?.diagnostics?.textureBytes ?? 0;
    expect(decoded.length).toBeGreaterThanOrEqual(13);
    expect(decoded.every((texture) => texture.width === 2 && texture.height === 1 && texture.format === "rgba8")).toBe(true);
    expect(runtimeTextureObjects).toBeGreaterThanOrEqual(5);
    expect(runtimeTextureBytes).toBeGreaterThanOrEqual(runtimeTextureObjects * 4);

    const checks = {
      baseColor: material?.baseColorFactor.join(",") === "0.8,0.25,0.15,0.72",
      normal: features?.normalScale === 0.75 && slots?.includes("normal") === true,
      metallicRoughness: material?.metallicFactor === 0.65 && material?.roughnessFactor === 0.35 && slots?.includes("metallicRoughness") === true,
      emissive: material?.emissiveStrength === 2.5 && slots?.includes("emissive") === true,
      occlusion: features?.occlusionStrength === 0.6 && slots?.includes("occlusion") === true,
      alpha: material?.alphaMode === "BLEND" && material.alphaCutoff === 0.43,
      doubleSided: material?.doubleSided === true,
      clearcoat: features?.clearcoat?.factor === 0.9 && slots?.includes("clearcoat") === true,
      transmission: features?.transmission?.factor === 0.4 && slots?.includes("transmission") === true,
      sheen: features?.sheen?.roughnessFactor === 0.33 && slots?.includes("sheenColor") === true,
      specular: features?.specular?.factor === 0.7 && slots?.includes("specularColor") === true,
      variants: result?.materialVariants?.includes("alternate-blue-finish") === true && result.variantSwitching?.available === true,
      decodedTextures: decoded.length >= 13,
      runtimeTextureObjects: runtimeTextureObjects >= 5
    };
    report.validations.push({
      name: "asset-viewer-material-fidelity",
      ok: Object.values(checks).every(Boolean),
      metrics: {
        materialCount: result?.inspection?.materials.length ?? 0,
        textureSlots: slots?.length ?? 0,
        decodedTextures: decoded.length,
        runtimeTextureObjects,
        drawCalls: result?.diagnostics?.drawCalls ?? 0,
        textureBytes: runtimeTextureBytes
      },
      checks
    });
    expect(checks).toEqual({
      baseColor: true,
      normal: true,
      metallicRoughness: true,
      emissive: true,
      occlusion: true,
      alpha: true,
      doubleSided: true,
      clearcoat: true,
      transmission: true,
      sheen: true,
      specular: true,
      variants: true,
      decodedTextures: true,
      runtimeTextureObjects: true
    });
  });

  test("visually applies texture transforms, alpha blend and mask states, and double-sided culling", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    const fixture = createVisualMaterialFixture();
    await page.route(`${server.origin}/fixtures/asset-viewer/v3-visual-materials.gltf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "model/gltf+json",
        body: JSON.stringify(fixture.gltf)
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/v3-visual-materials.bin`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from(fixture.buffer)
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/v3-stripe.png`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: fixture.stripePng
      });
    });
    await page.route(`${server.origin}/fixtures/asset-viewer/v3-white.png`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: fixture.whitePng
      });
    });

    const url = `${server.origin}/fixtures/asset-viewer/v3-visual-materials.gltf`;
    await page.goto(`${server.origin}/examples/asset-viewer/?model=custom&url=${encodeURIComponent(url)}`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => window.__GALILEO3D_ASSET_VIEWER__?.status === "ready" || window.__GALILEO3D_ASSET_VIEWER__?.status === "error",
        undefined,
        { timeout: 15_000 }
      );
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nPage errors:\n${pageErrors.join("\n")}`);
    }

    const result = await page.evaluate(() => window.__GALILEO3D_ASSET_VIEWER__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.diagnostics?.drawCalls).toBeGreaterThanOrEqual(8);
    expect(result?.diagnostics?.lastError).toBeNull();

    const counts = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("[data-testid='asset-viewer-canvas']");
      if (!canvas) throw new Error("asset viewer canvas missing");
      const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
      if (!gl) throw new Error("webgl2 context missing");
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const output = {
        red: 0,
        blue: 0,
        purple: 0,
        green: 0,
        cyan: 0,
        yellow: 0
      };
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index] ?? 0;
        const g = pixels[index + 1] ?? 0;
        const b = pixels[index + 2] ?? 0;
        if (r > 170 && g < 80 && b < 80) output.red += 1;
        if (b > 170 && r < 80 && g < 100) output.blue += 1;
        if (r > 80 && b > 80 && g < 80) output.purple += 1;
        if (g > 140 && r < 90 && b < 90) output.green += 1;
        if (g > 120 && b > 120 && r < 90) output.cyan += 1;
        if (r > 120 && g > 120 && b < 90) output.yellow += 1;
      }
      return output;
    });

    const checks = {
      textureTransformRedReference: counts.red > 12,
      textureTransformBlueOffset: counts.blue > 20,
      alphaBlendProducesPurple: counts.purple > 20,
      alphaMaskDiscardsRed: counts.green > 20,
      doubleSidedBackfaceVisible: counts.cyan > 20,
      singleSidedBackfaceCulled: counts.yellow < 8
    };
    report.validations.push({
      name: "asset-viewer-visual-material-states",
      ok: Object.values(checks).every(Boolean),
      metrics: {
        redPixels: counts.red,
        bluePixels: counts.blue,
        purplePixels: counts.purple,
        greenPixels: counts.green,
        cyanPixels: counts.cyan,
        yellowPixels: counts.yellow,
        drawCalls: result?.diagnostics?.drawCalls ?? 0
      },
      checks
    });
    expect(checks).toEqual({
      textureTransformRedReference: true,
      textureTransformBlueOffset: true,
      alphaBlendProducesPurple: true,
      alphaMaskDiscardsRed: true,
      doubleSidedBackfaceVisible: true,
      singleSidedBackfaceCulled: true
    });
  });
});

interface MaterialFeatureSnapshot {
  readonly normalScale?: number;
  readonly occlusionStrength?: number;
  readonly clearcoat?: {
    readonly factor: number;
    readonly roughnessFactor: number;
    readonly normalScale?: number;
  };
  readonly transmission?: {
    readonly factor: number;
  };
  readonly specular?: {
    readonly factor: number;
    readonly colorFactor: readonly number[];
  };
  readonly sheen?: {
    readonly colorFactor: readonly number[];
    readonly roughnessFactor: number;
  };
}

interface MaterialFidelityReport {
  ok: boolean;
  generatedAt: string;
  command: string;
  validations: Array<{
    readonly name: string;
    readonly ok: boolean;
    readonly metrics: Record<string, number>;
    readonly checks: Record<string, boolean>;
  }>;
  completedTaskEvidence: Array<{ readonly task: string; readonly evidence: readonly string[] }>;
  blockedTasks: readonly string[];
}

function createMaterialFidelityFixture(): { readonly gltf: unknown; readonly buffer: Uint8Array } {
  const buffer = createGeometryBuffer();
  const textures = Array.from({ length: 13 }, (_, index) => ({
    name: `fidelity-texture-${index}`,
    source: 0
  }));
  return {
    buffer,
    gltf: {
      asset: { version: "2.0", generator: "galileo3d-material-fidelity-browser-test" },
      extensionsUsed: [
        "KHR_materials_emissive_strength",
        "KHR_materials_clearcoat",
        "KHR_materials_transmission",
        "KHR_materials_specular",
        "KHR_materials_sheen",
        "KHR_materials_variants"
      ],
      extensions: {
        KHR_materials_variants: {
          variants: [{ name: "alternate-blue-finish" }]
        }
      },
      buffers: [{ uri: "material-fidelity.bin", byteLength: buffer.byteLength }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 36 },
        { buffer: 0, byteOffset: 72, byteLength: 48 },
        { buffer: 0, byteOffset: 120, byteLength: 24 },
        { buffer: 0, byteOffset: 144, byteLength: 6 }
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.6, -0.45, 0], max: [0.6, 0.7, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 2, componentType: 5126, count: 3, type: "VEC4" },
        { bufferView: 3, componentType: 5126, count: 3, type: "VEC2" },
        { bufferView: 4, componentType: 5123, count: 3, type: "SCALAR" }
      ],
      images: [{ name: "fidelity-pixel", uri: "fidelity-pixel.png", mimeType: "image/png" }],
      textures,
      materials: [
        {
          name: "fidelity-material",
          pbrMetallicRoughness: {
            baseColorFactor: [0.8, 0.25, 0.15, 0.72],
            baseColorTexture: { index: 0 },
            metallicFactor: 0.65,
            roughnessFactor: 0.35,
            metallicRoughnessTexture: { index: 1 }
          },
          normalTexture: { index: 2, scale: 0.75 },
          occlusionTexture: { index: 3, strength: 0.6 },
          emissiveTexture: { index: 4 },
          emissiveFactor: [0.05, 0.4, 0.12],
          alphaMode: "BLEND",
          alphaCutoff: 0.43,
          doubleSided: true,
          extensions: {
            KHR_materials_emissive_strength: { emissiveStrength: 2.5 },
            KHR_materials_clearcoat: {
              clearcoatFactor: 0.9,
              clearcoatTexture: { index: 5 },
              clearcoatRoughnessFactor: 0.22,
              clearcoatRoughnessTexture: { index: 6 },
              clearcoatNormalTexture: { index: 7, scale: 0.5 }
            },
            KHR_materials_transmission: {
              transmissionFactor: 0.4,
              transmissionTexture: { index: 8 }
            },
            KHR_materials_specular: {
              specularFactor: 0.7,
              specularTexture: { index: 9 },
              specularColorFactor: [0.9, 0.8, 0.7],
              specularColorTexture: { index: 10 }
            },
            KHR_materials_sheen: {
              sheenColorFactor: [0.15, 0.25, 0.8],
              sheenColorTexture: { index: 11 },
              sheenRoughnessFactor: 0.33,
              sheenRoughnessTexture: { index: 12 }
            }
          }
        },
        {
          name: "alternate-blue-material",
          pbrMetallicRoughness: {
            baseColorFactor: [0.1, 0.2, 0.9, 1],
            metallicFactor: 0,
            roughnessFactor: 0.8
          }
        }
      ],
      meshes: [{
        name: "material-fidelity-triangle",
        primitives: [{
          attributes: { POSITION: 0, NORMAL: 1, TANGENT: 2, TEXCOORD_0: 3 },
          indices: 4,
          material: 0,
          extensions: {
            KHR_materials_variants: {
              mappings: [{ material: 1, variants: [0] }]
            }
          }
        }]
      }],
      nodes: [{ name: "material-fidelity-node", mesh: 0 }],
      scenes: [{ name: "material-fidelity-scene", nodes: [0] }],
      scene: 0
    }
  };
}

function createGeometryBuffer(): Uint8Array {
  const buffer = new ArrayBuffer(152);
  new Float32Array(buffer, 0, 9).set([-0.6, -0.45, 0, 0.6, -0.45, 0, 0, 0.7, 0]);
  new Float32Array(buffer, 36, 9).set([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  new Float32Array(buffer, 72, 12).set([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]);
  new Float32Array(buffer, 120, 6).set([0, 0, 1, 0, 0.5, 1]);
  new Uint16Array(buffer, 144, 3).set([0, 1, 2]);
  return new Uint8Array(buffer);
}

function createVisualMaterialFixture(): { readonly gltf: unknown; readonly buffer: Uint8Array; readonly stripePng: Buffer; readonly whitePng: Buffer } {
  const builder = new VisualFixtureBuilder();
  const primitives = [
    builder.addQuad("texture-transform-reference", [-1.7, 0.45, -0.95, 0.95], 0, 0),
    builder.addQuad("texture-transform-offset", [-0.75, 0.45, 0, 0.95], 0, 1),
    builder.addQuad("alpha-blend-blue-background", [0.25, 0.45, 1, 0.95], 0, 2),
    builder.addQuad("alpha-blend-red-foreground", [0.25, 0.45, 1, 0.95], 0.01, 3),
    builder.addQuad("alpha-mask-green-background", [1.25, 0.45, 2, 0.95], 0, 4),
    builder.addQuad("alpha-mask-red-discarded", [1.25, 0.45, 2, 0.95], 0.01, 5),
    builder.addBackfaceTriangle("double-sided-backface", [-1.45, -0.75, -0.65, -0.05], 6),
    builder.addBackfaceTriangle("single-sided-backface", [0.85, -0.75, 1.65, -0.05], 7)
  ];
  return {
    buffer: builder.buffer(),
    stripePng: encodeRgbaPng(2, 1, [
      255, 0, 0, 255,
      0, 0, 255, 255
    ]),
    whitePng: encodeRgbaPng(1, 1, [255, 255, 255, 255]),
    gltf: {
      asset: { version: "2.0", generator: "galileo3d-visual-material-state-browser-test" },
      extensionsUsed: ["KHR_texture_transform"],
      buffers: [{ uri: "v3-visual-materials.bin", byteLength: builder.byteLength }],
      bufferViews: builder.bufferViews,
      accessors: builder.accessors,
      samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071, wrapT: 33071 }],
      images: [
        { name: "stripe-red-blue", uri: "v3-stripe.png", mimeType: "image/png" },
        { name: "white-pixel", uri: "v3-white.png", mimeType: "image/png" }
      ],
      textures: [
        { name: "stripe-texture", sampler: 0, source: 0 },
        { name: "white-texture", sampler: 0, source: 1 }
      ],
      materials: [
        {
          name: "texture-transform-red-reference",
          pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [1, 1, 1, 1] }
        },
        {
          name: "texture-transform-blue-offset",
          pbrMetallicRoughness: {
            baseColorTexture: {
              index: 0,
              extensions: { KHR_texture_transform: { offset: [0.75, 0], scale: [1, 1], rotation: 0 } }
            },
            baseColorFactor: [1, 1, 1, 1]
          }
        },
        {
          name: "opaque-blue-background",
          pbrMetallicRoughness: { baseColorTexture: { index: 1 }, baseColorFactor: [0, 0, 1, 1] }
        },
        {
          name: "transparent-red-blend",
          pbrMetallicRoughness: { baseColorTexture: { index: 1 }, baseColorFactor: [1, 0, 0, 0.5] },
          alphaMode: "BLEND"
        },
        {
          name: "opaque-green-mask-background",
          pbrMetallicRoughness: { baseColorTexture: { index: 1 }, baseColorFactor: [0, 1, 0, 1] }
        },
        {
          name: "masked-red-discard",
          pbrMetallicRoughness: { baseColorTexture: { index: 1 }, baseColorFactor: [1, 0, 0, 0.2] },
          alphaMode: "MASK",
          alphaCutoff: 0.5
        },
        {
          name: "double-sided-cyan-backface",
          pbrMetallicRoughness: { baseColorTexture: { index: 1 }, baseColorFactor: [0, 1, 1, 1] },
          doubleSided: true
        },
        {
          name: "single-sided-yellow-backface",
          pbrMetallicRoughness: { baseColorTexture: { index: 1 }, baseColorFactor: [1, 1, 0, 1] },
          doubleSided: false
        }
      ],
      meshes: [{ name: "visual-material-state-mesh", primitives }],
      nodes: [{ name: "visual-material-state-node", mesh: 0 }],
      scenes: [{ name: "visual-material-state-scene", nodes: [0] }],
      scene: 0
    }
  };
}

class VisualFixtureBuilder {
  private readonly bytes: number[] = [];
  readonly bufferViews: Array<{ readonly buffer: 0; readonly byteOffset: number; readonly byteLength: number }> = [];
  readonly accessors: Array<Record<string, unknown>> = [];

  get byteLength(): number {
    return this.bytes.length;
  }

  addQuad(name: string, bounds: readonly [number, number, number, number], z: number, material: number): Record<string, unknown> {
    const [minX, minY, maxX, maxY] = bounds;
    const positions = [
      minX, minY, z,
      maxX, minY, z,
      maxX, maxY, z,
      minX, maxY, z
    ];
    const uvs = [
      0, 0,
      0, 0,
      0, 0,
      0, 0
    ];
    const indices = [0, 1, 2, 0, 2, 3];
    return this.addPrimitive(name, positions, uvs, indices, material, [minX, minY, z], [maxX, maxY, z]);
  }

  addBackfaceTriangle(name: string, bounds: readonly [number, number, number, number], material: number): Record<string, unknown> {
    const [minX, minY, maxX, maxY] = bounds;
    const midX = (minX + maxX) / 2;
    const positions = [
      minX, minY, 0,
      maxX, minY, 0,
      midX, maxY, 0
    ];
    const uvs = [
      0, 0,
      0, 0,
      0, 0
    ];
    return this.addPrimitive(name, positions, uvs, [0, 2, 1], material, [minX, minY, 0], [maxX, maxY, 0]);
  }

  buffer(): Uint8Array {
    return new Uint8Array(this.bytes);
  }

  private addPrimitive(
    name: string,
    positions: readonly number[],
    uvs: readonly number[],
    indices: readonly number[],
    material: number,
    min: readonly [number, number, number],
    max: readonly [number, number, number]
  ): Record<string, unknown> {
    const positionAccessor = this.pushFloatAccessor(positions, "VEC3", min, max);
    const uvAccessor = this.pushFloatAccessor(uvs, "VEC2");
    const indexAccessor = this.pushIndexAccessor(indices);
    return {
      name,
      attributes: { POSITION: positionAccessor, TEXCOORD_0: uvAccessor },
      indices: indexAccessor,
      material
    };
  }

  private pushFloatAccessor(values: readonly number[], type: "VEC2" | "VEC3", min?: readonly number[], max?: readonly number[]): number {
    this.align(4);
    const byteOffset = this.bytes.length;
    const view = new Uint8Array(new Float32Array(values).buffer);
    this.bytes.push(...view);
    const bufferView = this.bufferViews.length;
    this.bufferViews.push({ buffer: 0, byteOffset, byteLength: view.byteLength });
    const accessor = this.accessors.length;
    this.accessors.push({
      bufferView,
      componentType: 5126,
      count: values.length / (type === "VEC3" ? 3 : 2),
      type,
      ...(min ? { min } : {}),
      ...(max ? { max } : {})
    });
    return accessor;
  }

  private pushIndexAccessor(values: readonly number[]): number {
    this.align(2);
    const byteOffset = this.bytes.length;
    const view = new Uint8Array(new Uint16Array(values).buffer);
    this.bytes.push(...view);
    const bufferView = this.bufferViews.length;
    this.bufferViews.push({ buffer: 0, byteOffset, byteLength: view.byteLength });
    const accessor = this.accessors.length;
    this.accessors.push({
      bufferView,
      componentType: 5123,
      count: values.length,
      type: "SCALAR"
    });
    return accessor;
  }

  private align(alignment: number): void {
    while (this.bytes.length % alignment !== 0) {
      this.bytes.push(0);
    }
  }
}

function encodeRgbaPng(width: number, height: number, rgba: readonly number[]): Buffer {
  const scanlines: number[] = [];
  for (let y = 0; y < height; y += 1) {
    scanlines.push(0);
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      scanlines.push(rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0, rgba[offset + 3] ?? 255);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 6, 0, 0, 0])
    ])),
    pngChunk("IDAT", deflateSync(Buffer.from(scanlines))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  return Buffer.concat([
    uint32(data.byteLength),
    typeBytes,
    data,
    uint32(crc32(Buffer.concat([typeBytes, data])))
  ]);
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const twoPixelPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGP4z8AAQv8BD/kD/YURmXYAAAAASUVORK5CYII=";
