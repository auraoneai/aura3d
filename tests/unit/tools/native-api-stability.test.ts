import { gzipSync } from "node:zlib";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExactReleasePlan } from "../../../tools/release/exact-release-plan.mjs";
import { describe, expect, it } from "vitest";
import { contractConsumers } from "../../../tools/public-api-contract/index.js";
import { compareEntryConditions, diffPackedSurfaces, expandExports, verifyBaseline } from "../../../tools/public-surface-diff/index.js";
import { classifyReleaseChange, validateReleaseKind } from "../../../tools/public-surface-diff/patch-compatibility.js";
import { readPackageArchive, type PackedPackage } from "../../../tools/public-surface-diff/prepare-baseline.js";

function fixture(declaration: string, exports: unknown = { ".": { types: "./index.d.ts", import: "./index.js" } }): PackedPackage {
  const manifest = { name: "@aura3d/test", version: "1.0.0", exports };
  return { manifest, files: new Map([["package.json", Buffer.from(JSON.stringify(manifest))], ["index.d.ts", Buffer.from(declaration)]]), paths: ["index.d.ts", "index.js", "package.json"] };
}
function tar(entries: { path: string; bytes: string; type?: string }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512), body = Buffer.from(entry.bytes);
    header.write(entry.path, 0, 100); header.write("0000644\0", 100); header.write("0000000\0", 108); header.write("0000000\0", 116);
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124); header.write("00000000000\0", 136);
    header.fill(32, 148, 156); header.write(entry.type ?? "0", 156); header.write("ustar\0", 257);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

