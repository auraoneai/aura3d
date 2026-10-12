/**
 * 06-PROMO (GPU promote run 38198435735): under A3D_QR_ANIMATION the
 * prd06.deform generated program declares `u_boneTexture` and no
 * `u_jointMatrices`. A skinned item whose producer never stamped a
 * `paletteKey` (08-skinned-character: the glTF loader's rest palette, no clip
 * ever applied) left the bone texture unbound, so the skin sampled texture
 * unit 0 and rendered garbage. The bind now falls back to the binding object.
 */

import { afterEach, describe, expect, it } from "vitest";
import { Renderer, SkinnedLitMaterial } from "@aura3d/rendering";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import { SkinningPaletteTextureCache } from "../../../../packages/rendering/src/SkinningPaletteTextureCache";
import { bindBoneTextureForSkinning } from "../../../../packages/rendering/src/SkinningUniforms";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";

const ANIMATION = resolveQrFlags({ env: { A3D_QR: "animation" } });
const OFF = resolveQrFlags({ env: { A3D_QR: "none" } });

const translated = (x: number, y: number, z: number) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

function skinnedItem(skinning: { jointCount: number; matrices: Float32Array }): RenderItem {
  const format = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 },
      { semantic: "joints", components: 4, offset: 24 },
      { semantic: "weights", components: 4, offset: 40 }
    ],
    56
  );
  const vertices = new VertexBuffer(format, 3);
  const positions = [[-1, -1, 0], [3, -1, 0], [-1, 3, 0]];
  for (let i = 0; i < 3; i++) {
    vertices.setAttribute(i, "position", positions[i]!);
    vertices.setAttribute(i, "normal", [0, 0, 1]);
    vertices.setAttribute(i, "joints", [0, 0, 0, 0]);
    vertices.setAttribute(i, "weights", [1, 0, 0, 0]);
  }
  const geometry = new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
  return { geometry, material: new SkinnedLitMaterial({}), modelMatrix: translated(0, 0, 0), label: "unstamped-skin", skinning } as RenderItem;
}

afterEach(() => setRendererQrFlags(OFF));

describe("unstamped skin palettes bind the bone texture (06-PROMO)", () => {
  it("binder: an unstamped binding still gets u_boneTexture and its current matrices", () => {
    const cache = new SkinningPaletteTextureCache();
    const skinning = { jointCount: 1, matrices: translated(1, 10, 100) };
    const set = new Map<string, unknown>();
    cache.beginFrame();
    expect(bindBoneTextureForSkinning((name, value) => set.set(name, value), cache, skinning)).toBe(true);
    const binding = set.get("u_boneTexture") as { texture: { data: Float32Array } } | undefined;
    expect(binding?.texture).toBeDefined();
    expect(set.get("u_boneTextureWidth")).toBe(4);
    expect(Array.from(binding!.texture.data.slice(12, 15))).toEqual([1, 10, 100]);
    skinning.matrices.set([2, 20, 200], 12);
    cache.beginFrame();
    bindBoneTextureForSkinning((name, value) => set.set(name, value), cache, skinning);
    const next = set.get("u_boneTexture") as { texture: { data: Float32Array } };
    expect(Array.from(next.texture.data.slice(12, 15))).toEqual([2, 20, 200]);
  });

  it("binder: idle unstamped entries are evicted (no leak for per-call bindings)", () => {
    const cache = new SkinningPaletteTextureCache();
    const skinning = { jointCount: 1, matrices: translated(0, 0, 0) };
    cache.beginFrame();
    bindBoneTextureForSkinning(() => undefined, cache, skinning);
    expect(cache.has(skinning)).toBe(true);
    for (let frame = 0; frame <= SkinningPaletteTextureCache.unstampedIdleFrames + 1; frame += 1) cache.beginFrame();
    expect(cache.has(skinning)).toBe(false);
  });

  it("renderer: the flag-on forward draw that declares u_boneTexture receives it", async () => {
    setRendererQrFlags(ANIMATION);
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16, qrFlags: ANIMATION });
    type Command = { shader: { reflection: { uniforms: Map<string, unknown> } }; uniforms?: Map<string, unknown> };
    const device = (renderer as unknown as { device: { draw(c: Command): void } }).device;
    const skinnedDraws: Command[] = [];
    const draw = device.draw.bind(device);
    device.draw = (command) => {
      if (command.shader.reflection.uniforms.has("u_boneTexture")) skinnedDraws.push(command);
      draw(command);
    };
    try {
      renderer.render([skinnedItem({ jointCount: 1, matrices: translated(1, 10, 100) })]);
    } finally {
      renderer.dispose();
    }
    expect(skinnedDraws.length).toBeGreaterThan(0);
    for (const command of skinnedDraws) {
      expect(command.uniforms?.get("u_boneTexture")).toBeDefined();
      expect(command.uniforms?.get("u_boneTextureWidth")).toBe(4);
    }
  });
});
