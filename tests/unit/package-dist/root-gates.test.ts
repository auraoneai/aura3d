import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { importEnginePackageViaNode } from "./package-dist-helpers.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const tempDirs: string[] = [];

describe("package/dist root gate parity", () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  test("CLI dist includes extracted root-gate modules and loads intended exports", async () => {
    const requiredFiles = [
      "asset-constants.js",
      "asset-core-types.js",
      "asset-inspection-types.js",
      "asset-manifest.js",
      "asset-readiness-types.js",
      "asset-source-ast.js",
      "asset-source-roles.js",
      "asset-source-validation.js",
      "character-assembly-types.js",
      "cli-options.js",
      "pull-bridge/scoring.js",
      "pull-bridge/types.js",
    ];

    for (const file of requiredFiles) {
      expect(existsSync(join(repoRoot, "packages/aura3d-cli/dist", file)), file).toBe(true);
    }

    const cli = await importDistModule("../../../packages/aura3d-cli/dist/index.js");
    expectExportedFunction(cli, "addAsset");
    expectExportedFunction(cli, "validateAssets");
    expectExportedFunction(cli, "readRenderedProbeMetadata");

    const bridge = await importDistModule("../../../packages/aura3d-cli/dist/pull-bridge.js");
    expectExportedFunction(bridge, "scoreResolveCandidate");
    expectExportedFunction(bridge, "rankResolveCandidates");
    expectExportedFunction(bridge, "selectPullable");
    expectExportedFunction(bridge, "toResolveConstraints");
  });

  test("CLI dist validation rejects rendered-probe, role-quality, and AST bypass failures", async () => {
    const cli = await importDistModule("../../../packages/aura3d-cli/dist/index.js");
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "dist-fighter.gltf");
    writeFileSync(sourceFile, JSON.stringify(createGltfFixture()));
    writeFileSync(join(projectDir, "public", "aura-assets", "fake-fighter.probe.png"), "not-a-png");

    const probeJson = {
      renderedProbe: {
        url: "/aura-assets/fake-fighter.probe.png",
        kind: "browser-screenshot",
        renderer: "createAuraApp",
        route: "dist-package-fixture",
        sha256: `sha256-${"0".repeat(64)}`,
        assetHash: `sha256-${"1".repeat(64)}`,
        width: 640,
        height: 360,
        nonBlankPixels: 42,
        colorBuckets: 1,
        checkedAt: "2026-06-20T00:00:00.000Z",
        foregroundBounds: { x: 0, y: 0, width: 16, height: 16 },
      },
    };
    writeFileSync(join(projectDir, "fake-fighter.probe.json"), `${JSON.stringify(probeJson, null, 2)}\n`);
    const renderedProbe = exportedFunction(cli, "readRenderedProbeMetadata")({ projectDir, file: "fake-fighter.probe.json" });

    exportedFunction(cli, "addAsset")({
      projectDir,
      file: "assets/dist-fighter.gltf",
      name: "distFighter",
      sourcePage: "https://example.test/dist-fighter",
      downloadUrl: "https://example.test/dist-fighter.glb",
      sourceUrl: "https://example.test/dist-fighter",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-20T00:00:00.000Z",
      quality: "release",
      role: "product",
      suitabilityReason: "Release product viewer candidate with retained rendered probe evidence.",
      renderedProbe,
    });
    patchManifestAsset(projectDir, "distFighter", {
      materials: [],
      materialMetadata: [],
      textures: [],
      hierarchy: { nodeCount: 1, meshCount: 1, materialCount: 0, textureCount: 0, animationClipCount: 0, skinCount: 0, morphTargetCount: 0, rootNodeNames: ["Root"], maxDepth: 1, messages: [] },
    });
    writeFileSync(join(projectDir, "src", "main.ts"), "import { model } from \"@aura3d/engine\";\nmodel(\"distFighter\");\n");

    const report = objectRecord(exportedFunction(cli, "validateAssets")({ projectDir, release: true, source: true }));
    const warnings = arrayStrings(report["warnings"]).join("\n");

    expect(report["ok"]).toBe(false);
    expect(warnings).toContain("renderedProbe artifact is not PNG screenshot proof");
    expect(warnings).toContain("role-aware release product validation requires readable material evidence");
    expect(warnings).toContain("role-aware release product validation requires texture evidence");
    expect(arrayStrings(report["failures"]).join("\n")).toContain("raw model string id \"distFighter\"");
  });

  test("asset-index and root engine dist exports preserve package metadata contracts", async () => {
    const assetIndex = await importDistModule("../../../packages/asset-index/dist/index.js");
    expectExportedFunction(assetIndex, "normalizeLicense");
    expectExportedFunction(assetIndex, "scoreAsset");
    expectExportedFunction(assetIndex, "matchesConstraints");
    const adapter = searchableAdapter(
      exportedFunction(assetIndex, "createAuraIndexAdapter")({ searchUrl: "https://example.test/search", limit: 1 })
    );
    const assets = await adapter.search({ text: "robot" }, { fetchJson: async () => hostedCatalogFixture() });
    const firstAsset = assets[0];
    if (!firstAsset) throw new Error("Expected hosted catalog fixture to return one asset.");

    expect(firstAsset).toMatchObject({
      id: "objaverse:robot",
      sourcePage: "https://objaverse.example/robot",
      downloadUrl: "https://cdn.example/robot.glb",
      semanticScore: 0.91,
      workerScore: 0.82,
      qualityScore: 0.77,
      materialCount: 2,
      textureCount: 1,
      animationClipCount: 1,
      skinCount: 1,
      intendedRole: "character",
    });
    expect(exportedFunction(assetIndex, "scoreAsset")(firstAsset, "robot character")).toBeGreaterThan(0);
    expect(exportedFunction(assetIndex, "matchesConstraints")(firstAsset, { license: ["CC-BY"] })).toBe(true);

    const engine = importEnginePackageViaNode(repoRoot);
    expect(engine["createAuraApp"]).toBe("function");
    expect(engine["model"]).toBe("function");
    expect(engine["resolved"]).toContain("/dist/engine/agent-api/index.js");
  });

  test("built CLI bin exposes the public root-gate command surface", () => {
    const rootHelp = runCli("--help");
    const addHelp = runCli("assets", "add", "--help");

    expect(rootHelp).toContain("--rendered-probe-json");
    expect(rootHelp).toContain("--role character|vehicle|world|environment|track|product|weapon|prop|set-dressing|debug|abstract|unknown");
    expect(addHelp).toContain("--rendered-probe-json");
    expect(addHelp).toContain("--role character|vehicle|world|environment|track|product|weapon|prop|set-dressing|debug|abstract|unknown");
  });
});

