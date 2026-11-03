import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadRenderableAsset } from "../../packages/assets/src";

// The corpus-manifest cases that used to live here read the three.js-derived
// `fixtures/threejs-parity/assets/manifest.json` corpus in a schema that was
// never committed; they are retired (docs/project/status/retired-tests.md).
// The one-call renderable API case now reads the tracked Khronos DamagedHelmet.
describe("CurrentRoutes GLTF loader corpus", () => {
  it("loads GLB assets through the one-call renderable asset API", async () => {
    const loaded = await loadRenderableAsset(toGlbDataUri("fixtures/asset-corpus/damaged-helmet.glb"), { type: "gltf" });

    expect(loaded.kind).toBe("gltf");
    expect(loaded.gltf?.loaderDiagnostics.textureCount).toBeGreaterThan(0);
    expect(loaded.gltf?.createScene().collectRenderables().length).toBeGreaterThan(0);
    expect(loaded.warnings).toEqual([]);
  });
});

function toGlbDataUri(localPath: string): string {
  return `data:model/gltf-binary;base64,${readFileSync(localPath).toString("base64")}`;
}