describe("packed API stability", () => {
  it("checks archive boundaries and refuses symlinks or traversal without extracting", () => {
    const identity = { path: "package/package.json", bytes: JSON.stringify({ name: "@aura3d/test", version: "1.0.0" }) };
    const declaration = { path: "package/index.d.ts", bytes: "export declare const a: number;" };
    expect(readPackageArchive(tar([identity, declaration])).manifest.name).toBe("@aura3d/test");
    expect(() => readPackageArchive(tar([identity, { path: "package/../outside", bytes: "bad" }]))).toThrow(/Unsafe/);
    expect(() => readPackageArchive(tar([identity, { path: "package/link", bytes: "", type: "2" }]))).toThrow(/Unsupported/);
    expect(() => readPackageArchive(tar([identity, identity]))).toThrow(/Duplicate/);
  });
  it("enumerates subpaths, conditions and actual wildcard files", () => {
    const pkg = fixture("export {};", { ".": { types: "./index.d.ts", import: "./index.js" }, "./features/*": { types: "./features/*.d.ts", import: "./features/*.js" } });
    pkg.paths.push("features/light.d.ts", "features/light.js"); pkg.files.set("features/light.d.ts", Buffer.from("export declare const light: number;"));
    expect(expandExports(pkg).map((entry) => entry.subpath)).toEqual([".", "./features/light"]);
    expect(contractConsumers(new Map([[pkg.manifest.name, pkg]])).map((entry) => entry.specifier)).toEqual(["@aura3d/test", "@aura3d/test/features/light"]);
    pkg.paths.splice(pkg.paths.indexOf("features/light.js"), 1);
    expect(() => expandExports(pkg)).toThrow(/missing/i);
  });
  it("treats subpath and runtime-condition removal as breaking, including at minor", () => {
    const entry = expandExports(fixture("export {};"))[0]!;
    expect(compareEntryConditions("@aura3d/test", entry, undefined, "minor", "1.1.0")[0]?.classification.disposition).toBe("breaking");
    expect(compareEntryConditions("@aura3d/test", entry, { ...entry, conditions: { types: "./index.d.ts" } }, "minor", "1.1.0")[0]?.kind).toBe("condition-removal");
  });
  it("checks actual old and new declaration types, values and removed symbols", () => {
    const before = fixture("export declare function draw(value: string): number; export interface Options { enabled: boolean } export declare const lost: number;");
    const after = fixture("export declare function draw(value: number): number; export interface Options { enabled: boolean; required: string }");
    const report = diffPackedSurfaces(new Map([[before.manifest.name, before]]), new Map([[after.manifest.name, after]]), "1.0.1", "patch");
    expect(report.diagnostics).toEqual([]);
    expect(report.changes.map((change) => [change.name, change.kind])).toEqual(expect.arrayContaining([["draw", "declaration-change"], ["Options", "declaration-change"], ["lost", "value-removal"]]));
    expect(report.changes.every((change) => !change.classification.compatible)).toBe(true);
  }, 30000);
  it("detects a break behind an unchanged exported function signature", () => {
    const before = fixture("interface Hidden { enabled: boolean } export declare function draw(value: Hidden): number;");
    const after = fixture("interface Hidden { enabled: boolean; label: string } export declare function draw(value: Hidden): number;");
    const changes = diffPackedSurfaces(new Map([[before.manifest.name, before]]), new Map([[after.manifest.name, after]]), "1.0.1", "patch").changes;
    expect(changes.some((change) => change.name === "draw" && !change.classification.compatible)).toBe(true);
  }, 30000);
  it("retains compatible optional interface additions and existing consumers", () => {
    const before = fixture("export interface Options { enabled: boolean } export declare function draw(value: string): number;");
    const after = fixture("export interface Options { enabled: boolean; label?: string } export declare function draw(value: string): number;");
    expect(diffPackedSurfaces(new Map([[before.manifest.name, before]]), new Map([[after.manifest.name, after]]), "1.1.0", "minor").changes).toEqual([]);
  }, 30000);
  it("rejects a baseline omitting a package from the prior release inventory", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura3d-baseline-test-"));
    try {
      const path = join(directory, "baseline.json");
      writeFileSync(path, JSON.stringify({ schema: "aura3d.public-api-baseline/1", version: "4.3.7", candidatePlanSha256: "plan-hash", packages: [{ name: "@aura3d/engine" }] }));
      const plan = { reference: { path: "plan.json", sha256: "plan-hash" } } as ExactReleasePlan;
      expect(() => verifyBaseline(path, plan)).toThrow(/inventory mismatch/i);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it("retains the announced earliest removal version from exported declarations", () => {
    const before = fixture('/** @deprecated Removal planned for 3.0.0. */ export declare const oldName: number;');
    const after = fixture('export {};');
    const change = diffPackedSurfaces(new Map([[before.manifest.name, before]]), new Map([[after.manifest.name, after]]), "2.0.0", "major").changes.find((entry) => entry.name === "oldName");
    expect(change?.classification.disposition).toBe("deprecation-window");
  }, 30000);
  it("preserves CLI command names as well as importable subpaths", () => {
    const before = fixture("export {};"), after = fixture("export {};");
    before.manifest.bin = { "aura3d": "./cli.js" };
    const changes = diffPackedSurfaces(new Map([[before.manifest.name, before]]), new Map([[after.manifest.name, after]]), "1.0.1", "patch").changes;
    expect(changes.some((change) => change.kind === "bin-removal" && change.name === "aura3d")).toBe(true);
  }, 30000);
  it("does not report unchanged private class members as a public break", () => {
    const source = "export declare class Viewer { private element; reset(): void; }";
    const before = fixture(source), after = fixture(source);
    expect(diffPackedSurfaces(new Map([[before.manifest.name, before]]), new Map([[after.manifest.name, after]]), "1.0.1", "patch").changes).toEqual([]);
  }, 30000);
  it("enforces release levels and promised deprecation windows", () => {
    expect(() => validateReleaseKind("1.2.3", "1.3.0", "patch")).toThrow(/does not match/);
    expect(classifyReleaseChange({ kind: "value-removal", removalVersion: "3.0.0" }, "major", "2.0.0").disposition).toBe("deprecation-window");
    expect(classifyReleaseChange({ kind: "value-removal", removalVersion: "2.0.0" }, "major", "2.0.0").disposition).toBe("major-break");
    expect(classifyReleaseChange({ kind: "value-removal" }, "patch", "1.0.1").compatible).toBe(false);
  });
});
