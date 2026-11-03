import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertExampleRetainedIdentity, assertPackedExampleLock, collectExampleRetainedFiles, packedExampleWrapper, exampleOfflineNpmCommand, exampleRetainedFilesDigest, prepareExampleLockedInstall, readExampleCandidateReviews, readExampleInstallBundle, rootServedFile, sourceScriptCommands, stageExampleDependencies, stageExampleVerifiedArchives } from "../../../tools/agent-examples/index.js";
import * as archiveAdmission from "../../../tools/release/archive-admission.mjs";

const roots: string[] = [];
function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-example-retention-"));
  roots.push(root);
  return root;
}
function put(root: string, path: string, content: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function candidateArchive(): Buffer {
  const body = Buffer.from(JSON.stringify({ name: "@aura3d/fixture", version: "1.0.0" }));
  const header = Buffer.alloc(512);
  header.write("package/package.json", 0, 100);
  header.write("0000644\0", 100, 8);
  header.write("0000000\0", 108, 8);
  header.write("0000000\0", 116, 8);
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12);
  header.write("00000000000\0", 136, 12);
  header.fill(0x20, 148, 156);
  header.write("0", 156);
  header.write("ustar\0", 257);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return gzipSync(Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512), Buffer.alloc(1024)]));
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("retained example source and output identity", () => {
  it("includes every regular output file, even under nested build, dist and reports names", () => {
    const root = scratch();
    put(root, "package.json", "{}");
    put(root, "app/dist/index.html", "<main>hello</main>");
    put(root, "app/dist/assets/build/worker.js", "worker");
    put(root, "app/dist/assets/reports/data.json", "report");
    put(root, "app/dist/assets/dist/module.js", "module");
    put(root, "node_modules/ignored/package.json", "dependency");
    const retained = collectExampleRetainedFiles(root, { excludeNodeModules: true });
    expect(retained.map((row) => row.path)).toEqual([
      "app/dist/assets/build/worker.js", "app/dist/assets/dist/module.js",
      "app/dist/assets/reports/data.json", "app/dist/index.html", "package.json"
    ]);
    expect(retained[0]).toEqual({ path: "app/dist/assets/build/worker.js", sha256: sha("worker"), bytes: 6 });
    const output = collectExampleRetainedFiles(join(root, "app/dist"), { rejectNodeModules: true });
    expect(output.map((row) => row.path)).toEqual(["assets/build/worker.js", "assets/dist/module.js", "assets/reports/data.json", "index.html"]);
    const before = exampleRetainedFilesDigest(output);
    put(root, "app/dist/assets/reports/data.json", "Report");
    const changed = collectExampleRetainedFiles(join(root, "app/dist"), { rejectNodeModules: true });
    expect(exampleRetainedFilesDigest(changed)).not.toBe(before);
    expect(changed.find((row) => row.path === "assets/reports/data.json")?.bytes).toBe(6);
  });

  it("changes identity for added, removed and renamed output files", () => {
    const root = scratch();
    put(root, "index.html", "initial");
    const base = exampleRetainedFilesDigest(collectExampleRetainedFiles(root));
    put(root, "dist/index.html", "initial");
    const added = exampleRetainedFilesDigest(collectExampleRetainedFiles(root));
    expect(added).not.toBe(base);
    rmSync(join(root, "index.html"));
    expect(exampleRetainedFilesDigest(collectExampleRetainedFiles(root))).not.toBe(added);
    expect(exampleRetainedFilesDigest(collectExampleRetainedFiles(root))).not.toBe(base);
  });

  it("revalidates the complete retained and served inventories, not just a top-level index", () => {
    const root = scratch();
    put(root, "package.json", "{}");
    put(root, "project/dist/index.html", "ok");
    put(root, "project/dist/reports/nested/result.json", "before");
    const dist = join(root, "project/dist");
    const retainedFiles = collectExampleRetainedFiles(root, { excludeNodeModules: true });
    const outputFiles = collectExampleRetainedFiles(dist, { rejectNodeModules: true });
    const record = { retainedFiles, retainedSha256: exampleRetainedFilesDigest(retainedFiles), outputFiles, outputSha256: exampleRetainedFilesDigest(outputFiles) };
    expect(() => assertExampleRetainedIdentity(root, dist, record)).not.toThrow();
    put(root, "project/dist/reports/nested/result.json", "after!");
    expect(() => assertExampleRetainedIdentity(root, dist, record)).toThrow(/inventory changed/);
    expect(() => assertExampleRetainedIdentity(root, dist, { ...record, retainedSha256: "0".repeat(64) })).toThrow(/inventory changed/);
  });

  it("fails closed on links and never follows a symlink into another tree", () => {
    const root = scratch();
    const outside = scratch();
    put(root, "index.html", "safe");
    put(outside, "secret.txt", "not part of the example");
    symlinkSync(outside, join(root, "linked"), "dir");
    expect(() => collectExampleRetainedFiles(root, { excludeNodeModules: true })).toThrow(/symlink/);
    rmSync(join(root, "linked"));
    symlinkSync(join(outside, "secret.txt"), join(root, "node_modules"), "file");
    expect(() => collectExampleRetainedFiles(root, { excludeNodeModules: true })).toThrow(/symlink/);
  });

  it.each([".npmrc", ".env.local", "private.key", ".ssh/id_ed25519", ".config/client.json"])(
    "refuses private path %s without exposing its contents", (path) => {
      const root = scratch();
      put(root, path, "synthetic private content");
      expect(() => collectExampleRetainedFiles(root)).toThrow(/private, configuration or nonportable path/);
      try { collectExampleRetainedFiles(root); } catch (error) {
        // invariant: source must not reintroduce `synthetic private content` in errors — refusing a private path never leaks that file's contents into logs
        expect(String(error)).not.toContain("synthetic private content");
      }
    }
  );

  it("rejects credential-like text before it can be retained, without exposing it", () => {
    const root = scratch();
    put(root, "config.json", '{"access_token":"synthetic-token-value"}');
    expect(() => collectExampleRetainedFiles(root)).toThrow(/credential-like text/);
    try { collectExampleRetainedFiles(root); } catch (error) {
      expect(String(error)).not.toContain("synthetic-token-value");
    }
  });

  it("refuses a dependency tree in the served output instead of omitting it from the digest", () => {
    const root = scratch();
    put(root, "index.html", "ok");
    put(root, "assets/node_modules/module.js", "must not be staged");
    expect(() => collectExampleRetainedFiles(root, { rejectNodeModules: true })).toThrow(/dependency tree/);
  });

  it("fails rather than losing an empty retained directory during file-only staging", () => {
    const root = scratch();
    put(root, "index.html", "ok");
    mkdirSync(join(root, "empty-source"));
    expect(() => collectExampleRetainedFiles(root, { rejectEmptyDirectories: true })).toThrow(/empty retained directory/);
    put(root, "empty-source/keep.txt", "kept");
    expect(() => collectExampleRetainedFiles(root, { rejectEmptyDirectories: true })).not.toThrow();
  });

  it("requires a complete run- and candidate-bound lock input before any install", () => {
    const root = scratch();
    expect(() => readExampleInstallBundle(root, undefined, "run", "a".repeat(64), "source", ["demo"])).toThrow(/before any install/);
    const entry = { id: "demo", manifestSha256: "b".repeat(64), lockPath: "inputs/lock.json", lockSha256: "c".repeat(64), archives: [] };
    const input = { schema: "aura3d.native-example-locks/1", runId: "run", candidateSha256: "a".repeat(64), sourceInputDigest: "source", examples: [entry] };
    put(root, "inputs/locks.json", JSON.stringify(input));
    expect(readExampleInstallBundle(root, "inputs/locks.json", "run", "a".repeat(64), "source", ["demo"]).examples).toHaveLength(1);
    expect(() => readExampleInstallBundle(root, "inputs/locks.json", "other", "a".repeat(64), "source", ["demo"])).toThrow(/source candidate and run/);
    expect(() => readExampleInstallBundle(root, "inputs/locks.json", "run", "b".repeat(64), "source", ["demo"])).toThrow(/source candidate and run/);
    expect(() => readExampleInstallBundle(root, "inputs/locks.json", "run", "a".repeat(64), "source", ["demo", "missing"])).toThrow(/exact catalog/);
    put(root, "inputs/locks.json", JSON.stringify({ ...input, examples: [entry, entry] }));
    expect(() => readExampleInstallBundle(root, "inputs/locks.json", "run", "a".repeat(64), "source", ["demo", "other"])).toThrow(/exact catalog/);
  });

  it("uses only the ordered candidate review refs bound to the retained source and candidate envelope", () => {
    const root = scratch(), runId = "review-run";
    const context = { sourceManifestPath: `tests/reports/native-capabilities/${runId}/source-manifest.json`, sourceManifestSha256: "a".repeat(64),
      planPath: `tests/reports/native-capabilities/${runId}/candidate-plan.json`, candidateSha256: "b".repeat(64) };
    const bodies = ['{"synthetic":"first"}', '{"synthetic":"second"}'];
    const refs = bodies.map((body) => ({ path: `tests/reports/native-source-inputs/${runId}/candidate-reviews/${sha(body)}.json`, sha256: sha(body) }))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    for (const body of bodies) put(root, `tests/reports/native-source-inputs/${runId}/candidate-reviews/${sha(body)}.json`, body);
    const envelopePath = `tests/reports/native-source-inputs/${runId}/inputs.json`;
    const envelope = { schema: "aura3d.native-portable-inputs/1", runId,
      sourceManifest: { path: context.sourceManifestPath, sha256: context.sourceManifestSha256 },
      candidatePlan: { path: context.planPath, sha256: context.candidateSha256 }, candidateReviews: refs,
      files: refs.map((ref) => ({ ...ref, size: readFileSync(join(root, ref.path)).byteLength })) };
    put(root, envelopePath, JSON.stringify(envelope));
    expect(readExampleCandidateReviews(root, runId, context, JSON.stringify(refs))).toEqual(refs);
    expect(() => readExampleCandidateReviews(root, runId, context, JSON.stringify([]))).toThrow(/differs from the retained envelope/);
    expect(() => readExampleCandidateReviews(root, runId, { ...context, candidateSha256: "c".repeat(64) })).toThrow(/does not match/);
    for (const candidateReviews of [[...refs, refs[0]], [...refs].reverse(), [{ ...refs[0], path: refs[0]!.path.replace(`/${runId}/`, "/other-run/") }]]) {
      put(root, envelopePath, JSON.stringify({ ...envelope, candidateReviews }));
      expect(() => readExampleCandidateReviews(root, runId, context)).toThrow(/candidate review reference/);
    }
  });

  it("rejects modified, missing or symlinked candidate review bytes without granting admission", () => {
    const root = scratch(), runId = "review-run";
    const body = '{"synthetic":"review"}', digest = sha(body);
    const path = `tests/reports/native-source-inputs/${runId}/candidate-reviews/${digest}.json`;
    const context = { sourceManifestPath: `tests/reports/native-capabilities/${runId}/source-manifest.json`, sourceManifestSha256: "a".repeat(64),
      planPath: `tests/reports/native-capabilities/${runId}/candidate-plan.json`, candidateSha256: "b".repeat(64) };
    const envelope = { schema: "aura3d.native-portable-inputs/1", runId,
      sourceManifest: { path: context.sourceManifestPath, sha256: context.sourceManifestSha256 },
      candidatePlan: { path: context.planPath, sha256: context.candidateSha256 },
      candidateReviews: [{ path, sha256: digest }], files: [{ path, sha256: digest, size: Buffer.byteLength(body) }] };
    put(root, `tests/reports/native-source-inputs/${runId}/inputs.json`, JSON.stringify(envelope));
    put(root, path, body);
    expect(readExampleCandidateReviews(root, runId, context)).toEqual(envelope.candidateReviews);
    put(root, path, "modified");
    expect(() => readExampleCandidateReviews(root, runId, context)).toThrow(/differs from the retained envelope/);
    rmSync(join(root, path));
    expect(() => readExampleCandidateReviews(root, runId, context)).toThrow();
    const outside = scratch();
    put(outside, "review.json", body);
    symlinkSync(join(outside, "review.json"), join(root, path), "file");
    expect(() => readExampleCandidateReviews(root, runId, context)).toThrow(/symlink/);
  });

  it("retains verified archive snapshots by digest with one file per unique content", () => {
    const root = scratch();
    const output = join(root, "tests/reports/native-examples-catalog/run");
    const data = new Uint8Array([1, 2, 3]);
    const digest = createHash("sha256").update(data).digest("hex");
    const rows = stageExampleVerifiedArchives(root, output, [
      { resolved: "file:aura-candidates/z.tgz", bytes: data },
      { resolved: "file:aura-candidates/a.tgz", bytes: data }
    ]);
    expect(rows.map((row) => row.resolved)).toEqual(["file:aura-candidates/a.tgz", "file:aura-candidates/z.tgz"]);
    expect(new Set(rows.map((row) => row.path))).toEqual(new Set([`tests/reports/native-examples-catalog/run/dependency-archives/${digest}.tgz`]));
    expect(rows.every((row) => row.sha256 === digest)).toBe(true);
    expect(() => stageExampleVerifiedArchives(root, output, [{ resolved: "same", bytes: data }, { resolved: "same", bytes: data }])).toThrow(/unique/);
    writeFileSync(join(output, "dependency-archives", `${digest}.tgz`), "altered");
    expect(() => stageExampleVerifiedArchives(root, output, [{ resolved: "file:aura-candidates/a.tgz", bytes: data }])).toThrow(/changed/);
  });

  it("refuses even a structurally valid candidate before installing without trusted provenance admission", () => {
    const root = scratch(), wrapper = join(root, "wrapper");
    const archive = candidateArchive();
    const digest = createHash("sha256").update(archive).digest("hex");
    const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    const spec = `file:aura-candidates/${digest}.tgz`;
    const dependencies = { "@aura3d/fixture": spec };
    const manifest = JSON.stringify({ name: "fixture-wrapper", dependencies });
    const lock = JSON.stringify({ lockfileVersion: 3, packages: {
      "": { name: "fixture-wrapper", dependencies },
      "node_modules/@aura3d/fixture": { version: "1.0.0", resolved: spec, integrity }
    } });
    put(wrapper, "package.json", manifest);
    put(root, "inputs/package-lock.json", lock);
    writeFileSync(join(root, "inputs/candidate.tgz"), archive);
    const entry = { id: "demo", manifestSha256: sha(manifest), lockPath: "inputs/package-lock.json", lockSha256: sha(lock),
      archives: [{ resolved: spec, path: "inputs/candidate.tgz" }] };
    const plan = { packages: [{ name: "@aura3d/fixture", version: "1.0.0", sha256: digest, integrity }] };
    expect(() => prepareExampleLockedInstall(root, wrapper, entry, plan)).toThrow(/candidate archive admission is unavailable/);
    expect(() => prepareExampleLockedInstall(root, wrapper, entry, plan, { sourceManifestPath: "inputs/source.json", planPath: "inputs/plan.json" })).toThrow();
    const refs = [{ path: `tests/reports/native-source-inputs/run/candidate-reviews/${"d".repeat(64)}.json`, sha256: "d".repeat(64) }];
    const verifier = vi.spyOn(archiveAdmission, "verifyArchiveAdmission").mockImplementationOnce(() => { throw new Error("synthetic verifier refusal"); });
    try {
      expect(() => prepareExampleLockedInstall(root, wrapper, entry, plan, { sourceManifestPath: "inputs/source.json", planPath: "inputs/plan.json", candidateReviews: refs })).toThrow(/synthetic verifier refusal/);
      expect(verifier).toHaveBeenCalledWith(expect.objectContaining({ candidateReviews: refs }));
    } finally { verifier.mockRestore(); }
    expect(() => readFileSync(join(wrapper, "aura-candidates", `${digest}.tgz`))).toThrow();
    expect(() => readFileSync(join(wrapper, "package-lock.json"))).toThrow();
  });

  it("rejects a prohibited dependency alias before reading any archive", () => {
    const root = scratch(), wrapper = join(root, "wrapper");
    const dependencies = { renderer: "npm:three@1.0.0" };
    const manifest = JSON.stringify({ name: "fixture-wrapper", dependencies });
    const lock = JSON.stringify({ lockfileVersion: 3, packages: { "": { name: "fixture-wrapper", dependencies } } });
    put(wrapper, "package.json", manifest);
    put(root, "inputs/package-lock.json", lock);
    const entry = { id: "demo", manifestSha256: sha(manifest), lockPath: "inputs/package-lock.json", lockSha256: sha(lock),
      archives: [{ resolved: "https://registry.npmjs.org/not-read.tgz", path: "inputs/does-not-exist.tgz" }] };
    expect(() => prepareExampleLockedInstall(root, wrapper, entry, { packages: [] }, { sourceManifestPath: "inputs/source.json", planPath: "inputs/plan.json" })).toThrow(/prohibited package identity/);
    expect(() => readFileSync(join(wrapper, "package-lock.json"))).toThrow();
  });

  it("only prepares an offline, script-disabled package install and rejects credential arguments", () => {
    const command = exampleOfflineNpmCommand("/cache", "/user-config", "/global-config");
    expect(command[0]).toBe("ci");
    expect(command).toEqual(expect.arrayContaining(["--offline", "--ignore-scripts", "--cache", "/cache", "--userconfig", "/user-config"]));
    expect(() => sourceScriptCommands({ build: "vite build --token=synthetic-secret" }, "build")).toThrow(/credential-bearing/);
  });
});

