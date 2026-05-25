import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  G3D_APP_WORKFLOW_PRESETS,
  captureScreenshot,
  createAssetDiagnostics,
  createCompatibilityReport,
  createDiagnosticsPanel,
  createEnvironment,
  createG3DApp,
  createMaterialVariantController,
  createRenderDiagnostics,
  loadAsset,
  resolveG3DAppQualityPreset,
  workflows
} from "@galileo3d/engine";

test("V4 root package exposes the developer product API", () => {
  expect(typeof createG3DApp).toBe("function");
  expect(typeof loadAsset).toBe("function");
  expect(typeof createEnvironment).toBe("function");
  expect(typeof createMaterialVariantController).toBe("function");
  expect(typeof captureScreenshot).toBe("function");
  expect(typeof createDiagnosticsPanel).toBe("function");
  expect(typeof createAssetDiagnostics).toBe("function");
  expect(typeof createRenderDiagnostics).toBe("function");
  expect(typeof createCompatibilityReport).toBe("function");
  expect(Object.keys(workflows).sort()).toEqual([
    "assetViewer",
    "interactiveScene",
    "materialStudio",
    "productConfigurator",
    "sceneShowcase"
  ]);
  expect(G3D_APP_WORKFLOW_PRESETS).toEqual([
    "asset-viewer",
    "product-configurator",
    "material-studio",
    "scene-showcase",
    "interactive-scene"
  ]);
});

test("V4 quality presets and environment API expose production defaults", () => {
  expect(resolveG3DAppQualityPreset("production")).toMatchObject({
    preset: "production",
    width: 1600,
    height: 1000,
    antialias: true,
    preserveDrawingBuffer: true,
    targetFormat: "rgba16f"
  });
  expect(resolveG3DAppQualityPreset("draft")).toMatchObject({
    preset: "draft",
    targetFormat: "rgba8"
  });
  const environment = createEnvironment({ target: "gallery-neutral-hdr", intensity: 1.1 });
  expect(environment.capabilities).toEqual(expect.arrayContaining([
    "diffuse irradiance",
    "specular prefilter mips",
    "BRDF LUT",
    "environment intensity"
  ]));
  expect(environment.releaseBlockers.join(" ")).toContain("Three.js");
});

test("V4 diagnostics and material variant helpers are stable", () => {
  const variants = createMaterialVariantController(["brushed", "anodized", "ceramic"] as const, "brushed");
  expect(variants.current).toBe("brushed");
  expect(variants.setVariant("ceramic")).toBe("ceramic");
  expect(variants.snapshot()).toEqual({
    current: "ceramic",
    variants: ["brushed", "anodized", "ceramic"]
  });
  expect(createRenderDiagnostics({ drawCalls: 4, buffers: 2, shaders: 1, textures: 3, lastError: null, contextLost: false })).toMatchObject({
    drawCalls: 4,
    buffers: 2,
    shaders: 1,
    textureCount: 3,
    warnings: []
  });
  const panel = createDiagnosticsPanel();
  expect(panel.snapshot().render.warnings[0]).toContain("No render diagnostics");
});

test("V4 package manifest exposes installable product paths", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    exports: Record<string, string>;
    files: string[];
    devDependencies: Record<string, string>;
  };
  expect(manifest.exports).toMatchObject({
    ".": "./dist/engine/index.js",
    "./apps": "./dist/apps/index.js",
    "./engine": "./dist/engine/index.js",
    "./create-g3d": "./dist/create-g3d/index.js"
  });
  expect(manifest.files).toEqual(expect.arrayContaining([
    "dist/apps",
    "dist/engine",
    "dist/create-g3d"
  ]));
  expect(manifest.devDependencies).toMatchObject({
    "@galileo3d/apps": "workspace:*",
    "@galileo3d/engine-runtime": "workspace:*",
    "@galileo3d/create-g3d": "workspace:*"
  });
});
