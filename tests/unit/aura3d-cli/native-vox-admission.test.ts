import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addAsset, addAssetAsync, readAssetManifest } from "../../../packages/aura3d-cli/src/index";

const roots: string[] = [];

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "aura3d-vox-admission-"));
  roots.push(root);
  mkdirSync(join(root, "assets"));
  return root;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function integer(value: number): Buffer {
  const result = Buffer.alloc(4);
  result.writeInt32LE(value);
  return result;
}

function dictionary(entries: Record<string, string> = {}): Buffer {
  const pairs: Buffer[] = [integer(Object.keys(entries).length)];
  for (const [key, value] of Object.entries(entries)) {
    const keyBytes = Buffer.from(key), valueBytes = Buffer.from(value);
    pairs.push(integer(keyBytes.length), keyBytes, integer(valueBytes.length), valueBytes);
  }
  return Buffer.concat(pairs);
}

function chunk(id: string, content: Buffer, children: Buffer = Buffer.alloc(0)): Buffer {
  const header = Buffer.alloc(12);
  header.write(id, 0, 4, "ascii");
  header.writeUInt32LE(content.length, 4);
  header.writeUInt32LE(children.length, 8);
  return Buffer.concat([header, content, children]);
}

interface VoxFixture {
  readonly version?: number;
  readonly voxels?: readonly number[];
  readonly size?: readonly [number, number, number];
  readonly scene?: "translated" | "hidden" | "cycle";
  readonly material?: boolean;
}

