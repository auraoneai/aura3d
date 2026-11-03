import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decals, defineAuraAssets, material, primitives } from "@aura3d/engine";
import { upgradeProductionPrimitiveTextures } from "@aura3d/engine-runtime";
import { TextureBinding } from "@aura3d/rendering";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import {
  PRIMITIVE_TEXTURE_UPGRADE_CONCURRENCY, resetSharedProductionTextureDecodes
} from "../../../packages/engine/src/agent-api/compiler/textures";
import { auraAssetRefBrand } from "../../../packages/engine/src/agent-api/nodes/assets";
import { createBunkerDecalTextures } from "../../../apps/showcase-bunker-zero/src/art/decals";
import {
  BZ_FLOOR_TEXTURES, BZ_TEXTURE_BUDGET_BYTES, BZ_TEXTURE_FILES, BZ_TEXTURE_MEAN_LINEAR, BZ_TEXTURE_SETS,
  BZ_TEXTURE_SOURCES, bunkerTexture, compensatedBase, textureMemoryBytes, type BunkerTextureFile, type BunkerTextureSet
} from "../../../apps/showcase-bunker-zero/src/art/textures";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PUBLIC = path.join(ROOT, "apps/showcase-bunker-zero/public");
const DIR = path.join(PUBLIC, "aura-assets/textures");
const sha256 = (bytes: Buffer): string => `sha256-${createHash("sha256").update(bytes).digest("hex")}`;

