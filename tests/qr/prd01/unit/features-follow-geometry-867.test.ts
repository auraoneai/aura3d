/**
 * #867 (games, SCORES.md column C): with the lane flags on, 15 of 18 games
 * threw `MaterialBindingError: Missing shader attribute a_uv / a_tangent`
 * (a_joints/a_weights on skinned). The generated program's feature set must
 * follow what the geometry carries, as in three.js: no uv → no uv maps,
 * uv without tangent → normal map via derivative TBN, no joints/weights → no
 * skinning. Binding validation must never kill the frame.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialBinding, MaterialBindingError, PBRMaterial, Renderer, Texture, TextureBinding } from "@aura3d/rendering";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import { featuresForGeometry } from "../../../../packages/rendering/src/program/MaterialFeatures";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { RenderDevice, ShaderSources } from "../../../../packages/rendering/src/RenderDevice";
import type { RenderItem } from "../../../../packages/rendering/src/ForwardPass";

const ALL_LANES = "core,lighting,post,materials,assets,animation,vfx,camera,game,world,tiers,looks,compiler";
const ALL = resolveQrFlags({ env: { A3D_QR: ALL_LANES } });
const ALL_STRICT = resolveQrFlags({ env: { A3D_QR: `${ALL_LANES},strict` } });
const OFF = resolveQrFlags({ env: {} });
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function texture(colorSpace: "srgb" | "linear" = "linear"): Texture {
  return new Texture({ width: 1, height: 1, format: "rgba8", colorSpace, data: new Uint8Array([255, 255, 255, 255]) });
}

function triangle(format: VertexFormat, uv: boolean): Geometry {
  const vertices = new VertexBuffer(format, 3);
  const positions = [[-1, -1, 0], [3, -1, 0], [-1, 3, 0]];
  for (let i = 0; i < 3; i++) {
    vertices.setAttribute(i, "position", positions[i]!);
    vertices.setAttribute(i, "normal", [0, 0, 1]);
    if (uv) vertices.setAttribute(i, "uv", [0, 0]);
  }
  return new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
}

/** A lit material whose lane-04 look bound base-color and normal maps. */
function mappedMaterial(): PBRMaterial {
  const material = new PBRMaterial();
  material.setParameter("u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", texture: texture("srgb") }));
  material.setParameter("u_normalTexture", new TextureBinding({ name: "u_normalTexture", texture: texture() }));
  return material;
}

const has = (names: string[]) => (n: string) => names.includes(n);

describe("featuresForGeometry (#867 games)", () => {
  const record = () => mappedMaterial().programFeatures({ flags: ALL, tier: QUALITY_TIERS.high });

  it("geometry without uv: uv maps (base color, normal) are dropped", () => {
    const out = featuresForGeometry(record(), has(["a_position", "a_normal"]));
    expect(out.maps.baseColor).toBeUndefined();
    expect(out.maps.normal).toBeUndefined();
  });

  it("geometry with uv but no tangent: maps are kept (normal map uses derivative TBN)", () => {
    const input = record();
    const out = featuresForGeometry(input, has(["a_position", "a_normal", "a_uv"]));
    expect(out.maps.baseColor).toBeDefined();
    expect(out.maps.normal).toBeDefined();
    expect(out).toBe(input);
  });

  it("geometry without skin: skinning and prd06.deform are dropped", () => {
    const skinned = { ...record(), skinning: { influences: 4 as const, palette: "uniform" as const }, features: { "prd06.deform": true } };
    const out = featuresForGeometry(skinned, has(["a_position", "a_normal", "a_uv"]));
    expect(out.skinning).toBeUndefined();
    expect(out.features["prd06.deform"]).toBeUndefined();
    const kept = featuresForGeometry(skinned, has(["a_position", "a_normal", "a_uv", "a_joints", "a_weights"]));
    expect(kept.skinning).toBeDefined();
    expect(kept.features["prd06.deform"]).toBe(true);
  });
});

