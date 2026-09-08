import { afterEach, expect, test, vi } from "vitest";
import { instances, material, upgradeProductionPrimitiveTextures } from "@aura3d/engine";
import { InstancedPBRMaterial, TexturedPBRMaterial } from "@aura3d/rendering";
import { assets } from "../../browser/fixtures/c1-extension/assets";

afterEach(() => vi.unstubAllGlobals());

test("plain instanced primitive upgrades to textured material without losing authored instance transforms", async () => {
  const close = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0]))));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close })));
  const sourceNode = instances.sphere({ name: "plain textured instances", transforms: [
    { position: [-1, 0, 0], scale: .5 }, { position: [1, 0, 0], rotation: [0, .5, 0] }
  ], material: material.pbr({ texture: assets.checker, clearcoat: 0, sheen: 0, iridescence: 0, anisotropy: 0 }) }).toJSON();
  const transforms = sourceNode.instances;
  const scalar = new InstancedPBRMaterial();
  const resource = { name: "plain textured instances", materialSpec: sourceNode.material, sourceNode,
    material: scalar, geometry: { vertexBuffer: { format: { hasAttribute: () => true } } },
    textureStatus: "none", textureWarnings: [] as string[], textureSlots: [] as string[],
    texturedMaterial: null as TexturedPBRMaterial | null, textureDisposer: undefined as (() => void) | undefined };
  const warnings = vi.fn();
  try {
    await upgradeProductionPrimitiveTextures([{ resources: [resource] }] as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], warnings);
    expect(warnings).not.toHaveBeenCalled();
    expect(resource.textureStatus).toBe("textured");
    expect(resource.texturedMaterial).toBeInstanceOf(TexturedPBRMaterial);
    expect(resource.textureSlots).toEqual(["baseColor"]);
    expect(resource.sourceNode.instances).toBe(transforms);
    expect(resource.sourceNode.instances).toEqual([
      { position: [-1, 0, 0], scale: .5 }, { position: [1, 0, 0], rotation: [0, .5, 0] }
    ]);
    // The new material retains the instance contract consumed by ForwardPass;
    // actual native submission and pixels are checked by the paired browser test.
    expect(resource.texturedMaterial!.getParameter("u_instanceCount")).toBe(0);
    expect(resource.texturedMaterial!.getParameter("u_instanceMatrices")).toBeDefined();
  } finally { resource.textureDisposer?.(); scalar.dispose(); }
  expect(close).toHaveBeenCalledTimes(1);
});