describe("Bunker Zero surface textures (GU47 WP-21 BZ-04)", () => {
  it("keeps all 18 tracked JPEGs, their committed bytes, hashes, sizes, and dimensions", async () => {
    expect(Object.keys(BZ_TEXTURE_FILES)).toHaveLength(18);
    for (const [file, rec] of Object.entries(BZ_TEXTURE_FILES)) {
      const relative = `apps/showcase-bunker-zero/public/aura-assets/textures/${file}`;
      const bytes = readFileSync(path.join(DIR, file));
      const tracked = execFileSync("git", ["ls-files", "--error-unmatch", "--", relative], { cwd: ROOT, encoding: "utf8" }).trim();
      const committed = execFileSync("git", ["show", `HEAD:${relative}`], { cwd: ROOT });
      const image = await sharp(bytes).metadata();
      expect(tracked, file).toBe(relative);
      expect(bytes.equals(committed), file).toBe(true);
      expect(sha256(bytes), file).toBe(rec.sha256);
      expect(bytes.length, file).toBe(rec.bytes);
      expect([image.format, image.width, image.height], file).toEqual(["jpeg", ...rec.size]);
    }
  });

  it("returns genuine factory refs with stable unique identities for both maps of every set", () => {
    expect(BZ_TEXTURE_SETS).toEqual([
      "concrete034", "bricks075a", "metal046b", "paintedplaster017", "wood096",
      "metal049a", "tiles141", "concrete047a", "metal063"
    ]);
    const ids = new Set<string>();
    const objects = new Set<object>();
    const files: string[] = [];
    for (const set of BZ_TEXTURE_SETS) {
      const refs = bunkerTexture(set);
      const again = bunkerTexture(set);
      for (const map of ["color", "normal"] as const) {
        const file: BunkerTextureFile = `bz-${set}-${map}.jpg`;
        const id = `bunkerZero.${set}.${map}`;
        const url = `/aura-assets/textures/${file}`;
        const hash = sha256(readFileSync(path.join(DIR, file)));
        const expected = defineAuraAssets({
          [id]: { type: "texture", format: "jpg", url, hash, metadata: { license: "CC0-1.0 (ambientCG)" } }
        })[id]!;
        const ref = refs[map];
        expect(ref, file).toStrictEqual(expected);
        expect(ref[auraAssetRefBrand], file).toEqual({ type: "texture", id });
        expect(ref.hash, file).toBe(BZ_TEXTURE_FILES[file].sha256);
        expect(again[map], file).toBe(ref);
        expect(new URL(ref.url, "https://bunker.example").origin, file).toBe("https://bunker.example");
        ids.add(ref.id);
        objects.add(ref);
        files.push(file);
      }
    }
    expect(ids.size).toBe(18);
    expect(objects.size).toBe(18);
    expect(files.sort()).toEqual(Object.keys(BZ_TEXTURE_FILES).sort());
  });

  it("ties every color/normal pair to its attributed ambientCG source and actual library zip", () => {
    const attribution = readFileSync(path.join(DIR, "ATTRIBUTION.md"), "utf8");
    const library: { entries: { id: string; downloadFileset?: { name: string; url: string }[] }[] } =
      JSON.parse(readFileSync(path.join(ROOT, "aura.library.json"), "utf8"));
    for (const set of BZ_TEXTURE_SETS) {
      const { ambientCgId, libraryZipSha256 } = BZ_TEXTURE_SOURCES[set];
      const libraryPath = `assets/library/textures/tiling/acg-${set}.zip`;
      const entry = library.entries.find((item) => item.id === `acg-${set}`);
      expect(ambientCgId.toLowerCase(), set).toBe(set);
      expect(attribution, set).toContain(`| bz-${set}-{color,normal}.jpg | ${ambientCgId} | ${libraryZipSha256} |`);
      expect(sha256(readFileSync(path.join(ROOT, libraryPath))), set).toBe(`sha256-${libraryZipSha256}`);
      expect(entry, set).toMatchObject({
        id: `acg-${set}`, type: "texture-set", libraryPath, sha256: libraryZipSha256,
        hash: `sha256-${libraryZipSha256}`, license: "CC0", author: "ambientCG",
        sourcePage: `https://ambientcg.com/view?id=${ambientCgId}`
      });
      expect(entry?.downloadFileset, set).toContainEqual(expect.objectContaining({
        name: "1K-JPG", url: `https://ambientcg.com/get?file=${ambientCgId}_1K-JPG.zip`
      }));
    }
  });

  it("preserves floor assignments, albedo compensation, and the exact texture budget", () => {
    expect(BZ_FLOOR_TEXTURES).toEqual([
      { wall: "concrete034", accent: "bricks075a", floor: "concrete047a", floorAlt: null },
      { wall: "bricks075a", accent: "concrete034", floor: "concrete047a", floorAlt: null },
      { wall: "metal063", accent: "bricks075a", floor: "concrete047a", floorAlt: "metal063" },
      { wall: "paintedplaster017", accent: "wood096", floor: "concrete047a", floorAlt: null },
      { wall: "metal049a", accent: "concrete034", floor: "metal063", floorAlt: null },
      { wall: "concrete034", accent: "wood096", floor: "concrete047a", floorAlt: null },
      { wall: "tiles141", accent: "concrete034", floor: "concrete047a", floorAlt: null }
    ]);
    expect(BZ_TEXTURE_MEAN_LINEAR).toEqual({
      concrete034: [0.8, 0.8, 0.8], bricks075a: [0.777, 0.774, 0.742], metal046b: [0.778, 0.777, 0.778],
      paintedplaster017: [0.799, 0.799, 0.795], wood096: [0.801, 0.801, 0.801],
      metal049a: [0.799, 0.799, 0.797], tiles141: [0.798, 0.797, 0.795],
      concrete047a: [0.79, 0.789, 0.781], metal063: [0.8, 0.801, 0.797]
    });
    const expectedBases: Readonly<Record<BunkerTextureSet, string>> = {
      concrete034: "#7e7c74", bricks075a: "#7f7d78", metal046b: "#7f7d76",
      paintedplaster017: "#7e7c75", wood096: "#7e7c74", metal049a: "#7e7c74",
      tiles141: "#7e7c75", concrete047a: "#7e7c76", metal063: "#7e7c74"
    };
    for (const set of BZ_TEXTURE_SETS) expect(compensatedBase("#77756e", set, 0.9), set).toBe(expectedBases[set]);
    for (let i = 1; i < 6; i++) expect(BZ_FLOOR_TEXTURES[i]!.wall).not.toBe(BZ_FLOOR_TEXTURES[i - 1]!.wall);
    expect(textureMemoryBytes()).toBe(20_971_518);
    expect(BZ_TEXTURE_BUDGET_BYTES).toBe(67_108_864);
    expect(textureMemoryBytes()).toBeLessThanOrEqual(BZ_TEXTURE_BUDGET_BYTES);
  });
});

