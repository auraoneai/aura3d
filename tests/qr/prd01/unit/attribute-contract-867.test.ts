/**
 * #867 (Track 0, T0-EXIT-4): under `$ALL,strict`, 03-damaged-helmet and
 * 08-skinned-character threw `MaterialBindingError: Missing shader attribute
 * a_uv/a_tangent` (08 also `a_joints`/`a_weights`) from bindGenerated.
 * This reproduces both scenes' material + geometry attribute sets on the
 * generated path.
 */

import { describe, expect, it } from "vitest";
import { Renderer, SkinnedLitMaterial, TexturedPBRMaterial, Texture, TextureBinding } from "@aura3d/rendering";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";

const ALL_STRICT = resolveQrFlags({ env: { A3D_QR: "core,lighting,post,materials,assets,animation,vfx,camera,game,world,tiers,looks,compiler,strict" } });
const OFF = resolveQrFlags({ env: {} });

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Color maps are sRGB like the glTF loader's (baseColor/emissive); data maps linear. */
function texture(colorSpace: "srgb" | "linear" = "linear"): Texture {
  return new Texture({ width: 1, height: 1, format: "rgba8", colorSpace, data: new Uint8Array([255, 255, 255, 255]) });
}

function triangle(format: VertexFormat, fill: (v: VertexBuffer, i: number) => void): Geometry {
  const vertices = new VertexBuffer(format, 3);
  const positions = [[-1, -1, 0], [3, -1, 0], [-1, 3, 0]];
  for (let i = 0; i < 3; i++) {
    vertices.setAttribute(i, "position", positions[i]!);
    vertices.setAttribute(i, "normal", [0, 0, 1]);
    fill(vertices, i);
  }
  return new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
}

/** 03-damaged-helmet: textured PBR with a normal map → a_uv + a_tangent geometry. */
function helmetItem(): RenderItem {
  const geometry = triangle(VertexFormat.P3N3T4T2, (v, i) => {
    v.setAttribute(i, "tangent", [1, 0, 0, 1]);
    v.setAttribute(i, "uv", [i === 1 ? 2 : 0, i === 2 ? 2 : 0]);
  });
  const material = new TexturedPBRMaterial({ baseColorTexture: texture("srgb"), normalTexture: texture(), metallicRoughnessTexture: texture(), emissiveTexture: texture("srgb"), occlusionTexture: texture() });
  return { geometry, material, modelMatrix: IDENTITY, label: "03-damaged-helmet" } as RenderItem;
}

/** 08-skinned-character: skinned lit + textures → a_joints/a_weights (+ a_uv/a_tangent). */
function skinnedItem(): RenderItem {
  const format = new VertexFormat(
    [
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 },
      { semantic: "tangent", components: 4, offset: 24 },
      { semantic: "uv", components: 2, offset: 40 },
      { semantic: "joints", components: 4, offset: 48 },
      { semantic: "weights", components: 4, offset: 64 }
    ],
    80
  );
  const geometry = triangle(format, (v, i) => {
    v.setAttribute(i, "tangent", [1, 0, 0, 1]);
    v.setAttribute(i, "uv", [0, 0]);
    v.setAttribute(i, "joints", [0, 0, 0, 0]);
    v.setAttribute(i, "weights", [1, 0, 0, 0]);
  });
  const material = new SkinnedLitMaterial({
    baseColorTexture: new TextureBinding({ name: "u_baseColorTexture", texture: texture("srgb") }),
    normalTexture: new TextureBinding({ name: "u_normalTexture", texture: texture() })
  });
  return {
    geometry,
    material,
    modelMatrix: IDENTITY,
    label: "08-skinned-character",
    skinning: { jointCount: 1, matrices: new Float32Array(IDENTITY) }
  } as RenderItem;
}

describe("#867 generated-path attribute contract ($ALL,strict)", () => {
  /** Draw commands the mock device received for this frame (shader label + marker). */
  async function renderOne(make: () => RenderItem, flags = ALL_STRICT) {
    setRendererQrFlags(flags);
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const device = (renderer as unknown as { device: { draw(c: { shader: { label: string; reflection: { attributes: Map<string, number> } } }): void } }).device;
    const drawn: { label: string; attributes: string[] }[] = [];
    const draw = device.draw.bind(device);
    device.draw = (command) => {
      drawn.push({ label: command.shader.label, attributes: [...command.shader.reflection.attributes.keys()] });
      draw(command);
    };
    try {
      const diagnostics = renderer.render([make()]);
      return { diagnostics, drawn };
    } finally {
      renderer.dispose();
      setRendererQrFlags(OFF);
    }
  }

  it("03-damaged-helmet: the generated program draws; it consumes uv but not the tangent attribute (derivative TBN)", async () => {
    const { diagnostics, drawn } = await renderOne(helmetItem);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    const generated = drawn.filter((d) => d.label.startsWith("a3d-program:"));
    expect(generated.length).toBeGreaterThan(0);
    for (const d of generated) {
      expect(d.attributes).toContain("a_uv");
      expect(d.attributes).not.toContain("a_tangent");
    }
  });

  it("08-skinned-character: draws through a program that skins (generated with prd06.deform, or the legacy skinned program)", async () => {
    const { diagnostics, drawn } = await renderOne(skinnedItem);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    const forward = drawn.filter((d) => !/depth|shadow|output|copy/i.test(d.label));
    expect(forward.length).toBeGreaterThan(0);
    for (const d of forward) {
      expect(d.attributes, d.label).toContain("a_joints");
      expect(d.attributes, d.label).toContain("a_weights");
    }
  });

  it("08 with core only (no A3D_QR_ANIMATION deform feature): falls back to the legacy skinned program instead of the bind pose", async () => {
    // animation is default-on: the core-only arm turns it off explicitly.
    const coreOnly = resolveQrFlags({ env: { A3D_QR: "core,strict", A3D_QR_ANIMATION: "0" } });
    const { diagnostics, drawn } = await renderOne(skinnedItem, coreOnly);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    expect(drawn.some((d) => d.label.startsWith("a3d-program:"))).toBe(false);
    expect(drawn.some((d) => d.attributes.includes("a_joints"))).toBe(true);
  });
});
