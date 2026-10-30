import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dropSharedGLTFDecoderRegistry, sharedGLTFDecoderRegistry } from "../../../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline";

/**
 * GU47 eint EH-6 (E-H handoff): `loadProductionGLTFRenderPipeline` reuses one decoder registry per decode
 * configuration, so the draco / meshopt decoder instances (which key `GLTFAssetParseCache`) are the same across loads
 * and `setScene` remounts; a failed decoder load drops the registry so the next load retries.
 */
const NONE = { astc: false, bptc: false, etc2: false, s3tc: false, s3tcSrgb: false };
const config = (overrides: Partial<Parameters<typeof sharedGLTFDecoderRegistry>[0]> = {}) => ({
  basePath: "/aura-decoders/", capabilities: NONE, maxTextureSize: 4096, workerCount: 1, ...overrides
});

describe("GU47 eint EH-6: shared glTF decoder registries", () => {
  it("one registry per decode configuration", () => {
    const a = sharedGLTFDecoderRegistry(config());
    expect(sharedGLTFDecoderRegistry(config())).toBe(a);
    expect(sharedGLTFDecoderRegistry(config({ capabilities: { ...NONE } }))).toBe(a);
    expect(sharedGLTFDecoderRegistry(config({ workerCount: 2 }))).not.toBe(a);
    expect(sharedGLTFDecoderRegistry(config({ basePath: "/decoders/" }))).not.toBe(a);
    expect(sharedGLTFDecoderRegistry(config({ maxTextureSize: 2048 }))).not.toBe(a);
    expect(sharedGLTFDecoderRegistry(config({ capabilities: { ...NONE, astc: true } }))).not.toBe(a);
  });

  it("a dropped registry is replaced on the next load", () => {
    const a = sharedGLTFDecoderRegistry(config({ basePath: "/drop/" }));
    dropSharedGLTFDecoderRegistry(a);
    const b = sharedGLTFDecoderRegistry(config({ basePath: "/drop/" }));
    expect(b).not.toBe(a);
    expect(sharedGLTFDecoderRegistry(config({ basePath: "/drop/" }))).toBe(b);
  });

  it("the pipeline takes the shared registry and drops it when require() fails", () => {
    const source = readFileSync(resolve(__dirname, "../../../../packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts"), "utf8");
    const load = source.slice(source.indexOf("export async function loadProductionGLTFRenderPipeline"));
    expect(load).toContain("const registry = sharedGLTFDecoderRegistry({");
    expect(load).not.toContain("createAssetDecoderRegistry(");
    expect(load).toContain("dropSharedGLTFDecoderRegistry(registry);");
  });
});
