import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addAsset, addAssetAsync } from "../../../packages/aura3d-cli/src/index";

const roots: string[] = [];

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-pvr-admission-"));
  roots.push(root);
  mkdirSync(join(root, "assets"));
  return root;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A tiny independently constructed PVR v3 RGBA texture. */
function pvr(options: { flags?: number; bits?: 8 | 16; metadata?: Buffer; fill?: number } = {}): Buffer {
  const metadata = options.metadata ?? Buffer.alloc(0);
  const bits = options.bits ?? 8;
  const pixels = Buffer.alloc(2 * 2 * 4 * (bits / 8), options.fill ?? 23);
  const header = Buffer.alloc(52);
  header.writeUInt32LE(0x03525650, 0);
  header.writeUInt32LE(options.flags ?? 0, 4);
  header.writeUInt32LE(0x61626772, 8); // r, g, b, a
  header.writeUInt32LE(bits === 8 ? 0x08080808 : 0x10101010, 12);
  header.writeUInt32LE(1, 16); // sRGB
  header.writeUInt32LE(bits === 8 ? 0 : 4, 20); // unsigned normalized channels
  header.writeUInt32LE(2, 24); // height
  header.writeUInt32LE(2, 28); // width
  header.writeUInt32LE(1, 32); // depth
  header.writeUInt32LE(1, 36); // surface count
  header.writeUInt32LE(1, 40); // face count
  header.writeUInt32LE(1, 44); // mip count
  header.writeUInt32LE(metadata.length, 48);
  return Buffer.concat([header, metadata, pixels]);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("bounded PVR texture admission", () => {
  it("requires asynchronous inspection and publishes the inspected bytes with provenance and a typed digest", async () => {
    const root = project(), bytes = pvr(), hash = digest(bytes);
    writeFileSync(join(root, "assets/color.PVR"), bytes);
    const options = {
      projectDir: root, file: "assets/color.PVR", name: "color",
      sha256: `sha256-${hash}`, license: "CC0-1.0", author: "Artist",
      sourcePage: "https://example.test/color", retrievedAt: "2026-01-01T00:00:00Z"
    };
    expect(() => addAsset(options)).toThrow(/PVR texture inspection is asynchronous/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);

    const result = await addAssetAsync(options);
    const entry = result.manifest.assets[0]!;
    expect(entry).toMatchObject({
      id: "color", type: "texture", format: "pvr", hash: `sha256-${hash}`,
      integrity: { version: 1, digest: `sha256-${hash}` }, sizeBytes: bytes.length,
      provenance: { sha256: `sha256-${hash}`, license: "CC0-1.0", author: "Artist", sourcePage: "https://example.test/color" }
    });
    expect(entry.warnings.join(" ")).toMatch(/does not establish renderer, texture-upload, or device support/);
    expect(result.messages.join(" ")).toMatch(/upload and device support have not been established/);
    expect(readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    const generated = readFileSync(join(root, "src/aura-assets.ts"), "utf8");
    expect(generated).toContain(`sha256-${hash}`);
    expect(generated).toContain('readonly format: "pvr"');
    expect(generated).toContain('type: "texture"');
  });

  it("pins the initial input and destination when the source and options change while inspection awaits", async () => {
    const root = project(), bytes = pvr(), replacement = pvr({ fill: 77 });
    const source = join(root, "assets/color.pvr");
    writeFileSync(source, bytes);
    const options = { projectDir: root, file: "assets/color.pvr", name: "color", sha256: digest(bytes) };
    const pending = addAssetAsync(options);
    options.name = "later";
    options.sha256 = digest(replacement);
    writeFileSync(source, replacement);
    const entry = (await pending).manifest.assets[0]!;
    expect(entry.id).toBe("color");
    expect(entry.hash).toBe(`sha256-${digest(bytes)}`);
    expect(readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    expect(readFileSync(source)).toEqual(replacement);
  });

  it("rejects malformed, truncated, unsupported, oversized, or incorrectly typed input before publishing", async () => {
    const root = project();
    const badMagic = pvr(); badMagic.writeUInt32LE(0, 0);
    const badDimensions = pvr(); badDimensions.writeUInt32LE(0, 28);
    const unsupported = Buffer.concat([pvr().subarray(0, 52), Buffer.alloc(32)]);
    unsupported.writeUInt32LE(0, 8); unsupported.writeUInt32LE(0, 12); // PVRTC blocks, no device declared
    for (const [name, bytes] of [
      ["magic", badMagic], ["short", pvr().subarray(0, 55)], ["dimensions", badDimensions], ["unsupported", unsupported]
    ] as const) {
      writeFileSync(join(root, `assets/${name}.pvr`), bytes);
      await expect(addAssetAsync({ projectDir: root, file: `assets/${name}.pvr`, name })).rejects.toThrow();
      expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
      expect(existsSync(join(root, "src/aura-assets.ts"))).toBe(false);
    }
    writeFileSync(join(root, "assets/large.pvr"), pvr());
    truncateSync(join(root, "assets/large.pvr"), 64 * 1024 * 1024 + 1);
    await expect(addAssetAsync({ projectDir: root, file: "assets/large.pvr", name: "large" })).rejects.toThrow(/64 MiB/);
    await expect(addAssetAsync({ projectDir: root, file: "assets/unsupported.pvr", name: "unsupported" })).rejects.toThrow(/requires a GPU format or a transcoder/);
    writeFileSync(join(root, "assets/good.pvr"), pvr());
    await expect(addAssetAsync({ projectDir: root, file: "assets/good.pvr", name: "wrong", type: "model" })).rejects.toThrow(/must use --type texture/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
  });

  it("rejects a changed supplied digest without changing an existing manifest, generated source, or staged asset", async () => {
    const root = project(), original = pvr(), updated = pvr({ fill: 99 });
    const path = join(root, "assets/color.pvr");
    writeFileSync(path, original);
    const first = (await addAssetAsync({ projectDir: root, file: "assets/color.pvr", name: "color", sha256: digest(original), license: "CC0-1.0" })).manifest.assets[0]!;
    const tracked = ["aura.assets.json", "src/aura-assets.ts", first.outputPath, "public/aura-assets/color.thumb.svg"];
    const before = tracked.map((file) => readFileSync(join(root, file)));
    writeFileSync(path, updated);
    await expect(addAssetAsync({ projectDir: root, file: "assets/color.pvr", name: "color", sha256: digest(original) })).rejects.toThrow(/does not match the inspected asset bytes/);
    expect(tracked.map((file) => readFileSync(join(root, file)))).toEqual(before);
    const replacement = (await addAssetAsync({ projectDir: root, file: "assets/color.pvr", name: "color" })).manifest.assets[0]!;
    expect(replacement.hash).toBe(`sha256-${digest(updated)}`);
    expect(replacement.provenance?.license).toBeUndefined();
    expect(replacement.provenance?.sha256).toBeUndefined();
  });

  it("allows copy:false only when the exact digest-named bytes are already staged", async () => {
    const root = project(), bytes = pvr(), hash = digest(bytes);
    writeFileSync(join(root, "assets/color.pvr"), bytes);
    const target = join(root, `public/aura-assets/color.${hash.slice(0, 8)}.pvr`);
    const options = { projectDir: root, file: "assets/color.pvr", name: "color", copy: false };
    await expect(addAssetAsync(options)).rejects.toThrow(/copy:false requires the matching hashed file/);
    mkdirSync(join(root, "public/aura-assets"), { recursive: true });
    writeFileSync(target, pvr({ fill: 99 }));
    await expect(addAssetAsync(options)).rejects.toThrow(/copy:false requires the matching hashed file/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    writeFileSync(target, bytes);
    const entry = (await addAssetAsync(options)).manifest.assets[0]!;
    expect(entry.hash).toBe(`sha256-${hash}`);
    expect(readFileSync(target)).toEqual(bytes);
  });

  it("reports bridge limits for metadata and premultiplied textures while admitting supported high-bit-depth encodings", async () => {
    const root = project();
    for (const [name, bytes, warning] of [
      ["metadata", pvr({ metadata: Buffer.from([1, 2, 3, 4]) }), /does not support PVR orientation or other metadata/],
      ["premultiplied", pvr({ flags: 2 }), /transparent linear RGBA8 pixels/]
    ] as const) {
      writeFileSync(join(root, `assets/${name}.pvr`), bytes);
      const entry = (await addAssetAsync({ projectDir: root, file: `assets/${name}.pvr`, name })).manifest.assets.find((item) => item.id === name)!;
      expect(entry.warnings.join(" ")).toMatch(warning);
    }
    writeFileSync(join(root, "assets/wide.pvr"), pvr({ bits: 16 }));
    const wide = (await addAssetAsync({ projectDir: root, file: "assets/wide.pvr", name: "wide" })).manifest.assets.find((item) => item.id === "wide")!;
    expect(wide.warnings.join(" ")).not.toMatch(/pixel encoding.*not supported/);
  });
});
