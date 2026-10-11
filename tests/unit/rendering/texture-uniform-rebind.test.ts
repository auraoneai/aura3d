// #1142 — WebGL2DrawCallBinder.uploadUniforms must re-bind texture uniforms on
// every upload. A per-uniform "same texture as last time" skip left the
// sampler pointing at a unit that another draw had since rebound, so the
// skinned cesium man (08) rendered untextured with flags off and the ground
// over-lit with A3D_QR_COMPILER (qr-azure-gpu 38141790531 shows both fixed:
// none = compiler = 118.2 median object luminance; three.js 118.4).

import { describe, expect, it } from "vitest";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";

const BRAND = Symbol.for("@aura3d/rendering/TextureBinding");

function binding(texture: object) {
  return { [BRAND]: true, name: "u_baseColorTexture", texture, sampler: {}, offset: [0, 0], scale: [1, 1], rotation: 0 };
}

function setup() {
  const uploads: { unit: number; texture: unknown }[] = [];
  const host = {
    counters: { uniformLocationLookupCount: 0 },
    gl: { getUniformLocation: (_p: unknown, name: string) => ({ name }), uniform1f() {}, uniform1i() {} },
    samplers: {
      uploadTextureUniform: (_loc: unknown, value: { texture: unknown }, unit: number) => uploads.push({ unit, texture: value.texture })
    }
  };
  const shader = {
    handle: {},
    reflection: {
      uniforms: new Set(["u_baseColorTexture", "u_normalTexture"]),
      uniformDetails: new Map()
    }
  };
  const binder = new WebGL2DrawCallBinder(host as never);
  return { binder, shader, uploads };
}

describe("texture uniform upload (#1142)", () => {
  it("re-uploads an unchanged texture uniform on the next draw", () => {
    const { binder, shader, uploads } = setup();
    const albedo = {};
    const uniforms = new Map<string, unknown>([["u_baseColorTexture", binding(albedo)]]);
    binder.uploadUniforms(shader as never, uniforms);
    binder.uploadUniforms(shader as never, uniforms);
    expect(uploads).toEqual([{ unit: 0, texture: albedo }, { unit: 0, texture: albedo }]);
  });

  it("binds each draw's textures to its own positional units", () => {
    const { binder, shader, uploads } = setup();
    const albedo = {};
    const normal = {};
    binder.uploadUniforms(shader as never, new Map<string, unknown>([["u_baseColorTexture", binding(albedo)], ["u_normalTexture", binding(normal)]]));
    // A second draw with only the normal map: it must land on unit 0 again,
    // not be skipped while its sampler still points at unit 1.
    binder.uploadUniforms(shader as never, new Map<string, unknown>([["u_normalTexture", binding(normal)]]));
    expect(uploads.at(-1)).toEqual({ unit: 0, texture: normal });
  });
});