type PrimitiveEntry = ReturnType<typeof createProductionRuntimePrimitiveEntries>[number];
type FakeBitmap = { width: number; height: number; close: ReturnType<typeof vi.fn> };
let active: { entries: PrimitiveEntry[]; done: Promise<void>; release: () => void } | undefined;

describe("Bunker Zero queued surface prefetch", () => {
  afterEach(async () => {
    if (active) {
      active.release();
      await Promise.allSettled([active.done]);
      for (const entry of active.entries) for (const resource of entry.resources) {
        resource.textureDisposer?.();
        resource.material.dispose();
        resource.texturedMaterial?.dispose();
        resource.geometry.dispose();
      }
      active = undefined;
    }
    resetSharedProductionTextureDecodes();
    vi.unstubAllGlobals();
  });

  /** Four real decal maps occupy the workers while an actual boot-floor wall waits with both maps. */
  function startQueue(legacy = false) {
    const decalsByKind = createBunkerDecalTextures(defineAuraAssets);
    const kinds = ["scorch", "crack", "hazard", "bullet"] as const;
    const blockerUrls = kinds.map((kind) => decalsByKind[kind].url);
    const wallSet = BZ_FLOOR_TEXTURES[0]!.wall;
    const wall = bunkerTexture(wallSet);
    // The negative control reproduces the old unbranded, missing-id shape without mutating the live refs.
    const color = legacy ? { ...wall.color } : wall.color;
    const normal = legacy ? { ...wall.normal } : wall.normal;
    if (legacy) {
      for (const ref of [color, normal]) {
        expect(Reflect.deleteProperty(ref, "id")).toBe(true);
        expect(Reflect.deleteProperty(ref, auraAssetRefBrand)).toBe(true);
      }
    }
    const targetUrls = [wall.color.url, wall.normal.url];
    const blockers = kinds.map((kind) => decals.project({
      name: `block-${kind}`, texture: decalsByKind[kind], size: 1
    }).toJSON());
    const surface = primitives.box({
      name: "boot floor wall",
      material: material.pbr({
        color: compensatedBase("#77756e", wallSet, 0.9), texture: color, normal,
        normalScale: 0.9, textureAnisotropy: 8, roughness: 0.88, metalness: 0
      })
    }).toJSON();
    expect(surface.material?.texture).toBe(color);
    expect(surface.material?.normal).toBe(normal);

    const entries = createProductionRuntimePrimitiveEntries([...blockers, surface]);
    const blocked = entries.slice(0, 4).map((entry) => entry.resources[0]!);
    const queued = entries[4]!.resources[0]!;
    const bytesByUrl = new Map([...blockerUrls, ...targetUrls].map((url) =>
      [url, readFileSync(path.join(PUBLIC, url.slice(1)))] as const
    ));
    const urlByHash = new Map([...bytesByUrl].map(([url, bytes]) => [sha256(bytes), url] as const));
    const fetched: string[] = [];
    const started = new Map<string, FakeBitmap>();
    const gates: (() => void)[] = [];
    const warnings: string[] = [];
    let released = false;
    const release = () => { released = true; for (const gate of gates.splice(0)) gate(); };

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      fetched.push(url);
      const bytes = bytesByUrl.get(url);
      if (!bytes) throw new Error(`unexpected texture URL ${url}`);
      return new Response(new Uint8Array(bytes), {
        headers: { "content-type": url.endsWith(".png") ? "image/png" : "image/jpeg" }
      });
    }));
    vi.stubGlobal("createImageBitmap", vi.fn(async (blob: Blob) => {
      const url = urlByHash.get(sha256(Buffer.from(await blob.arrayBuffer())));
      if (!url) throw new Error("unexpected texture bytes");
      const image = { width: 2, height: 2, close: vi.fn() };
      started.set(url, image);
      if (blockerUrls.includes(url) && !released) await new Promise<void>((resolve) => { gates.push(resolve); });
      return image;
    }));
    const done = upgradeProductionPrimitiveTextures(entries, (message) => { warnings.push(message); });
    active = { entries, done, release };
    return { blocked, queued, blockerUrls, targetUrls, fetched, started, warnings, release, done, wall, color, normal };
  }

  // Native 5.0: the 4.7.x look-ahead prefetch (822f9d071) and cache-only ready assembly (4e4a24a5e) bypassed the
  // request policy and are not restored. These tests now pin the native queue: a resource waits "queued" (no fetch)
  // while the four workers are busy, then loads both maps together and binds the exact decoded images.
  it("keeps the real wall color and normal refs queued behind four blocked decal workers, then binds them", async () => {
    expect(PRIMITIVE_TEXTURE_UPGRADE_CONCURRENCY).toBe(4);
    const run = startQueue();
    expect(run.color).toBe(run.wall.color);
    expect(run.normal).toBe(run.wall.normal);
    await vi.waitFor(() => expect(run.blocked.every((resource) =>
      resource.textureStatus === "pending" && resource.textureStage?.startsWith("decode ")
    )).toBe(true));
    expect(run.queued.textureStatus).toBe("pending");
    expect(run.queued.textureStage).toBe("queued");
    expect(new Set(run.fetched)).toEqual(new Set(run.blockerUrls));
    expect(run.targetUrls.every((url) => !run.started.has(url))).toBe(true);
    run.release();
    await run.done;
    expect(run.warnings).toEqual([]);
    expect(run.queued.textureStatus).toBe("textured");
    expect(run.queued.textureStage).toBe("done");
    expect(run.fetched).toHaveLength(6);
    for (const url of [...run.blockerUrls, ...run.targetUrls]) {
      expect(run.fetched.filter((fetched) => fetched === url)).toHaveLength(1);
    }
    for (const [uniform, url] of [["u_baseColorTexture", run.targetUrls[0]!], ["u_normalTexture", run.targetUrls[1]!]] as const) {
      const binding = run.queued.texturedMaterial?.getParameter(uniform);
      expect(binding).toBeInstanceOf(TextureBinding);
      if (!(binding instanceof TextureBinding)) throw new Error(`missing ${uniform} binding`);
      expect(binding.texture?.source).toBe(run.started.get(url));
    }
    expect(run.blocked.every((resource) => resource.textureStatus === "textured")).toBe(true);
  });

  it("rejects the old missing-id surface map shape through the typed bitmap policy without fetching it", async () => {
    // 4.7.x eventually loaded this shape on a free worker; native 5.0 requires a typed texture asset (with an id).
    const run = startQueue(true);
    await vi.waitFor(() => expect(run.blocked.every((resource) =>
      resource.textureStatus === "pending" && resource.textureStage?.startsWith("decode ")
    )).toBe(true));
    expect(run.queued.textureStatus).toBe("pending");
    expect(run.queued.textureStage).toBe("queued");
    expect(new Set(run.fetched)).toEqual(new Set(run.blockerUrls));
    run.release();
    await run.done;
    expect(run.queued.textureStatus).toBe("fallback");
    expect(run.warnings).toHaveLength(1);
    expect(run.warnings[0]).toContain("typed texture asset");
    expect(run.targetUrls.every((url) => !run.fetched.includes(url) && !run.started.has(url))).toBe(true);
    expect(run.blocked.every((resource) => resource.textureStatus === "textured")).toBe(true);
  });
});
