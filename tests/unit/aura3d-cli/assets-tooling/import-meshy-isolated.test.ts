import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { importMeshyIsolated, isAuraMonorepoRoot, isolatedTypedKey } from "../../../../packages/aura3d-cli/src/commands/assets/importMeshy.js";
import { cliCommandFor } from "../../../../packages/aura3d-cli/src/contracts/commands.js";
import "../../../../packages/aura3d-cli/src/commands/registry.js";

const dirs: string[] = [];
function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function validGlb(): Buffer {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [] }] }));
  const chunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const buffer = Buffer.alloc(20 + chunk.length);
  buffer.write("glTF", 0, "ascii");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(chunk.length, 12);
  buffer.write("JSON", 16, "ascii");
  chunk.copy(buffer, 20);
  return buffer;
}

function download(root: string, name: string): string {
  const run = join(root, name);
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, "model.glb"), validGlb());
  writeFileSync(join(run, "meta.json"), JSON.stringify({ taskId: `task-${name}`, operation: "text-to-3d" }));
  writeFileSync(join(run, "rights.json"), JSON.stringify({ licenseName: "Meshy generated asset (paid API, plan terms at generation time)", termsUrl: "https://www.meshy.ai/terms", rightsBasis: "Generated through the project Meshy account from an original text prompt." }));
  writeFileSync(join(run, "texture_0.png"), Buffer.from("sidecar"));
  return run;
}

describe("isolated import-meshy", () => {
  test("typed keys carry the game prefix", () => {
    expect(isolatedTypedKey("drift", "lamp")).toBe("drift_lamp");
    expect(isolatedTypedKey("last-train", "tram")).toBe("last_train_tram");
    expect(isolatedTypedKey("drift", "drift_lamp")).toBe("drift_lamp");
    expect(() => isolatedTypedKey("Bad Tag", "x")).toThrowError(/game\/project tag/);
  });

  test("admits in a temp project, copies only the model and evidence, and leaves the invoking project untouched", () => {
    const project = tmp("aura3d-iso-project-");
    const downloads = join(project, "artifacts", "meshy");
    const run = download(downloads, "lamp-run");
    const gameAssets = join(project, "examples", "drift-port", "assets");
    const before = readdirSync(project).sort();
    const result = importMeshyIsolated({ cwd: project, input: run, into: gameAssets, prefix: "drift", name: "lamp", role: "prop" });
    expect(result.ok).toBe(true);
    expect(result.typedKey).toBe("drift_lamp");
    expect(existsSync(join(gameAssets, "models", "drift_lamp.glb"))).toBe(true);
    expect(existsSync(join(gameAssets, "provenance", "drift_lamp.rights.json"))).toBe(true);
    expect(existsSync(join(gameAssets, "provenance", "drift_lamp.meta.json"))).toBe(true);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.bytes).toBeGreaterThan(0);
    // shared root files were never created in the invoking project
    for (const shared of ["aura.assets.json", "src", "public", "aura-evidence"]) expect(existsSync(join(project, shared))).toBe(false);
    expect(readdirSync(project).sort()).toEqual([...before, "examples"].sort());
    // the temp project is gone
    expect(result.tempProject).toBeUndefined();
  });

  test("refuses to replace a different model of the same key unless overwritten", () => {
    const project = tmp("aura3d-iso-collide-");
    const downloads = join(project, "artifacts", "meshy");
    const gameAssets = join(project, "assets");
    importMeshyIsolated({ cwd: project, input: download(downloads, "a"), into: gameAssets, prefix: "wind", name: "rocks", role: "prop" });
    const other = download(downloads, "b");
    // a distinct valid GLB so the hashes differ
    const json = Buffer.from(JSON.stringify({ asset: { version: "2.0", generator: "different bytes" }, scenes: [{ nodes: [] }] }));
    const chunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
    const distinct = Buffer.alloc(20 + chunk.length);
    distinct.write("glTF", 0, "ascii");
    distinct.writeUInt32LE(2, 4);
    distinct.writeUInt32LE(distinct.length, 8);
    distinct.writeUInt32LE(chunk.length, 12);
    distinct.write("JSON", 16, "ascii");
    chunk.copy(distinct, 20);
    writeFileSync(join(other, "model.glb"), distinct);
    expect(() => importMeshyIsolated({ cwd: project, input: other, into: gameAssets, prefix: "wind", name: "rocks", role: "prop" })).toThrowError(/already exists with different bytes/);
    const replaced = importMeshyIsolated({ cwd: project, input: other, into: gameAssets, prefix: "wind", name: "rocks", role: "prop", overwrite: true });
    expect(replaced.ok).toBe(true);
    expect(readFileSync(join(gameAssets, "models", "wind_rocks.glb")).equals(distinct)).toBe(true);
  });

  test("missing inputs and rights evidence fail with clear errors", () => {
    const project = tmp("aura3d-iso-missing-");
    expect(() => importMeshyIsolated({ cwd: project, input: "nope", into: "out", prefix: "drift", name: "x" })).toThrowError(/download directory not found/);
    const empty = join(project, "run");
    mkdirSync(empty);
    cpSync(empty, join(project, "run2"), { recursive: true });
    expect(() => importMeshyIsolated({ cwd: project, input: "run", into: "out", prefix: "drift", name: "x" })).toThrowError(/Rights evidence not found/);
  });

  test("the monorepo root is detected and the new verbs are registered", () => {
    expect(isAuraMonorepoRoot(process.cwd())).toBe(true);
    expect(isAuraMonorepoRoot(tmp("aura3d-iso-plain-"))).toBe(false);
    expect(cliCommandFor("assets merge-clips")?.usage).toMatch(/--base/);
    expect(cliCommandFor("meshy ledger")?.usage).toMatch(/reserve/);
    expect(cliCommandFor("assets optimize")?.usage).toMatch(/--file in\.glb --out out\.glb/);
  });
});
