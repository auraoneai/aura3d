import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectDependencyGraph, parsePnpmLock } from "../../../tools/native-runtime-audit/dependency-graph.js";
import { installProfileInventory, packedConsumerProfiles } from "../../../tools/native-runtime-audit/index.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("native dependency graph", () => {
  it("inventories direct, optional, peer, aliases, overrides, transitive and bound peer edges without substring matches", () => {
    const root = fixture();
    writeJson(root, "package.json", {
      name: "consumer",
      dependencies: { alias: "npm:three@^1.0.0", "three-helper": "1.0.0", utility: "1.0.0" },
      devDependencies: { babylonjs: "2.0.0" },
      optionalDependencies: { render: "npm:playcanvas@1.0.0" },
      peerDependencies: { three: "^1.0.0" },
      peerDependenciesMeta: { three: { optional: true } },
      pnpm: { overrides: { "utility>alias": "npm:three@1.2.0" } },
      description: "A mention of an engine is not a dependency"
    });
    write(root, "pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n  - '!packages/excluded'\noverrides:\n  'utility>tool': npm:three@1.2.0\n");
    writeJson(root, "packages/one/package.json", { name: "@example/one", dependencies: { utility: "1.0.0" } });
    writeJson(root, "packages/excluded/package.json", { name: "excluded", dependencies: { playcanvas: "1.0.0" } });
    write(root, "pnpm-lock.yaml", LOCK);

    const report = collectDependencyGraph(root);
    const edges = report.edges;
    expect(report.manifests.map((manifest) => manifest.path)).toEqual(["package.json", "packages/one/package.json"]);
    expect(edges).toContainEqual(expect.objectContaining({ source: "manifest", field: "dependencies", name: "alias", resolvedName: "three", alias: true }));
    expect(edges).toContainEqual(expect.objectContaining({ source: "manifest", field: "optionalDependencies", name: "render", resolvedName: "playcanvas", optional: true }));
    expect(edges).toContainEqual(expect.objectContaining({ source: "manifest", field: "peerDependencies", name: "three", optional: true }));
    expect(edges).toContainEqual(expect.objectContaining({ source: "override", name: "alias", resolvedName: "three", alias: true }));
    expect(edges).toContainEqual(expect.objectContaining({ source: "lock-importer", name: "alias", resolvedName: "three", resolution: "three@1.2.0" }));
    expect(edges).toContainEqual(expect.objectContaining({ source: "lock-snapshot", owner: "utility@1.0.0(three@1.2.0)", field: "dependencies", name: "three" }));
    expect(edges).toContainEqual(expect.objectContaining({ source: "lock-snapshot", field: "peerBindings", name: "three" }));
    expect(edges).toContainEqual(expect.objectContaining({ source: "lock-package", field: "peerDependencies", name: "three", optional: true }));
    expect(edges).toContainEqual(expect.objectContaining({ source: "lock-snapshot", field: "transitivePeerDependencies", name: "three" }));
    expect(edges).toContainEqual(expect.objectContaining({ source: "lock-package", field: "packageIdentity", name: "three" }));
    expect(report.findings.every(({ name }) => name !== "three-helper")).toBe(true);
    expect(report.files.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true);
    expect(report.limitations.join(" ")).toContain("does not establish independent authorship");
  });

  it("projects an unlocked profile onto the root lock and workspace importers, transitively", () => {
    const root = fixture();
    writeJson(root, "package.json", { name: "root", devDependencies: { bundler: "^2.0.0" } });
    write(root, "pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n");
    writeJson(root, "packages/engine/package.json", { name: "@example/engine", dependencies: { "@example/math": "workspace:*", helper: "1.0.0" } });
    writeJson(root, "packages/math/package.json", { name: "@example/math" });
    write(root, "pnpm-lock.yaml", [
      "lockfileVersion: '9.0'",
      "importers:",
      "  .:",
      "    devDependencies:",
      "      bundler:",
      "        specifier: ^2.0.0",
      "        version: 2.1.0",
      "  packages/engine:",
      "    dependencies:",
      "      '@example/math':",
      "        specifier: workspace:*",
      "        version: link:../math",
      "      helper:",
      "        specifier: 1.0.0",
      "        version: 1.0.0(peer@3.0.0)",
      "  packages/math: {}",
      "packages:",
      "  bundler@2.1.0: {}",
      "  helper@1.0.0: {}",
      "  leaf@1.0.0: {}",
      "  three@1.2.0: {}",
      "snapshots:",
      "  bundler@2.1.0:",
      "    dependencies:",
      "      leaf: 1.0.0",
      "  helper@1.0.0(peer@3.0.0):",
      "    dependencies:",
      "      leaf: 1.0.0",
      "    optionalDependencies:",
      "      renderer: three@1.2.0",
      "  leaf@1.0.0: {}",
      "  three@1.2.0: {}",
      ""
    ].join("\n"));
    writeJson(root, "templates/scaffold/package.json", {
      name: "scaffold",
      dependencies: { "@example/engine": "5.0.0" },
      devDependencies: { bundler: "^2.0.0", missing: "^9.0.0" },
      peerDependencies: { optionalPeer: "^1.0.0" },
      peerDependenciesMeta: { optionalPeer: { optional: true } }
    });
    writeJson(root, "templates/clean/package.json", { name: "clean", dependencies: { "@example/math": "5.0.0" } });

    const report = collectDependencyGraph(root, { installProfiles: ["templates/scaffold", "templates/clean"] });
    const [scaffold, clean] = report.projectedProfiles!;
    expect(scaffold).toMatchObject({ path: "templates/scaffold", resolution: "workspace-lock-projection", complete: false, prohibited: ["three"] });
    expect(scaffold!.nodes).toEqual(["bundler@2.1.0", "helper@1.0.0(peer@3.0.0)", "importer:packages/engine", "importer:packages/math", "leaf@1.0.0", "three@1.2.0"]);
    expect(scaffold!.unresolved).toEqual([{ owner: "templates/scaffold", name: "missing", specifier: "^9.0.0" }]);
    expect(clean).toMatchObject({ path: "templates/clean", nodes: ["importer:packages/math"], unresolved: [], prohibited: [], complete: true });
    expect(report.findings).toContainEqual(expect.objectContaining({ name: "three", disposition: "projected-dependency" }));
    expect(report.limitations.join(" ")).toContain("workspace-lock projection");
  });

  it("scans every install profile, packed consumer profiles, and records external comparison harnesses as excluded", () => {
    const root = fixture();
    writeJson(root, "package.json", { name: "root" });
    write(root, "pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n");
    writeJson(root, "packages/engine/package.json", { name: "@example/engine", dependencies: { helper: "1.0.0" } });
    write(root, "pnpm-lock.yaml", [
      "lockfileVersion: '9.0'", "importers:", "  .: {}", "  packages/engine:", "    dependencies:", "      helper:",
      "        specifier: 1.0.0", "        version: 1.0.0", "packages:", "  helper@1.0.0: {}", "snapshots:", "  helper@1.0.0: {}", ""
    ].join("\n"));
    write(root, "packages/create-aura3d/src/index.ts", 'export const CREATE_AURA3D_TEMPLATES = ["starter"] as const;\n');
    writeJson(root, "packages/create-aura3d/templates/starter/package.json", { name: "starter", dependencies: { "@example/engine": "5.0.0" } });
    writeJson(root, "packages/create-aura3d/templates/retired/package.json", { name: "retired", dependencies: { "@example/engine": "5.0.0" } });
    writeJson(root, "templates/vanilla/package.json", { name: "vanilla", dependencies: { "@example/engine": "5.0.0" } });
    writeJson(root, "apps/game/package.json", { name: "game", dependencies: { "@example/engine": "5.0.0" } });
    mkdirSync(join(root, "apps/no-manifest"), { recursive: true });
    writeJson(root, "apps/showcase-kits/package.json", { name: "kits", dependencies: { three: "0.180.0" } });
    writeJson(root, "benchmarks/threejs/package.json", { name: "bench-three", dependencies: { three: "0.180.0" } });
    writeJson(root, "benchmarks/babylon/package.json", { name: "bench-babylon", dependencies: { "@babylonjs/core": "8.0.0" } });
    writeJson(root, "marketing/package.json", { name: "site", dependencies: { "@example/engine": "5.0.0" } });

    const inventory = installProfileInventory(root);
    expect(inventory.profiles).toEqual(["packages/create-aura3d/templates/starter", "packages/create-aura3d/templates/retired",
      "templates/vanilla", "apps/game", "marketing"]);
    expect(inventory.externalHarnesses).toEqual(["apps/showcase-kits", "benchmarks/babylon", "benchmarks/threejs"]);

    const consumers = packedConsumerProfiles([{ id: "npm-a" }, { id: "pnpm-b" }], (cell) => ({ name: `consumer-${cell.id}`,
      dependencies: { "@example/engine": "file:./tarballs/engine.tgz", ...(cell.id === "pnpm-b" ? { extra: "npm:three@1.0.0" } : {}) } }));
    const report = collectDependencyGraph(root, { installProfiles: inventory.profiles, externalHarnesses: inventory.externalHarnesses, virtualProfiles: consumers });
    expect(report.installProfiles.map((profile) => profile.path)).toEqual([".", ...inventory.profiles, "packed-consumer/npm-a", "packed-consumer/pnpm-b"]);
    expect(report.projectedProfiles!.find((profile) => profile.path === "packed-consumer/npm-a"))
      .toMatchObject({ nodes: ["helper@1.0.0", "importer:packages/engine"], prohibited: [], complete: true });
    // An engine reaching a packed consumer profile is a finding, attributed to that profile.
    expect(report.findings).toContainEqual(expect.objectContaining({ name: "three", disposition: "declared-dependency",
      edge: expect.objectContaining({ owner: "packed-consumer/pnpm-b/package.json", alias: true }) }));
    expect(report.findings.filter((finding) => finding.edge.owner.startsWith("apps/showcase-kits") || finding.edge.owner.startsWith("benchmarks"))).toEqual([]);
    expect(report.externalHarnesses).toEqual([
      { path: "apps/showcase-kits", declaredEngines: ["three"], workspaceMember: false, locked: false },
      { path: "benchmarks/babylon", declaredEngines: ["@babylonjs/core"], workspaceMember: false, locked: false },
      { path: "benchmarks/threejs", declaredEngines: ["three"], workspaceMember: false, locked: false }
    ]);
    // Without the engine-bearing consumer, every shipped profile is engine-free.
    const clean = collectDependencyGraph(root, { installProfiles: inventory.profiles, externalHarnesses: inventory.externalHarnesses, virtualProfiles: consumers.slice(0, 1) });
    expect(clean.findings).toEqual([]);

    // A harness may never be a shipped profile, nor be installed by the workspace.
    expect(() => collectDependencyGraph(root, { installProfiles: ["benchmarks/threejs"], externalHarnesses: ["benchmarks/threejs"] })).toThrow(/may not also be an install profile/);
    write(root, "pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n  - 'benchmarks/*'\n");
    const installed = collectDependencyGraph(root, { externalHarnesses: ["benchmarks/threejs"] });
    expect(installed.findings).toContainEqual(expect.objectContaining({ name: "three", disposition: "harness-installed" }));
  });

  it("accepts npm lock link targets outside the project (local file: dependencies) but not escaping install paths", () => {
    const root = fixture();
    writeJson(root, "package.json", { name: "root" });
    write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
    writeJson(root, "apps/local/package.json", { name: "local", dependencies: { "@example/engine": "file:../.." } });
    const lock = { name: "local", lockfileVersion: 3, packages: {
      "": { name: "local", dependencies: { "@example/engine": "file:../.." } },
      "../..": { name: "@example/engine", version: "1.0.0", dependencies: { three: "1.0.0" } },
      "node_modules/@example/engine": { resolved: "../..", link: true }
    } };
    writeJson(root, "apps/local/package-lock.json", lock);
    const report = collectDependencyGraph(root, { installProfiles: ["apps/local"] });
    expect(report.npmLockPackages.map((item) => [item.path, item.name])).toContainEqual(["../..", "@example/engine"]);
    expect(report.findings).toContainEqual(expect.objectContaining({ name: "three", disposition: "lock-review" }));
    writeJson(root, "apps/local/package-lock.json", { ...lock, packages: { ...lock.packages, "../node_modules/x": { version: "1.0.0" } } });
    expect(() => collectDependencyGraph(root, { installProfiles: ["apps/local"] })).toThrow(/Unsafe npm lock package path/);
  });

  it("inspects every file and nested package manifest in a supplied packed payload without extracting it", () => {
    const root = fixture();
    writeJson(root, "package.json", { name: "consumer" });
    write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
    writeJson(root, "stage/package/package.json", { name: "consumer", dependencies: { alias: "npm:three@1.2.0" } });
    writeJson(root, "stage/package/node_modules/three/package.json", { name: "three", version: "1.2.0" });
    write(root, "stage/package/dist/index.js", "export const answer = 42;\n");
    const archive = join(root, "candidate.tgz");
    execFileSync("tar", ["-czf", archive, "-C", join(root, "stage"), "package"]);

    const report = collectDependencyGraph(root, { payloads: [archive] });
    expect(report.payloadEntries.map((entry) => entry.path)).toContain("package/dist/index.js");
    expect(report.payloadEntries.map((entry) => entry.path)).toContain("package/node_modules/three/package.json");
    expect(report.findings).toContainEqual(expect.objectContaining({ name: "three", edge: expect.objectContaining({ source: "payload", field: "packageIdentity" }) }));
    expect(report.findings).toContainEqual(expect.objectContaining({ name: "three", edge: expect.objectContaining({ source: "payload", name: "alias", alias: true }) }));
    expect(report.files.some((file) => file.path === "candidate.tgz" && file.kind === "payload")).toBe(true);
  });

  it("inventories standalone npm lockfiles including alias identities, peers and optional transitive edges", () => {
    const root = fixture();
    writeJson(root, "package.json", { name: "root" });
    write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
    writeJson(root, "templates/example/package.json", { name: "example", dependencies: { renderer: "npm:three@1.0.0" } });
    writeJson(root, "templates/example/package-lock.json", {
      name: "example", lockfileVersion: 3,
      packages: {
        "": { name: "example", dependencies: { renderer: "npm:three@1.0.0" } },
        "node_modules/renderer": { name: "three", version: "1.0.0", resolved: "https://user:secret@registry.example/three.tgz?token=secret", peerDependencies: { playcanvas: "^1" }, peerDependenciesMeta: { playcanvas: { optional: true } } },
        "node_modules/utility": { version: "1.0.0", optionalDependencies: { three: "1.0.0" } }
      }
    });
    writeJson(root, "templates/unlocked/package.json", { name: "unlocked" });
    const report = collectDependencyGraph(root, { installProfiles: ["templates/example", "templates/unlocked"] });

    expect(report.installProfiles).toContainEqual({ path: "templates/example", lockfile: "templates/example/package-lock.json", lockVersion: "npm:3" });
    expect(report.installProfiles).toContainEqual({ path: "templates/unlocked", lockfile: null, lockVersion: null });
    expect(report.findings).toContainEqual(expect.objectContaining({ name: "three", disposition: "lock-review", edge: expect.objectContaining({ source: "npm-lock-package", field: "packageIdentity", name: "renderer", resolvedName: "three", alias: true }) }));
    expect(report.findings).toContainEqual(expect.objectContaining({ name: "playcanvas", edge: expect.objectContaining({ source: "npm-lock-package", field: "peerDependencies", optional: true }) }));
    expect(report.findings).toContainEqual(expect.objectContaining({ name: "three", edge: expect.objectContaining({ source: "npm-lock-package", field: "optionalDependencies", optional: true }) }));
    expect(JSON.stringify(report)).not.toContain("secret");
  });

  it("records package extensions, named catalogs and bundled dependencies as graph edges", () => {
    const root = fixture();
    writeJson(root, "package.json", {
      name: "root", dependencies: { embedded: "npm:three@1.0.0" }, bundledDependencies: ["embedded"],
      pnpm: { packageExtensions: { "utility@1": { peerDependencies: { playcanvas: "^1" }, peerDependenciesMeta: { playcanvas: { optional: true } } } } }
    });
    write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
    write(root, "pnpm-workspace.yaml", `packages: []
packageExtensions:
  'utility@1':
    optionalDependencies:
      engineAlias: npm:three@1.0.0
    peerDependencies:
      playcanvas: ^1
    peerDependenciesMeta:
      playcanvas:
        optional: true
catalogs:
  graphics:
    engine: npm:three@1.0.0
`);
    const report = collectDependencyGraph(root);
    expect(report.edges).toContainEqual(expect.objectContaining({ field: "bundledDependencies", name: "embedded", resolvedName: "three" }));
    expect(report.edges).toContainEqual(expect.objectContaining({ owner: "pnpm-workspace.yaml:packageExtensions>utility@1", field: "optionalDependencies", name: "engineAlias", resolvedName: "three", optional: true }));
    expect(report.edges).toContainEqual(expect.objectContaining({ owner: "pnpm-workspace.yaml:packageExtensions>utility@1", field: "peerDependencies", name: "playcanvas", optional: true }));
    expect(report.edges).toContainEqual(expect.objectContaining({ owner: "pnpm-workspace.yaml:catalogs>graphics", field: "catalog", name: "engine", resolvedName: "three" }));
    expect(report.edges).toContainEqual(expect.objectContaining({ owner: "package.json:pnpm.packageExtensions>utility@1", field: "peerDependencies", name: "playcanvas", optional: true }));
  });

  it("fails closed on symlink entries, unknown lockfile versions and unsupported dependency syntax", () => {
    const root = fixture();
    writeJson(root, "package.json", { name: "consumer" });
    write(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
    writeJson(root, "stage/package/package.json", { name: "consumer" });
    symlinkSync("/does-not-need-to-exist", join(root, "stage/package/link"));
    execFileSync("tar", ["-czf", join(root, "unsafe.tgz"), "-C", join(root, "stage"), "package"]);
    expect(() => collectDependencyGraph(root, { payloads: ["unsafe.tgz"] })).toThrow(/entry type/);
    expect(() => parsePnpmLock("lockfileVersion: '8.0'\n")).toThrow(/Unsupported pnpm lockfile version/);
    expect(() => parsePnpmLock("lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies: {three: 1}\n")).toThrow(/Unsupported lock dependency group/);
  });
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-native-dependency-"));
  roots.push(root);
  return root;
}

function write(root: string, path: string, contents: string): void {
  const file = join(root, path);
  mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  writeFileSync(file, contents);
}

function writeJson(root: string, path: string, data: unknown): void {
  write(root, path, JSON.stringify(data));
}

const LOCK = `lockfileVersion: '9.0'
overrides:
  'utility>alias': npm:three@1.2.0
importers:
  .:
    dependencies:
      alias:
        specifier: npm:three@^1.0.0
        version: three@1.2.0
      utility:
        specifier: 1.0.0
        version: 1.0.0(three@1.2.0)
packages:
  three@1.2.0: {}
  utility@1.0.0:
    peerDependencies:
      three: ^1.0.0
    peerDependenciesMeta:
      three:
        optional: true
snapshots:
  three@1.2.0: {}
  utility@1.0.0(three@1.2.0):
    dependencies:
      three: 1.2.0
    transitivePeerDependencies:
      - three
`;