describe("isolated example dependency staging", () => {
  it("stages imported sibling examples, repo-root modules and the root-served files they name, never package source", () => {
    const root = scratch();
    put(root, "apps/game-port/index.html", '<link rel="stylesheet" href="/fonts/local.css"><script type="module" src="./src/main.ts"></script>');
    put(root, "apps/game-port/src/main.ts", 'import "../../port-shared/diag";\nimport "../../../examples/game-port/main";\nimport "../../../packages/engine/src/index";\n');
    put(root, "apps/port-shared/diag.ts", "export {};\n");
    put(root, "examples/game-port/main.ts", 'import { assets } from "../../src/aura-assets.js";\nconst hdr = "/hdri/sky.hdr";\nconst soldier = "/fixtures/parity/soldier.glb";\nexport const used = [assets.robot, hdr, soldier];\n');
    put(root, "src/aura-assets.ts", 'export const assets = defineAuraAssets({\n  "robot": {\n    type: "model",\n    url: "/aura-assets/robot.1234.glb",\n  },\n  "unused": {\n    type: "model",\n    url: "/aura-assets/unused.5678.glb",\n  },\n} as const);\n');
    put(root, "public/aura-assets/robot.1234.glb", "glb");
    put(root, "public/aura-assets/unused.5678.glb", "glb");
    put(root, "public/hdri/sky.hdr", "hdr");
    put(root, "public/fonts/local.css", '@font-face { src: url("/fonts/a/A.woff2"); }');
    put(root, "public/fonts/a/A.woff2", "font");
    put(root, "fixtures/parity/soldier.glb", "glb");
    put(root, "packages/engine/src/index.ts", "export {};\n");
    put(root, "apps/game-port/tsconfig.json", '{ "extends": "../../tsconfig.base.json", "include": ["src/**/*.ts"] }');
    put(root, "apps/game-port/vite.config.ts", 'import rootConfig from "../../vite.config";\nexport default rootConfig;\n');
    put(root, "tsconfig.base.json", '{ "extends": ["./tsconfig.paths.generated.json"] }');
    put(root, "tsconfig.paths.generated.json", '{ "compilerOptions": { "paths": { "@aura3d/engine": ["packages/engine/src/index.ts"] } } }');
    put(root, "vite.config.ts", "export default {};\n");
    const wrapper = scratch();
    for (const file of ["tsconfig.json", "vite.config.ts"]) put(wrapper, `apps/game-port/${file}`, readFileSync(join(root, "apps/game-port", file), "utf8"));
    put(wrapper, "apps/game-port/index.html", readFileSync(join(root, "apps/game-port/index.html"), "utf8"));
    put(wrapper, "apps/game-port/src/main.ts", readFileSync(join(root, "apps/game-port/src/main.ts"), "utf8"));
    const result = stageExampleDependencies(root, wrapper, join(wrapper, "apps/game-port"));
    // The root Vite config aliases workspace source, so it is never staged.
    expect(result.staged.sort()).toEqual(["apps/port-shared", "examples/game-port", "src/aura-assets.ts", "tsconfig.base.json", "tsconfig.paths.generated.json"]);
    expect(() => readFileSync(join(wrapper, "vite.config.ts"))).toThrow();
    expect(result.publicFiles).toEqual(["aura-assets/robot.1234.glb", "fixtures/parity/soldier.glb", "fonts/a/A.woff2", "fonts/local.css", "hdri/sky.hdr"]);
    expect(readFileSync(join(wrapper, "examples/game-port/main.ts"), "utf8")).toContain("assets.robot");
    expect(() => readFileSync(join(wrapper, "packages/engine/src/index.ts"))).toThrow();
    expect(rootServedFile(root, "/packages/engine/src/index.ts")).toBeUndefined();
    expect(rootServedFile(root, "/hdri/sky.hdr")).toBe(join(root, "public/hdri/sky.hdr"));
  });
});

