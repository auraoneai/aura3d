import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextureBinding, type Material } from "@aura3d/rendering";
import { model } from "../../../packages/engine/src/agent-api/nodes/model";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { applyModelTintBridge } from "../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import type { AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";

/**
 * S5-WP26-03: custom shaders on individual imported slots, over textured
 * authored materials and together with KHR_materials_variants.
 */
const asset = { kind: "aura-asset-ref", id: "kit", type: "model", format: "gltf", url: "/kit.gltf", bounds: [1, 1, 1] } as unknown as AuraAssetRef<"model">;

function kitDocument(): string {
  const data = new Float32Array([
    -1, -1, 0, 1, -1, 0, 0, 1, 0, // positions
    0, 0, 1, 0, 0, 1, 0, 0, 1, // normals
    0, 0, 1, 0, 0.5, 1 // uvs
  ]);
  const bytes = Buffer.from(data.buffer);
  return JSON.stringify({
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_materials_variants"],
    extensions: { KHR_materials_variants: { variants: [{ name: "red" }] } },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }, { buffer: 0, byteOffset: 72, byteLength: 24 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }
    ],
    images: [{ uri: "data:image/png;base64,AA==" }, { uri: "data:image/png;base64,AQ==" }],
    textures: [{ source: 0 }, { source: 1 }],
    materials: [
      { name: "body", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
      { name: "trim", pbrMetallicRoughness: { baseColorFactor: [0.2, 0.2, 0.2, 1] } },
      { name: "bodyRed", pbrMetallicRoughness: { baseColorTexture: { index: 1 } } }
    ],
    meshes: [
      { name: "bodyMesh", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0,
        extensions: { KHR_materials_variants: { mappings: [{ material: 2, variants: [0] }] } } }] },
      { name: "trimMesh", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 1 }] }
    ],
    nodes: [{ name: "body", mesh: 0 }, { name: "trim", mesh: 1 }], scenes: [{ nodes: [0, 1] }], scene: 0
  });
}

const decoder = (_image: unknown, index: number) => ({
  width: 1, height: 1, colorSpace: "srgb" as const,
  data: new Uint8Array(index === 0 ? [255, 255, 255, 255] : [255, 0, 0, 255])
});

const flat = () => material.custom({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(0.1,0.9,0.4,1.0);}" } });
const sampled = () => material.custom({
  glsl: { fragment: "in vec2 v_uv; out vec4 outColor; void main(){outColor=texture(baseColorTexture, v_uv);}" },
  uniforms: { baseColorTexture: { type: "texture2d" } }
});

async function load(id: string, node: ReturnType<ReturnType<typeof model>["toJSON"]>) {
  return createTypedGLBActor({
    asset: { url: "https://asset.invalid/kit.gltf", format: "gltf" }, id, width: 16, height: 16,
    imageDecoder: decoder, shareTextures: false, ...applyModelTintBridge(node)
  });
}

const byNode = (actor: Awaited<ReturnType<typeof load>>) => {
  const items = actor.collectRenderItems();
  const find = (name: string) => items.find((item) => item.label?.includes(`:${name}:`))!.material as Material;
  return { body: find("body"), trim: find("trim") };
};

const authoredBaseColor = (actor: Awaited<ReturnType<typeof load>>, name: string) => {
  for (const [key, entry] of actor.pipeline.resources.materialLibrary) {
    if (key === name || key.startsWith(`${name}|`) || key.startsWith(`${name}#`)) {
      return (entry.getParameter("u_baseColorTexture") as TextureBinding).texture;
    }
  }
  throw new Error(`no imported material ${name}`);
};

describe("custom shaders on imported model slots", () => {
  beforeEachFetch();

  it("replaces only the targeted slot and keeps the other slot's imported PBR material", async () => {
    const actor = await load("slot-trim", model(asset, { materialOverrides: [{ target: "trim", material: flat() }] }).toJSON());
    try {
      const { body, trim } = byNode(actor);
      expect(trim.shaderKey).toContain("custom-");
      expect(body.shaderKey).not.toContain("custom-");
      expect([...actor.pipeline.resources.materialLibrary.values()]).toContain(body);
      expect(actor.hasCustomMaterialOverride?.("trim")).toBe(true);
      expect(actor.hasCustomMaterialOverride?.("body")).toBe(false);
    } finally { actor.dispose(); }
  });

  it("binds a textured slot's authored map into the declared shader uniform", async () => {
    const actor = await load("slot-body", model(asset, { materialOverrides: [{ target: "body", material: sampled() }] }).toJSON());
    try {
      const { body } = byNode(actor);
      expect(body.shaderKey).toContain("custom-");
      const bound = (body.getParameter("u_baseColorTexture") as TextureBinding).texture;
      expect(bound).toBeTruthy();
      expect(bound).toBe(authoredBaseColor(actor, "body"));
    } finally { actor.dispose(); }
  });

  it("rejects a textured slot whose shader would silently drop the authored map, unless replaced explicitly", async () => {
    await expect(load("slot-drop", model(asset, { materialOverrides: [{ target: "body", material: flat() }] }).toJSON()))
      .rejects.toMatchObject({ code: "MODEL_CUSTOM_MATERIAL_UNSUPPORTED", message: expect.stringContaining("baseColorTexture") });
    const actor = await load("slot-replace", model(asset, { materialOverrides: [{ target: "body", material: flat(), replaceTextures: true }] }).toJSON());
    try {
      expect(byNode(actor).body.shaderKey).toContain("custom-");
    } finally { actor.dispose(); }
  });

  it("keeps a whole-model shader per slot under a variant and rebinds the variant's authored map", async () => {
    const actor = await load("whole-variant", model(asset, { material: sampled(), variant: "red" }).toJSON());
    try {
      const { body, trim } = byNode(actor);
      expect(body.shaderKey).toContain("custom-");
      expect(trim.shaderKey).toContain("custom-");
      expect(body).not.toBe(trim);
      const red = authoredBaseColor(actor, "bodyRed");
      expect((body.getParameter("u_baseColorTexture") as TextureBinding).texture).toBe(red);
      expect(await actor.setMaterialVariant(null)).toBe("applied");
      const restored = byNode(actor).body;
      expect((restored.getParameter("u_baseColorTexture") as TextureBinding).texture).toBe(authoredBaseColor(actor, "body"));
      expect((restored.getParameter("u_baseColorTexture") as TextureBinding).texture).not.toBe(red);
    } finally { actor.dispose(); }
  });
});

function beforeEachFetch(): void {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => new Response(kitDocument(), { status: 200 }))); });
  afterEach(() => vi.unstubAllGlobals());
}
