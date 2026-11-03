import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { writeRouteTypedAssets, type RouteTypegenVariant } from "../../../packages/aura3d-cli/src/asset-route-typegen";
import type { AuraCliAssetManifest } from "../../../packages/aura3d-cli/src/asset-core-types";

const ROOT_HEX = "a".repeat(64);
const CHILD_HEX = "b".repeat(64);
const OTHER_HEX = "c".repeat(64);
const ROOT_HASH = `sha256-${ROOT_HEX}`;
const CHILD_HASH = `sha256-${CHILD_HEX}`;
const OTHER_HASH = `sha256-${OTHER_HEX}`;
const workDirs: string[] = [];

type Data = Record<string, unknown>;

afterEach(() => {
  for (const path of workDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

function scalarAsset(overrides: Data = {}): Data {
  return {
    id: "scan",
    type: "scalar-volume",
    format: "nhdr",
    source: "private/source/location.nhdr",
    outputPath: "public/custom-volumes/scan/header.nhdr",
    url: "/custom-volumes/scan/header.nhdr",
    hash: ROOT_HASH,
    sizeBytes: 128,
    materials: [],
    animations: [],
    textures: [],
    warnings: [],
    dependencies: ["payload/data.raw"],
    integrity: { version: 1, digest: ROOT_HASH, dependencies: { "payload/data.raw": CHILD_HASH }, requireDependencies: true },
    ...overrides
  };
}

function derived(overrides: Data = {}): Data {
  return {
    url: "/custom-volumes/derived.nhdr",
    hash: OTHER_HASH,
    sourceHash: ROOT_HASH,
    outputPath: "public/custom-volumes/derived.nhdr",
    profile: "balanced",
    steps: [],
    extensionsUsed: [],
    requiredDecoders: [],
    lods: [],
    measurements: { before: {}, after: {} },
    ...overrides
  };
}

function fixture(asset: Data) {
  const root = mkdtempSync(join(tmpdir(), "aura-route-nrrd-"));
  workDirs.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "main.ts"), 'import { assets } from "./aura-assets.route";\nvoid assets.scan;\n');
  const manifest = {
    schema: "aura3d.assets/1.0",
    assetBasePath: "/custom-volumes",
    outputDir: "public/custom-volumes",
    typegen: "src/aura-assets.ts",
    assets: [asset]
  } as unknown as AuraCliAssetManifest;
  const generate = (variant?: RouteTypegenVariant) => writeRouteTypedAssets({ projectDir: root, route: ".", manifest, variant });
  return { root, manifest, generate };
}

/** Execute only the synthetic generated module, with its public factory mocked. */
function evaluateRoute(code: string): Record<string, Data> {
  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(output, {
    exports,
    require: (id: string) => {
      if (id !== "@aura3d/engine") throw new Error(`Unexpected generated import: ${id}`);
      return { defineAuraAssets: (items: unknown) => items };
    }
  });
  return exports.assets as Record<string, Data>;
}

describe("scalar-volume route type generation", () => {
  it("retains exact detached dependency integrity and staged output provenance", () => {
    const asset = scalarAsset({
      hash: ROOT_HEX.toUpperCase(),
      sha256: ROOT_HEX,
      integrity: { version: 1, digest: `SHA256-${ROOT_HEX.toUpperCase()}`, dependencies: { "payload/data.raw": CHILD_HEX.toUpperCase() }, requireDependencies: true },
      formatMetadata: { mediaType: "application/nrrd", source: { format: "raw", conversion: "offline" } },
      provenance: { license: "private-license-marker", sourceUrl: "https://example.invalid/private-source-marker" }
    });
    const result = fixture(asset).generate("source");
    expect(result.ok).toBe(true);
    expect(result.referencedIds).toEqual(["scan"]);
    const code = readFileSync(result.path, "utf8");
    const scan = evaluateRoute(code).scan!;
    expect(scan.type).toBe("scalar-volume");
    expect(scan.hash).toBe(ROOT_HASH);
    expect(JSON.parse(JSON.stringify(scan.integrity))).toEqual({
      version: 1, digest: ROOT_HASH, dependencies: { "payload/data.raw": CHILD_HASH }, requireDependencies: true
    });
    expect(JSON.parse(JSON.stringify(scan.metadata))).toEqual({ outputPath: "public/custom-volumes/scan/header.nhdr" });
    expect(JSON.parse(JSON.stringify(scan.formatMetadata))).toEqual({ mediaType: "application/nrrd", source: { format: "raw", conversion: "offline" } });
    expect(code).not.toContain("private/source/location.nhdr");
    expect(code).not.toContain("private-license-marker");
    expect(code).not.toContain("private-source-marker");
  });

  it("preserves an empty admitted dependency map for embedded data", () => {
    const asset = scalarAsset({ format: "nrrd", dependencies: [], integrity: { version: 1, digest: ROOT_HASH, dependencies: {}, requireDependencies: true } });
    const result = fixture(asset).generate();
    const scan = evaluateRoute(readFileSync(result.path, "utf8")).scan!;
    expect(JSON.parse(JSON.stringify(scan.integrity))).toEqual({ version: 1, digest: ROOT_HASH, dependencies: {}, requireDependencies: true });
  });

  it("keeps unusual safe dependency names as own data properties", () => {
    const dependencies = Object.fromEntries([["__proto__", CHILD_HASH], ["測試/volume raw.bin", OTHER_HASH]]);
    const asset = scalarAsset({ dependencies: ["__proto__", "測試/volume raw.bin"], integrity: { version: 1, digest: ROOT_HASH, dependencies, requireDependencies: true } });
    const result = fixture(asset).generate("source");
    const scan = evaluateRoute(readFileSync(result.path, "utf8")).scan!;
    const integrity = scan.integrity as { dependencies: Record<string, string> };
    expect(Object.hasOwn(integrity.dependencies, "__proto__")).toBe(true);
    expect(integrity.dependencies["__proto__"]).toBe(CHILD_HASH);
    expect(integrity.dependencies["測試/volume raw.bin"]).toBe(OTHER_HASH);
  });

  it.each(["source", "optimized", "mobile"] as const)("uses source integrity when %s selects the unmodified source", (variant) => {
    const result = fixture(scalarAsset()).generate(variant);
    const scan = evaluateRoute(readFileSync(result.path, "utf8")).scan!;
    expect(scan.hash).toBe(ROOT_HASH);
    expect((scan.integrity as { dependencies: Record<string, string> }).dependencies["payload/data.raw"]).toBe(CHILD_HASH);
  });

  it("uses the source hash when the mobile URL explicitly selects the source", () => {
    const asset = scalarAsset({ derived: derived({ mobileUrl: "/custom-volumes/scan/header.nhdr" }) });
    const result = fixture(asset).generate("mobile");
    const scan = evaluateRoute(readFileSync(result.path, "utf8")).scan!;
    expect(scan.url).toBe(asset.url);
    expect(scan.hash).toBe(ROOT_HASH);
    expect(scan.variants).toBeUndefined();
  });

  it("accepts an optimized entry only when its URL and root hash are source-identical", () => {
    const asset = scalarAsset({ derived: derived({ url: "/custom-volumes/scan/header.nhdr", hash: ROOT_HASH }) });
    const result = fixture(asset).generate("optimized");
    const scan = evaluateRoute(readFileSync(result.path, "utf8")).scan!;
    expect(scan.hash).toBe(ROOT_HASH);
    expect((scan.integrity as { digest: string }).digest).toBe(ROOT_HASH);
  });

  it.each([
    ["a different optimized URL", derived(), "optimized"],
    ["a different mobile URL", derived({ mobileUrl: "/custom-volumes/mobile.nhdr" }), "mobile"],
    ["a different URL even with the same root digest", derived({ hash: ROOT_HASH }), "optimized"],
    ["the source URL with a conflicting derived digest", derived({ url: "/custom-volumes/scan/header.nhdr", hash: OTHER_HASH }), "optimized"]
  ] as const)("refuses %s without a variant-specific dependency identity", (_label, candidate, variant) => {
    const f = fixture(scalarAsset({ derived: candidate }));
    const output = join(f.root, "src", "aura-assets.route.ts");
    writeFileSync(output, "previous route contents\n");
    expect(() => f.generate(variant)).toThrow(/selected variant.*dependency integrity/i);
    expect(readFileSync(output, "utf8")).toBe("previous route contents\n");
  });

  it("allows an explicit source route even if another variant is different", () => {
    const result = fixture(scalarAsset({ derived: derived() })).generate("source");
    expect(evaluateRoute(readFileSync(result.path, "utf8")).scan!.hash).toBe(ROOT_HASH);
  });

  it.each([
    ["missing integrity", { integrity: undefined }],
    ["wrong root digest", { integrity: { version: 1, digest: OTHER_HASH, dependencies: { "payload/data.raw": CHILD_HASH }, requireDependencies: true } }],
    ["missing dependency policy", { integrity: { version: 1, digest: ROOT_HASH, dependencies: { "payload/data.raw": CHILD_HASH } } }],
    ["missing dependency map", { integrity: { version: 1, digest: ROOT_HASH, requireDependencies: true } }],
    ["unlisted dependency", { dependencies: [] }],
    ["duplicate dependency list", { dependencies: ["payload/data.raw", "payload/data.raw"] }],
    ["invalid child digest", { integrity: { version: 1, digest: ROOT_HASH, dependencies: { "payload/data.raw": "bad" }, requireDependencies: true } }],
    ["conflicting legacy digest", { sha256: OTHER_HEX }],
    ["unsafe output path", { outputPath: "../outside/header.nhdr" }]
  ] as const)("rejects %s before writing a route", (_label, overrides) => {
    const f = fixture(scalarAsset(overrides));
    const output = join(f.root, "src", "aura-assets.route.ts");
    writeFileSync(output, "previous route contents\n");
    expect(() => f.generate("source")).toThrow(/Scalar-volume asset/);
    expect(readFileSync(output, "utf8")).toBe("previous route contents\n");
  });

  it.each(["../payload.raw", "/payload.raw", "a//payload.raw", "a/%2e%2e/payload.raw", "a\\payload.raw", "data.raw?key=x", "https://example.invalid/payload.raw"])(
    "rejects an unsafe detached reference %s without generating a route",
    (reference) => {
      const dependencies = Object.fromEntries([[reference, CHILD_HASH]]);
      const asset = scalarAsset({ dependencies: [reference], integrity: { version: 1, digest: ROOT_HASH, dependencies, requireDependencies: true } });
      expect(() => fixture(asset).generate("source")).toThrow(/dependency reference/i);
    }
  );

  it("keeps ordinary model route entries compatible", () => {
    const asset = scalarAsset({ type: "model", format: "glb", integrity: undefined, dependencies: undefined });
    const result = fixture(asset).generate("source");
    const model = evaluateRoute(readFileSync(result.path, "utf8")).scan!;
    expect(model.type).toBe("model");
    expect(model.hash).toBe(ROOT_HASH);
    expect(model.integrity).toBeUndefined();
    expect(model.metadata).toBeUndefined();
  });
});
