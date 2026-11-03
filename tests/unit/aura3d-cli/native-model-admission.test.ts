import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addAsset, addAssetAsync } from "../../../packages/aura3d-cli/src/index";

const roots: string[] = [];
const repo = resolve(import.meta.dirname, "../../..");
const ply = ["ply", "format ascii 1.0", "element vertex 3", "property float x", "property float y", "property float z", "element face 1", "property list uchar int vertex_indices", "end_header", "0 0 0", "2 0 0", "0 3 0", "3 0 1 2", ""].join("\n");
const stl = ["solid triangle", "facet normal 0 0 1", "outer loop", "vertex 0 0 0", "vertex 2 0 0", "vertex 0 3 0", "endloop", "endfacet", "endsolid triangle", ""].join("\n");

function binaryPly(little: boolean): Buffer {
  const header = Buffer.from(["ply", `format binary_${little ? "little" : "big"}_endian 1.0`, "element vertex 3", "property float x", "property float y", "property float z", "element face 1", "property list uchar int vertex_indices", "end_header", ""].join("\n"));
  const body = Buffer.alloc(3 * 3 * 4 + 13), view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  [0, 0, 0, 2, 0, 0, 0, 3, 0].forEach((value, index) => view.setFloat32(index * 4, value, little));
  body[36] = 3;
  [0, 1, 2].forEach((value, index) => view.setInt32(37 + index * 4, value, little));
  return Buffer.concat([header, body]);
}

function binaryStl(): Buffer {
  const bytes = Buffer.alloc(134), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  bytes.write("solid binary"); view.setUint32(80, 1, true);
  [0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0].forEach((value, index) => view.setFloat32(84 + index * 4, value, true));
  return bytes;
}

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-native-admit-"));
  roots.push(root);
  mkdirSync(join(root, "assets"));
  return root;
}

