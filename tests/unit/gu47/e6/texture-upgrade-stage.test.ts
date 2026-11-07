import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { defineAuraAssets } from "@aura3d/engine";
import { upgradeProductionPrimitiveTextures } from "@aura3d/engine-runtime";
import { PBRMaterial } from "@aura3d/rendering";
import { resetSharedProductionTextureDecodes, texturePendingMs } from "../../../../packages/engine/src/agent-api/compiler/textures";

/**
 * GU47 e6 (g09 handoff): a textured-material row stuck in `pending` gave no hint of where it waited. The upgrade now
 * records its last step (`stage`) and, while pending, how long it has waited (`pendingMs`).
 */
// Native 5.0: the policy transport verifies the declared digest, so declare the real SHA-256 of the served bytes.
const BYTES = [0, 1, 2, 3];
const SHA256 = createHash("sha256").update(Uint8Array.from(BYTES)).digest("hex");
const assets = defineAuraAssets({ map: { type: "texture", format: "png", url: "/map.png", hash: SHA256 } });
// GU47 e6 phase 8: decodes are shared per URL across calls; a stalled fixture decode must not leak into the next test.
afterEach(() => { vi.unstubAllGlobals(); resetSharedProductionTextureDecodes(); });
function resource(name: string, materialSpec: Record<string, unknown>) {
  return { name, materialSpec, sourceNode: { kind: "primitive", primitive: "box", material: materialSpec },
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } }, textureStatus: "none",
    textureWarnings: [] as string[], textureSlots: [] as string[], texturedMaterial: null as PBRMaterial | null,
    textureDisposer: undefined as (() => void) | undefined, textureStage: undefined as string | undefined, texturePendingSince: undefined as number | undefined };
}
const run = (values: ReturnType<typeof resource>[]) =>
  upgradeProductionPrimitiveTextures([{ resources: values }] as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], () => undefined);

test("a pending upgrade names the fetch it waits on and how long it has waited", async () => {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  vi.stubGlobal("createImageBitmap", vi.fn());
  const value = resource("stuck", { texture: assets.map });
  void run([value]);
  await vi.waitFor(() => expect(value.textureStage).toBe("fetch /map.png"));
  expect(value.textureStatus).toBe("pending");
  expect(texturePendingMs(value)).toBeGreaterThanOrEqual(0);
});

test("a finished upgrade reports stage done and no pendingMs", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from(BYTES))));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })));
  const value = resource("ok", { texture: assets.map });
  await run([value]);
  expect(value.textureStatus).toBe("textured");
  expect(value.textureStage).toBe("done");
  expect(texturePendingMs(value)).toBeUndefined();
});

test("a failed upgrade reports stage failed", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("absent", { status: 404 })));
  vi.stubGlobal("createImageBitmap", vi.fn());
  const value = resource("missing", { texture: assets.map });
  await run([value]);
  expect(value.textureStatus).toBe("fallback");
  expect(value.textureStage).toBe("failed");
});

test("every queued resource reads pending, and one stalled fetch does not hold the others back", async () => {
  const slow = defineAuraAssets({ stall: { type: "texture", format: "png", url: "/stall.png", hash: SHA256 } });
  vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("stall") ? new Promise<Response>(() => undefined) : Promise.resolve(new Response(Uint8Array.from(BYTES)))));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })));
  const stalled = resource("stalled", { texture: slow.stall });
  const later = [resource("a", { texture: assets.map }), resource("b", { texture: assets.map })];
  const untextured = resource("plain", { color: "#ffffff" });
  void run([stalled, ...later, untextured]);
  // Synchronously after the call: the whole queue is pending, the untextured resource is not.
  expect([stalled, ...later].map((r) => r.textureStatus)).toEqual(["pending", "pending", "pending"]);
  expect(untextured.textureStatus).toBe("none");
  await vi.waitFor(() => expect(later.map((r) => r.textureStatus)).toEqual(["textured", "textured"]));
  expect(stalled.textureStatus).toBe("pending");
  expect(stalled.textureStage).toBe("fetch /stall.png");
});

test("a decode that never settles is named as decode, not fetch", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from(BYTES))));
  vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise(() => undefined)));
  const value = resource("decoding", { texture: assets.map });
  void run([value]);
  await vi.waitFor(() => expect(value.textureStage).toBe("decode /map.png"));
  expect(value.textureStatus).toBe("pending");
});

test("a superseded upgrade leaves the replacement material's queued stage alone, so the replacement still upgrades (lane 521)", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.stubGlobal("fetch", vi.fn(async () => { await gate; return new Response(Uint8Array.from(BYTES)); }));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })));
  const value = resource("retinted", { texture: assets.map });
  const stale = run([value]);
  await vi.waitFor(() => expect(value.textureStage).toBe("fetch /map.png"));
  // The app replaces the material while the maps load (Aura FC's applyVenue re-tint); the scheduler re-queues it.
  value.material = new PBRMaterial();
  value.materialSpec = { texture: assets.map, color: "#88aa66" };
  value.textureStatus = "pending";
  value.textureStage = "queued";
  release();
  await stale;
  expect(value.textureStage).toBe("queued");
  expect(value.textureStatus).toBe("pending");
});