function createProject(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "aura3d-package-dist-"));
  tempDirs.push(projectDir);
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  mkdirSync(join(projectDir, "public", "aura-assets"), { recursive: true });
  mkdirSync(join(projectDir, "src"), { recursive: true });
  return projectDir;
}

function createGltfFixture(): Record<string, unknown> {
  return {
    asset: { version: "2.0", extras: { aura3d: { orientation: { forwardAxis: "+z", upAxis: "+y" } } } },
    materials: [{ name: "body" }],
    meshes: [{ name: "Body", primitives: [{}] }],
    nodes: [{ name: "Root", mesh: 0 }],
    images: [{ uri: "data:image/png;base64,AA==" }],
    accessors: [{ min: [-1, 0, -1], max: [1, 2, 1] }],
  };
}

function patchManifestAsset(projectDir: string, id: string, patch: Record<string, unknown>): void {
  const manifestPath = join(projectDir, "aura.assets.json");
  const root = objectRecord(JSON.parse(readFileSync(manifestPath, "utf8")));
  const assets = arrayRecords(root["assets"]);
  root["assets"] = assets.map((asset) => asset["id"] === id ? { ...asset, ...patch } : asset);
  writeFileSync(manifestPath, `${JSON.stringify(root, null, 2)}\n`);
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected JSON object.");
  }
  return Object.fromEntries(Object.entries(value));
}

function arrayStrings(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error("Expected JSON array.");
  return value.map((entry) => {
    if (typeof entry !== "string") throw new Error("Expected string array entry.");
    return entry;
  });
}

function arrayRecords(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("Expected JSON array.");
  return value.map(objectRecord);
}

async function importDistModule(specifier: string): Promise<Record<string, unknown>> {
  return objectRecord(await import(specifier));
}

function expectExportedFunction(module: Record<string, unknown>, name: string): void {
  expect(module[name]).toBeTypeOf("function");
}

function exportedFunction(module: Record<string, unknown>, name: string): (...args: readonly unknown[]) => unknown {
  const value = module[name];
  if (!isUnknownFunction(value)) throw new Error(`Expected ${name} to be exported as a function.`);
  return value;
}

function isUnknownFunction(value: unknown): value is (...args: readonly unknown[]) => unknown {
  return typeof value === "function";
}

interface SearchableAdapter {
  search(
    query: Readonly<Record<string, unknown>>,
    options: { readonly fetchJson: () => Promise<Record<string, unknown>> }
  ): Promise<readonly Record<string, unknown>[]>;
}

function searchableAdapter(value: unknown): SearchableAdapter {
  if (!isSearchableAdapter(value)) {
    throw new Error("Expected asset-index adapter with search method.");
  }
  return value;
}

function isSearchableAdapter(value: unknown): value is SearchableAdapter {
  return typeof value === "object" && value !== null && "search" in value && typeof value.search === "function";
}

function hostedCatalogFixture(): Record<string, unknown> {
  return {
    results: [{
      id: "objaverse:robot",
      title: "Robot Character",
      source: "objaverse",
      url: "https://cdn.example/robot.glb",
      downloadUrl: "https://cdn.example/robot.glb",
      sourcePage: "https://objaverse.example/robot",
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      author: "Fixture Author",
      score: 0.91,
      workerScore: 0.82,
      qualityScore: 0.77,
      bounds: { size: [1, 2, 1] },
      triangleCount: 12000,
      meshCount: 3,
      materialCount: 2,
      textureCount: 1,
      animationClipCount: 1,
      skinCount: 1,
      morphTargetCount: 0,
      intendedRole: "character",
      roleSuitability: "Readable robot character with complete provenance.",
    }],
  };
}

function runCli(...args: readonly string[]): string {
  return execFileSync(process.execPath, [join(repoRoot, "packages/aura3d-cli/dist/cli.js"), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
