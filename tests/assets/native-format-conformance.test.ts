import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as publicAssets from "@aura3d/assets";
import {
  createGLTFRenderResources, exportOBJ, exportSTL, GLTFLoader, LoadContext,
  Model3MFLoader, OBJLoader, PLYLoader, read3MFPackageEntries, STLLoader,
  transcodeKTX2BasisTexture, type AssetLoader, type GLTFAsset, type GLTFImageAsset
} from "@aura3d/assets";
import { createDracoDecoder, createMeshoptDecoder, type GLTFDracoDecoderModule, type GLTFMeshoptDecoderModule } from "@aura3d/assets";
import { createNativeFormatRegistry } from "@aura3d/assets/importers";

/** OBJ/STL exporters return bytes in Node; a Blob here would be an exporter regression. */
function exportedBytes(data: Blob | Uint8Array): Uint8Array {
  if (!(data instanceof Uint8Array)) throw new Error("expected exporter bytes, got a Blob");
  return data;
}

interface Fixture {
  id: string;
  format: string;
  formatVersion: string;
  mediaType: string;
  path: string;
  origin: { author: string; license: string; provenance: string };
  byteLength: number;
  sha256: string;
  limits: { maxBytes: number; maxExpandedBytes?: number; maxCompressionRatio?: number };
  extensionsUsed: string[];
  extensionsRequired: string[];
  dependencies: Array<{ uri: string; fixtureId: string }>;
  expected: {
    outcome: "render" | "reject" | "dependency" | "texture-failure";
    positions?: number[][];
    indices?: number[];
    bounds?: { min: number[]; max: number[] };
    unsupportedExtension?: string;
    errorPattern?: string;
    rgba?: number[];
  };
  dataBase64: string;
}
interface FixtureManifest { schema: string; version: number; fixtures: Fixture[]; unverifiedFormats: string[] }
const manifest = JSON.parse(readFileSync(new URL("../fixtures/native-capabilities/manifest.json", import.meta.url), "utf8")) as FixtureManifest;
const byId = new Map(manifest.fixtures.map((fixture) => [fixture.id, fixture]));
const byPath = new Map(manifest.fixtures.map((fixture) => [fixture.path, fixture]));
const origin = "https://conformance.invalid";
const originalFetch = globalThis.fetch;
const bytes = (fixture: Fixture): Buffer => Buffer.from(fixture.dataBase64, "base64");
function fixture(id: string): Fixture {
  const value = byId.get(id);
  if (!value) throw new Error(`Missing conformance fixture ${id}`);
  return value;
}
function url(id: string): string { return `${origin}${fixture(id).path}`; }
function stubFixtures(overrides: Readonly<Record<string, Uint8Array>> = {}): string[] {
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const parsed = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (parsed.origin !== origin) return originalFetch(input);
    requests.push(parsed.pathname);
    const item = byPath.get(parsed.pathname);
    if (!item) return new Response("missing fixture", { status: 404 });
    const body = overrides[parsed.pathname] ?? bytes(item);
    return new Response(Uint8Array.from(body), { headers: { "content-type": item.mediaType } });
  });
  return requests;
}

