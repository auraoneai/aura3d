import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as advancedRuntime from "@galileo3d/engine/advanced-runtime";
import * as advancedRuntimeLegacy from "@galileo3d/engine/v9";
import * as advancedRendering from "@galileo3d/engine/rendering/advanced-runtime";
import * as advancedRenderingLegacy from "@galileo3d/engine/rendering/v9";
import * as advancedAssets from "@galileo3d/engine/assets/advanced-gallery";
import * as advancedAssetsLegacy from "@galileo3d/engine/assets/v9";
import * as productionRuntime from "@galileo3d/engine/production-runtime";
import * as productionRuntimeLegacy from "@galileo3d/engine/v6";
import * as productionRendering from "@galileo3d/engine/rendering/production-runtime";
import * as productionRenderingLegacy from "@galileo3d/engine/rendering/v6";
import * as assetCorpus from "@galileo3d/engine/assets/asset-corpus";
import * as assetCorpusLegacy from "@galileo3d/engine/assets/v6";
import * as productionWorkflows from "@galileo3d/engine/workflows/production";
import * as productionWorkflowsLegacy from "@galileo3d/engine/workflows/v6";
import {
  ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR,
  ADVANCED_GALLERY_LEGACY_REPORT_DIR,
  resolveAdvancedGalleryReportDir
} from "../../../tools/advanced-gallery-evidence-paths";
import {
  ADVANCED_GALLERY_CONTEXTUAL_ROUTE,
  ADVANCED_GALLERY_LEGACY_ROUTE,
  CONTEXTUAL_FIXTURE_ALIASES,
  CONTEXTUAL_REPORT_ALIASES,
  CONTEXTUAL_ROUTE_ALIASES,
  contextualPathForLegacyPath,
  legacyPathForContextualPath
} from "../../../tools/naming-taxonomy/contextualAliases";

describe("naming taxonomy contextual aliases", () => {
  it("keeps contextual package exports equivalent to legacy version aliases", () => {
    expect(advancedRuntime.G3DRenderer).toBe(advancedRuntimeLegacy.G3DRenderer);
    expect(advancedRuntime.G3DScene).toBe(advancedRuntimeLegacy.G3DScene);
    expect(advancedRendering.RendererV9).toBe(advancedRenderingLegacy.RendererV9);
    expect(advancedAssets.GLTFLoader).toBe(advancedAssetsLegacy.GLTFLoader);

    expect(productionRuntime.G3DRenderer).toBe(productionRuntimeLegacy.G3DRenderer);
    expect(productionRuntime.createProductViewer).toBe(productionRuntimeLegacy.createProductViewer);
    expect(productionRendering.RendererV6).toBe(productionRenderingLegacy.RendererV6);
    expect(assetCorpus.loadV6AssetManifest).toBe(assetCorpusLegacy.loadV6AssetManifest);
    expect(productionWorkflows.runV6Example).toBe(productionWorkflowsLegacy.runV6Example);
  });

  it("declares package export aliases before legacy versioned package exports are removed", () => {
    const rootPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { exports: Record<string, string> };
    const enginePackage = JSON.parse(readFileSync(resolve("packages/engine/package.json"), "utf8")) as {
      exports: Record<string, string | { readonly types?: string; readonly import?: string }>;
    };
    const exports = rootPackage.exports;

    expect(exports["./advanced-runtime"]).toBe(exports["./v9"]);
    expect(exports["./rendering/advanced-runtime"]).toBe(exports["./rendering/v9"]);
    expect(exports["./assets/advanced-gallery"]).toBe(exports["./assets/v9"]);
    expect(exports["./production-runtime"]).toBe(exports["./v6"]);
    expect(exports["./rendering/production-runtime"]).toBe(exports["./rendering/v6"]);
    expect(exports["./assets/asset-corpus"]).toBe(exports["./assets/v6"]);
    expect(exports["./workflows/production"]).toBe(exports["./workflows/v6"]);
    expect(enginePackage.exports["./advanced-runtime"]).toEqual(enginePackage.exports["./v9"]);
  });

  it("maps contextual route, fixture, and report paths back to existing compatibility targets", () => {
    expect(CONTEXTUAL_ROUTE_ALIASES).toContainEqual(expect.objectContaining({
      contextual: ADVANCED_GALLERY_CONTEXTUAL_ROUTE,
      legacy: ADVANCED_GALLERY_LEGACY_ROUTE,
      classification: "active-alias"
    }));
    expect(CONTEXTUAL_ROUTE_ALIASES).toEqual(expect.arrayContaining([
      expect.objectContaining({ contextual: "/apps/flagship-viewer/", legacy: "/apps/v8-flagship-viewer/" }),
      expect.objectContaining({ contextual: "/apps/character-viewer/", legacy: "/apps/v6-character-viewer/" }),
      expect.objectContaining({ contextual: "/apps/three-compat-product-studio-pro/", legacy: "/apps/v5-product-studio-pro/" }),
      expect.objectContaining({ contextual: "/apps/regression-animation-keyframes/", legacy: "/apps/v7-animation-keyframes/" }),
      expect.objectContaining({ contextual: "/apps/public-scene/", legacy: "/apps/v9-public-scene/" }),
      expect.objectContaining({ contextual: "/apps/common/", legacy: "/apps/v6-common/" })
    ]));
    expect(CONTEXTUAL_REPORT_ALIASES).toContainEqual(expect.objectContaining({
      contextual: ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR,
      legacy: ADVANCED_GALLERY_LEGACY_REPORT_DIR,
      classification: "active-alias"
    }));
    expect(CONTEXTUAL_FIXTURE_ALIASES.length).toBeGreaterThanOrEqual(5);

    const filePairs = [
      ["fixtures/asset-corpus/damaged-helmet.glb", "fixtures/v6/assets/corpus/damaged-helmet.glb"],
      ["fixtures/environment-corpus/hdri/studio_small_08_1k.hdr", "fixtures/v6/environments/hdri/studio_small_08_1k.hdr"],
      ["fixtures/threejs-parity/assets/vehicles/car-concept.glb", "fixtures/v8/assets/vehicles/car-concept.glb"],
      ["fixtures/advanced-gallery/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb", "fixtures/v9/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb"],
      ["fixtures/advanced-gallery/environments/hdri/data_galaxy_deep_space_1k.hdr", "fixtures/v9/environments/hdri/data_galaxy_deep_space_1k.hdr"]
    ] as const;

    for (const [contextual, legacy] of filePairs) {
      expect(legacyPathForContextualPath(contextual)).toBe(legacy);
      expect(contextualPathForLegacyPath(legacy)).toBe(contextual);
      expect(existsSync(resolve(contextual)), contextual).toBe(true);
      expect(sha256(resolve(contextualPathForLegacyPath(legacy)))).toBe(sha256(resolve(contextual)));
    }
  });

  it("resolves contextual report directories first while preserving legacy report-reader fallback", () => {
    const root = mkdtempSync(join(tmpdir(), "g3d-advanced-gallery-report-alias-"));
    try {
      mkdirSync(join(root, ADVANCED_GALLERY_LEGACY_REPORT_DIR), { recursive: true });
      expect(resolveAdvancedGalleryReportDir(root)).toBe(ADVANCED_GALLERY_LEGACY_REPORT_DIR);

      mkdirSync(join(root, ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR), { recursive: true });
      expect(resolveAdvancedGalleryReportDir(root)).toBe(ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