describe("packed-candidate example installs (ACR source5 path, no custody lock input)", () => {
  // Synthetic plan: engine depends on core; react is unused by the example.
  const pkg = (name: string, deps: string[] = []) => ({ name, version: "5.0.0", internalDependencies: deps, tarball: `tests/reports/release-tarballs/${name.replace("@", "").replace("/", "-")}-5.0.0.tgz`,
    sha256: createHash("sha256").update(name).digest("hex"), integrity: `sha512-${createHash("sha512").update(name).digest("base64")}` });
  const plan = { version: "5.0.0", packages: [pkg("@aura3d/engine", ["@aura3d/core"]), pkg("@aura3d/core"), pkg("@aura3d/react", ["@aura3d/engine"])] };
  const example = { name: "camera-path", scripts: { build: "vite build" }, dependencies: { "@aura3d/engine": "workspace:*" }, devDependencies: { vite: "^7.0.0", typescript: "^5.8.3" } };
  const spec = (name: string) => `file:.aura3d-candidate/${name.replace("@", "").replace("/", "-")}-5.0.0.tgz`;
  const lockFor = (overrides: Record<string, unknown> = {}) => ({ lockfileVersion: 3, packages: {
    "": {}, "node_modules/vite": { version: "7.0.0", resolved: "https://registry.npmjs.org/vite/-/vite-7.0.0.tgz", integrity: "sha512-x" },
    ...Object.fromEntries(["@aura3d/engine", "@aura3d/core"].map((name) => [`node_modules/${name}`, { version: "5.0.0", resolved: spec(name), integrity: plan.packages.find((p) => p.name === name)!.integrity }])),
    ...overrides } });
  const installed = ["@aura3d/engine", "@aura3d/core"].map((name) => { const p = plan.packages.find((entry) => entry.name === name)!;
    return { name, installPath: `node_modules/${name}`, version: p.version, sha256: p.sha256, integrity: p.integrity, contentsSha256: "c".repeat(64) }; });

  it("substitutes candidate specifiers with the staged plan archives and pins the internal closure", () => {
    const { wrapper, closure, substitutions } = packedExampleWrapper(example, plan as never);
    expect((wrapper.dependencies as Record<string, string>)["@aura3d/engine"]).toBe(spec("@aura3d/engine"));
    expect((wrapper.dependencies as Record<string, string>).vite).toBe("^7.0.0");
    expect(wrapper.overrides).toEqual({ "@aura3d/core": spec("@aura3d/core") });
    expect(closure.map((p) => p.name)).toEqual(["@aura3d/engine", "@aura3d/core"]);
    expect(substitutions.map((item) => [item.section, item.name])).toEqual([["dependencies", "@aura3d/engine"], ["overrides", "@aura3d/core"]]);
    expect(() => assertPackedExampleLock(wrapper, lockFor(), plan as never, substitutions, installed)).not.toThrow();
  });

  it("refuses external engines, unstaged workspaces, unpinned or foreign locks and incomplete installs", () => {
    expect(() => packedExampleWrapper({ ...example, dependencies: { ...example.dependencies, three: "^0.170.0" } }, plan as never)).toThrow(/prohibited external 3D engine/);
    expect(() => packedExampleWrapper({ ...example, dependencies: { ...example.dependencies, "@aura3d/missing": "workspace:*" } }, plan as never)).toThrow(/Missing candidate package/);
    expect(() => packedExampleWrapper({ ...example, dependencies: { ...example.dependencies, helper: "workspace:*" } }, plan as never)).toThrow(/unstaged local workspace/);
    const { wrapper, substitutions } = packedExampleWrapper(example, plan as never);
    const engine = plan.packages[0]!;
    expect(() => assertPackedExampleLock(wrapper, lockFor({ "node_modules/@aura3d/engine": { version: "5.0.0", resolved: spec(engine.name), integrity: "sha512-other" } }), plan as never, substitutions, installed)).toThrow(/not pinned to the plan integrity/);
    expect(() => assertPackedExampleLock(wrapper, lockFor({ "node_modules/@aura3d/engine": { version: "5.0.0", resolved: "https://registry.npmjs.org/@aura3d/engine/-/engine-5.0.0.tgz", integrity: engine.integrity } }), plan as never, substitutions, installed)).toThrow(/not pinned/);
    expect(() => assertPackedExampleLock(wrapper, lockFor({ "node_modules/@aura3d/react": { version: "5.0.0", resolved: spec("@aura3d/react"), integrity: plan.packages[2]!.integrity } }), plan as never, substitutions, installed)).toThrow(/outside the candidate closure/);
    const noCore = lockFor(); delete (noCore.packages as Record<string, unknown>)["node_modules/@aura3d/core"];
    expect(() => assertPackedExampleLock(wrapper, noCore, plan as never, substitutions, installed)).toThrow(/not locked: @aura3d\/core/);
    expect(() => assertPackedExampleLock({ ...wrapper, dependencies: { ...(wrapper.dependencies as object), extra: "file:../x.tgz" } }, lockFor(), plan as never, substitutions, installed)).toThrow(/unrecorded local dependency/);
    expect(() => assertPackedExampleLock(wrapper, lockFor(), plan as never, substitutions, installed.slice(0, 1))).toThrow(/inventory is incomplete/);
    expect(() => assertPackedExampleLock(wrapper, lockFor(), plan as never, [], installed)).toThrow(/substitutions are missing/);
  });
});