// This tiny test-side PNG reader is independent of Aura's image loading path.
// It accepts only this corpus's 8-bit RGBA, filter-0, non-interlaced PNG; CRC and
// zlib are verified rather than treating a PNG signature as image decoding.
function pngRgba(png: Uint8Array): { width: number; height: number; data: Uint8Array } {
  const buf = Buffer.from(png);
  if (!buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("PNG signature mismatch");
  let at = 8, width = 0, height = 0, ended = false;
  const compressed: Buffer[] = [];
  while (at + 12 <= buf.length) {
    const length = buf.readUInt32BE(at), end = at + 12 + length;
    if (end > buf.length) throw new Error("PNG chunk truncated");
    const type = buf.toString("ascii", at + 4, at + 8);
    const chunk = buf.subarray(at + 4, at + 8 + length);
    if (crc32(chunk) !== buf.readUInt32BE(at + 8 + length)) throw new Error("PNG CRC mismatch");
    const payload = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      if (length !== 13 || payload[8] !== 8 || payload[9] !== 6 || payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) throw new Error("PNG unsupported fixture encoding");
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
    } else if (type === "IDAT") compressed.push(payload);
    else if (type === "IEND") { ended = true; break; }
    at = end;
  }
  if (!ended || width !== 1 || height !== 1 || compressed.length === 0) throw new Error("PNG invalid fixture structure");
  const raw = inflateSync(Buffer.concat(compressed));
  if (raw.length !== 5 || raw[0] !== 0) throw new Error("PNG unsupported filter or length");
  return { width, height, data: Uint8Array.from(raw.subarray(1)) };
}
function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
async function decodePng(image: GLTFImageAsset, _index: number, asset: GLTFAsset) {
  let data: Uint8Array;
  if (image.data) data = new Uint8Array(image.data);
  else if (image.uri?.startsWith("data:")) data = Buffer.from(image.uri.split(",", 2)[1] ?? "", "base64");
  else if (image.uri) data = new Uint8Array(await (await fetch(new URL(image.uri, asset.url))).arrayBuffer());
  else throw new Error("PNG image has no data or URI");
  return { ...pngRgba(data), colorSpace: "srgb" as const };
}
function assertTriangle(asset: GLTFAsset, item: Fixture): void {
  expect(asset.meshes).toHaveLength(1);
  expect(asset.meshes[0].positions).toEqual(item.expected.positions);
  expect(asset.meshes[0].indices).toEqual(item.expected.indices);
  expect(asset.meshes[0].geometry.bounds).toEqual(item.expected.bounds);
  expect(asset.meshes[0].topology).toBe("triangles");
}
async function createResources(asset: GLTFAsset) {
  const resources = await createGLTFRenderResources(asset, { imageDecoder: decodePng, failOnMissingTexture: true });
  expect(resources.geometryLibrary.size).toBeGreaterThan(0);
  expect(resources.materialLibrary.size).toBeGreaterThan(0);
  expect(resources.renderableBindings.length).toBeGreaterThan(0);
  expect(resources.bounds.min).toEqual([-1, -1, 0]);
  expect(resources.bounds.max).toEqual([1, 1, 0]);
  return resources;
}

afterEach(() => vi.unstubAllGlobals());

