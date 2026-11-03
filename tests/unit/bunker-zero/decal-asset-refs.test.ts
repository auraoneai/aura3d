import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decals, defineAuraAssets, material, primitives, upgradeProductionPrimitiveTextures,
  type AuraAssetRef, type AuraPrimitiveNode
} from "@aura3d/engine";
import { PBRMaterial, TextureBinding } from "@aura3d/rendering";
import { auraAssetRefBrand } from "../../../packages/engine/src/agent-api/nodes/assets";
import {
  PRIMITIVE_TEXTURE_UPGRADE_CONCURRENCY, resetSharedProductionTextureDecodes
} from "../../../packages/engine/src/agent-api/compiler/textures";
import {
  BZ_BULLET_HOLES, BZ_DECAL_FILES, BZ_DECAL_NODES, BZ_FLOOR_DECAL_COUNT, BZ_HAZARD_DECALS,
  createBunkerDecalTextures, decalUrl, floorDecalKind, type DecalKind
} from "../../../apps/showcase-bunker-zero/src/art/decals";
import { BZ_FLOOR_TEXTURES, bunkerTexture } from "../../../apps/showcase-bunker-zero/src/art/textures";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const EXPECTED = {
  scorch: { id: "bzDecalScorch", file: "bz-scorch.png" },
  crack: { id: "bzDecalCrack", file: "bz-crack.png" },
  bullet: { id: "bzDecalBullet", file: "bz-bullet-hole.png" },
  hazard: { id: "bzDecalHazard", file: "bz-hazard-stripe.png" }
} as const;
const KINDS = Object.keys(EXPECTED) as DecalKind[];
const sha256 = (bytes: Buffer): string => `sha256-${createHash("sha256").update(bytes).digest("hex")}`;

describe("Bunker Zero decal asset refs", () => {
  it("uses stable, branded texture refs with the original URLs and hashes of the committed PNG bytes", () => {
    const refs = createBunkerDecalTextures(defineAuraAssets);
    const again = createBunkerDecalTextures(defineAuraAssets);
    expect(Object.keys(refs).sort()).toEqual([...KINDS].sort());
    expect(new Set(KINDS.map((kind) => refs[kind].id)).size).toBe(4);

    for (const kind of KINDS) {
      const { id, file } = EXPECTED[kind];
      const ref = refs[kind];
      const url = `/aura-assets/decals/${file}`;
      const relative = `apps/showcase-bunker-zero/public${url}`;
      expect(BZ_DECAL_FILES[kind]).toBe(file);
      expect(decalUrl(kind)).toBe(url);
      expect(ref).toMatchObject({ kind: "aura-asset-ref", id, type: "texture", format: "png", url });
      expect(again[kind]).toMatchObject({ id, type: "texture", format: "png", url, hash: ref.hash });
      expect(ref[auraAssetRefBrand]).toEqual({ type: "texture", id });
      expect(new URL(ref.url, "https://bunker.example").origin).toBe("https://bunker.example");
      expect(ref.hash).toMatch(/^sha256-[a-f0-9]{64}$/);

      const tracked = execFileSync("git", ["ls-files", "--error-unmatch", "--", relative], { cwd: ROOT, encoding: "utf8" }).trim();
      const committed = execFileSync("git", ["show", `HEAD:${relative}`], { cwd: ROOT });
      const local = readFileSync(path.join(ROOT, relative));
      expect(tracked).toBe(relative);
      expect(local.equals(committed)).toBe(true);
      expect(ref.hash).toBe(sha256(committed));
    }
  });

  it("wires the very same factory's refs into all three scene decal pools", () => {
    const main = readFileSync(path.join(ROOT, "apps/showcase-bunker-zero/src/main.ts"), "utf8");
    const start = main.indexOf("// BZ-10: one shared pool");
    const end = main.indexOf("// C8: enemy gunshots", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const pool = main.slice(start, end);
    expect(pool).toContain("createBunkerDecalTextures(defineAuraAssets)");
    expect(pool).toContain("texture: decalTextures[kind]");
    expect(pool).toContain("texture: decalTextures.hazard");
    expect(pool).toContain("texture: decalTextures.bullet");
    expect(pool).not.toContain('kind: "aura-asset-ref"');
  });

  it("loads the actual generator with its tsx config without generating or writing any files", () => {
    const dryRun = `
      import fs from "node:fs";
      import path from "node:path";
      import { syncBuiltinESMExports } from "node:module";
      const expected = path.resolve("apps/showcase-bunker-zero/public/aura-assets/decals");
      fs.mkdirSync = (dir) => {
        if (String(dir) !== expected) throw new Error("unexpected mkdir: " + dir);
        throw new Error("stopped-before-generation");
      };
      fs.writeFileSync = () => { throw new Error("unexpected file write"); };
      syncBuiltinESMExports();
      try {
        await import("./apps/showcase-bunker-zero/scripts/make-decals.ts");
        throw new Error("generator was not stopped");
      } catch (error) {
        if (error.message !== "stopped-before-generation") throw error;
        console.log("generator imports passed");
      }
    `;
    const stdout = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", dryRun], {
      cwd: ROOT, encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: path.join(ROOT, "tsconfig.base.json") }
    });
    expect(stdout.trim()).toBe("generator imports passed");
  });
});

