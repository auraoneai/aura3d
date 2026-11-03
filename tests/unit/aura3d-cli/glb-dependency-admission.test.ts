import { createHash, webcrypto } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addAsset, addAssetAsync, readAssetManifest, validateAssets } from "../../../packages/aura3d-cli/src/index.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";

const roots: string[] = [];
const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const geometry = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
const sha = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const digest = (bytes: Uint8Array | string): string => `sha256-${sha(bytes)}`;

function glb(json: object, bin?: Buffer): Buffer {
  const encoded = Buffer.from(JSON.stringify(json));
  const chunk = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)]);
  const binary = bin && Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunk.length + (binary ? 8 + binary.length : 0), 8);
  header.writeUInt32LE(chunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  if (!binary) return Buffer.concat([header, chunk]);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, chunk, binaryHeader, binary]);
}

function project(): string {
  const root = fs.mkdtempSync(join(tmpdir(), "aura3d-glb-admit-"));
  roots.push(root);
  fs.mkdirSync(join(root, "assets"));
  return root;
}

function put(root: string, path: string, bytes: Uint8Array | string): void {
  const destination = join(root, path);
  fs.mkdirSync(dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
}

function namespace(root: Buffer, members: readonly (readonly [string, Buffer])[]): string {
  const pairs = members.map(([uri, bytes]) => [uri, sha(bytes)] as const)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `glb-bundles/${sha(JSON.stringify(["aura3d.glb-bundle/1", sha(root), pairs]))}`;
}

/** Only temporary fixture trees are traversed; links are recorded, not followed. */
function tree(root: string, ignored = ""): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (path: string, name: string): void => {
    if (name === ignored) return;
    const stat = fs.lstatSync(path);
    if (stat.isSymbolicLink()) files[name] = `link:${fs.readlinkSync(path)}`;
    else if (stat.isDirectory()) {
      files[name] = "dir";
      for (const child of fs.readdirSync(path).sort()) visit(join(path, child), name ? `${name}/${child}` : child);
    } else files[name] = fs.readFileSync(path).toString("hex");
  };
  visit(root, "");
  return files;
}

