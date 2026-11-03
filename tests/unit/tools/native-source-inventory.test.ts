import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const {
  assertNativeSourceInventoryReady,
  createNativeSourceInventory,
  default: extraVitestConfig
} = await import(new URL("../../../tools/native-source-inventory/index.mjs", import.meta.url).href) as {
  assertNativeSourceInventoryReady: (inventory: any) => unknown;
  createNativeSourceInventory: (input: {
    manifest: any;
    expectedTestFiles: Record<string, string[]>;
    runId: string;
  }) => any;
  default: () => Promise<any>;
};

const { isSourceInput, sourceManifestInputDigest } = await import(
  new URL("../../../tools/release/source-identity.mjs", import.meta.url).href
) as {
  isSourceInput: (path: string) => boolean;
  sourceManifestInputDigest: (files: { path: string; sha256: string; mode: string; type: string }[]) => string;
};

const historical = "tests/unit/tools/historical-verdict.test.ts";
const replay = "tests/unit/aura-slam/replay.test.ts";
const codec = "tests/acceptance/gltf-external-decoder-fixtures.test.ts";
const scratchProbe = "tests/browser-probe/to-data-url.probe.spec.ts";
const scratchProbeSha256 = "e31ea093fb088eadbf9ab5c618c9ca8832009063a2099f5774788e622d741507";
const gameRuntimeTest = "tests/game-runtime/aura3d104-game-runtime-source.test.ts";
const gameRuntimeFixtures = [
  "tests/fixtures/game-runtime/browser-evidence.manifest.json",
  "tests/fixtures/game-runtime/command-gates.manifest.json",
  "tests/fixtures/game-runtime/runtime-evidence.manifest.json"
];
const gameRuntimeConfig = [
  "tools/native-source-inventory/index.mjs",
  "vitest.config.ts",
  "aura.exports.json"
];
const clashTest = "apps/aura-clash-showcase/tests/copy-boundary.test.mjs";
const clashPrerequisites = [
  "apps/aura-clash-showcase/index.html",
  "apps/aura-clash-showcase/src/main.ts",
  "apps/aura-clash-showcase/src/legacy/main.ts",
  "apps/aura-clash-showcase/src/legacy/playable/AuraClashArenaApp.ts",
  "apps/aura-clash-showcase/src/legacy/ui/TitleScreen.ts",
  "apps/aura-clash-showcase/src/v2/boot.ts"
];
const releaseTest = "tests/unit/release/muse301-publication-workflows.test.mjs";
const releasePrerequisites = [
  "tools/release/publish-all.mjs",
  "tools/release/exact-release-plan.mjs",
  "tools/release/release-inventory.mjs",
  "tools/release/final-review-approval.mjs",
  "tools/release/visual-review-manifest.mjs",
  "tools/release/source-identity.mjs"
];
const matrixIds = [
  "parity", "unit", "unit-dist", "unit-packed", "assets-qr",
  "integration", "packages", "packages-dist", "node-release"
];

function matrix(changes: Record<string, string[]> = {}) {
  return Object.assign(Object.fromEntries(matrixIds.map((id) => [id, []])), changes);
}

function manifest(paths: string[] = []) {
  const all = [...new Set([historical, replay, codec, ...paths])];
  return {
    schema: "aura3d.native-source-manifest/1",
    inputDigest: "a".repeat(64),
    files: all.map((path) => ({
      path,
      sha256: path === scratchProbe ? scratchProbeSha256 : "b".repeat(64),
      mode: "100644",
      type: "file"
    })),
    deferredAcceptanceTests: [{ path: historical, phase: "acceptance", status: "not-run" }],
    deferredReplayTests: { path: replay, phase: "acceptance", status: "not-run" },
    deferredExternalCodecTests: { path: codec, phase: "acceptance", status: "not-run" }
  };
}