function digest(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Independently constructed stored ZIP/OPC fixture: no archive is extracted to disk. */
function package3mf(modelOverride?: string): Buffer {
  const model = modelOverride ?? `<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="meter"><resources><object id="1" name="triangle"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="2" y="0" z="0"/><vertex x="0" y="3" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  const files: Array<[string, string]> = [
    ["_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/></Relationships>`],
    ["[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`],
    ["3D/3dmodel.model", model]
  ];
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, contents] of files) {
    const nameBytes = Buffer.from(name), data = Buffer.from(contents), crc = crc32(data);
    const header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(nameBytes.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, nameBytes, data); central.push(directory, nameBytes); offset += header.length + nameBytes.length + data.length;
  }
  const table = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(table.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, table, end]);
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("native model asset admission", () => {
  it.each([["PLY", ply], ["STL", stl]] as const)("admits real %s bytes synchronously with typed hash and provenance", (extension, bytes) => {
    const root = project(), hash = digest(bytes), file = `assets/triangle.${extension}`;
    writeFileSync(join(root, file), bytes);
    const result = addAsset({ projectDir: root, file, name: "triangle", license: "CC0-1.0", licenseUrl: "https://example.test/license", sourcePage: "https://example.test/model", author: "Artist", retrievedAt: "2026-01-01T00:00:00Z", quality: "candidate", role: "prop" });
    const entry = result.manifest.assets[0]!;
    expect(entry).toMatchObject({
      type: "model", format: extension.toLowerCase(), hash: `sha256-${hash}`, source: file,
      sizeBytes: Buffer.byteLength(bytes), bounds: [2, 3, 0], quality: "candidate", role: "prop",
      provenance: { sourcePath: file, license: "CC0-1.0", licenseUrl: "https://example.test/license", sourcePage: "https://example.test/model", author: "Artist", retrievedAt: "2026-01-01T00:00:00Z" }
    });
    expect(result.messages.join(" ")).toMatch(/Register a renderer-capable/);
    expect(entry.warnings.join(" ")).not.toMatch(/requires explicit registration/);
    expect(entry.url).toBe(`/aura-assets/triangle.${hash.slice(0, 8)}.${extension.toLowerCase()}`);
    expect(readFileSync(join(root, entry.outputPath), "utf8")).toBe(bytes);
    const stored = JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8"));
    expect(stored.assets[0].integrity).toMatchObject({ version: 1, digest: `sha256-${hash}` });
    const typed = readFileSync(join(root, "src/aura-assets.ts"), "utf8");
    expect(typed).toContain(`sha256-${hash}`);
    expect(typed).toContain(`readonly format: "${extension.toLowerCase()}"`);
    expect(typed).toContain('type: "model"');
  });

  it("inspects a real 3MF package asynchronously before creating its typed manifest", async () => {
    const root = project(), bytes = package3mf(), hash = digest(bytes);
    writeFileSync(join(root, "assets/triangle.3mf"), bytes);
    expect(() => addAsset({ projectDir: root, file: "assets/triangle.3mf", name: "triangle" })).toThrow(/asynchronous/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    const result = await addAssetAsync({ projectDir: root, file: "assets/triangle.3mf", name: "triangle", publicPath: "/models/", outputDir: "public/models", typegen: "generated/assets.ts", license: "CC0-1.0", sha256: hash });
    const entry = result.manifest.assets[0]!;
    expect(entry).toMatchObject({ type: "model", format: "3mf", hash: `sha256-${hash}`, url: `/models/triangle.${hash.slice(0, 8)}.3mf`, provenance: { license: "CC0-1.0", sha256: hash } });
    expect(readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    expect(readFileSync(join(root, "generated/assets.ts"), "utf8")).toContain(`sha256-${hash}`);
  });

  it.each([["little-endian PLY", "ply", binaryPly(true)], ["big-endian PLY", "ply", binaryPly(false)], ["binary STL", "stl", binaryStl()]] as const)("admits %s from the actual bytes", (_label, extension, bytes) => {
    const root = project();
    writeFileSync(join(root, `assets/model.${extension}`), bytes);
    const entry = addAsset({ projectDir: root, file: `assets/model.${extension}`, name: "model" }).manifest.assets[0]!;
    expect(entry).toMatchObject({ type: "model", format: extension, hash: `sha256-${digest(bytes)}`, bounds: [2, 3, 0] });
    expect(readFileSync(join(root, entry.outputPath))).toEqual(bytes);
  });

  it("preserves provenance across a re-add and records a durable staged path for external files", () => {
    const root = project(), external = project(), source = join(external, "assets/model.stl");
    writeFileSync(source, stl);
    const first = addAsset({ projectDir: root, file: source, name: "model", license: "CC0-1.0", author: "Artist", sourcePage: "https://example.test/model", retrievedAt: "2026-01-01T00:00:00Z", role: "prop", quality: "candidate" }).manifest.assets[0]!;
    expect(first.source).toBe(first.outputPath);
    expect(first.provenance?.sourcePath).toBe(first.outputPath);
    rmSync(source);
    const second = addAsset({ projectDir: root, file: first.outputPath, name: "model" }).manifest.assets[0]!;
    expect(second).toMatchObject({ hash: first.hash, role: "prop", quality: "candidate", provenance: { license: "CC0-1.0", author: "Artist", sourcePage: "https://example.test/model", retrievedAt: "2026-01-01T00:00:00Z" } });
  });

  it("does not carry an older model's rights, digest, or quality onto different bytes with the same id", () => {
    const root = project(), path = join(root, "assets/model.ply");
    writeFileSync(path, ply);
    addAsset({ projectDir: root, file: "assets/model.ply", name: "model", sha256: digest(ply), license: "CC0-1.0", sourcePage: "https://example.test/original", quality: "candidate" });
    writeFileSync(path, ply.replace("2 0 0", "4 0 0"));
    const entry = addAsset({ projectDir: root, file: "assets/model.ply", name: "model" }).manifest.assets[0]!;
    expect(entry.quality).toBe("ungraded");
    expect(entry.provenance?.license).toBeUndefined();
    expect(entry.provenance?.sourcePage).toBeUndefined();
    expect(entry.provenance?.sha256).toBeUndefined();
    expect(entry.hash).toBe(`sha256-${digest(readFileSync(path))}`);
  });

  it("rejects malformed mesh and archive bytes before changing an existing admission", async () => {
    const root = project();
    writeFileSync(join(root, "assets/good.ply"), ply);
    const good = addAsset({ projectDir: root, file: "assets/good.ply", name: "kept", license: "CC0-1.0" }).manifest.assets[0]!;
    const paths = ["aura.assets.json", "src/aura-assets.ts", good.outputPath, "public/aura-assets/kept.thumb.svg"];
    const before = paths.map((path) => readFileSync(join(root, path)));
    for (const [name, bytes] of [["bad.ply", ply.replace("3 0 1 2", "3 0 1 9")], ["bad.stl", stl.replace("endloop", "missing")], ["bad.3mf", package3mf().subarray(0, 40)]] as const) {
      writeFileSync(join(root, "assets", name), bytes);
      await expect(addAssetAsync({ projectDir: root, file: `assets/${name}`, name: "bad" })).rejects.toThrow();
    }
    await expect(addAssetAsync({ projectDir: root, file: "assets/good.ply", name: "bad", orientation: { source: "gltf-extras", messages: [] } })).rejects.toThrow(/orientation/);
    paths.forEach((path, index) => expect(readFileSync(join(root, path))).toEqual(before[index]));
    expect(readdirSync(root).filter((name) => name.startsWith(".aura3d-admission-"))).toEqual([]);
  });

  it("rejects unsupported types, conflicting hashes, unsafe paths and unavailable no-copy output without writes", () => {
    const root = project();
    writeFileSync(join(root, "assets/good.ply"), ply);
    const base = { projectDir: root, file: "assets/good.ply", name: "good" } as const;
    for (const options of [
      { ...base, type: "texture" as const },
      { ...base, sha256: "0".repeat(64) },
      { ...base, name: "../escape" },
      { ...base, outputDir: "../escape" },
      { ...base, typegen: "../escape.ts" },
      { ...base, publicPath: "//other.test/models/" },
      { ...base, publicPath: "/models/%2e%2e/" },
      { ...base, copy: false }
    ]) expect(() => addAsset(options)).toThrow();
    expect(readdirSync(root)).toEqual(["assets"]);
  });

  it("does not misclassify a Gaussian splat PLY as an ordinary mesh", () => {
    const root = project();
    const names = ["scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3", "opacity", "f_dc_0", "f_dc_1", "f_dc_2"];
    const bytes = ["ply", "format ascii 1.0", "element vertex 1", "property float x", "property float y", "property float z", ...names.map((name) => `property float ${name}`), "end_header", `0 0 0 ${names.map(() => "0").join(" ")}`, ""].join("\n");
    writeFileSync(join(root, "assets/splat.ply"), bytes);
    expect(() => addAsset({ projectDir: root, file: "assets/splat.ply", name: "splat" })).toThrow(/Gaussian splat PLY/);
    expect(readdirSync(root)).toEqual(["assets"]);
  });

  it("rejects oversized files and unsupported 3MF required extensions before writing", async () => {
    const root = project();
    const big = join(root, "assets/large.ply");
    writeFileSync(big, ""); truncateSync(big, 64 * 1024 * 1024 + 1);
    expect(() => addAsset({ projectDir: root, file: "assets/large.ply", name: "large" })).toThrow(/64 MiB/);
    const model = `<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:x="urn:unsupported" requiredextensions="x"><resources/><build/></model>`;
    writeFileSync(join(root, "assets/unsupported.3mf"), package3mf(model));
    await expect(addAssetAsync({ projectDir: root, file: "assets/unsupported.3mf", name: "unsupported" })).rejects.toThrow(/3MF_REQUIRED_EXTENSION/);
    expect(readdirSync(root)).toEqual(["assets"]);
  });

  it("rejects symlinked outputs and keeps existing generated files when a destination is unusable", () => {
    const root = project(), outside = project();
    writeFileSync(join(root, "assets/good.stl"), stl);
    symlinkSync(outside, join(root, "linked"));
    expect(() => addAsset({ projectDir: root, file: "assets/good.stl", name: "unsafe", outputDir: "linked" })).toThrow(/symbolic links/);
    expect(readdirSync(outside)).toEqual(["assets"]);
    const result = addAsset({ projectDir: root, file: "assets/good.stl", name: "kept" });
    const manifest = readFileSync(join(root, "aura.assets.json"));
    const generated = readFileSync(join(root, "src/aura-assets.ts"));
    writeFileSync(join(root, "occupied"), "file");
    expect(() => addAsset({ projectDir: root, file: "assets/good.stl", name: "new", typegen: "occupied/assets.ts" })).toThrow();
    expect(readFileSync(join(root, "aura.assets.json"))).toEqual(manifest);
    expect(readFileSync(join(root, "src/aura-assets.ts"))).toEqual(generated);
    expect(existsSync(join(root, result.manifest.assets[0]!.outputPath))).toBe(true);
    expect(readdirSync(root).filter((name) => name.startsWith(".aura3d-admission-"))).toEqual([]);
  });

  it("honors copy:false only when the exact hashed output is already staged", () => {
    const root = project(), hash = digest(ply), output = `public/aura-assets/triangle.${hash.slice(0, 8)}.ply`;
    writeFileSync(join(root, "assets/triangle.ply"), ply);
    mkdirSync(join(root, "public/aura-assets"), { recursive: true });
    writeFileSync(join(root, output), ply);
    const result = addAsset({ projectDir: root, file: "assets/triangle.ply", name: "triangle", copy: false });
    expect(result.manifest.assets[0]!.outputPath).toBe(output);
    expect(readFileSync(join(root, output), "utf8")).toBe(ply);
  });

  it("uses the actual assets add command for 3MF and its existing provenance/type flags", () => {
    const root = project(), bytes = package3mf();
    writeFileSync(join(root, "assets/triangle.3mf"), bytes);
    // Real CLI startup can exceed the default unit-test deadline; still bound hangs in the subprocess itself.
    const output = execFileSync(join(repo, "node_modules/.bin/tsx"), ["--tsconfig", join(repo, "tsconfig.base.json"), join(repo, "packages/aura3d-cli/src/cli.ts"), "assets", "add", "assets/triangle.3mf", "--name", "triangle", "--type", "model", "--license", "CC0-1.0", "--source-page", "https://example.test/model", "--author", "Artist", "--role", "prop", "--quality", "candidate"], { cwd: root, encoding: "utf8", timeout: 25_000 });
    expect(output).toMatch(/renderer-capable 3MF adapter/);
    const manifest = JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8"));
    expect(manifest.assets[0]).toMatchObject({ type: "model", format: "3mf", hash: `sha256-${digest(bytes)}`, role: "prop", quality: "candidate", provenance: { license: "CC0-1.0", sourcePage: "https://example.test/model", author: "Artist" } });
  }, 30_000);
});
