import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { addAsset, readAssetManifest, validateAssets } from "../../../packages/aura3d-cli/src/index";

const roots: string[] = [];
const repo = resolve(import.meta.dirname, "../../..");
const triangle = ["mtllib materials/test.mtl", "v 0 0 0", "v 2 0 0", "v 0 3 0", "vt 0 0", "vt 1 0", "vt 0 1", "usemtl painted", "f 1/1 2/2 3/3", ""].join("\n");
const mtl = "newmtl painted\nKd 1 0 0\nmap_Kd textures/red.png\n";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
const hash = (bytes: string | Uint8Array) => `sha256-${createHash("sha256").update(bytes).digest("hex")}`;

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-model-migration-"));
  roots.push(root); mkdirSync(join(root, "assets/materials/textures"), { recursive: true });
  return root;
}

function writeObj(root: string, source = triangle): void {
  writeFileSync(join(root, "assets/model.obj"), source);
  writeFileSync(join(root, "assets/materials/test.mtl"), mtl);
  writeFileSync(join(root, "assets/materials/textures/red.png"), png);
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("compatible model inspection migration", () => {
  it("strictly inspects OBJ/MTL and stages every runtime texture with its own digest", () => {
    const root = project(); writeObj(root);
    const result = addAsset({ projectDir: root, file: "assets/model.obj", name: "subject", type: "model", modelInspection: "strict", license: "CC0-1.0" });
    const entry = result.manifest.assets[0]!;
    expect(entry).toMatchObject({ type: "model", format: "obj", hash: hash(triangle), bounds: [2, 3, 0], modelInspection: { version: 1, status: "parser-inspected", inspector: "obj", digest: hash(triangle) }, integrity: { version: 1, digest: hash(triangle), requireDependencies: true, dependencies: { "materials/test.mtl": hash(mtl), "materials/textures/red.png": hash(png) } } });
    expect(readFileSync(join(root, entry.outputPath), "utf8")).toBe(triangle);
    expect(readFileSync(join(root, "public/aura-assets/materials/test.mtl"), "utf8")).toBe(mtl);
    expect(readFileSync(join(root, "public/aura-assets/materials/textures/red.png"))).toEqual(png);
    expect(result.messages.join(" ")).toContain("renderer-capable OBJ adapter");
    expect(entry.warnings.join(" ")).not.toContain("requires explicit registration");
    const typed = readFileSync(join(root, "src/aura-assets.ts"), "utf8");
    expect(typed).toContain('"status": "parser-inspected"');
    expect(typed).toContain(hash(mtl)); expect(typed).toContain(hash(png));
    const doc = `https://example.test${entry.url}`;
    const context = new LoadContext({ documentUrl: doc, baseUrl: "https://example.test/aura-assets/", integrity: entry.integrity });
    expect(context.requestOptionsFor("https://example.test/aura-assets/materials/textures/red.png").integrity?.digest).toBe(hash(png));
    expect(() => context.requestOptionsFor("https://example.test/aura-assets/materials/other.png")).toThrow(/Missing required dependency/);
  });

  it("keeps the legacy unknown-format path explicit and refuses it under strict inspection", () => {
    const root = project(); writeFileSync(join(root, "assets/custom.xyz"), "opaque bytes");
    const entry = addAsset({ projectDir: root, file: "assets/custom.xyz", name: "custom", type: "model" }).manifest.assets[0]!;
    expect(entry.modelInspection).toEqual({ version: 1, status: "legacy-unverified" });
    expect(entry.warnings.join(" ")).toMatch(/not parser-inspected.*deprecated/);
    expect(readFileSync(join(root, "src/aura-assets.ts"), "utf8")).toContain('"status": "legacy-unverified"');
    const before = readFileSync(join(root, "aura.assets.json"));
    expect(() => addAsset({ projectDir: root, file: "assets/custom.xyz", name: "strict", type: "model", modelInspection: "strict" })).toThrow(/strict bounded parser inspection is unavailable/);
    expect(readFileSync(join(root, "aura.assets.json"))).toEqual(before);
  });

  it("marks the unchanged glTF path as metadata-only and does not pretend strict validation occurred", () => {
    const root = project(); writeFileSync(join(root, "assets/model.gltf"), JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [] }], nodes: [] }));
    const entry = addAsset({ projectDir: root, file: "assets/model.gltf", name: "model", type: "model" }).manifest.assets[0]!;
    expect(entry.modelInspection).toEqual({ version: 1, status: "metadata-only" });
    const before = readFileSync(join(root, "aura.assets.json"));
    expect(() => addAsset({ projectDir: root, file: "assets/model.gltf", name: "strict", modelInspection: "strict" })).toThrow(/metadata-only/);
    expect(readFileSync(join(root, "aura.assets.json"))).toEqual(before);
  });

  it("preserves the default OBJ path with an explicit warning if parser inspection is unavailable", () => {
    const root = project(); writeObj(root, triangle.replace("f 1/1 2/2 3/3", "f 1/1 2/2 9/3"));
    const entry = addAsset({ projectDir: root, file: "assets/model.obj", name: "model", type: "model" }).manifest.assets[0]!;
    expect(entry.modelInspection?.status).toBe("legacy-unverified");
    expect(entry.warnings.join(" ")).toMatch(/not parser-inspected/);
    const before = readFileSync(join(root, "aura.assets.json"));
    expect(() => addAsset({ projectDir: root, file: "assets/model.obj", name: "strict", modelInspection: "strict" })).toThrow(/index/i);
    expect(readFileSync(join(root, "aura.assets.json"))).toEqual(before);
  });

  it("preserves legacy OBJ admission when a new dependency destination conflicts", () => {
    const root = project(); writeObj(root);
    mkdirSync(join(root, "public/aura-assets"), { recursive: true });
    writeFileSync(join(root, "public/aura-assets/materials"), "occupied");
    const entry = addAsset({ projectDir: root, file: "assets/model.obj", name: "legacy", type: "model" }).manifest.assets[0]!;
    expect(entry.modelInspection?.status).toBe("legacy-unverified");
    expect(entry.warnings.join(" ")).toMatch(/not parser-inspected/);
    expect(readFileSync(join(root, "public/aura-assets/materials"), "utf8")).toBe("occupied");
    expect(readFileSync(join(root, entry.outputPath), "utf8")).toBe(triangle);
  });

  it("rejects unsafe/missing dependencies and preserves an existing manifest and typed file", () => {
    const root = project(); writeObj(root);
    addAsset({ projectDir: root, file: "assets/model.obj", name: "kept", modelInspection: "strict" });
    const before = ["aura.assets.json", "src/aura-assets.ts"].map((path) => readFileSync(join(root, path)));
    for (const reference of ["../escape.mtl", "/project/materials/test.mtl", "https://aura3d.invalid/project/materials/test.mtl", "https://other.test/test.mtl", "%2e%2e/escape.mtl", "missing.mtl"]) {
      writeFileSync(join(root, "assets/model.obj"), triangle.replace("materials/test.mtl", reference));
      expect(() => addAsset({ projectDir: root, file: "assets/model.obj", name: "bad", modelInspection: "strict" })).toThrow();
    }
    writeFileSync(join(root, "assets/model.obj"), triangle);
    rmSync(join(root, "assets/materials/test.mtl"));
    symlinkSync(join(root, "assets/materials/textures/red.png"), join(root, "assets/materials/test.mtl"));
    expect(() => addAsset({ projectDir: root, file: "assets/model.obj", name: "bad", modelInspection: "strict" })).toThrow(/symbolic links/);
    ["aura.assets.json", "src/aura-assets.ts"].forEach((path, index) => expect(readFileSync(join(root, path))).toEqual(before[index]));
    expect(readdirSync(root).filter((name) => name.startsWith(".aura3d-admission-"))).toEqual([]);
  });

  it("rejects external textures and missing UVs while exposing unsupported directives", () => {
    const root = project(); writeObj(root);
    writeFileSync(join(root, "assets/materials/test.mtl"), "newmtl painted\nmap_Kd https://other.test/red.png\n");
    expect(() => addAsset({ projectDir: root, file: "assets/model.obj", name: "remote", modelInspection: "strict" })).toThrow(/OBJ_DEPENDENCY_PATH/);
    writeFileSync(join(root, "assets/materials/test.mtl"), "newmtl painted\nmap_Kd /project/materials/textures/red.png\n");
    expect(() => addAsset({ projectDir: root, file: "assets/model.obj", name: "absolute", modelInspection: "strict" })).toThrow(/OBJ_DEPENDENCY_PATH/);
    writeFileSync(join(root, "assets/materials/test.mtl"), mtl);
    writeFileSync(join(root, "assets/model.obj"), triangle.replace(/vt [^\n]+\n/g, "").replace("f 1/1 2/2 3/3", "f 1 2 3"));
    expect(() => addAsset({ projectDir: root, file: "assets/model.obj", name: "unmapped", modelInspection: "strict" })).toThrow(/no texture coordinates/);
    writeFileSync(join(root, "assets/model.obj"), `${triangle}curv 0 1 1 2 3\n`);
    const entry = addAsset({ projectDir: root, file: "assets/model.obj", name: "partial", modelInspection: "strict" }).manifest.assets[0]!;
    expect(entry.warnings.join(" ")).toContain("OBJ curv is not mapped");
  });

  it("does not publish the OBJ or overwrite existing files when a dependency destination is unusable", () => {
    const root = project(); writeObj(root);
    mkdirSync(join(root, "public/aura-assets"), { recursive: true });
    writeFileSync(join(root, "public/aura-assets/materials"), "occupied");
    expect(() => addAsset({ projectDir: root, file: "assets/model.obj", name: "bad", modelInspection: "strict" })).toThrow();
    expect(readFileSync(join(root, "public/aura-assets/materials"), "utf8")).toBe("occupied");
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    expect(readdirSync(join(root, "public/aura-assets"))).toEqual(["materials"]);
  });

  it("rechecks staged OBJ dependency hashes and requires their integrity policy", () => {
    const root = project(); writeObj(root);
    addAsset({ projectDir: root, file: "assets/model.obj", name: "model", modelInspection: "strict" });
    writeFileSync(join(root, "public/aura-assets/materials/textures/red.png"), "tampered");
    expect(validateAssets({ projectDir: root }).failures.join("\n")).toMatch(/OBJ dependency hash mismatch.*red\.png/);
    const manifestPath = join(root, "aura.assets.json"), manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    delete manifest.assets[0].integrity.requireDependencies;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(validateAssets({ projectDir: root }).failures.join("\n")).toMatch(/must require dependency integrity/);
  });

  it("permits strict copy:false only with every exact dependency already staged", () => {
    const root = project(); writeObj(root);
    const first = addAsset({ projectDir: root, file: "assets/model.obj", name: "model", modelInspection: "strict" }).manifest.assets[0]!;
    const result = addAsset({ projectDir: root, file: "assets/model.obj", name: "model", modelInspection: "strict", copy: false });
    expect(result.manifest.assets[0]!.integrity).toEqual(first.integrity);
    const before = readFileSync(join(root, "aura.assets.json"));
    writeFileSync(join(root, "public/aura-assets/materials/test.mtl"), "changed");
    expect(() => addAsset({ projectDir: root, file: "assets/model.obj", name: "model", modelInspection: "strict", copy: false })).toThrow(/pre-staged|matching dependency/);
    expect(readFileSync(join(root, "aura.assets.json"))).toEqual(before);
  });

  it("enforces a bounded number of OBJ dependencies before publishing", () => {
    const root = project();
    const names = Array.from({ length: 257 }, (_, index) => `materials/m${index}.mtl`);
    for (const name of names) writeFileSync(join(root, "assets", name), "");
    writeFileSync(join(root, "assets/model.obj"), triangle.replace("mtllib materials/test.mtl", `mtllib ${names.join(" ")}`));
    expect(() => addAsset({ projectDir: root, file: "assets/model.obj", name: "model", modelInspection: "strict" })).toThrow(/OBJ_DEPENDENCY_LIMIT/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    expect(existsSync(join(root, "public"))).toBe(false);
  });

  it("marks old model records unverified and rejects stale claimed parser digests", () => {
    const root = project();
    const base = { schema: "aura3d.assets/1.0", assetBasePath: "/aura-assets/", outputDir: "public/aura-assets", typegen: "src/aura-assets.ts", assets: [{ id: "old", type: "model", format: "obj", source: "assets/old.obj", outputPath: "public/aura-assets/old.obj", url: "/aura-assets/old.obj", hash: hash("old"), sizeBytes: 3, materials: [], animations: [], textures: [], warnings: [] }] };
    writeFileSync(join(root, "aura.assets.json"), JSON.stringify(base));
    expect(readAssetManifest(root).assets[0]!.modelInspection).toEqual({ version: 1, status: "legacy-unverified" });
    base.assets[0] = { ...base.assets[0]!, modelInspection: { version: 1, status: "parser-inspected", inspector: "obj", digest: hash("different") } } as typeof base.assets[number];
    writeFileSync(join(root, "aura.assets.json"), JSON.stringify(base));
    expect(() => readAssetManifest(root)).toThrow(/stale model parser inspection/);
  });

  // Two cold `tsx cli.ts` spawns (about 2 s locally) exceed the 5 s default on a loaded source-pass shard.
  it("accepts strict mode through the real CLI and reports an invalid policy", { timeout: 60_000 }, () => {
    const root = project(); writeObj(root);
    const run = (args: string[]) => execFileSync(join(repo, "node_modules/.bin/tsx"), ["--tsconfig", join(repo, "tsconfig.base.json"), join(repo, "packages/aura3d-cli/src/cli.ts"), "assets", "add", "assets/model.obj", "--name", "model", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(run(["--model-inspection", "strict"])).toContain('"status": "parser-inspected"');
    expect(() => run(["--model-inspection", "bogus"])).toThrow();
  });

  it("does not turn the old optional-adapter notice into an automatic release failure", () => {
    const root = project(); writeObj(root);
    const added = addAsset({ projectDir: root, file: "assets/model.obj", name: "model", modelInspection: "strict" });
    const manifestPath = join(root, "aura.assets.json"), manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.assets[0].warnings.push("OBJ requires explicit registration of a renderer-capable adapter in the app's FormatRegistry.");
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const report = validateAssets({ projectDir: root, release: true });
    expect(report.failures.join("\n")).not.toContain("requires explicit registration");
    expect(added.messages.join(" ")).toContain("renderer-capable OBJ adapter");
  });
});