/** Construct minimal chunks directly from the documented binary fields. */
function vox(options: VoxFixture = {}): Buffer {
  const version = options.version ?? 150;
  const size = options.size ?? [2, 3, 4];
  const voxels = options.voxels ?? [0, 0, 0, 1, 1, 2, 3, 1];
  const content = [
    chunk("SIZE", Buffer.concat(size.map(integer))),
    chunk("XYZI", Buffer.concat([integer(voxels.length / 4), Buffer.from(voxels)]))
  ];
  if (options.scene) {
    const palette = Buffer.alloc(1024);
    palette.set([250, 60, 20, 255], 0);
    content.push(chunk("RGBA", palette));
    const attributes: Record<string, string> = options.scene === "hidden" ? { _hidden: "1" } : {};
    const transform = Buffer.concat([
      integer(0), dictionary(attributes), integer(options.scene === "cycle" ? 0 : 1), integer(-1), integer(-1), integer(1),
      dictionary({ _t: "2 3 4" })
    ]);
    content.push(chunk("nTRN", transform));
    if (options.scene !== "cycle") content.push(chunk("nSHP", Buffer.concat([integer(1), dictionary(), integer(1), integer(0), dictionary()])));
  }
  if (options.material) content.push(chunk("MATL", Buffer.concat([integer(1), dictionary({ _type: "_metal" })])));
  const header = Buffer.alloc(8);
  header.write("VOX ");
  header.writeUInt32LE(version, 4);
  return Buffer.concat([header, chunk("MAIN", Buffer.alloc(0), Buffer.concat(content))]);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("bounded VOX model admission", () => {
  it.each([150, 200])("admits version %s from the inspected bytes with typed hash and provenance", async (version) => {
    const root = project(), bytes = vox({ version }), hash = digest(bytes);
    writeFileSync(join(root, "assets/model.VOX"), bytes);
    const options = {
      projectDir: root, file: "assets/model.VOX", name: "model", modelInspection: "strict" as const,
      sha256: `sha256-${hash}`, license: "CC0-1.0", author: "Artist",
      sourcePage: "https://example.test/model", retrievedAt: "2026-01-01T00:00:00Z"
    };
    expect(() => addAsset(options)).toThrow(/VOX model inspection is asynchronous/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    const result = await addAssetAsync(options);
    const entry = result.manifest.assets[0]!;
    expect(entry).toMatchObject({
      type: "model", format: "vox", formatMetadata: { version: String(version) }, hash: `sha256-${hash}`,
      integrity: { version: 1, digest: `sha256-${hash}` },
      modelInspection: { version: 1, status: "parser-inspected", inspector: "vox", digest: `sha256-${hash}` },
      provenance: { license: "CC0-1.0", author: "Artist", sourcePage: "https://example.test/model", sha256: `sha256-${hash}` },
      bounds: [2, 4, 3], boundsMetadata: { min: [0, 0, -3], max: [2, 4, 0] }
    });
    expect(readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    expect(result.messages.join(" ")).toMatch(/Register a renderer-capable VOX adapter/);
    expect(entry.warnings.join(" ")).toMatch(/frame 0.*animation and hierarchy are not retained/i);
    const typed = readFileSync(join(root, "src/aura-assets.ts"), "utf8");
    expect(typed).toContain(`sha256-${hash}`);
    expect(typed).toContain('readonly format: "vox"');
    expect(typed).toContain(`"version": "${version}"`);
    const reloaded = readAssetManifest(root).assets[0]!;
    expect(reloaded.modelInspection?.inspector).toBe("vox");
    expect(Object.is(entry.boundsMetadata?.max[2], -0)).toBe(false);
    expect(reloaded.boundsMetadata).toEqual(entry.boundsMetadata);
  });

  it("derives bounds from version 200 scene transforms and retains material limitations", async () => {
    const root = project(), bytes = vox({ version: 200, scene: "translated", material: true });
    writeFileSync(join(root, "assets/scene.vox"), bytes);
    const entry = (await addAssetAsync({ projectDir: root, file: "assets/scene.vox", name: "scene" })).manifest.assets[0]!;
    expect(entry.formatMetadata?.version).toBe("200");
    expect(entry.boundsMetadata).toMatchObject({ min: [1, 2, -4.5], max: [3, 6, -1.5], size: [2, 4, 3] });
    expect(entry.warnings.join(" ")).toMatch(/physical material properties are not mapped/);
  });

  it("pins the original bytes and destination across the asynchronous parser import", async () => {
    const root = project(), original = vox(), changed = vox({ version: 200 });
    const source = join(root, "assets/model.vox");
    writeFileSync(source, original);
    const options = { projectDir: root, file: "assets/model.vox", name: "model", sha256: digest(original), provenanceEvidence: ["original proof"] };
    const pending = addAssetAsync(options);
    options.name = "changed";
    options.sha256 = digest(changed);
    options.provenanceEvidence.push("later proof");
    writeFileSync(source, changed);
    const entry = (await pending).manifest.assets[0]!;
    expect(entry.id).toBe("model");
    expect(entry.hash).toBe(`sha256-${digest(original)}`);
    expect(entry.formatMetadata?.version).toBe("150");
    expect(entry.provenance?.evidence).toEqual(["original proof"]);
    expect(readFileSync(join(root, entry.outputPath))).toEqual(original);
  });

  it("rejects malformed, unsupported, empty, hidden, and cyclic scenes before any publication", async () => {
    const root = project();
    const badMagic = vox(); badMagic.write("BAD ", 0);
    for (const [name, bytes] of [
      ["magic", badMagic], ["short", vox().subarray(0, 25)], ["version", vox({ version: 151 })],
      ["empty", vox({ voxels: [] })], ["hidden", vox({ version: 200, scene: "hidden" })],
      ["cycle", vox({ version: 200, scene: "cycle" })]
    ] as const) {
      writeFileSync(join(root, `assets/${name}.vox`), bytes);
      await expect(addAssetAsync({ projectDir: root, file: `assets/${name}.vox`, name })).rejects.toThrow();
      expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
      expect(existsSync(join(root, "src/aura-assets.ts"))).toBe(false);
    }
    writeFileSync(join(root, "assets/good.vox"), vox());
    await expect(addAssetAsync({ projectDir: root, file: "assets/good.vox", name: "wrong", type: "texture" })).rejects.toThrow(/must use --type model/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
  });

  it("rejects excessive source and generated geometry without changing existing artifacts", async () => {
    const root = project(), good = vox();
    writeFileSync(join(root, "assets/good.vox"), good);
    const entry = (await addAssetAsync({ projectDir: root, file: "assets/good.vox", name: "kept" })).manifest.assets[0]!;
    const tracked = ["aura.assets.json", "src/aura-assets.ts", entry.outputPath, "public/aura-assets/kept.thumb.svg"];
    const before = tracked.map((file) => readFileSync(join(root, file)));
    writeFileSync(join(root, "assets/truncated.vox"), good.subarray(0, 25));
    await expect(addAssetAsync({ projectDir: root, file: "assets/truncated.vox", name: "kept" })).rejects.toThrow();
    const many: number[] = [];
    for (let z = 0; z < 64 && many.length < 31_000 * 4; z++) for (let y = 0; y < 64 && many.length < 31_000 * 4; y++) for (let x = 0; x < 64 && many.length < 31_000 * 4; x++) {
      if ((x + y + z) % 2 === 0) many.push(x, y, z, 1);
    }
    writeFileSync(join(root, "assets/many.vox"), vox({ size: [64, 64, 64], voxels: many }));
    await expect(addAssetAsync({ projectDir: root, file: "assets/many.vox", name: "kept" })).rejects.toThrow(/VOX_ALLOCATION_LIMIT/);
    writeFileSync(join(root, "assets/large.vox"), good);
    truncateSync(join(root, "assets/large.vox"), 64 * 1024 * 1024 + 1);
    await expect(addAssetAsync({ projectDir: root, file: "assets/large.vox", name: "kept" })).rejects.toThrow(/64 MiB/);
    expect(tracked.map((file) => readFileSync(join(root, file)))).toEqual(before);
  });

  it("rejects stale SHA-256 and only keeps provenance when re-admitting identical bytes", async () => {
    const root = project(), original = vox(), changed = vox({ version: 200 }), source = join(root, "assets/model.vox");
    writeFileSync(source, original);
    const first = (await addAssetAsync({ projectDir: root, file: "assets/model.vox", name: "model", sha256: digest(original), license: "CC0-1.0" })).manifest.assets[0]!;
    const same = (await addAssetAsync({ projectDir: root, file: "assets/model.vox", name: "model" })).manifest.assets[0]!;
    expect(same.provenance).toMatchObject({ license: "CC0-1.0", sha256: digest(original) });
    const tracked = ["aura.assets.json", "src/aura-assets.ts", first.outputPath, "public/aura-assets/model.thumb.svg"];
    const before = tracked.map((file) => readFileSync(join(root, file)));
    writeFileSync(source, changed);
    await expect(addAssetAsync({ projectDir: root, file: "assets/model.vox", name: "model", sha256: digest(original) })).rejects.toThrow(/does not match the inspected asset bytes/);
    expect(tracked.map((file) => readFileSync(join(root, file)))).toEqual(before);
    const replacement = (await addAssetAsync({ projectDir: root, file: "assets/model.vox", name: "model" })).manifest.assets[0]!;
    expect(replacement.hash).toBe(`sha256-${digest(changed)}`);
    expect(replacement.provenance?.license).toBeUndefined();
    expect(replacement.provenance?.sha256).toBeUndefined();
    expect(replacement.formatMetadata?.version).toBe("200");
  });

  it("requires byte-identical copy:false staging and rejects stale parser evidence on reload", async () => {
    const root = project(), bytes = vox(), hash = digest(bytes);
    writeFileSync(join(root, "assets/model.vox"), bytes);
    const target = join(root, `public/aura-assets/model.${hash.slice(0, 8)}.vox`);
    const options = { projectDir: root, file: "assets/model.vox", name: "model", copy: false };
    await expect(addAssetAsync(options)).rejects.toThrow(/copy:false requires the matching hashed file/);
    mkdirSync(join(root, "public/aura-assets"), { recursive: true });
    writeFileSync(target, vox({ version: 200 }));
    await expect(addAssetAsync(options)).rejects.toThrow(/copy:false requires the matching hashed file/);
    expect(existsSync(join(root, "aura.assets.json"))).toBe(false);
    writeFileSync(target, bytes);
    await addAssetAsync(options);
    const stored = JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8"));
    stored.assets[0].modelInspection.digest = `sha256-${"0".repeat(64)}`;
    writeFileSync(join(root, "aura.assets.json"), JSON.stringify(stored));
    expect(() => readAssetManifest(root)).toThrow(/invalid or stale model parser inspection metadata/);
  });
});