describe("generated draws follow geometry attributes ($ALL, mock device)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setRendererQrFlags(OFF);
  });

  async function renderOne(item: RenderItem, flags = ALL_STRICT) {
    setRendererQrFlags(flags);
    const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16 });
    const device = (renderer as unknown as { device: RenderDevice }).device;
    const sources = new Map<string, ShaderSources>();
    const compile = device.createShaderProgram.bind(device);
    vi.spyOn(device, "createShaderProgram").mockImplementation((source) => {
      sources.set(source.label, source);
      return compile(source);
    });
    const drawn: { label: string; attributes: string[]; vertex: string }[] = [];
    const draw = device.draw.bind(device);
    device.draw = (command) => {
      drawn.push({ label: command.shader.label, attributes: [...command.shader.reflection.attributes.keys()], vertex: sources.get(command.shader.label)?.vertex ?? "" });
      draw(command);
    };
    try {
      return { diagnostics: renderer.render([item]), drawn };
    } finally {
      renderer.dispose();
    }
  }

  const generatedOf = (drawn: { label: string; attributes: string[]; vertex: string }[]) => drawn.filter((d) => d.label.startsWith("a3d-program:"));

  it("primitive without uv: the generated program draws with a_uv disabled and no a_tangent", async () => {
    const item = { geometry: triangle(VertexFormat.P3N3, false), material: mappedMaterial(), modelMatrix: IDENTITY, label: "box" } as RenderItem;
    const { diagnostics, drawn } = await renderOne(item);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    const generated = generatedOf(drawn);
    expect(generated.length).toBeGreaterThan(0);
    for (const d of generated) {
      // Mock reflection sees inactive declarations; the GPU preprocessor
      // removes this guarded input when geometry-driven features omit UV0.
      expect(d.vertex).toMatch(/#ifdef A3D_NEED_UV0\s+layout\(location = 2\) in vec2 a_uv;\s+#endif/);
      expect(d.vertex).not.toMatch(/^#define A3D_NEED_UV0\b/m);
      expect(d.attributes).not.toContain("a_tangent");
    }
  });

  it("uv but no tangent: the generated program consumes a_uv and never a_tangent", async () => {
    const item = { geometry: triangle(VertexFormat.P3N3T2, true), material: mappedMaterial(), modelMatrix: IDENTITY, label: "plane" } as RenderItem;
    const { diagnostics, drawn } = await renderOne(item);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    const generated = generatedOf(drawn);
    expect(generated.length).toBeGreaterThan(0);
    for (const d of generated) {
      expect(d.attributes).toContain("a_uv");
      expect(d.vertex).toMatch(/^#define A3D_NEED_UV0\b/m);
      expect(d.attributes).not.toContain("a_tangent");
    }
  });

  it("skinning on an item without joints/weights: draws unskinned on the generated program", async () => {
    const item = {
      geometry: triangle(VertexFormat.P3N3T2, true),
      material: new PBRMaterial(),
      modelMatrix: IDENTITY,
      label: "rigless",
      skinning: { jointCount: 1, matrices: new Float32Array(IDENTITY) }
    } as RenderItem;
    const { diagnostics, drawn } = await renderOne(item);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    const generated = generatedOf(drawn);
    expect(generated.length).toBeGreaterThan(0);
    for (const d of generated) {
      expect(d.attributes).not.toContain("a_joints");
      expect(d.attributes).not.toContain("a_weights");
    }
  });

  it("a binding validation failure never kills the frame (non-strict): falls back to the legacy program", async () => {
    vi.spyOn(MaterialBinding.prototype, "bindGenerated").mockImplementation(() => {
      throw new MaterialBindingError("Material binding validation failed", ["Missing shader attribute: a_uv"]);
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const item = { geometry: triangle(VertexFormat.P3N3T2, true), material: new PBRMaterial(), modelMatrix: IDENTITY, label: "fallback" } as RenderItem;
    const { diagnostics, drawn } = await renderOne(item, ALL);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    expect(drawn.some((d) => !d.label.startsWith("a3d-program:"))).toBe(true);
  });

  it("strict still throws the binding error", async () => {
    vi.spyOn(MaterialBinding.prototype, "bindGenerated").mockImplementation(() => {
      throw new MaterialBindingError("Material binding validation failed", ["Missing shader attribute: a_uv"]);
    });
    const item = { geometry: triangle(VertexFormat.P3N3T2, true), material: new PBRMaterial(), modelMatrix: IDENTITY, label: "strict" } as RenderItem;
    await expect(renderOne(item, ALL_STRICT)).rejects.toThrow(MaterialBindingError);
  });
});
