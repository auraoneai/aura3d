import { afterEach, expect, test, vi } from "vitest";
import { defineAuraAssets, upgradeProductionPrimitiveTextures } from "@aura3d/engine";
import { PBRMaterial } from "@aura3d/rendering";

const assets = defineAuraAssets({ map: { type: "texture", format: "png", url: "/map.png", hash: "fixture" }, missing: { type: "texture", format: "png", url: "/missing.png", hash: "missing" } });
afterEach(() => vi.unstubAllGlobals());
function resource(materialSpec: Record<string, unknown>) {
  return { name: "lifecycle", materialSpec, sourceNode: { kind: "primitive", primitive: "box", material: materialSpec },
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } }, textureStatus: "none",
    textureWarnings: [] as string[], textureSlots: [] as string[], texturedMaterial: null as PBRMaterial | null,
    textureDisposer: undefined as (() => void) | undefined };
}
async function upgrade(value: ReturnType<typeof resource>, warn: (message: string) => void) {
  await upgradeProductionPrimitiveTextures([{ resources: [value] }] as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], warn);
}
test("shared URLs decode once and successful texture ownership closes each bitmap once", async () => {
  const close = vi.fn(); const bitmap = { width: 1, height: 1, close };
  const fetch = vi.fn(async () => new Response(new Uint8Array([0, 1, 2, 3])));
  vi.stubGlobal("fetch", fetch); vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
  const value = resource({ texture: assets.map, clearcoatMap: assets.map, clearcoat: 1 });
  const warnings = vi.fn(); await upgrade(value, warnings);
  expect(value.textureStatus).toBe("textured"); expect(fetch).toHaveBeenCalledTimes(1); expect(warnings).not.toHaveBeenCalled();
  expect(value.textureDisposer).toBeTypeOf("function");
  value.textureDisposer!(); value.textureDisposer!(); expect(close).toHaveBeenCalledTimes(1);
});
test("a failed extension fetch closes prior decoded sources and retains scalar material with a warning", async () => {
  const close = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("missing") ? new Response("absent", { status: 404 }) : new Response(new Uint8Array([0]))));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close })));
  const value = resource({ texture: assets.map, clearcoatMap: assets.missing, clearcoat: 1 });
  const warnings = vi.fn(); await upgrade(value, warnings);
  expect(value.textureStatus).toBe("fallback"); expect(value.texturedMaterial).toBeNull(); expect(close).toHaveBeenCalledTimes(1);
  expect(warnings).toHaveBeenCalledWith(expect.stringContaining("texture fetch failed with status 404"));
});

test("a texture load finishing after material disposal cannot resurrect the resource", async () => {
  const close = vi.fn();
  let finish!: (bitmap: { width: number; height: number; close: () => void }) => void;
  const decoded = new Promise<{ width: number; height: number; close: () => void }>((resolve) => { finish = resolve; });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0]))));
  const decode = vi.fn(() => decoded); vi.stubGlobal("createImageBitmap", decode);
  const value = resource({ clearcoatMap: assets.map, clearcoat: 1 });
  const warnings = vi.fn(); const pending = upgrade(value, warnings);
  await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
  value.material.dispose(); finish({ width: 1, height: 1, close }); await pending;
  expect(value.textureStatus).toBe("fallback"); expect(value.texturedMaterial).toBeNull(); expect(close).toHaveBeenCalledTimes(1);
  expect(warnings).toHaveBeenCalledWith(expect.stringContaining("disposed while texture upgrade was pending"));
});

for(const slot of ["clearcoat","clearcoatRoughness","clearcoatNormal","sheenColor","sheenRoughness","iridescence","iridescenceThickness","anisotropy"]){
  test(`missing UV1 for ${slot} rejects the upgrade before fetching and preserves scalar ownership`,async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    const value=resource({[`${slot}Map`]:assets.map,texCoords:{[slot]:1}});
    value.geometry.vertexBuffer.format.hasAttribute=(name:string)=>name!=="uv1";
    const original=value.material;const warnings=vi.fn();await upgrade(value,warnings);
    expect(value.textureStatus).toBe("fallback");expect(value.texturedMaterial).toBeNull();expect(value.material).toBe(original);expect(original.disposed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();expect(warnings).toHaveBeenCalledWith(expect.stringContaining("geometry carries no uv1 set requested by extension texture"));
  });
}

for(const slot of ["clearcoat","clearcoatRoughness","clearcoatNormal","sheenColor","sheenRoughness","iridescence","iridescenceThickness","anisotropy"]){
  test(`missing UV0 for ${slot} rejects the upgrade before fetching`,async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    const value=resource({[`${slot}Map`]:assets.map});value.geometry.vertexBuffer.format.hasAttribute=(name:string)=>name!=="uv";
    const original=value.material;const warnings=vi.fn();await upgrade(value,warnings);
    expect(value.textureStatus).toBe("fallback");expect(value.texturedMaterial).toBeNull();expect(value.material).toBe(original);expect(original.disposed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();expect(warnings).toHaveBeenCalledWith(expect.stringContaining("geometry carries no uv set; textured upgrade needs generated uvs"));
  });
}
