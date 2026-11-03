import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { defineAuraAssets } from "@aura3d/engine";
import { upgradeProductionPrimitiveTextures } from "@aura3d/engine-runtime";
import { PBRMaterial } from "@aura3d/rendering";
import { interleaveByMapSet, resetSharedProductionTextureDecodes } from "../../../../packages/engine/src/agent-api/compiler/textures";

/**
 * GU47 g11 phase 10: Bunker Zero's 31 decal rows share 4 PNGs. In authoring order the 4 upgrade workers all waited on
 * the same in-flight decode, so the PNGs decoded one at a time and 19 rows were still pending at the 25 s luma shot.
 * The queue is taken round-robin over map sets, so every distinct set starts as soon as a worker is free.
 *
 * Native 5.0: typed assets are verified against their declared digest. These fixtures never serve bytes (fetches stay
 * pending or only the queue order is read), so each declares the SHA-256 of its URL as a well-formed stand-in.
 */
const sha256 = (data: string): string => createHash("sha256").update(data).digest("hex");
const maps = defineAuraAssets({
  scorch: { type: "texture", format: "png", url: "/scorch.png", hash: sha256("/scorch.png") },
  crack: { type: "texture", format: "png", url: "/crack.png", hash: sha256("/crack.png") },
  hazard: { type: "texture", format: "png", url: "/hazard.png", hash: sha256("/hazard.png") },
  bullet: { type: "texture", format: "png", url: "/bullet.png", hash: sha256("/bullet.png") },
  wall: { type: "texture", format: "jpg", url: "/wall.jpg", hash: sha256("/wall.jpg") },
  wallN: { type: "texture", format: "jpg", url: "/wall-n.jpg", hash: sha256("/wall-n.jpg") }
});
afterEach(() => { vi.unstubAllGlobals(); resetSharedProductionTextureDecodes(); });
function resource(name: string, materialSpec: Record<string, unknown>) {
  return { name, materialSpec, sourceNode: { kind: "primitive", primitive: "box", material: materialSpec },
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } }, textureStatus: "none",
    textureWarnings: [] as string[], textureSlots: [] as string[], texturedMaterial: null as PBRMaterial | null,
    textureDisposer: undefined as (() => void) | undefined, textureStage: undefined as string | undefined, texturePendingSince: undefined as number | undefined };
}
type R = ReturnType<typeof resource>;
const decalPool = (): R[] => [
  ...Array.from({ length: 8 }, (_, i) => resource(`scorch ${i}`, { texture: maps.scorch })),
  ...Array.from({ length: 4 }, (_, i) => resource(`crack ${i}`, { texture: maps.crack })),
  ...Array.from({ length: 7 }, (_, i) => resource(`hazard ${i}`, { texture: maps.hazard })),
  ...Array.from({ length: 12 }, (_, i) => resource(`bullet ${i}`, { texture: maps.bullet }))
];

test("the queue is round-robin over map sets in first-appearance order; distinct sets keep their order", () => {
  const walls = resource("walls", { texture: maps.wall, normal: maps.wallN });
  const columns = resource("columns", { normal: maps.wallN, texture: maps.wall });
  const plain = resource("plain", { color: "#fff" });
  const queue = [walls, plain, columns, ...decalPool()];
  const order = interleaveByMapSet(queue as never, false).map((r) => r.name);
  expect(order).toHaveLength(queue.length);
  expect(new Set(order).size).toBe(queue.length);
  expect(order.slice(0, 6)).toEqual(["walls", "plain", "scorch 0", "crack 0", "hazard 0", "bullet 0"]);
  // the same map set in another slot order is the same set: columns follow walls in round 1
  expect(order.slice(6, 11)).toEqual(["columns", "scorch 1", "crack 1", "hazard 1", "bullet 1"]);
  expect(order.at(-1)).toBe("bullet 11");
});

test("with 4 workers, all 4 decal PNGs are fetched before any decode lands", async () => {
  const fetches: string[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string) => { fetches.push(url); return new Promise<Response>(() => undefined); }));
  vi.stubGlobal("createImageBitmap", vi.fn());
  const pool = decalPool();
  void upgradeProductionPrimitiveTextures([{ resources: pool }] as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], () => undefined);
  await vi.waitFor(() => expect(new Set(fetches)).toEqual(new Set(["/scorch.png", "/crack.png", "/hazard.png", "/bullet.png"])));
  expect(pool.every((r) => r.textureStatus === "pending")).toBe(true);
});

test("different URL sets cannot collide when a URL contains the map-set separator", () => {
  const special = defineAuraAssets({
    combined: { type: "texture", format: "png", url: "/a|/b", hash: sha256("/a|/b") },
    a: { type: "texture", format: "png", url: "/a", hash: sha256("/a") },
    b: { type: "texture", format: "png", url: "/b", hash: sha256("/b") }
  });
  const queue = [
    resource("combined 0", { texture: special.combined }),
    resource("combined 1", { texture: special.combined }),
    resource("separate", { texture: special.a, normal: special.b })
  ];
  expect(interleaveByMapSet(queue as never, false).map((r) => r.name)).toEqual(["combined 0", "separate", "combined 1"]);
});
