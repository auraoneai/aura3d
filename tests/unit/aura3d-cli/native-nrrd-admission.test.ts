import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { inspectScalarVolume, parseNRRD } from "@aura3d/assets/importers";
import { addAsset, addAssetAsync, readAssetManifest, validateAssets } from "../../../packages/aura3d-cli/src/index";
import { createCliOptionReaders } from "../../../packages/aura3d-cli/src/cli-options";
import { assetsAddHelp, mainHelp } from "../../../packages/aura3d-cli/src/cli-help";

const roots: string[] = [];

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-nrrd-admission-"));
  roots.push(root);
  mkdirSync(join(root, "assets"));
  return root;
}

function digest(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function header(options: { reference?: string; type?: string; sizes?: string; encoding?: string; endian?: string; space?: string; directions?: string } = {}): Buffer {
  return Buffer.from([
    "NRRD0005", `type: ${options.type ?? "uint8"}`, `dimension: ${(options.sizes ?? "2 2 2").split(" ").length}`,
    `sizes: ${options.sizes ?? "2 2 2"}`, `encoding: ${options.encoding ?? "raw"}`, ...(options.endian ? [`endian: ${options.endian}`] : []),
    `space: ${options.space ?? "right-anterior-superior"}`,
    `space directions: ${options.directions ?? "(1,0,0) (0,1,0) (0,0,1)"}`,
    "space origin: (0,0,0)", ...(options.reference !== undefined ? [`data file: ${options.reference}`] : []), "", ""
  ].join("\n"));
}

const samples = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
const embedded = (payload = samples) => Buffer.concat([header(), payload]);
const detached = (reference = "voxels.raw") => header({ reference });

function namespace(format: string, root: Buffer, reference?: string, child?: Buffer): string {
  const members = reference === undefined ? [] : [[reference, digest(child!)]];
  return `scalar-volumes/${digest(JSON.stringify(["aura3d.scalar-volume/1", format, digest(root), members]))}`;
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("typed scalar-volume admission", () => {
  it("admits embedded bytes with a typed, dependency-required identity and validates the staged root", async () => {
    const root = project(), bytes = embedded(), hash = digest(bytes);
    writeFileSync(join(root, "assets/scan.nrrd"), bytes);
    const options = { projectDir: root, file: "assets/scan.nrrd", name: "scan", sha256: hash, license: "CC0-1.0" };
    expect(() => addAsset(options)).toThrow(/scalar-volume inspection is asynchronous/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    const entry = (await addAssetAsync(options)).manifest.assets[0]!;
    expect(entry).toMatchObject({
      type: "scalar-volume", format: "nrrd", hash: `sha256-${hash}`,
      integrity: { version: 1, digest: `sha256-${hash}`, dependencies: {}, requireDependencies: true },
      dependencies: [], bounds: [1, 1, 1], boundsMetadata: { min: [0, 0, -1], max: [1, 1, 0] },
      provenance: { sha256: hash, license: "CC0-1.0" }
    });
    expect(entry.formatMetadata).toBeUndefined();
    expect(entry.outputPath).toBe(`public/aura-assets/${namespace("nrrd", bytes)}/volume.nrrd`);
    expect(readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    const generated = readFileSync(join(root, "src/aura-assets.ts"), "utf8");
    expect(generated).toContain('readonly type: "scalar-volume"');
    expect(generated).toContain(`sha256-${hash}`);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
    expect(createCliOptionReaders(["assets", "add", "--type", "scalar-volume"]).readAssetType()).toBe("scalar-volume");
    expect(assetsAddHelp()).toContain("--type scalar-volume");
    expect(mainHelp("general")).toContain("navigation|lut|scalar-volume");
  });

  it("admits signed int8 samples without changing their bytes or values", async () => {
    const root = project(), values = [-128, -9, -1, 0, 1, 9, 42, 127];
    const bytes = Buffer.concat([header({ type: "int8" }), Buffer.from(Int8Array.from(values))]);
    writeFileSync(join(root, "assets/signed.nrrd"), bytes);
    const entry = (await addAssetAsync({ projectDir: root, file: "assets/signed.nrrd", name: "signed" })).manifest.assets[0]!;
    expect(entry).toMatchObject({
      type: "scalar-volume", format: "nrrd", hash: `sha256-${digest(bytes)}`,
      integrity: { version: 1, digest: `sha256-${digest(bytes)}`, dependencies: {}, requireDependencies: true }
    });
    const staged = readFileSync(join(root, entry.outputPath));
    expect(staged).toEqual(bytes);
    const volume = inspectScalarVolume(await parseNRRD(staged));
    expect(volume.data).toBeInstanceOf(Int8Array);
    expect(Array.from(volume.data)).toEqual(values);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("stages an unchanged detached header with its exact relative child and digest", async () => {
    const root = project(), reference = "slices/volume data.raw", bytes = detached(reference), hash = digest(bytes);
    mkdirSync(join(root, "assets/slices"), { recursive: true });
    writeFileSync(join(root, "assets/scan.nhdr"), bytes);
    writeFileSync(join(root, "assets", reference), samples);
    const entry = (await addAssetAsync({ projectDir: root, file: "assets/scan.nhdr", name: "scan", type: "scalar-volume" })).manifest.assets[0]!;
    expect(entry.outputPath).toBe(`public/aura-assets/${namespace("nhdr", bytes, reference, samples)}/volume.nhdr`);
    expect(entry).toMatchObject({
      type: "scalar-volume", format: "nhdr", hash: `sha256-${hash}`, dependencies: [reference],
      integrity: { version: 1, digest: `sha256-${hash}`, dependencies: { [reference]: `sha256-${digest(samples)}` }, requireDependencies: true }
    });
    expect(readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    expect(readFileSync(join(root, dirname(entry.outputPath), reference))).toEqual(samples);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("admits bounded embedded and detached gzip streams without rewriting them", async () => {
    const root = project(), zipped = gzipSync(samples);
    const inside = Buffer.concat([header({ encoding: "gzip" }), zipped]);
    const outside = header({ encoding: "gzip", reference: "voxels.raw.gz" });
    writeFileSync(join(root, "assets/inside.nrrd"), inside);
    writeFileSync(join(root, "assets/outside.nhdr"), outside);
    writeFileSync(join(root, "assets/voxels.raw.gz"), zipped);
    const first = (await addAssetAsync({ projectDir: root, file: "assets/inside.nrrd", name: "inside" })).manifest.assets.find((item) => item.id === "inside")!;
    const second = (await addAssetAsync({ projectDir: root, file: "assets/outside.nhdr", name: "outside" })).manifest.assets.find((item) => item.id === "outside")!;
    expect(readFileSync(join(root, first.outputPath))).toEqual(inside);
    expect(readFileSync(join(root, second.outputPath))).toEqual(outside);
    expect(readFileSync(join(root, dirname(second.outputPath), "voxels.raw.gz"))).toEqual(zipped);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("isolates equal headers with different children and does not carry rights onto changed payloads", async () => {
    const root = project(), bytes = detached(), changed = Buffer.from(samples.map((n) => n + 7));
    mkdirSync(join(root, "assets/a")); mkdirSync(join(root, "assets/b"));
    for (const folder of ["a", "b"]) writeFileSync(join(root, "assets", folder, "scan.nhdr"), bytes);
    writeFileSync(join(root, "assets/a/voxels.raw"), samples);
    writeFileSync(join(root, "assets/b/voxels.raw"), changed);
    const first = (await addAssetAsync({ projectDir: root, file: "assets/a/scan.nhdr", name: "scan", license: "CC0-1.0", quality: "candidate" })).manifest.assets[0]!;
    const other = (await addAssetAsync({ projectDir: root, file: "assets/b/scan.nhdr", name: "other" })).manifest.assets.find((item) => item.id === "other")!;
    expect(other.hash).toBe(first.hash);
    expect(other.outputPath).not.toBe(first.outputPath);
    expect(validateAssets({ projectDir: root }).warnings.join(" ")).not.toMatch(/duplicate asset hash/);
    const second = (await addAssetAsync({ projectDir: root, file: "assets/b/scan.nhdr", name: "scan" })).manifest.assets.find((item) => item.id === "scan")!;
    expect(second.hash).toBe(first.hash);
    expect(second.outputPath).not.toBe(first.outputPath);
    expect(second.provenance?.license).toBeUndefined();
    expect(second.quality).toBe("ungraded");
    expect(readFileSync(join(root, dirname(first.outputPath), "voxels.raw"))).toEqual(samples);
    expect(readFileSync(join(root, dirname(second.outputPath), "voxels.raw"))).toEqual(changed);
    expect(second.integrity?.dependencies?.["voxels.raw"]).toBe(`sha256-${digest(changed)}`);
  });

  it("snapshots both files and admission options before the asynchronous parser yields", async () => {
    const root = project(), bytes = detached(), changed = Buffer.from(samples.map((n) => n + 1));
    writeFileSync(join(root, "assets/scan.nhdr"), bytes);
    writeFileSync(join(root, "assets/voxels.raw"), samples);
    const options = { projectDir: root, file: "assets/scan.nhdr", name: "scan", license: "CC0-1.0", provenanceEvidence: ["first"] };
    const pending = addAssetAsync(options);
    options.name = "changed"; options.license = "other"; options.provenanceEvidence.push("later");
    writeFileSync(join(root, "assets/scan.nhdr"), detached("other.raw"));
    writeFileSync(join(root, "assets/voxels.raw"), changed);
    const entry = (await pending).manifest.assets[0]!;
    expect(entry.id).toBe("scan");
    expect(entry.provenance).toMatchObject({ license: "CC0-1.0", evidence: ["first"] });
    expect(readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    expect(readFileSync(join(root, dirname(entry.outputPath), "voxels.raw"))).toEqual(samples);
  });

  it("requires exact pre-staged root and child bytes when copy:false", async () => {
    const root = project(), bytes = detached(), path = namespace("nhdr", bytes, "voxels.raw", samples);
    writeFileSync(join(root, "assets/scan.nhdr"), bytes); writeFileSync(join(root, "assets/voxels.raw"), samples);
    const options = { projectDir: root, file: "assets/scan.nhdr", name: "scan", copy: false };
    await expect(addAssetAsync(options)).rejects.toThrow(/copy:false requires the matching hashed file/);
    expect(existsSync(join(root, ".aura3d-scalar-admission.lock"))).toBe(false);
    const target = join(root, "public/aura-assets", path);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "volume.nhdr"), bytes); writeFileSync(join(target, "voxels.raw"), Buffer.alloc(samples.length));
    await expect(addAssetAsync(options)).rejects.toThrow(/copy:false requires the matching dependency/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    writeFileSync(join(target, "voxels.raw"), samples);
    const entry = (await addAssetAsync(options)).manifest.assets[0]!;
    expect(readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    expect(readFileSync(join(target, "voxels.raw"))).toEqual(samples);
  });

  it("refuses concurrent scalar admission and protects generated paths from asset collisions", async () => {
    const root = project(), bytes = detached(), path = namespace("nhdr", bytes, "voxels.raw", samples);
    writeFileSync(join(root, "assets/scan.nhdr"), bytes); writeFileSync(join(root, "assets/voxels.raw"), samples);
    const lock = join(root, ".aura3d-scalar-admission.lock");
    writeFileSync(lock, "another owner");
    await expect(addAssetAsync({ projectDir: root, file: "assets/scan.nhdr", name: "scan" })).rejects.toThrow(/another scalar-volume admission/);
    expect(readFileSync(lock, "utf8")).toBe("another owner");
    rmSync(lock);
    await expect(addAssetAsync({ projectDir: root, file: "assets/scan.nhdr", name: "scan", typegen: `public/aura-assets/${path}/volume.nhdr` })).rejects.toThrow(/paths collide/);
    expect(existsSync(lock)).toBe(false);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
  });

  it("rejects unsafe, nonportable, colliding, and symlinked child references before publishing", async () => {
    const root = project();
    for (const reference of ["../secret.raw", "/absolute.raw", "https://example.test/data.raw", "dir\\data.raw", "data%2fsecret.raw", "data.raw?x=1", "data.raw#part", "VoLuMe.NHDR", "NUL.raw"]) {
      writeFileSync(join(root, "assets/scan.nhdr"), detached(reference));
      await expect(addAssetAsync({ projectDir: root, file: "assets/scan.nhdr", name: "scan" })).rejects.toThrow(/dependency/i);
      expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    }
    writeFileSync(join(root, "assets/scan.nhdr"), detached());
    writeFileSync(join(root, "assets/real.raw"), samples);
    symlinkSync(join(root, "assets/real.raw"), join(root, "assets/voxels.raw"));
    await expect(addAssetAsync({ projectDir: root, file: "assets/scan.nhdr", name: "scan" })).rejects.toThrow(/symbolic links/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
  });

  it("rejects wrong type, stale root digest, and missing detached data without writing", async () => {
    const root = project(), bytes = detached();
    writeFileSync(join(root, "assets/scan.nhdr"), bytes);
    await expect(addAssetAsync({ projectDir: root, file: "assets/scan.nhdr", name: "scan", type: "texture" })).rejects.toThrow(/must use --type scalar-volume/);
    await expect(addAssetAsync({ projectDir: root, file: "assets/scan.nhdr", name: "scan" })).rejects.toThrow(/does not exist/);
    writeFileSync(join(root, "assets/voxels.raw"), samples);
    await expect(addAssetAsync({ projectDir: root, file: "assets/scan.nhdr", name: "scan", sha256: "0".repeat(64) })).rejects.toThrow(/does not match the inspected asset bytes/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    expect(existsSync(join(root, "src/aura-assets.ts"))).toBe(false);
    expect(existsSync(join(root, ".aura3d-scalar-admission.lock"))).toBe(false);
  });

  it("rejects invalid scalar content and input/decompression limits without changing prior artifacts", async () => {
    const root = project(), good = embedded();
    writeFileSync(join(root, "assets/good.nrrd"), good);
    const entry = (await addAssetAsync({ projectDir: root, file: "assets/good.nrrd", name: "kept" })).manifest.assets[0]!;
    const tracked = ["aura.assets.json", "src/aura-assets.ts", entry.outputPath, "public/aura-assets/kept.thumb.svg"];
    const before = tracked.map((file) => readFileSync(join(root, file)));
    const nonfinite = Buffer.alloc(8 * 4); nonfinite.writeFloatLE(Number.NaN, 0);
    const cases: Array<[string, Buffer, RegExp?]> = [
      ["bad", Buffer.from("NRRD0005\nnot a valid header")],
      ["type", Buffer.concat([header({ type: "double", endian: "little" }), Buffer.alloc(8 * 8)]), /SCALAR_VOLUME_UNSUPPORTED_TYPE/],
      ["dimension", Buffer.concat([header({ sizes: "2 2", directions: "(1,0,0) (0,1,0)" }), samples.subarray(0, 4)])],
      ["nonfinite", Buffer.concat([header({ type: "float", endian: "little" }), nonfinite])],
      ["space", Buffer.concat([header({ space: "scanner-xyz" }), samples])],
      ["singular", Buffer.concat([header({ directions: "(1,0,0) (1,0,0) (0,0,1)" }), samples])],
      ["gzip", Buffer.concat([header({ encoding: "gzip" }), gzipSync(Buffer.alloc(1024))])]
    ];
    for (const [name, bytes, reason] of cases) {
      writeFileSync(join(root, `assets/${name}.nrrd`), bytes);
      const admission = expect(addAssetAsync({ projectDir: root, file: `assets/${name}.nrrd`, name: "kept" })).rejects;
      if (reason) await admission.toThrow(reason);
      else await admission.toThrow();
    }
    writeFileSync(join(root, "assets/large.nrrd"), good);
    truncateSync(join(root, "assets/large.nrrd"), 64 * 1024 * 1024 + 1);
    await expect(addAssetAsync({ projectDir: root, file: "assets/large.nrrd", name: "kept" })).rejects.toThrow(/64 MiB/);
    writeFileSync(join(root, "assets/large.nhdr"), detached("large.raw"));
    writeFileSync(join(root, "assets/large.raw"), samples);
    truncateSync(join(root, "assets/large.raw"), 64 * 1024 * 1024);
    await expect(addAssetAsync({ projectDir: root, file: "assets/large.nhdr", name: "kept" })).rejects.toThrow(/remaining input budget/);
    expect(tracked.map((file) => readFileSync(join(root, file)))).toEqual(before);
  });

  it("refuses an existing namespace with different bytes and detects changed or missing dependencies", async () => {
    const root = project(), bytes = detached();
    writeFileSync(join(root, "assets/scan.nhdr"), bytes); writeFileSync(join(root, "assets/voxels.raw"), samples);
    const options = { projectDir: root, file: "assets/scan.nhdr", name: "scan" };
    const entry = (await addAssetAsync(options)).manifest.assets[0]!;
    const child = join(root, dirname(entry.outputPath), "voxels.raw");
    const manifest = readFileSync(join(root, "aura.assets.json"));
    writeFileSync(child, Buffer.alloc(samples.length));
    expect(validateAssets({ projectDir: root }).failures.join(" ")).toMatch(/dependency hash mismatch/);
    await expect(addAssetAsync(options)).rejects.toThrow(/namespace contains different bytes/);
    expect(readFileSync(join(root, "aura.assets.json"))).toEqual(manifest);
    expect(readFileSync(child)).toEqual(Buffer.alloc(samples.length));
    rmSync(child);
    expect(validateAssets({ projectDir: root }).failures.join(" ")).toMatch(/dependency validation failed/);
  });

  it("compares dependency metadata with the actual staged header reference", async () => {
    const root = project(), bytes = detached();
    writeFileSync(join(root, "assets/scan.nhdr"), bytes); writeFileSync(join(root, "assets/voxels.raw"), samples);
    const entry = (await addAssetAsync({ projectDir: root, file: "assets/scan.nhdr", name: "scan" })).manifest.assets[0]!;
    const manifestPath = join(root, "aura.assets.json");
    const stored = JSON.parse(readFileSync(manifestPath, "utf8"));
    stored.assets[0].dependencies = ["different.raw"];
    stored.assets[0].integrity.dependencies = { "different.raw": `sha256-${digest(samples)}` };
    writeFileSync(manifestPath, JSON.stringify(stored));
    expect(readAssetManifest(root).assets[0]?.outputPath).toBe(entry.outputPath);
    expect(validateAssets({ projectDir: root }).failures.join(" ")).toMatch(/does not match the declared reference/);
  });
});
