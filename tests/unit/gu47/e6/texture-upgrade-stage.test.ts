import { afterEach, expect, test, vi } from "vitest";
import { defineAuraAssets, upgradeProductionPrimitiveTextures } from "@aura3d/engine";
import { PBRMaterial } from "@aura3d/rendering";
import { texturePendingMs } from "../../../../packages/engine/src/agent-api/compiler/textures";

/**
 * GU47 e6 (g09 handoff): a textured-material row stuck in `pending` gave no hint of where it waited. The upgrade now
 * records its last step (`stage`) and, while pending, how long it has waited (`pendingMs`).
 */
const assets = defineAuraAssets({ map: { type: "texture", format: "png", url: "/map.png", hash: "fixture" } });
afterEach(() => vi.unstubAllGlobals());
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
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0, 1, 2, 3]))));
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