function inventory(paths: string[], selected = matrix(), runId = "source-42") {
  return createNativeSourceInventory({ manifest: manifest(paths), expectedTestFiles: selected, runId });
}

describe("native source test inventory", () => {
  it("preserves matrix overlap and plans every reviewed supplemental family from staged paths", () => {
    const paths = [
      "tests/unit/parity/native.test.ts",
      "tests/unit/consumer-bundle/no-tla.test.ts",
      "tests/unit/tools/packed-consumer-check.test.ts",
      "tests/assets/loader.test.ts",
      "tests/integration/consumer.test.ts",
      "packages/assets/tests/assets.test.ts",
      "tools/release/archives.test.mjs",
      "apps/veer-wonder-world/tests/unit/runtime/beat-runner.test.ts",
      "apps/veer-wonder-world/vitest.config.ts",
      "tools/native-source-inventory/index.mjs",
      "vitest.config.ts",
      "aura.exports.json",
      "apps/showcase-cross-hop/tests/lanes.test.ts",
      "apps/showcase-cross-hop/vitest.config.ts",
      "apps/animation-studio-web/verify/wiring.test.cjs",
      "apps/animation-studio-web/src/state/backend.ts",
      "apps/animation-studio-web/src/state/mapDocument.ts",
      clashTest,
      ...clashPrerequisites,
      "tools/asset-optimize/tests/profiles.test.ts",
      "tools/asset-optimize/vitest.config.ts",
      "tests/cli-configs/install-meshy-mcp.test.mjs",
      "cli-configs/install-meshy-mcp.sh",
      "tests/cli-configs/meshy-agent.test.sh",
      "cli-configs/meshy-agent",
      "tests/unit/release/final-review-approval.test.mjs",
      releaseTest,
      ...releasePrerequisites,
      "tools/agent-templates/cli.test.mjs",
      "tests/templates/template-verification.test.ts",
      "tests/templates/vitest.config.ts",
      "tests/performance/ecs-entities-baseline.test.ts",
      "tests/performance/vitest.config.ts",
      "docs/prds/game-upgrades-47/lanes/wp36-decisions.test.mjs",
      "docs/prds/game-upgrades-47/lanes/wp36-decisions.mjs"
    ];
    const selected = matrix({
      parity: ["tests/unit/parity/native.test.ts"],
      unit: ["tests/unit/parity/native.test.ts"],
      "unit-dist": ["tests/unit/consumer-bundle/no-tla.test.ts"],
      "unit-packed": ["tests/unit/tools/packed-consumer-check.test.ts"],
      "assets-qr": ["tests/assets/loader.test.ts"],
      integration: ["tests/integration/consumer.test.ts"],
      packages: ["packages/assets/tests/assets.test.ts"],
      "packages-dist": ["packages/assets/tests/assets.test.ts"],
      "node-release": ["tools/release/archives.test.mjs"]
    });
    const result = inventory(paths, selected);
    expect(result.schema).toBe("aura3d.native-source-inventory/1");
    expect(result.inputDigest).toBe("a".repeat(64));
    expect(result.status).toBe("ready");
    expect(result.blockers).toEqual([]);
    expect(result.entries.find((entry: any) => entry.path === "tests/unit/parity/native.test.ts")).toMatchObject({
      classification: "source",
      checkIds: ["parity", "unit"]
    });
    expect(result.entries.find((entry: any) => entry.path === "packages/assets/tests/assets.test.ts").checkIds)
      .toEqual(["packages", "packages-dist"]);
    const byId = Object.fromEntries(result.supplementalChecks.map((check: any) => [check.id, check]));
    expect(Object.keys(byId).sort()).toEqual([
      "app-animation-studio-node", "app-clash-node", "app-cross-hop-vitest",
      "app-wonder-world-vitest", "asset-optimize-vitest", "cli-config-node",
      "cli-config-shell", "docs-game-upgrades-node", "node-release-unit",
      "performance-cpu-vitest", "template-node", "template-source-vitest"
    ]);
    expect(byId["app-wonder-world-vitest"]).toMatchObject({
      cwd: "apps/veer-wonder-world",
      runner: "vitest",
      expectedFiles: ["apps/veer-wonder-world/tests/unit/runtime/beat-runner.test.ts"],
      status: "not-run"
    });
    expect(byId["app-wonder-world-vitest"].invocations[0].argv).toEqual([
      "pnpm", "exec", "vitest", "run", "--config", "../../tools/native-source-inventory/index.mjs", "--maxWorkers=1",
      "--reporter=json",
      "--outputFile=../../tests/reports/native-capabilities/source-42/app-wonder-world-vitest.json",
      "tests/unit/runtime/beat-runner.test.ts"
    ]);
    expect(byId["asset-optimize-vitest"].invocations[0].argv.at(-1)).toBe("tests/profiles.test.ts");
    expect(byId["app-animation-studio-node"].invocations[0].argv).toEqual([
      "node", "--test", "--test-reporter=tap", "--test-concurrency=1",
      "apps/animation-studio-web/verify/wiring.test.cjs"
    ]);
    expect(byId["app-clash-node"].prerequisitePaths).toEqual([...clashPrerequisites].sort());
    expect(byId["node-release-unit"].prerequisitePaths).toEqual([...releasePrerequisites].sort());
    expect(byId["cli-config-shell"].invocations[0].argv)
      .toEqual(["bash", "tests/cli-configs/meshy-agent.test.sh"]);
    expect(byId["performance-cpu-vitest"].execution).toBe("remote-only");
    expect(() => assertNativeSourceInventoryReady(result)).not.toThrow();
    expect(result.entries.every((entry: any) => entry.reason && entry.sha256)).toBe(true);
  });

  it("is deterministic across manifest and matrix ordering and never infers a fixed test count", () => {
    const paths = [
      "tests/unit/b.test.ts",
      "tests/unit/a.test.ts",
      "apps/veer-wonder-world/tests/unit/runtime/turn-taking.test.ts",
      "apps/veer-wonder-world/tests/unit/runtime/beat-runner.test.ts",
      "tools/native-source-inventory/index.mjs",
      "vitest.config.ts",
      "aura.exports.json"
    ];
    const first = inventory(paths, matrix({ unit: ["tests/unit/b.test.ts", "tests/unit/a.test.ts"] }));
    const second = inventory([...paths].reverse(), matrix({ unit: ["tests/unit/a.test.ts", "tests/unit/b.test.ts"] }));
    expect(first).toEqual(second);
    expect(first.supplementalChecks[0].expectedFiles).toEqual([
      "apps/veer-wonder-world/tests/unit/runtime/beat-runner.test.ts",
      "apps/veer-wonder-world/tests/unit/runtime/turn-taking.test.ts"
    ]);
    const next = inventory([...paths, "apps/veer-wonder-world/tests/unit/runtime/new.test.ts"], matrix({
      unit: ["tests/unit/b.test.ts", "tests/unit/a.test.ts"]
    }));
    expect(next.supplementalChecks[0].expectedFiles).toContain("apps/veer-wonder-world/tests/unit/runtime/new.test.ts");
  });

  it("separates declared deferrals, browser acceptance, archive, scratch, unknown, and snapshot artifacts", () => {
    const paths = [
      "tests/browser/native-lifecycle.spec.ts",
      "tests/qr/prd06/browser/animated-character-browser.spec.ts",
      "tests/game-runtime/keyboard-operation-browser.spec.ts",
      "packages/create-aura3d/templates/mini-game/tests/playable.spec.ts",
      "templates/mini-game/tests/screenshot.spec.ts",
      "docs/agents/samples/coin-dash/coin-dash.spec.ts",
      "archive/legacy-ai-runtime/tests/old.test.ts",
      "tests/qr/prd15/__snapshots__/example.test.ts.snap",
      scratchProbe,
      "some-new-area/surprise.test.ts"
    ];
    const result = inventory(paths);
    const entries = Object.fromEntries(result.entries.map((entry: any) => [entry.path, entry]));
    for (const path of [
      historical, replay, codec, "tests/browser/native-lifecycle.spec.ts",
      "tests/qr/prd06/browser/animated-character-browser.spec.ts",
      "tests/game-runtime/keyboard-operation-browser.spec.ts",
      "packages/create-aura3d/templates/mini-game/tests/playable.spec.ts",
      "templates/mini-game/tests/screenshot.spec.ts",
      "docs/agents/samples/coin-dash/coin-dash.spec.ts"
    ]) expect(entries[path].classification, path).toBe("acceptance");
    expect(entries[codec].reason).toMatch(/codec/i);
    expect(entries[replay].reason).toMatch(/replay/i);
    expect(entries["archive/legacy-ai-runtime/tests/old.test.ts"].classification).toBe("archived");
    expect(entries[scratchProbe].classification).toBe("scratch");
    expect(entries[scratchProbe].reason).toMatch(/Playwright.*machine-specific.*file:.*logs.*no assertions/i);
    expect(entries[scratchProbe].checkIds).toEqual([]);
    expect(entries["some-new-area/surprise.test.ts"].classification).toBe("unknown");
    expect(entries["tests/qr/prd15/__snapshots__/example.test.ts.snap"]).toBeUndefined();
    expect(result.status).toBe("blocked");
    expect(() => assertNativeSourceInventoryReady(result)).toThrow(/some-new-area\/surprise\.test\.ts/);
  });

  it("excludes only the inspected scratch probe bytes and fails closed if they or neighboring probes change", () => {
    const source = readFileSync(new URL("../../browser-probe/to-data-url.probe.spec.ts", import.meta.url), "utf8");
    expect(createHash("sha256").update(source).digest("hex")).toBe(scratchProbeSha256);
    expect(source).toContain("file:///private/tmp/");
    expect(source).toMatch(/console\.log/);
    expect(source).not.toMatch(/\bexpect\s*\(/);

    const reviewed = inventory([scratchProbe]);
    expect(reviewed.status).toBe("ready");
    expect(reviewed.entries.find((entry: any) => entry.path === scratchProbe)).toMatchObject({
      classification: "scratch",
      sha256: scratchProbeSha256,
      checkIds: []
    });
    expect(reviewed.supplementalChecks).toEqual([]);

    const changed = manifest([scratchProbe]);
    changed.files.find((entry) => entry.path === scratchProbe)!.sha256 = "c".repeat(64);
    const unreviewed = createNativeSourceInventory({ manifest: changed, expectedTestFiles: matrix(), runId: "source-42" });
    expect(unreviewed.entries.find((entry: any) => entry.path === scratchProbe).classification).toBe("unknown");
    expect(unreviewed.status).toBe("blocked");
    expect(() => assertNativeSourceInventoryReady(unreviewed)).toThrow(/to-data-url\.probe\.spec\.ts/);

    const symlink = manifest([scratchProbe]);
    symlink.files.find((entry) => entry.path === scratchProbe)!.type = "symlink";
    const unsafe = createNativeSourceInventory({ manifest: symlink, expectedTestFiles: matrix(), runId: "source-42" });
    expect(unsafe.entries.find((entry: any) => entry.path === scratchProbe).classification).toBe("unknown");
    expect(unsafe.status).toBe("blocked");

    const misdeclared = manifest([scratchProbe]);
    misdeclared.deferredAcceptanceTests.push({ path: scratchProbe, phase: "acceptance", status: "not-run" });
    expect(() => createNativeSourceInventory({
      manifest: misdeclared,
      expectedTestFiles: matrix(),
      runId: "source-42"
    })).toThrow(/scratch probe cannot be declared as acceptance/);

    const otherProbe = "tests/browser-probe/other.probe.spec.ts";
    const neighbor = inventory([scratchProbe, otherProbe]);
    expect(neighbor.entries.find((entry: any) => entry.path === otherProbe).classification).toBe("unknown");
    expect(neighbor.status).toBe("blocked");
    expect(() => assertNativeSourceInventoryReady(neighbor)).toThrow(/other\.probe\.spec\.ts/);
  });

  it("fails closed for unreviewed suffixes and new node, shell, or browser families", () => {
    const result = inventory([
      "tests/unit/release/new.test.mjs",
      "tests/cli-configs/new.test.sh",
      "tools/new-tool/unknown.test.cjs",
      "tests/unit/forgotten.test.ts",
      "tests/new-surface/example.spec.ts",
      "tests/new-surface/example.test.py"
    ]);
    expect(result.status).toBe("blocked");
    expect(result.entries.filter((entry: any) => entry.classification === "unknown").map((entry: any) => entry.path))
      .toEqual([
        "tests/cli-configs/new.test.sh",
        "tests/new-surface/example.spec.ts",
        "tests/new-surface/example.test.py",
        "tests/unit/forgotten.test.ts",
        "tests/unit/release/new.test.mjs",
        "tools/new-tool/unknown.test.cjs"
      ]);
    expect(result.supplementalChecks).toEqual([]);
  });

  it("keeps the game-runtime file source-required and reports missing staged requirement fixtures", () => {
    const result = inventory([gameRuntimeTest, ...gameRuntimeConfig]);
    const entry = result.entries.find((item: any) => item.path === gameRuntimeTest);
    expect(entry).toMatchObject({ classification: "source", checkIds: ["game-runtime-vitest"] });
    const check = result.supplementalChecks.find((item: any) => item.id === "game-runtime-vitest");
    expect(check.invocations[0].argv).toEqual([
      "pnpm", "exec", "vitest", "run", "--config", "tools/native-source-inventory/index.mjs",
      "--maxWorkers=1", "--reporter=json",
      "--outputFile=tests/reports/native-capabilities/source-42/game-runtime-vitest.json",
      gameRuntimeTest
    ]);
    expect(check.missingPrerequisitePaths).toEqual(gameRuntimeFixtures);
    expect(result.status).toBe("blocked");
    expect(() => assertNativeSourceInventoryReady(result)).toThrow(/browser-evidence\.manifest\.json/);
  });

  it("binds every game-runtime requirement fixture to the staged source identity", () => {
    const staged = manifest([gameRuntimeTest, ...gameRuntimeConfig, ...gameRuntimeFixtures]);
    staged.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    staged.inputDigest = sourceManifestInputDigest(staged.files);
    const result = createNativeSourceInventory({ manifest: staged, expectedTestFiles: matrix(), runId: "source-42" });
    const check = result.supplementalChecks.find((item: any) => item.id === "game-runtime-vitest");
    expect(check.missingPrerequisitePaths).toEqual([]);
    expect(check.prerequisitePaths).toEqual([...gameRuntimeConfig, ...gameRuntimeFixtures].sort());
    expect(result.inputDigest).toBe(staged.inputDigest);
    expect(result.status).toBe("ready");

    for (const fixture of gameRuntimeFixtures) {
      expect(isSourceInput(fixture)).toBe(true);
      const absent = structuredClone(staged);
      absent.files = absent.files.filter((entry) => entry.path !== fixture);
      absent.inputDigest = sourceManifestInputDigest(absent.files);
      const missing = createNativeSourceInventory({ manifest: absent, expectedTestFiles: matrix(), runId: "source-42" });
      expect(missing.status).toBe("blocked");
      expect(missing.supplementalChecks[0].missingPrerequisitePaths).toEqual([fixture]);
      expect(() => assertNativeSourceInventoryReady(missing)).toThrow(fixture);
      expect(absent.inputDigest).not.toBe(staged.inputDigest);

      const changed = structuredClone(staged);
      changed.files.find((entry) => entry.path === fixture)!.sha256 = "c".repeat(64);
      changed.inputDigest = sourceManifestInputDigest(changed.files);
      expect(changed.inputDigest).not.toBe(staged.inputDigest);
      expect(createNativeSourceInventory({ manifest: changed, expectedTestFiles: matrix(), runId: "source-42" }).inputDigest)
        .toBe(changed.inputDigest);
    }
    expect(isSourceInput("tests/reports/game-runtime/browser-evidence.manifest.json")).toBe(false);
  });

  it.each([
    { testPath: clashTest, checkId: "app-clash-node", prerequisites: clashPrerequisites },
    { testPath: releaseTest, checkId: "node-release-unit", prerequisites: releasePrerequisites }
  ])("binds exactly the staged $checkId contract inputs and blocks every missing path", ({ testPath, checkId, prerequisites }) => {
    const staged = manifest([testPath, ...prerequisites]);
    for (const path of prerequisites) {
      expect(isSourceInput(path), path).toBe(true);
      staged.files.find((entry) => entry.path === path)!.sha256 = createHash("sha256")
        .update(readFileSync(new URL(`../../../${path}`, import.meta.url)))
        .digest("hex");
    }
    staged.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    staged.inputDigest = sourceManifestInputDigest(staged.files);
    const result = createNativeSourceInventory({ manifest: staged, expectedTestFiles: matrix(), runId: "source-42" });
    expect(result.status).toBe("ready");
    expect(result.blockers).toEqual([]);
    expect(result.inputDigest).toBe(staged.inputDigest);
    expect(result.entries.find((entry: any) => entry.path === testPath)).toMatchObject({
      classification: "source",
      checkIds: [checkId]
    });
    const check = result.supplementalChecks.find((item: any) => item.id === checkId);
    expect(check).toMatchObject({
      runner: "node-test",
      cwd: ".",
      expectedFiles: [testPath],
      prerequisitePaths: [...prerequisites].sort(),
      missingPrerequisitePaths: [],
      execution: "remote-only"
    });
    expect(check.invocations).toEqual([{
      file: testPath,
      argv: ["node", "--test", "--test-reporter=tap", "--test-concurrency=1", testPath]
    }]);
    expect(() => assertNativeSourceInventoryReady(result)).not.toThrow();

    const none = inventory([testPath]);
    expect(none.status).toBe("blocked");
    expect(none.supplementalChecks[0].missingPrerequisitePaths).toEqual([...prerequisites].sort());
    expect(none.blockers.map((blocker: any) => blocker.path)).toEqual([...prerequisites].sort());

    for (const path of prerequisites) {
      const absent = structuredClone(staged);
      absent.files = absent.files.filter((entry) => entry.path !== path);
      absent.inputDigest = sourceManifestInputDigest(absent.files);
      const missing = createNativeSourceInventory({ manifest: absent, expectedTestFiles: matrix(), runId: "source-42" });
      expect(missing.status, path).toBe("blocked");
      expect(missing.supplementalChecks[0].missingPrerequisitePaths).toEqual([path]);
      expect(missing.blockers).toMatchObject([{ code: "MISSING_PREREQUISITE", path, checkId }]);
      expect(() => assertNativeSourceInventoryReady(missing)).toThrow(path);
      expect(absent.inputDigest).not.toBe(staged.inputDigest);

      const changed = structuredClone(staged);
      const changedEntry = changed.files.find((entry) => entry.path === path)!;
      changedEntry.sha256 = changedEntry.sha256 === "c".repeat(64) ? "d".repeat(64) : "c".repeat(64);
      changed.inputDigest = sourceManifestInputDigest(changed.files);
      expect(changed.inputDigest).not.toBe(staged.inputDigest);
      expect(createNativeSourceInventory({ manifest: changed, expectedTestFiles: matrix(), runId: "source-42" }).inputDigest)
        .toBe(changed.inputDigest);
    }

    const unknownPath = "tests/unreviewed/new.test.mjs";
    const unknown = inventory([testPath, ...prerequisites, unknownPath]);
    expect(unknown.status).toBe("blocked");
    expect(unknown.blockers).toMatchObject([{ code: "UNKNOWN_TEST", path: unknownPath }]);
    expect(() => assertNativeSourceInventoryReady(unknown)).toThrow(unknownPath);
  });

  it("does not confuse the static live-smoke workflow contract with a live service test", () => {
    const path = "tests/cli-configs/meshy-live-smoke-workflow.test.mjs";
    const result = inventory([path, ".github/workflows/meshy-live-smoke.yml"]);
    const entry = result.entries.find((item: any) => item.path === path);
    expect(entry.classification).toBe("source");
    expect(entry.reason).toMatch(/static/i);
    expect(result.status).toBe("ready");
  });

  it("fails before running the static CLI contract when its text input is unstaged", () => {
    const result = inventory([
      "tests/cli-configs/meshy-docs-skill.test.mjs",
      "docs/meshy-cli.md",
      "cli-configs/install-meshy-mcp.sh"
    ]);
    expect(result.status).toBe("blocked");
    expect(result.blockers.map((blocker: any) => blocker.path)).toEqual([
      ".cursor/skills/meshy-cli/SKILL.md"
    ]);
    expect(() => assertNativeSourceInventoryReady(result)).toThrow(/SKILL\.md/);
  });

  it("rejects undeclared matrix files, duplicates, unsafe paths, bad run IDs and missing deferred data", () => {
    expect(() => inventory([], matrix({ unit: ["tests/unit/missing.test.ts"] }))).toThrow(/not staged|manifest/i);
    expect(() => inventory(["tests/unit/a.test.ts"], matrix({ unit: ["tests/unit/a.test.ts", "tests/unit/a.test.ts"] })))
      .toThrow(/duplicate/i);
    expect(() => inventory(["../escape.test.ts"])).toThrow(/unsafe|invalid/i);
    expect(() => inventory(["C:\\escape.test.ts"])).toThrow(/unsafe|invalid/i);
    expect(() => inventory([], matrix(), "../bad")).toThrow(/run.?id/i);
    const duplicated = manifest([]);
    duplicated.files.push({ ...duplicated.files[0] });
    expect(() => createNativeSourceInventory({ manifest: duplicated, expectedTestFiles: matrix(), runId: "r1" }))
      .toThrow(/duplicate/i);
    const missing = manifest([]);
    delete (missing as any).deferredAcceptanceTests;
    expect(() => createNativeSourceInventory({ manifest: missing, expectedTestFiles: matrix(), runId: "r1" }))
      .toThrow(/deferred/i);
    expect(() => createNativeSourceInventory({ manifest: manifest([]), expectedTestFiles: {}, runId: "r1" }))
      .toThrow(/matrix|expected/i);
  });

  it("rejects a deferred or browser test that the source matrix also selects", () => {
    expect(() => inventory([], matrix({ unit: [historical] }))).toThrow(/acceptance|deferred/i);
    const path = "tests/qr/prd06/browser/surprise.test.ts";
    expect(() => inventory([path], matrix({ "assets-qr": [path] }))).toThrow(/browser|acceptance/i);
  });

  it("provides a source-alias Vitest config that actually includes the missing game-runtime family", async () => {
    const config = await extraVitestConfig();
    expect(config.test.include).toContain("tests/game-runtime/**/*.test.ts");
    expect(config.test.include).toContain("tests/unit/**/*.test.ts");
    expect(config.test.server.deps.inline).toBeTruthy();
    expect(config.resolve.alias.some((alias: any) => alias.find === "@aura3d/engine")).toBe(true);
  });
});
