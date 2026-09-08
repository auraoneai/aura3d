import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertDecoderVersion, assertKtxProvenance, verifyKtxBehavior, KTX_R185_PROVENANCE, type KtxParserModule } from "../../../tools/muse3jsparity-matrix/decoder-alignment.js";

describe("3.0.1 installed decoder alignment", () => {
  it.each(["1.2.0", "1.2.1", "1.10.0", "2.0.0"])("accepts equal or newer stable decoder %s", version => {
    expect(() => assertDecoderVersion("meshoptimizer", version, "1.2.0")).not.toThrow();
  });
  it.each([null, "1.1.1", "1.2.0-beta.1", "unknown", "^1.2.0"])("rejects missing, older, unverified installed version %s", version => {
    expect(() => assertDecoderVersion("meshoptimizer", version, "1.2.0")).toThrow();
  });
  it("rejects a versionless reference with no verified mapping", () => {
    expect(() => assertDecoderVersion("ktx-parse", "1.0.1", null)).toThrow(/unverified/);
    expect(() => assertKtxProvenance("", "", null)).toThrow(/provenance/);
  });
  it("rejects changed vendored or installed content despite a claimed version", () => {
    const vendored = readFileSync(resolve("node_modules/three/examples/jsm/libs/ktx-parse.module.js"), "utf8");
    expect(() => assertKtxProvenance(vendored + "changed", "", KTX_R185_PROVENANCE)).toThrow(/r185 content changed/);
    expect(() => assertKtxProvenance(vendored, "export const version = '1.0.1'", KTX_R185_PROVENANCE)).toThrow(/installed content/);
  });
  it("verifies actual loader-resolved KTX upstream content and compressed fixture behavior", async () => {
    const rootRequire = createRequire(resolve("package.json"));
    const loaderRequire = createRequire(rootRequire.resolve("@loaders.gl/textures"));
    const directory = dirname(loaderRequire.resolve("ktx-parse"));
    const installedPath = resolve(directory, "ktx-parse.modern.js");
    const referencePath = resolve("node_modules/three/examples/jsm/libs/ktx-parse.module.js");
    assertKtxProvenance(readFileSync(referencePath, "utf8"), readFileSync(installedPath, "utf8"), KTX_R185_PROVENANCE);
    const [reference, installed] = await Promise.all([import(pathToFileURL(referencePath).href), import(pathToFileURL(installedPath).href)]) as [KtxParserModule, KtxParserModule];
    const fixture = readFileSync(resolve("tests/assets/corpus/ktx2/Rib_N.ktx2"));
    expect(verifyKtxBehavior(reference, installed, [fixture])).toMatchObject({ positiveFixtures: 1, malformedFixtures: 3, readWriteEquivalent: true });
    expect(() => verifyKtxBehavior(reference, installed, [])).toThrow(/missing positive/);
    expect(() => verifyKtxBehavior(reference, { ...installed, read: () => ({ pixelWidth: 999 }) }, [fixture])).toThrow(/mip levels differ/);
  });
});