function resource(node: AuraPrimitiveNode) {
  return {
    name: node.name ?? "unnamed", materialSpec: node.material, sourceNode: node,
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } },
    textureStatus: "none", textureWarnings: [] as string[], textureSlots: [] as string[],
    texturedMaterial: null as PBRMaterial | null, textureDisposer: undefined as (() => void) | undefined,
    textureStage: undefined as string | undefined, texturePendingSince: undefined as number | undefined
  };
}
type Resource = ReturnType<typeof resource>;
type Decode = { url: string; image: { width: number; height: number; close: ReturnType<typeof vi.fn> } };
let active: { resources: Resource[]; done: Promise<void>; release: () => void } | undefined;

afterEach(async () => {
  if (active) {
    active.release();
    await Promise.allSettled([active.done]);
    for (const value of active.resources) {
      value.textureDisposer?.();
      value.material.dispose();
      value.texturedMaterial?.dispose();
    }
    active = undefined;
  }
  resetSharedProductionTextureDecodes();
  vi.unstubAllGlobals();
});

/** Four blocked workers use real boot-floor maps; mocked fetch/bitmap APIs receive the actual route-local files. */
function startQueue(legacy = false) {
  const refs = createBunkerDecalTextures(defineAuraAssets);
  const boot = BZ_FLOOR_TEXTURES[0]!;
  const wall = bunkerTexture(boot.wall), accent = bunkerTexture(boot.accent), floor = bunkerTexture(boot.floor);
  const floorRefs = [wall.color, wall.normal, accent.color, floor.color];
  const floorUrls = floorRefs.map((ref) => ref.url);
  const floors = floorRefs.map((ref, index) => resource(primitives.box({
    name: `boot-floor-map-${index}`, material: material.pbr({ texture: ref })
  }).toJSON()));
  const kinds: DecalKind[] = [
    ...Array.from({ length: BZ_FLOOR_DECAL_COUNT }, (_, index) => floorDecalKind(index)),
    ...Array.from({ length: BZ_HAZARD_DECALS }, () => "hazard" as const),
    ...Array.from({ length: BZ_BULLET_HOLES }, () => "bullet" as const)
  ];
  const queued = kinds.map((kind, index) => {
    const genuine = refs[kind];
    // Recreate the old missing-id shape only as a negative control for the engine's guard.
    const texture = legacy
      ? { kind: genuine.kind, type: genuine.type, format: genuine.format, url: genuine.url } as unknown as AuraAssetRef<"texture">
      : genuine;
    const node = decals.project({ name: `${kind}-${index}`, texture, size: 1 }).toJSON();
    expect(node.material?.texture).toBe(texture);
    return { kind, value: resource(node) };
  });
  const fetches: string[] = [];
  const starts: Decode[] = [];
  const completed: string[] = [];
  const publicDir = path.join(ROOT, "apps/showcase-bunker-zero/public");
  const files = new Map([...floorUrls, ...KINDS.map((kind) => refs[kind].url)].map((url) =>
    [url, readFileSync(path.join(publicDir, url.slice(1)))] as const
  ));
  const urlsByHash = new Map([...files].map(([url, bytes]) => [sha256(bytes), url]));
  const gates: Array<() => void> = [];
  let released = false;
  const release = () => { released = true; for (const gate of gates.splice(0)) gate(); };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    fetches.push(url);
    const bytes = files.get(url);
    if (!bytes) throw new Error(`unexpected texture URL ${url}`);
    return new Response(new Uint8Array(bytes), { headers: { "content-type": url.endsWith(".png") ? "image/png" : "image/jpeg" } });
  }));
  vi.stubGlobal("createImageBitmap", vi.fn(async (blob: Blob) => {
    const url = urlsByHash.get(sha256(Buffer.from(await blob.arrayBuffer())));
    if (!url) throw new Error("unexpected texture bytes");
    const image = { width: 2, height: 2, close: vi.fn() };
    starts.push({ url, image });
    if (floorUrls.includes(url) && !released) await new Promise<void>((resolve) => { gates.push(resolve); });
    completed.push(url);
    return image;
  }));
  const values = [...floors, ...queued.map((row) => row.value)];
  const warn = vi.fn();
  const done = upgradeProductionPrimitiveTextures(
    [{ resources: values }] as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], warn
  );
  active = { resources: values, done, release };
  return { refs, floors, floorUrls, queued, fetches, starts, completed, release, warn, done };
}