function triangleJson(uri = "geo/triangle.bin"): object {
  return {
    asset: { version: "2.0" },
    buffers: [{ uri, byteLength: geometry.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: geometry.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("content-bound GLB dependency admission", () => {
  it("stages actual image and buffer URIs with their hashes and typed references", () => {
    const root = project();
    const bytes = glb({
      ...triangleJson("./geo/triangle.bin"),
      images: [{ uri: "Textures/color%20map.png" }, { uri: "Textures/color%20map.png" }]
    });
    put(root, "assets/source.glb", bytes);
    put(root, "assets/Textures/color map.png", image);
    put(root, "assets/geo/triangle.bin", geometry);
    const result = addAsset({
      projectDir: root, file: "assets/source.glb", name: "hero",
      license: "CC0-1.0", sha256: sha(bytes), outputDir: "public/models", publicPath: "/models/"
    });
    const entry = result.manifest.assets[0]!;
    const bundle = namespace(bytes, [["./geo/triangle.bin", geometry], ["Textures/color%20map.png", image]]);
    expect(entry.outputPath).toBe(`public/models/${bundle}/document.glb`);
    expect(entry.url).toBe(`/models/${bundle}/document.glb`);
    expect(entry).toMatchObject({
      type: "model", format: "glb", hash: digest(bytes),
      modelInspection: { version: 1, status: "metadata-only" },
      integrity: {
        version: 1, digest: digest(bytes), requireDependencies: true,
        dependencies: { "./geo/triangle.bin": digest(geometry), "Textures/color%20map.png": digest(image) }
      },
      provenance: { license: "CC0-1.0", sha256: sha(bytes) }
    });
    expect(fs.readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    expect(fs.readFileSync(join(root, dirname(entry.outputPath), "Textures/color map.png"))).toEqual(image);
    expect(fs.readFileSync(join(root, dirname(entry.outputPath), "geo/triangle.bin"))).toEqual(geometry);
    const generated = fs.readFileSync(join(root, "src/aura-assets.ts"), "utf8");
    expect(generated).toContain(digest(bytes));
    expect(generated).toContain(digest(image));
    expect(generated).toContain(digest(geometry));
    expect(generated).toContain('"requireDependencies": true');
    expect(result.messages.join(" ")).not.toMatch(/Register a renderer-capable/);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("is compatible with typed actor loading using only offline fixture responses", async () => {
    const root = project(), bytes = glb(triangleJson());
    put(root, "assets/source.glb", bytes);
    put(root, "assets/geo/triangle.bin", geometry);
    const entry = (await addAssetAsync({ projectDir: root, file: "assets/source.glb", name: "triangle" })).manifest.assets[0]!;
    const url = `https://fixture.test${entry.url}`;
    const childUrl = new URL("geo/triangle.bin", url).href;
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const requested = String(input);
      const body = requested === url ? bytes : requested === childUrl ? geometry : undefined;
      if (!body) throw new Error(`Unexpected offline fixture request: ${requested}`);
      return new Response(Uint8Array.from(body).buffer, { status: 200 });
    }));
    const actor = await createTypedGLBActor({ asset: { ...entry, url }, id: "verified", width: 64, height: 64 });
    actor.dispose();
    expect(vi.mocked(fetch).mock.calls.map(([input]) => String(input))).toContain(childUrl);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("admits an explicitly selected external source directory without retaining temporary source paths", () => {
    const root = project(), outside = project(), bytes = glb(triangleJson());
    put(outside, "assets/model.glb", bytes);
    put(outside, "assets/geo/triangle.bin", geometry);
    const entry = addAsset({ projectDir: root, file: join(outside, "assets/model.glb"), name: "model" }).manifest.assets[0]!;
    expect(entry.source).toBe(entry.outputPath);
    expect(entry.provenance?.sourcePath).toBe(entry.outputPath);
    expect(fs.readFileSync(join(root, entry.outputPath))).toEqual(bytes);
    expect(fs.readFileSync(join(root, dirname(entry.outputPath), "geo/triangle.bin"))).toEqual(geometry);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("deduplicates equal local paths while preserving every original URI as an integrity key", () => {
    const root = project(), bytes = glb({
      asset: { version: "2.0" },
      images: [{ uri: "tex.png" }, { uri: "./tex.png" }, { uri: "tex%2epng" }, { uri: "__proto__" }]
    });
    put(root, "assets/model.glb", bytes);
    put(root, "assets/tex.png", image);
    put(root, "assets/__proto__", "legal fixture bytes");
    const entry = addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }).manifest.assets[0]!;
    expect(entry.integrity?.dependencies).toEqual({
      "tex.png": digest(image), "./tex.png": digest(image), "tex%2epng": digest(image),
      ["__proto__"]: digest("legal fixture bytes")
    });
    expect(fs.readFileSync(join(root, "src/aura-assets.ts"), "utf8")).toContain('["__proto__"]:');
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("chooses a document name that cannot overwrite a referenced file", () => {
    const root = project(), bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "document.glb" }] });
    put(root, "assets/original.glb", bytes);
    put(root, "assets/document.glb", image);
    const entry = addAsset({ projectDir: root, file: "assets/original.glb", name: "model" }).manifest.assets[0]!;
    expect(entry.outputPath).toMatch(/\/document-1\.glb$/);
    expect(fs.readFileSync(join(root, dirname(entry.outputPath), "document.glb"))).toEqual(image);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("keeps byte-identical bundles shared, isolates changed dependencies, and does not carry their prior rights", () => {
    const root = project(), bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "texture.png" }] });
    const changed = Buffer.from("different texture bytes");
    for (const folder of ["a", "b"]) {
      put(root, `assets/${folder}/model.glb`, bytes);
      put(root, `assets/${folder}/texture.png`, image);
    }
    const first = addAsset({ projectDir: root, file: "assets/a/model.glb", name: "one", license: "CC0-1.0", role: "prop", quality: "candidate" }).manifest.assets[0]!;
    const shared = addAsset({ projectDir: root, file: "assets/b/model.glb", name: "two", license: "CC-BY-4.0", quality: "candidate" }).manifest.assets.find((asset) => asset.id === "two")!;
    expect(shared.outputPath).toBe(first.outputPath);
    const same = addAsset({ projectDir: root, file: "assets/a/model.glb", name: "one" }).manifest.assets.find((asset) => asset.id === "one")!;
    expect(same).toMatchObject({ provenance: { license: "CC0-1.0" }, quality: "candidate", role: "prop" });

    put(root, "assets/b/texture.png", changed);
    const replacement = addAsset({ projectDir: root, file: "assets/b/model.glb", name: "two" }).manifest.assets.find((asset) => asset.id === "two")!;
    expect(replacement.hash).toBe(first.hash);
    expect(replacement.outputPath).not.toBe(first.outputPath);
    expect(replacement.provenance?.license).toBeUndefined();
    expect(replacement.quality).toBe("ungraded");
    expect(replacement.integrity?.dependencies?.["texture.png"]).toBe(digest(changed));
    expect(fs.readFileSync(join(root, dirname(first.outputPath), "texture.png"))).toEqual(image);
    expect(fs.readFileSync(join(root, dirname(replacement.outputPath), "texture.png"))).toEqual(changed);
    const report = validateAssets({ projectDir: root });
    expect(report.failures).toEqual([]);
    expect(report.warnings.join("\n")).not.toMatch(/duplicate asset hash/);
  });

  it("does not inherit rights from a legacy or incomplete dependency identity", () => {
    const root = project(), bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] });
    put(root, "assets/model.glb", bytes);
    put(root, "assets/image.png", image);
    addAsset({ projectDir: root, file: "assets/model.glb", name: "model", license: "CC0-1.0", quality: "release" });
    const manifestPath = join(root, "aura.assets.json");
    const stored = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { assets: Array<{ integrity: { requireDependencies: boolean } }> };
    stored.assets[0]!.integrity.requireDependencies = false;
    fs.writeFileSync(manifestPath, JSON.stringify(stored));
    const entry = addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }).manifest.assets[0]!;
    expect(entry.provenance?.license).toBeUndefined();
    expect(entry.quality).toBe("ungraded");
    expect(entry.integrity?.requireDependencies).toBe(true);
  });

  it("does not reapply unchanged root-embedded rights to a substituted sidecar", () => {
    const root = project(), bytes = glb({
      asset: { version: "2.0", extras: { aura3d: { provenance: { license: "CC0-1.0", author: "Original creator" } } } },
      images: [{ uri: "image.png" }]
    });
    put(root, "assets/model.glb", bytes);
    put(root, "assets/image.png", image);
    const first = addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }).manifest.assets[0]!;
    expect(first.provenance).toMatchObject({ license: "CC0-1.0", author: "Original creator" });
    put(root, "assets/image.png", "substituted sidecar");
    const replacement = addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }).manifest.assets[0]!;
    expect(replacement.provenance?.license).toBeUndefined();
    expect(replacement.provenance?.author).toBeUndefined();
    expect(replacement.outputPath).not.toBe(first.outputPath);
    const again = addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }).manifest.assets[0]!;
    expect(again.provenance?.license).toBeUndefined();
    expect(again.provenance?.author).toBeUndefined();
    addAsset({ projectDir: root, file: "assets/model.glb", name: "model", license: "CC-BY-4.0" });
    const explicitlyLicensed = addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }).manifest.assets[0]!;
    expect(explicitlyLicensed.provenance?.license).toBe("CC-BY-4.0");
    expect(explicitlyLicensed.provenance?.author).toBeUndefined();
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("requires exact pre-staged root and sidecars for copy:false without replacing them", () => {
    const root = project(), bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] });
    const bundle = namespace(bytes, [["image.png", image]]);
    const stagedRoot = `public/aura-assets/${bundle}/document.glb`;
    const stagedChild = `public/aura-assets/${bundle}/image.png`;
    put(root, "assets/model.glb", bytes);
    put(root, "assets/image.png", image);
    const options = { projectDir: root, file: "assets/model.glb", name: "model", copy: false } as const;
    let before = tree(root);
    expect(() => addAsset(options)).toThrow(/copy:false requires the matching hashed file/);
    expect(tree(root)).toEqual(before);
    put(root, stagedRoot, bytes);
    put(root, stagedChild, "wrong");
    before = tree(root);
    expect(() => addAsset(options)).toThrow(/copy:false requires the matching dependency/);
    expect(tree(root)).toEqual(before);
    put(root, stagedChild, image);
    const entry = addAsset(options).manifest.assets[0]!;
    expect(entry.outputPath).toBe(stagedRoot);
    expect(fs.readFileSync(join(root, stagedRoot))).toEqual(bytes);
    expect(fs.readFileSync(join(root, stagedChild))).toEqual(image);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("refuses an altered existing namespace instead of overwriting it", () => {
    const root = project(), bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] });
    put(root, "assets/model.glb", bytes);
    put(root, "assets/image.png", image);
    const options = { projectDir: root, file: "assets/model.glb", name: "model" } as const;
    const entry = addAsset(options).manifest.assets[0]!;
    put(root, `${dirname(entry.outputPath)}/image.png`, "tampered");
    const before = tree(root);
    expect(() => addAsset(options)).toThrow(/existing GLB namespace contains different/);
    expect(tree(root)).toEqual(before);
    expect(validateAssets({ projectDir: root }).failures.join("\n")).toMatch(/dependency hash mismatch/);
  });

  it.each(["root", "dependency", "extra-key"] as const)(
    "validates the complete bundle identity after %s metadata and bytes are altered",
    (which) => {
      const root = project(), bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] });
      put(root, "assets/model.glb", bytes);
      put(root, "assets/image.png", image);
      const entry = addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }).manifest.assets[0]!;
      const manifestPath = join(root, "aura.assets.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        assets: Array<{ hash: string; integrity: { digest: string; dependencies: Record<string, string> } }>
      };
      if (which === "root") {
        const changed = glb({ asset: { version: "2.0", generator: "altered" }, images: [{ uri: "image.png" }] });
        put(root, entry.outputPath, changed);
        manifest.assets[0]!.hash = digest(changed);
        manifest.assets[0]!.integrity.digest = digest(changed);
      } else if (which === "dependency") {
        const changed = Buffer.from("substituted image");
        put(root, `${dirname(entry.outputPath)}/image.png`, changed);
        manifest.assets[0]!.integrity.dependencies["image.png"] = digest(changed);
      } else {
        manifest.assets[0]!.integrity.dependencies["not-referenced.png"] = digest(image);
      }
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const failures = validateAssets({ projectDir: root }).failures.join("\n");
      expect(failures).toMatch(which === "extra-key" ? /integrity must exactly match/ : /namespace does not match/);
    }
  );

  it("rejects missing files and incorrect root provenance without touching existing outputs", () => {
    const root = project(), first = glb({ asset: { version: "2.0" } });
    put(root, "assets/kept.glb", first);
    addAsset({ projectDir: root, file: "assets/kept.glb", name: "kept" });
    const bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "missing.png" }] });
    put(root, "assets/missing.glb", bytes);
    const before = tree(root);
    expect(() => addAsset({ projectDir: root, file: "assets/missing.glb", name: "new" })).toThrow(/missing.*GLB dependency/i);
    expect(tree(root)).toEqual(before);
    put(root, "assets/missing.png", image);
    const withImage = tree(root);
    expect(() => addAsset({ projectDir: root, file: "assets/missing.glb", name: "new", sha256: "0".repeat(64) })).toThrow(/SHA-256 does not match/);
    expect(tree(root)).toEqual(withImage);
  });

  it.each([undefined, -1, 1.5, geometry.length - 1, geometry.length + 1])(
    "rejects an external buffer whose declared byteLength is %s",
    (declared) => {
      const root = project();
      const bytes = glb({
        asset: { version: "2.0" },
        buffers: [{ uri: "mesh.bin", ...(declared === undefined ? {} : { byteLength: declared }) }]
      });
      put(root, "assets/model.glb", bytes);
      put(root, "assets/mesh.bin", geometry);
      const before = tree(root);
      expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }))
        .toThrow(/buffer.*byteLength/i);
      expect(tree(root)).toEqual(before);
    }
  );

  it.each([
    "../secret.png", "folder/../../secret.png", "%2e%2e/secret.png", "folder/.%2e/secret.png",
    "folder%2fsecret.png", "folder%5csecret.png", "%252e%252e/secret.png", "/absolute.png",
    "//example.test/file.png", "https://example.test/file.png", "C:/file.png", "folder\\file.png",
    " image.png", "image.png?x=1", "image.png#fragment", "bad%zz.png", "NUL.png"
  ])("rejects unsafe external URI %s without publishing anything", (uri) => {
    const root = project();
    put(root, "assets/model.glb", glb({ asset: { version: "2.0" }, images: [{ uri }] }));
    const before = tree(root);
    expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" })).toThrow(/unsafe|dependency/i);
    expect(tree(root)).toEqual(before);
  });

  it.each([
    ["image*.png", "image*.png"],
    ["image%3Cbad.png", "image<bad.png"],
    ["bad\ud800.png", "bad\ufffd.png"]
  ])("rejects the nonportable URI %s even when a matching local file exists", (uri, filename) => {
    const root = project();
    put(root, "assets/model.glb", glb({ asset: { version: "2.0" }, images: [{ uri }] }));
    put(root, `assets/${filename}`, image);
    const before = tree(root);
    expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }))
      .toThrow(/nonportable|unsafe/i);
    expect(tree(root)).toEqual(before);
  });

  it.each([
    { outputDir: "public/invalid*" },
    { outputDir: "public/NUL" },
    { typegen: "src/CON.ts" },
    { typegen: "src/unsafe\nmodule.ts" },
    { publicPath: "/models\n/" }
  ])("rejects nonportable output or public paths without publishing: %o", (options) => {
    const root = project();
    put(root, "assets/model.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] }));
    put(root, "assets/image.png", image);
    const before = tree(root);
    expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model", ...options }))
      .toThrow(/nonportable|unsafe/i);
    expect(tree(root)).toEqual(before);
  });

  it("rejects symlinked roots, symlinked dependency files and directories, and symlinked destinations", () => {
    const root = project(), outside = project();
    const bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "nested/image.png" }] });
    put(root, "assets/source.glb", bytes);
    put(outside, "assets/image.png", image);
    fs.symlinkSync(join(root, "assets/source.glb"), join(root, "assets/link.glb"));
    expect(() => addAsset({ projectDir: root, file: "assets/link.glb", name: "model" })).toThrow(/symbolic link/);
    fs.symlinkSync(join(outside, "assets"), join(root, "assets/nested"));
    const before = tree(root), otherBefore = tree(outside);
    expect(() => addAsset({ projectDir: root, file: "assets/source.glb", name: "model" })).toThrow(/symbolic link/);
    expect(tree(root)).toEqual(before);
    expect(tree(outside)).toEqual(otherBefore);
    fs.rmSync(join(root, "assets/nested"));
    fs.mkdirSync(join(root, "assets/nested"));
    fs.symlinkSync(join(outside, "assets/image.png"), join(root, "assets/nested/image.png"));
    expect(() => addAsset({ projectDir: root, file: "assets/source.glb", name: "model" })).toThrow(/symbolic link/);
    fs.rmSync(join(root, "assets/nested/image.png"));
    put(root, "assets/nested/image.png", image);
    fs.symlinkSync(outside, join(root, "linked-output"));
    expect(() => addAsset({ projectDir: root, file: "assets/source.glb", name: "model", outputDir: "linked-output" })).toThrow(/symbolic links/);
    expect(tree(outside)).toEqual(otherBefore);
    expect(fs.existsSync(join(root, "aura.assets.json"))).toBe(false);
  });

  it("rejects portable path collisions, source/generated collisions, and generated files in a bundle", () => {
    const root = project();
    put(root, "assets/model.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "tex.png" }, { uri: "TEX.PNG" }] }));
    put(root, "assets/tex.png", image);
    let before = tree(root);
    expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" })).toThrow(/collide/);
    expect(tree(root)).toEqual(before);

    const bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "aura-assets.ts" }] });
    put(root, "src/source.glb", bytes);
    put(root, "src/aura-assets.ts", "source dependency");
    before = tree(root);
    expect(() => addAsset({ projectDir: root, file: "src/source.glb", name: "model" })).toThrow(/cannot overwrite a GLB source or dependency/);
    expect(tree(root)).toEqual(before);
    const bundle = namespace(bytes, [["aura-assets.ts", Buffer.from("source dependency")]]);
    expect(() => addAsset({
      projectDir: root, file: "src/source.glb", name: "model",
      typegen: `public/aura-assets/${bundle}/other.ts`
    })).toThrow(/inside a GLB bundle namespace/);
    expect(tree(root)).toEqual(before);
  });

  it("enforces bounded JSON and aggregate external inputs before writing", () => {
    const root = project();
    const bytes = glb({ asset: { version: "2.0" }, buffers: [{ uri: "big.bin", byteLength: 1 }] });
    put(root, "assets/model.glb", bytes);
    put(root, "assets/big.bin", "");
    fs.truncateSync(join(root, "assets/big.bin"), 64 * 1024 * 1024 + 1);
    expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" })).toThrow(/64 MiB/);
    const jsonLength = 16 * 1024 * 1024 + 4;
    const header = Buffer.alloc(20);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(20 + jsonLength, 8);
    header.writeUInt32LE(jsonLength, 12);
    header.writeUInt32LE(0x4e4f534a, 16);
    put(root, "assets/large-json.glb", header);
    fs.truncateSync(join(root, "assets/large-json.glb"), 20 + jsonLength);
    expect(() => addAsset({ projectDir: root, file: "assets/large-json.glb", name: "model" })).toThrow(/GLB JSON chunk must be between/);
    expect(fs.readdirSync(root)).toEqual(["assets"]);
  });

  it("bounds external GLB metadata inspection and rejects cyclic or excessively deep node graphs", () => {
    const root = project();
    put(root, "assets/image.png", image);
    const cases = [
      { nodes: Array.from({ length: 258 }, (_, index) => index < 257 ? { children: [index + 1] } : {}) },
      { nodes: [{ children: [1] }, { children: [0] }] },
      { nodes: [{ children: [2] }, { children: [2] }, {}] },
      { meshes: [{ primitives: Array.from({ length: 32_769 }, () => ({})) }] }
    ];
    for (const value of cases) {
      put(root, "assets/model.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }], ...value }));
      const before = tree(root);
      expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }))
        .toThrow(/GLB.*(?:inspection|node|graph|metadata)/i);
      expect(tree(root)).toEqual(before);
    }
  });

  it("does not overwrite an unowned thumbnail or typed source file", () => {
    for (const output of ["public/aura-assets/model.thumb.svg", "src/aura-assets.ts"]) {
      const root = project();
      put(root, "assets/model.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] }));
      put(root, "assets/image.png", image);
      put(root, output, "existing unrelated user file");
      const before = tree(root);
      expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }))
        .toThrow(/overwrite.*(?:existing|unowned)|(?:existing|unowned).*overwrite/i);
      expect(tree(root)).toEqual(before);
    }
  });

  it("does not overwrite an actual dependency of an existing GLB even when its inspection metadata omits it", () => {
    const root = project();
    const prior = glb({ asset: { version: "2.0" }, images: [{ uri: "model.thumb.svg" }] });
    put(root, "public/aura-assets/old.glb", prior);
    put(root, "public/aura-assets/model.thumb.svg", image);
    put(root, "src/aura-assets.ts", "previous generated module");
    put(root, "aura.assets.json", JSON.stringify({
      schema: "aura3d.assets/1.0", assetBasePath: "/aura-assets/",
      outputDir: "public/aura-assets", typegen: "src/aura-assets.ts",
      assets: [{
        id: "model", type: "model", format: "glb", source: "public/aura-assets/old.glb",
        outputPath: "public/aura-assets/old.glb", url: "/aura-assets/old.glb",
        hash: digest(prior), sizeBytes: prior.length, materials: [], animations: [], textures: [], dependencies: [],
        integrity: { version: 1, digest: digest(prior), requireDependencies: true, dependencies: { "model.thumb.svg": digest(image) } },
        thumbnailUrl: "/aura-assets/model.thumb.svg"
      }]
    }));
    put(root, "assets/new.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "new.png" }] }));
    put(root, "assets/new.png", image);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
    const before = tree(root);
    expect(() => addAsset({ projectDir: root, file: "assets/new.glb", name: "model" }))
      .toThrow(/overwrite.*(?:existing|dependency)/i);
    expect(tree(root)).toEqual(before);
    expect(validateAssets({ projectDir: root }).failures).toEqual([]);
  });

  it("preserves root identity conflicts as failures rather than laundering them through re-admission", () => {
    const root = project();
    put(root, "assets/model.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] }));
    put(root, "assets/image.png", image);
    addAsset({ projectDir: root, file: "assets/model.glb", name: "model" });
    const path = join(root, "aura.assets.json");
    const manifest = JSON.parse(fs.readFileSync(path, "utf8")) as { assets: Array<{ sha256?: string }> };
    manifest.assets[0]!.sha256 = "0".repeat(64);
    fs.writeFileSync(path, JSON.stringify(manifest));
    const before = tree(root);
    expect(() => validateAssets({ projectDir: root })).toThrow(/conflicting hash and sha256/i);
    expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" }))
      .toThrow(/conflicting hash and sha256/i);
    expect(tree(root)).toEqual(before);
  });

  it("continues to report every missing sidecar instead of inventing or accepting it", () => {
    const root = project();
    const uris = Array.from({ length: 9 }, (_, index) => `missing-${index}.png`);
    const bytes = glb({ asset: { version: "2.0" }, images: uris.map((uri) => ({ uri })) });
    put(root, "public/aura-assets/model.glb", bytes);
    put(root, "src/aura-assets.ts", "previous generated module");
    put(root, "aura.assets.json", JSON.stringify({
      schema: "aura3d.assets/1.0", assetBasePath: "/aura-assets/",
      outputDir: "public/aura-assets", typegen: "src/aura-assets.ts",
      assets: [{
        id: "model", type: "model", format: "glb", source: "public/aura-assets/model.glb",
        outputPath: "public/aura-assets/model.glb", url: "/aura-assets/model.glb",
        hash: digest(bytes), sizeBytes: bytes.length, materials: [], animations: [], textures: [], dependencies: [],
        integrity: { version: 1, digest: digest(bytes), requireDependencies: true }
      }]
    }));
    const before = tree(root);
    const report = validateAssets({ projectDir: root });
    expect(report.failures.filter((failure) => failure.includes("Missing referenced asset dependency"))).toHaveLength(9);
    expect(tree(root)).toEqual(before);
  });

  it("keeps embedded GLB and ordinary glTF output conventions", () => {
    const root = project();
    const embedded = glb({
      asset: { version: "2.0" },
      buffers: [{ byteLength: 4 }, { uri: "data:application/octet-stream;base64,AAECAw==", byteLength: 4 }],
      images: [{ bufferView: 0, mimeType: "image/png" }]
    }, Buffer.from([0, 1, 2, 3]));
    put(root, "assets/embedded.glb", embedded);
    const embeddedEntry = addAsset({ projectDir: root, file: "assets/embedded.glb", name: "embedded" }).manifest.assets[0]!;
    expect(embeddedEntry.outputPath).toBe(`public/aura-assets/embedded.${sha(embedded).slice(0, 8)}.glb`);
    expect(fs.readFileSync(join(root, embeddedEntry.outputPath))).toEqual(embedded);
    expect(readAssetManifest(root).assets[0]!.integrity).toEqual({ version: 1, digest: digest(embedded) });
    const text = JSON.stringify({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] });
    put(root, "assets/ordinary.gltf", text);
    put(root, "assets/image.png", image);
    const gltf = addAsset({ projectDir: root, file: "assets/ordinary.gltf", name: "ordinary" }).manifest.assets.find((asset) => asset.id === "ordinary")!;
    expect(gltf.outputPath).toBe(`public/aura-assets/ordinary.${sha(text).slice(0, 8)}.gltf`);
    expect(fs.readFileSync(join(root, "public/aura-assets/image.png"))).toEqual(image);
  });

  it("rolls back newly staged assets and existing generated files when publication fails", () => {
    const root = project();
    put(root, "assets/kept.glb", glb({ asset: { version: "2.0" } }));
    addAsset({ projectDir: root, file: "assets/kept.glb", name: "kept" });
    put(root, "assets/new.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "new.png" }] }));
    put(root, "assets/new.png", image);
    const before = tree(root);
    const original = fs.linkSync;
    vi.spyOn(fs, "linkSync").mockImplementation((from, to) => {
      if (String(from).endsWith("/native-generated.ts") && String(to).endsWith("/src/aura-assets.ts")) {
        throw Object.assign(new Error("injected publication failure"), { code: "EIO" });
      }
      return original(from, to);
    });
    syncBuiltinESMExports();
    expect(() => addAsset({ projectDir: root, file: "assets/new.glb", name: "new" })).toThrow(/injected publication failure/);
    expect(tree(root)).toEqual(before);
  });

  it("does not overwrite a generated-path file introduced by another writer during publication", () => {
    const root = project();
    put(root, "assets/model.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] }));
    put(root, "assets/image.png", image);
    const original = fs.linkSync;
    let injected = false;
    vi.spyOn(fs, "linkSync").mockImplementation((from, to) => {
      if (!injected && String(to).includes("/glb-bundles/")) {
        injected = true;
        put(root, "src/aura-assets.ts", "concurrent writer");
      }
      return original(from, to);
    });
    syncBuiltinESMExports();
    expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" })).toThrow();
    expect(injected).toBe(true);
    expect(fs.readFileSync(join(root, "src/aura-assets.ts"), "utf8")).toBe("concurrent writer");
    expect(fs.existsSync(join(root, "aura.assets.json"))).toBe(false);
    expect(fs.existsSync(join(root, "public/aura-assets/model.thumb.svg"))).toBe(false);
    expect(fs.existsSync(join(root, "public/aura-assets/glb-bundles"))).toBe(false);
  });

  it("rolls back without overwriting a generated module changed by another writer", () => {
    const root = project();
    put(root, "assets/kept.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "kept.png" }] }));
    put(root, "assets/kept.png", image);
    addAsset({ projectDir: root, file: "assets/kept.glb", name: "kept" });
    put(root, "assets/new.glb", glb({ asset: { version: "2.0" }, images: [{ uri: "new.png" }] }));
    put(root, "assets/new.png", image);
    const before = tree(root, "src/aura-assets.ts");
    const original = fs.linkSync;
    let injected = false;
    vi.spyOn(fs, "linkSync").mockImplementation((from, to) => {
      if (!injected && String(to).includes("/glb-bundles/")) {
        injected = true;
        fs.writeFileSync(join(root, "src/aura-assets.ts"), "concurrent modification");
      }
      return original(from, to);
    });
    syncBuiltinESMExports();
    expect(() => addAsset({ projectDir: root, file: "assets/new.glb", name: "new" }))
      .toThrow(/generated output changed/);
    expect(injected).toBe(true);
    expect(fs.readFileSync(join(root, "src/aura-assets.ts"), "utf8")).toBe("concurrent modification");
    expect(tree(root, "src/aura-assets.ts")).toEqual(before);
  });

  it("rechecks copy:false sidecars immediately before publishing generated files", () => {
    const root = project(), bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] });
    const bundle = namespace(bytes, [["image.png", image]]);
    const stagedChild = `public/aura-assets/${bundle}/image.png`;
    put(root, "assets/model.glb", bytes);
    put(root, "assets/image.png", image);
    put(root, `public/aura-assets/${bundle}/document.glb`, bytes);
    put(root, stagedChild, image);
    const before = tree(root, stagedChild);
    const original = fs.writeFileSync;
    let injected = false;
    vi.spyOn(fs, "writeFileSync").mockImplementation((path, data, options) => {
      original(path, data, options);
      if (!injected && String(path).endsWith("/thumbnail.svg")) {
        injected = true;
        original(join(root, stagedChild), "concurrent modification");
      }
    });
    syncBuiltinESMExports();
    expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model", copy: false }))
      .toThrow(/staged GLB dependency.*changed/);
    expect(injected).toBe(true);
    expect(tree(root, stagedChild)).toEqual(before);
  });

  it.each(["root", "dependency"] as const)("rolls back when the source %s changes after capture", (which) => {
    const root = project(), bytes = glb({ asset: { version: "2.0" }, images: [{ uri: "image.png" }] });
    put(root, "assets/model.glb", bytes);
    put(root, "assets/image.png", image);
    const ignored = which === "root" ? "assets/model.glb" : "assets/image.png";
    const before = tree(root, ignored);
    const original = fs.linkSync;
    let changed = false;
    vi.spyOn(fs, "linkSync").mockImplementation((from, to) => {
      original(from, to);
      if (!changed && String(to).includes("/glb-bundles/")) {
        changed = true;
        fs.writeFileSync(join(root, ignored), "changed after capture");
      }
    });
    syncBuiltinESMExports();
    expect(() => addAsset({ projectDir: root, file: "assets/model.glb", name: "model" })).toThrow(/changed.*during admission/);
    expect(changed).toBe(true);
    expect(tree(root, ignored)).toEqual(before);
  });
});
