import { createHash, webcrypto } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAssetManifest, validateAssets, writeTypedAssets } from "../../../packages/aura3d-cli/src/index.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";

const roots: string[] = [];
const digest = (bytes: Uint8Array | string): string => `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const geometry = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);

function glb(json: object, bin?: Buffer): Buffer {
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)]);
  const binary = bin && Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length + (binary ? 8 + binary.length : 0), 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  if (!binary) return Buffer.concat([header, padded]);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binaryHeader, binary]);
}

interface FixtureOptions {
  readonly digests?: Readonly<Record<string, string>>;
  readonly requireDependencies?: boolean;
  readonly recordedDependencies?: readonly string[];
  readonly textures?: readonly string[];
  readonly url?: string;
  readonly bin?: Buffer;
}

function project(json: object, options: FixtureOptions = {}): { root: string; bytes: Buffer; model: string } {
  const root = mkdtempSync(join(tmpdir(), "aura3d-glb-check-"));
  roots.push(root);
  const model = join(root, "public/aura-assets/model.glb");
  mkdirSync(dirname(model), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  const bytes = glb(json, options.bin);
  writeFileSync(model, bytes);
  writeFileSync(join(root, "src/aura-assets.ts"), "export const assets = {};\n");
  writeFileSync(join(root, "aura.assets.json"), JSON.stringify({
    schema: "aura3d.assets/1.0",
    assetBasePath: "/aura-assets/",
    outputDir: "public/aura-assets",
    typegen: "src/aura-assets.ts",
    assets: [{
      id: "model", type: "model", format: "glb", source: "source/model.glb",
      outputPath: "public/aura-assets/model.glb", url: options.url ?? "/aura-assets/model.glb",
      hash: digest(bytes), sizeBytes: bytes.length, materials: [], animations: [],
      textures: options.textures ?? [], dependencies: options.recordedDependencies ?? [],
      ...(options.digests ? { integrity: {
        version: 1, digest: digest(bytes), dependencies: options.digests,
        ...(options.requireDependencies === undefined ? {} : { requireDependencies: options.requireDependencies })
      } } : {})
    }]
  }));
  return { root, bytes, model };
}

function sidecar(root: string, path: string, bytes: Buffer): void {
  const target = join(root, "public/aura-assets", path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("assets check GLB external dependencies", () => {
  it("accepts staged image and buffer bytes whose admitted hashes match the actual JSON URIs", () => {
    const { root } = project({
      asset: { version: "2.0" },
      images: [{ uri: "Textures/color%20map.png" }, { uri: "Textures/color%20map.png" }],
      buffers: [{ uri: "./geometry.bin", byteLength: geometry.length }]
    }, {
      digests: {
        "./Textures/color%20map.png": digest(image),
        "/aura-assets/geometry.bin": digest(geometry)
      },
      // The runtime enforces dependency integrity even if this flag is false.
      requireDependencies: false,
      recordedDependencies: ["outdated/not-the-real-reference.bin"],
      textures: ["not-an-external-path"]
    });
    sidecar(root, "Textures/color map.png", image);
    sidecar(root, "geometry.bin", geometry);
    const generated = readFileSync(writeTypedAssets(root, readAssetManifest(root)), "utf8");
    expect(generated).toContain(digest(image));
    expect(generated).toContain(digest(geometry));

    const report = validateAssets({ projectDir: root });
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("reports all actually referenced missing resources even when source copies exist and metadata omits them", () => {
    const { root } = project({
      asset: { version: "2.0" },
      images: [{ uri: "Textures/colormap.png" }],
      buffers: [{ uri: "mesh.bin", byteLength: geometry.length }]
    }, { digests: { "Textures/colormap.png": digest(image), "mesh.bin": digest(geometry) } });
    mkdirSync(join(root, "source/Textures"), { recursive: true });
    writeFileSync(join(root, "source/Textures/colormap.png"), image);
    writeFileSync(join(root, "source/mesh.bin"), geometry);

    const report = validateAssets({ projectDir: root });
    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain('Missing referenced asset dependency for "model": "Textures/colormap.png"');
    expect(report.failures.join("\n")).toContain('Missing referenced asset dependency for "model": "mesh.bin"');
  });

  it("requires integrity for a present external file even for legacy and explicitly non-required manifests", () => {
    for (const options of [{}, { digests: {}, requireDependencies: false }]) {
      const { root } = project({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] }, options);
      sidecar(root, "image.png", image);
      const report = validateAssets({ projectDir: root });
      expect(report.failures.join("\n")).toContain('Missing required GLB dependency integrity for "model": "image.png"');
    }
  });

  it("detects altered child bytes and altered root bytes independently", () => {
    const json = {
      asset: { version: "2.0" },
      images: [{ uri: "texture.png" }],
      buffers: [{ uri: "geometry.bin", byteLength: geometry.length }]
    };
    const { root, model } = project(json, { digests: { "texture.png": digest(image), "geometry.bin": digest(geometry) } });
    sidecar(root, "texture.png", image);
    sidecar(root, "geometry.bin", geometry);
    expect(validateAssets({ projectDir: root }).ok).toBe(true);

    sidecar(root, "texture.png", Buffer.from("tampered"));
    sidecar(root, "geometry.bin", Buffer.alloc(geometry.length, 0x44));
    let failures = validateAssets({ projectDir: root }).failures.join("\n");
    expect(failures).toMatch(/GLB dependency hash mismatch.*texture\.png/);
    expect(failures).toMatch(/GLB dependency hash mismatch.*geometry\.bin/);

    sidecar(root, "texture.png", image);
    sidecar(root, "geometry.bin", geometry);
    writeFileSync(model, glb({ ...json, asset: { version: "2.0", generator: "changed" } }));
    failures = validateAssets({ projectDir: root }).failures.join("\n");
    expect(failures).toMatch(/Hash mismatch for "model"/);
  });

  it("skips bufferView images, embedded BIN buffers, data URIs, and misleading manifest texture names", () => {
    const { root } = project({
      asset: { version: "2.0" },
      buffers: [
        { byteLength: 4 },
        { uri: "data:application/octet-stream;base64,AAECAw==", byteLength: 4 }
      ],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
      images: [
        { name: "not-a-local-path.png", bufferView: 0, mimeType: "image/png" },
        { uri: "data:image/png;base64,iVBORw0KGgo=" }
      ]
    }, {
      bin: Buffer.from([0, 1, 2, 3]),
      recordedDependencies: ["stale/ghost.bin"],
      textures: ["embedded image name", "stale/ghost.png"]
    });
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it.each([
    "../secret.png", "Textures/../../secret.png", "%2e%2e/secret.png", "Textures/.%2e/secret.png",
    "Textures%2fsecret.png", "Textures%5csecret.png", "%252e%252e/secret.png",
    "/etc/passwd", "//example.test/image.png", "https://example.test/image.png", "C:/secret.png",
    "Textures\\secret.png", " image.png", "image.png?version=1", "image.png#fragment", "bad%zz.png", "NUL.png"
  ])("rejects unsafe resource URI %s without resolving it as a file", (uri) => {
    const { root } = project({ asset: { version: "2.0" }, images: [{ uri }] });
    const report = validateAssets({ projectDir: root });
    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toMatch(/Invalid or unsafe GLB dependency/);
  });

  it("rejects symlinked and non-regular sidecars", () => {
    const { root } = project({
      asset: { version: "2.0" }, images: [{ uri: "link.png" }, { uri: "directory.png" }]
    }, { digests: { "link.png": digest(image), "directory.png": digest(image) } });
    sidecar(root, "actual.png", image);
    symlinkSync(join(root, "public/aura-assets/actual.png"), join(root, "public/aura-assets/link.png"));
    mkdirSync(join(root, "public/aura-assets/directory.png"));
    const failures = validateAssets({ projectDir: root }).failures.join("\n");
    expect(failures).toMatch(/link\.png.*symbolic link/);
    expect(failures).toMatch(/directory\.png.*not a regular file/);
  });

  it("uses the first equivalent integrity key, as the runtime does", () => {
    const { root } = project({ asset: { version: "2.0" }, images: [{ uri: "texture.png" }] }, {
      digests: { "./texture.png": digest("wrong"), "texture.png": digest(image) }
    });
    sidecar(root, "texture.png", image);
    expect(validateAssets({ projectDir: root }).failures.join("\n")).toMatch(/GLB dependency hash mismatch.*texture\.png/);
  });

  it("still reports derived metadata drift using the bounded GLB JSON", () => {
    const { root } = project({
      asset: { version: "2.0" },
      accessors: [{ count: 3, min: [0, 0, 0], max: [1, 2, 3] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
    });
    const path = join(root, "aura.assets.json");
    const manifest = JSON.parse(readFileSync(path, "utf8")) as { assets: { bounds?: number[] }[] };
    manifest.assets[0]!.bounds = [1, 3, 2];
    writeFileSync(path, JSON.stringify(manifest));
    const report = validateAssets({ projectDir: root });
    expect(report.failures).toEqual([]);
    expect(report.warnings.join("\n")).toContain("do not match the asset file");
  });

  it("rejects an oversized JSON chunk before allocating or reading it", () => {
    const { root, model } = project({ asset: { version: "2.0" } });
    const jsonLength = 16 * 1024 * 1024 + 4;
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + jsonLength, 8);
    header.writeUInt32LE(jsonLength, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    writeFileSync(model, header);
    truncateSync(model, 20 + jsonLength);
    expect(validateAssets({ projectDir: root }).failures.join("\n")).toMatch(/GLB JSON chunk must be between/);
  });

  it("fails closed on duplicate JSON chunks, malformed chunks, and non-string resource URIs", () => {
    const first = project({ asset: { version: "2.0" } });
    const other = glb({ asset: { version: "2.0" }, images: [{ uri: "hidden.png" }] });
    const duplicated = Buffer.concat([first.bytes, other.subarray(12)]);
    duplicated.writeUInt32LE(duplicated.length, 8);
    writeFileSync(first.model, duplicated);
    expect(validateAssets({ projectDir: first.root }).failures.join("\n")).toMatch(/more than one JSON chunk/);

    const second = project({ asset: { version: "2.0" } });
    const malformed = Buffer.from(second.bytes);
    malformed.writeUInt32LE(malformed.length, 12);
    writeFileSync(second.model, malformed);
    expect(validateAssets({ projectDir: second.root }).failures.join("\n")).toMatch(/chunk length is invalid/);

    const third = project({ asset: { version: "2.0" }, buffers: [{ uri: 123 }] });
    expect(validateAssets({ projectDir: third.root }).failures.join("\n")).toMatch(/non-string URI/);
    const fourth = project({ asset: { version: "2.0" }, images: [{ name: "missing-source" }] });
    expect(validateAssets({ projectDir: fourth.root }).failures.join("\n")).toMatch(/must have a URI or a bufferView/);
  });

  it("agrees with the typed runtime about external GLB buffer integrity without network access", async () => {
    const json = {
      asset: { version: "2.0" },
      buffers: [{ uri: "geo/triangle.bin", byteLength: geometry.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: geometry.length }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
    };
    const url = "https://fixture.test/aura-assets/model.glb";
    const { root, bytes } = project(json, { url, digests: { "geo/triangle.bin": digest(geometry) } });
    sidecar(root, "geo/triangle.bin", geometry);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);

    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const requested = String(input);
      const body = requested === url ? bytes : requested === "https://fixture.test/aura-assets/geo/triangle.bin" ? geometry : undefined;
      if (!body) throw new Error(`Unexpected offline fixture request: ${requested}`);
      return new Response(Uint8Array.from(body).buffer, { status: 200 });
    }));
    const asset = {
      url, format: "glb", hash: digest(bytes),
      integrity: { version: 1 as const, digest: digest(bytes), dependencies: { "geo/triangle.bin": digest(geometry) } }
    };
    const actor = await createTypedGLBActor({ asset, id: "verified-glb", width: 64, height: 64 });
    actor.dispose();
    await expect(createTypedGLBActor({
      asset: { url, format: "glb", hash: digest(bytes) }, id: "unverified-glb", width: 64, height: 64
    })).rejects.toThrow(/dependency integrity/i);
  });
});
