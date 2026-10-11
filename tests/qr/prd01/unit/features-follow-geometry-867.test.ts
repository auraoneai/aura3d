/**
 * #867 (games, SCORES.md column C): with the lane flags on, 15 of 18 games
 * threw `MaterialBindingError: Missing shader attribute a_uv / a_tangent`
 * (a_joints/a_weights on skinned). The generated program's feature set must
 * follow what the geometry carries, as in three.js: no uv → no uv maps,
 * uv without tangent → normal map via derivative TBN, no joints/weights → no
 * skinning. Binding validation must never kill the frame.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { Material, MaterialBinding, MaterialBindingError, PBRMaterial, Renderer, Texture, TextureBinding } from "@aura3d/rendering";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import { featuresForGeometry } from "../../../../packages/rendering/src/program/MaterialFeatures";
import { ProgramCache } from "../../../../packages/rendering/src/program/ProgramCache";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
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

/**
 * A lit allow-listed material whose look bound base-color and normal maps
 * without declaring uv/tangent inputs (default C-02 feature derivation).
 */
function mappedMaterial(): Material {
  return new Material({
    shaderKey: "aura3d/pbr-direct",
    requiredAttributes: ["a_position", "a_normal"],
    parameters: {
      u_baseColorTexture: new TextureBinding({ name: "u_baseColorTexture", texture: texture("srgb") }),
      u_normalTexture: new TextureBinding({ name: "u_normalTexture", texture: texture() })
    }
  });
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
    const device = (renderer as unknown as { device: { draw(c: { shader: { label: string; reflection: { attributes: Map<string, number> } } }): void } }).device;
    const drawn: { label: string; attributes: string[] }[] = [];
    const acquired: ProgramFeatures[] = [];
    const acquire = ProgramCache.prototype.acquire;
    vi.spyOn(ProgramCache.prototype, "acquire").mockImplementation(function (this: ProgramCache, features: ProgramFeatures) {
      if (features.pass === "forward") acquired.push(features);
      return acquire.call(this, features);
    });
    const draw = device.draw.bind(device);
    device.draw = (command) => {
      drawn.push({ label: command.shader.label, attributes: [...command.shader.reflection.attributes.keys()] });
      draw(command);
    };
    try {
      return { diagnostics: renderer.render([item]), drawn, acquired };
    } finally {
      renderer.dispose();
    }
  }

  const generatedOf = (drawn: { label: string; attributes: string[] }[]) => drawn.filter((d) => d.label.startsWith("a3d-program:"));

  it("primitive without uv: the generated program draws and declares no a_uv / a_tangent", async () => {
    const item = { geometry: triangle(VertexFormat.P3N3, false), material: mappedMaterial(), modelMatrix: IDENTITY, label: "box" } as RenderItem;
    const { diagnostics, drawn, acquired } = await renderOne(item);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    expect(generatedOf(drawn).length).toBeGreaterThan(0);
    expect(acquired.length).toBeGreaterThan(0);
    // No uv-set map → the generator never defines A3D_NEED_UV0 (no a_uv input).
    for (const f of acquired) expect(Object.values(f.maps).filter(Boolean)).toEqual([]);
  });

  it("uv but no tangent: the generated program consumes a_uv and never a_tangent", async () => {
    const item = { geometry: triangle(VertexFormat.P3N3T2, true), material: mappedMaterial(), modelMatrix: IDENTITY, label: "plane" } as RenderItem;
    const { diagnostics, drawn, acquired } = await renderOne(item);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    const generated = generatedOf(drawn);
    expect(generated.length).toBeGreaterThan(0);
    for (const d of generated) expect(d.attributes).not.toContain("a_tangent");
    for (const f of acquired) {
      expect(f.maps.baseColor).toBeDefined();
      expect(f.maps.normal).toBeDefined();
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
    const { diagnostics, drawn, acquired } = await renderOne(item);
    expect(diagnostics.drawCalls).toBeGreaterThan(0);
    expect(generatedOf(drawn).length).toBeGreaterThan(0);
    expect(acquired.length).toBeGreaterThan(0);
    for (const f of acquired) {
      expect(f.skinning).toBeUndefined();
      expect(f.features["prd06.deform"]).toBeUndefined();
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