describe("independent native format conformance", () => {
  it("validates versioned fixture provenance, actual bytes, digests, expected results and dependency graph", () => {
    expect(manifest.schema).toBe("aura3d.native-format-conformance/1");
    expect(manifest.version).toBe(1);
    expect(new Set(manifest.fixtures.map((item) => item.id)).size).toBe(manifest.fixtures.length);
    expect(new Set(manifest.fixtures.map((item) => item.path)).size).toBe(manifest.fixtures.length);
    expect(manifest.unverifiedFormats).toContain("FBX");
    for (const item of manifest.fixtures) {
      const data = bytes(item);
      expect(["MIT", "CC0-1.0"]).toContain(item.origin.license);
      expect(item.origin.author).toBeTruthy();
      expect(item.origin.provenance).toMatch(/independently authored/i);
      expect(item.formatVersion).toBeTruthy();
      expect(item.limits.maxBytes).toBeGreaterThanOrEqual(data.length);
      expect(data.length).toBe(item.byteLength);
      expect(createHash("sha256").update(data).digest("hex")).toBe(item.sha256);
      expect(item.extensionsUsed).toEqual(expect.arrayContaining(item.extensionsRequired));
      for (const dependency of item.dependencies) {
        const target = fixture(dependency.fixtureId);
        expect(new URL(dependency.uri, `${origin}${item.path}`).pathname).toBe(target.path);
      }
    }
    expect([...pngRgba(bytes(fixture("external-texture-png"))).data]).toEqual([255, 0, 0, 255]);
  });

  it.each(["triangle-gltf-embedded", "triangle-glb-embedded", "triangle-gltf-external", "gltf-unknown-optional"])(
    "%s decodes real bytes, creates geometry and texture resources, then disposes them", async (id) => {
      const requests = stubFixtures();
      const item = fixture(id);
      const loader = new GLTFLoader();
      const asset = await loader.load({ url: url(id) }, new LoadContext());
      assertTriangle(asset, item);
      if (item.expected.unsupportedExtension) expect(asset.loaderDiagnostics.unsupportedExtensions).toContain(item.expected.unsupportedExtension);
      const resources = await createResources(asset);
      expect(resources.textureLibrary.size).toBeGreaterThan(0);
      const textures = [...resources.textureLibrary.values()];
      expect([...new Uint8Array(textures[0].data as Uint8Array)]).toEqual([255, 0, 0, 255]);
      if (id === "triangle-gltf-external") {
        expect(requests).toContain(fixture("external-geometry-bin").path);
        expect(requests).toContain(fixture("external-texture-png").path);
      }
      resources.dispose();
      expect(textures.every((texture) => texture.disposed)).toBe(true);
      loader.dispose(asset);
      expect(asset.disposed).toBe(true);
    }
  );

  it("decodes independently encoded ETC1S bytes and creates the actual KTX2 texture resource", async () => {
    stubFixtures();
    const sample = fixture("ktx2-red-4x4");
    const decoded = await transcodeKTX2BasisTexture(bytes(sample), { targetFormat: "rgba8" });
    expect([decoded.width, decoded.height, decoded.data?.length]).toEqual([4, 4, 64]);
    for (let offset = 0; offset < decoded.data!.length; offset += 4) {
      expect(decoded.data![offset]).toBeGreaterThan(180);
      expect(decoded.data![offset + 1]).toBeLessThan(75);
      expect(decoded.data![offset + 2]).toBeLessThan(75);
      expect(decoded.data![offset + 3]).toBe(255);
    }
    const loader = new GLTFLoader();
    const item = fixture("gltf-ktx2-basis");
    const asset = await loader.load({ url: url(item.id) }, new LoadContext());
    assertTriangle(asset, item);
    expect(asset.loaderDiagnostics.compression.ktx2Basis).toBe(true);
    const resources = await createGLTFRenderResources(asset, { failOnMissingTexture: true, ktx2BasisTargetFormat: "rgba8" });
    const texture = [...resources.textureLibrary.values()][0];
    expect([texture.width, texture.height, texture.data?.length ?? texture.mipLevels[0]?.data.length]).toEqual([4, 4, 64]);
    resources.dispose();
    expect(texture.disposed).toBe(true);
    loader.dispose(asset);
    expect(asset.disposed).toBe(true);
  });

  it.each(["triangle-obj", "triangle-ply-ascii", "triangle-ply-le", "triangle-ply-be", "triangle-stl-ascii", "triangle-stl-binary", "triangle-3mf-stored"])(
    "%s loads real format bytes into render resources", async (id) => {
      stubFixtures();
      const item = fixture(id);
      const loader: AssetLoader<GLTFAsset> = item.format === "obj" ? new OBJLoader() : item.format === "ply" ? new PLYLoader() : item.format === "stl" ? new STLLoader() : new Model3MFLoader();
      const asset = await loader.load({ url: url(id), type: item.format }, new LoadContext());
      assertTriangle(asset, item);
      const resources = await createResources(asset);
      resources.dispose();
      loader.dispose?.(asset);
      expect(asset.disposed).toBe(true);
    }
  );

  it.each(["gltf-unknown-required", "glb-truncated", "ply-truncated", "stl-truncated"])(
    "%s rejects the actual malformed bytes for the specified reason", async (id) => {
      stubFixtures();
      const item = fixture(id);
      const loader = item.format === "ply" ? new PLYLoader() : item.format === "stl" ? new STLLoader() : new GLTFLoader();
      expect(item.expected.errorPattern).toBeTruthy();
      await expect(loader.load({ url: url(id), type: item.format }, new LoadContext())).rejects.toThrow(new RegExp(item.expected.errorPattern!, "i"));
    }
  );

  it.each(["triangle-glb-draco", "triangle-glb-meshopt"])(
    "%s decodes the claimed compressed variant with its injected codec, creates resources and disposes them", async (id) => {
      stubFixtures();
      const item = fixture(id);
      expect(item.extensionsRequired).toHaveLength(1);
      await expect(new GLTFLoader().load({ url: url(id) }, new LoadContext())).rejects.toThrow(/draco|meshopt/i);
      let loader: GLTFLoader;
      if (item.extensionsRequired[0] === "KHR_draco_mesh_compression") {
        const specifier = "draco3d";
        const imported = await import(specifier);
        const factory = (imported.default ?? imported) as { createDecoderModule(): Promise<GLTFDracoDecoderModule> };
        loader = new GLTFLoader({ dracoDecoder: createDracoDecoder(await factory.createDecoderModule()) });
      } else {
        const { MeshoptDecoder } = await import("meshoptimizer");
        await MeshoptDecoder.ready;
        loader = new GLTFLoader({ meshoptDecoder: createMeshoptDecoder(MeshoptDecoder as unknown as GLTFMeshoptDecoderModule) });
      }
      const asset = await loader.load({ url: url(id) }, new LoadContext());
      assertTriangle(asset, item);
      const resources = await createGLTFRenderResources(asset, { failOnMissingTexture: true });
      expect(resources.geometryLibrary.size).toBeGreaterThan(0);
      expect(resources.bounds.min).toEqual([-1, -1, 0]);
      expect(resources.bounds.max).toEqual([1, 1, 0]);
      resources.dispose();
      loader.dispose(asset);
      expect(asset.disposed).toBe(true);
    }
  );

  it.each(["triangle-obj", "triangle-ply-le", "triangle-stl-binary", "triangle-3mf-stored"])(
    "%s loads through the root app's native format registry lease and disposes it", async (id) => {
      stubFixtures();
      const item = fixture(id);
      const registry = createNativeFormatRegistry();
      const lease = await registry.load({ url: url(id), format: item.format }, new LoadContext(), { format: item.format });
      assertTriangle(lease.asset as GLTFAsset, item);
      const resources = await lease.createGLTFRenderResources();
      expect(resources.renderableBindings.length).toBeGreaterThan(0);
      await lease.dispose();
      expect(lease.disposed).toBe(true);
      expect((lease.asset as GLTFAsset).disposed).toBe(true);
    }
  );

  it("rejects an actual compressed ZIP expansion before allocating the declared contents", async () => {
    const item = fixture("3mf-expansion-limit");
    await expect(read3MFPackageEntries(bytes(item), { maxExpandedBytes: item.limits.maxExpandedBytes, maxCompressionRatio: item.limits.maxCompressionRatio }))
      .rejects.toThrow(new RegExp(item.expected.errorPattern!, "i"));
  });

  it("uses exact document and nested dependency digests, rejecting changed bytes before resource creation", async () => {
    const item = fixture("triangle-gltf-external");
    const integrity = {
      version: 1 as const,
      digest: `sha256-${item.sha256}`,
      dependencies: Object.fromEntries(item.dependencies.map((dependency) => [dependency.uri, `sha256-${fixture(dependency.fixtureId).sha256}`])),
      requireDependencies: true
    };
    stubFixtures();
    const loader = new GLTFLoader();
    const asset = await loader.load({ url: url(item.id), integrity }, new LoadContext());
    assertTriangle(asset, item);
    loader.dispose(asset);
    const dependency = fixture("external-geometry-bin");
    const changed = Uint8Array.from(bytes(dependency)); changed[0] ^= 1;
    stubFixtures({ [dependency.path]: changed });
    await expect(loader.load({ url: url(item.id), integrity }, new LoadContext())).rejects.toThrow(/integrity|sha-?256/i);
    const image = fixture("external-texture-png");
    const changedImage = Uint8Array.from(bytes(image)); changedImage[0] ^= 1;
    stubFixtures({ [image.path]: changedImage });
    await expect(loader.load({ url: url(item.id), integrity }, new LoadContext())).rejects.toThrow(/integrity|sha-?256/i);
    const changedDocument = Uint8Array.from(bytes(item)); changedDocument[0] ^= 1;
    stubFixtures({ [item.path]: changedDocument });
    await expect(loader.load({ url: url(item.id), integrity }, new LoadContext())).rejects.toThrow(/integrity|sha-?256/i);
  });

  it("distinguishes corrupt encoded texture rejection from a diagnosed fallback", async () => {
    stubFixtures();
    const loader = new GLTFLoader();
    const asset = await loader.load({ url: url("gltf-corrupt-texture") }, new LoadContext());
    await expect(createGLTFRenderResources(asset, { imageDecoder: decodePng, failOnMissingTexture: true })).rejects.toMatchObject({
      issue: { code: "texture-load-failed", fallback: false, reason: expect.stringMatching(/PNG CRC mismatch/i) }
    });
    const resources = await createGLTFRenderResources(asset, { imageDecoder: decodePng, failOnMissingTexture: false });
    expect(resources.loadIssues).toContainEqual(expect.objectContaining({ code: "texture-load-failed", fallback: true, reason: expect.stringMatching(/PNG CRC mismatch/i) }));
    expect(resources.textureLibrary.size).toBeGreaterThan(0);
    resources.dispose();
    loader.dispose(asset);
  });

  it("publishes conformance loaders and writers through a public package entrypoint", () => {
    const surface = publicAssets as Record<string, unknown>;
    for (const symbol of ["GLTFLoader", "OBJLoader", "PLYLoader", "STLLoader", "Model3MFLoader", "read3MFPackageEntries", "exportOBJ", "exportSTL"]) {
      expect(surface[symbol], `${symbol} must be reachable by installed consumers`).toBeTypeOf("function");
    }
  });

  it("checks OBJ and binary STL exports using a small reader independent of Aura loaders", () => {
    const scene = {
      nodes: [{ name: "triangle", mesh: 0 }], roots: [0],
      meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: { values: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), itemSize: 3 as const } }, indices: [0, 1, 2] }] }],
      metersPerUnit: 1, upAxis: "Y" as const
    };
    const obj = exportOBJ(scene);
    const lines = new TextDecoder().decode(exportedBytes(obj.data)).split(/\r?\n/);
    const vertices = lines.filter((line) => line.startsWith("v ")).map((line) => line.split(/\s+/).slice(1).map(Number));
    const faces = lines.filter((line) => line.startsWith("f ")).map((line) => line.split(/\s+/).slice(1).map((value) => Number(value.split("/")[0]) - 1));
    expect(vertices).toEqual(fixture("triangle-obj").expected.positions);
    expect(faces).toEqual([fixture("triangle-obj").expected.indices]);
    const stl = exportSTL(scene, { binary: true });
    const binary = Buffer.from(exportedBytes(stl.data));
    expect(binary.readUInt32LE(80)).toBe(1);
    expect(binary.length).toBe(134);
    expect(Array.from({ length: 9 }, (_, index) => binary.readFloatLE(96 + index * 4))).toEqual(vertices.flat());
    expect(stl.warnings.map((warning) => warning.code)).toContain("HIERARCHY_FLATTENED");
    expect(stl.warnings.map((warning) => warning.code)).toContain("UNITS_UNDECLARED");
  });
});