describe("Bunker Zero queued texture prefetch", () => {
  // Native 5.0: the 4.7.x look-ahead prefetch (822f9d071) bypassed the request policy and is not restored. These
  // tests now pin the native queue: decals wait "queued" (no fetch) while the four floor workers are busy, then the
  // freed workers take the four decal sets round-robin and every decal of a kind shares one decode.
  it("queues all 31 decals behind four blocked floor workers, then shares one decode per decal PNG", async () => {
    expect(PRIMITIVE_TEXTURE_UPGRADE_CONCURRENCY).toBe(4);
    const queue = startQueue();
    const decalUrls = KINDS.map((kind) => queue.refs[kind].url);
    expect(new Set(queue.floorUrls).size).toBe(4);
    expect(queue.queued).toHaveLength(BZ_DECAL_NODES);
    expect(BZ_DECAL_NODES).toBe(31);
    expect(KINDS.map((kind) => queue.queued.filter((row) => row.kind === kind).length)).toEqual([8, 4, 12, 7]);

    await vi.waitFor(() => expect(queue.floors.map((value) => value.textureStage)).toEqual(queue.floorUrls.map((url) => `decode ${url}`)));
    expect(queue.queued.every(({ value }) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
    expect(new Set(queue.fetches)).toEqual(new Set(queue.floorUrls));
    expect(queue.completed).toEqual([]);

    queue.release();
    await queue.done;
    expect(queue.warn).not.toHaveBeenCalled();
    expect([...queue.floors, ...queue.queued.map((row) => row.value)].every((value) =>
      value.textureStatus === "textured" && value.textureStage === "done"
    )).toBe(true);
    expect(queue.fetches).toHaveLength(8);
    for (const url of [...queue.floorUrls, ...decalUrls]) expect(queue.fetches.filter((fetched) => fetched === url)).toHaveLength(1);
    for (const kind of KINDS) {
      const image = queue.starts.find((started) => started.url === queue.refs[kind].url)!.image;
      for (const { value } of queue.queued.filter((row) => row.kind === kind)) {
        const binding = value.texturedMaterial?.getParameter("u_baseColorTexture");
        expect(binding).toBeInstanceOf(TextureBinding);
        expect((binding as TextureBinding).texture?.source).toBe(image);
      }
    }
  });

  it("rejects the old missing-id decal ref shape through the typed bitmap policy without fetching it", async () => {
    // 4.7.x eventually loaded this shape on a free worker; native 5.0 requires a typed texture asset (with an id).
    const queue = startQueue(true);
    await vi.waitFor(() => expect(queue.floors.map((value) => value.textureStage)).toEqual(queue.floorUrls.map((url) => `decode ${url}`)));
    expect(queue.queued.every(({ value }) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
    expect(new Set(queue.fetches)).toEqual(new Set(queue.floorUrls));
    expect(queue.completed).toEqual([]);

    queue.release();
    await queue.done;
    expect(queue.fetches).toHaveLength(4);
    expect(queue.queued.every(({ value }) => value.textureStatus === "fallback")).toBe(true);
    expect(queue.warn).toHaveBeenCalledTimes(BZ_DECAL_NODES);
    expect(queue.floors.every((value) => value.textureStatus === "textured")).toBe(true);
  });
});
