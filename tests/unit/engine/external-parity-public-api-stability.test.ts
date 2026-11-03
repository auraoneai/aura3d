import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  createAssetDiagnostics,
  createDiagnosticsPanel,
  createEnvironment,
  workflows
} from "@aura3d/engine";
import { captureScreenshot, loadAsset } from "@aura3d/engine-runtime";
import { A3D_APP_WORKFLOW_PRESETS, createA3DApp, resolveA3DAppQualityPreset } from "@aura3d/apps";
import { createRenderDiagnostics } from "@aura3d/engine/devtools";
import { createMaterialVariantController } from "../../../packages/engine/src/agent-api/engineSurface.js";
import { createCompatibilityReport } from "@aura3d/engine/devtools";

test("ExternalParity developer product API stays reachable from its owning modules", () => {
  expect(typeof createA3DApp).toBe("function");
  expect(typeof loadAsset).toBe("function");
  expect(typeof createEnvironment).toBe("function");
  expect(typeof createMaterialVariantController).toBe("function");
  expect(typeof captureScreenshot).toBe("function");
  expect(typeof createDiagnosticsPanel).toBe("function");
  expect(typeof createAssetDiagnostics).toBe("function");
  expect(typeof createRenderDiagnostics).toBe("function");
  expect(typeof createCompatibilityReport).toBe("function");
  expect(Object.keys(workflows).sort()).toEqual([
    "animationLab",
    "assetViewer",
    "comparison",
    "interactiveScene",
    "materialStudio",
    "productConfigurator",
    "sceneShowcase"
  ]);
  expect(A3D_APP_WORKFLOW_PRESETS).toEqual([
    "asset-viewer",
    "product-configurator",
    "material-studio",
    "scene-showcase",
    "interactive-scene"
  ]);
});

test("5.0.0 removed the deprecated loadAsset/captureScreenshot/createA3DApp root exports", async () => {
  // Deprecated in 4.x with no public replacement (createA3DApp -> createAuraApp); migration guide B14.
  const root = (await import("@aura3d/engine")) as Record<string, unknown>;
  for (const name of ["loadAsset", "captureScreenshot", "createA3DApp"]) expect(name in root, name).toBe(false);
});

test("ExternalParity quality presets and environment API expose production defaults", () => {
  expect(resolveA3DAppQualityPreset("production")).toMatchObject({
    preset: "production",
    width: 1600,
    height: 1000,
    antialias: true,
    preserveDrawingBuffer: true,
    targetFormat: "rgba16f"
  });
  expect(resolveA3DAppQualityPreset("draft")).toMatchObject({
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

test("ExternalParity diagnostics and material variant helpers are stable", () => {
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

test("ExternalParity package manifest exposes installable product paths", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
    exports: Record<string, string>;
    files: string[];
    devDependencies: Record<string, string>;
  };
  // PRD-15 §6.1 + T8.1: "." is the public surface entry. Consumer-free subpaths were
  // removed at 4.0.0; the remaining deprecated stubs were removed at 5.0.0 (migration
  // guide B15). `./media-node` stays as the Node-only media entry.
  expect(manifest.exports).toMatchObject({
    ".": {
      browser: "./dist/engine/public/index.js",
      import: "./dist/engine/public/index.js"
    },
    "./media-node": "./dist/engine/agent-api/media-node.js"
  });
  for (const removed of [
    "./apps",
    "./contracts",
    "./rendering",
    "./rendering/production-runtime",
    "./rendering/webgpu",
    "./production-runtime",
    "./advanced-runtime",
    "./assets/browser",
    "./workflows/production",
    "./engine",
    "./engine-runtime",
    "./create-aura3d",
    "./lean",
    "./core",
    "./rendering/advanced-runtime",
    "./assets/advanced-gallery",
    "./editor",
    "./debug"
  ]) {
    expect(manifest.exports[removed]).toBeUndefined();
  }
  expect(manifest.files).toEqual(expect.arrayContaining([
    "dist/apps",
    "dist/engine",
    "dist/create-aura3d"
  ]));
  expect(manifest.devDependencies).toMatchObject({
    "@aura3d/apps": "workspace:*",
    "@aura3d/engine-runtime": "workspace:*",
    "create-aura3d": "workspace:*"
  });
});
