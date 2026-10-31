// GU47 phase 2 — uniform-array crashes. WebGL2DrawCallBinder.uploadUniforms
// picked the GL setter from the value length alone, so vec4[2]
// (u_localShadowTexelScale, 8 floats, EB-3 multi-caster local shadows) and
// the band-less sky's zero-length u_bandParams threw "Unsupported uniform
// array length". The binder now dispatches on the declared uniform type and
// the sky always uploads its full declared arrays.

import { describe, expect, it } from "vitest";
import { WebGL2DrawCallBinder } from "../../../../packages/rendering/src/webgl2/MultiDraw";
import { skyUniforms } from "../../../../packages/rendering/src/atmosphere/SkyBackgroundPass";
import { skyFrame } from "../../../../packages/rendering/src/atmosphere/SkyEval";
import { SKY_BAND_CAPACITY } from "../../../../packages/rendering/src/atmosphere/GradientSky";

// GL enums as getActiveUniform reports them (WebGL2Device.reflectProgram).
const FLOAT_VEC3 = "35665";
const FLOAT_VEC4 = "35666";
const FLOAT_MAT4 = "35676";

function setup(details: Record<string, { type: string; arraySize: number | null }>) {
  const calls: { fn: string; name: string; length: number }[] = [];
  const record = (fn: string) => (loc: { name: string }, a: ArrayLike<number> | boolean, b?: ArrayLike<number>) =>
    calls.push({ fn, name: loc.name, length: (typeof a === "boolean" ? b! : a).length });
  const host = {
    counters: { uniformLocationLookupCount: 0, inactiveUniformBindCount: 0 },
    gl: {
      getUniformLocation: (_p: unknown, name: string) => ({ name }),
      uniform1f() {},
      uniform1i() {},
      uniform1ui() {},
      uniform1fv: record("uniform1fv"),
      uniform2fv: record("uniform2fv"),
      uniform3fv: record("uniform3fv"),
      uniform4fv: record("uniform4fv"),
      uniformMatrix3fv: record("uniformMatrix3fv"),
      uniformMatrix4fv: record("uniformMatrix4fv")
    }
  };
  const uniformDetails = new Map(Object.entries(details).map(([name, d]) => [name, { name, ...d, source: "fragment", line: 0 }]));
  const shader = { handle: {}, reflection: { uniforms: new Set(Object.keys(details)), uniformDetails } };
  return { binder: new WebGL2DrawCallBinder(host as never), shader, calls };
}

describe("uniform array upload (GU47 phase 2)", () => {
  it("uploads vec4[2] u_localShadowTexelScale (8 floats) with uniform4fv", () => {
    const { binder, shader, calls } = setup({ u_localShadowTexelScale: { type: FLOAT_VEC4, arraySize: 2 } });
    expect(() => binder.uploadUniforms(shader as never, new Map([["u_localShadowTexelScale", new Float32Array(8).fill(0.5)]]))).not.toThrow();
    expect(calls).toEqual([{ fn: "uniform4fv", name: "u_localShadowTexelScale", length: 8 }]);
  });

  it("uploads vec4[4] (16 floats) as vec4, not mat4, and vec3[4] (12 floats) with uniform3fv", () => {
    const { binder, shader, calls } = setup({
      u_bandParams: { type: FLOAT_VEC4, arraySize: 4 },
      u_bandColors: { type: FLOAT_VEC3, arraySize: 4 },
      u_viewMatrix: { type: FLOAT_MAT4, arraySize: null }
    });
    binder.uploadUniforms(
      shader as never,
      new Map([
        ["u_bandParams", new Float32Array(16)],
        ["u_bandColors", new Float32Array(12)],
        ["u_viewMatrix", new Float32Array(16)]
      ])
    );
    expect(calls).toEqual([
      { fn: "uniform4fv", name: "u_bandParams", length: 16 },
      { fn: "uniform3fv", name: "u_bandColors", length: 12 },
      { fn: "uniformMatrix4fv", name: "u_viewMatrix", length: 16 }
    ]);
  });

  it("keeps the length heuristic when the declared type is unknown", () => {
    const { binder, shader, calls } = setup({ u_tint: { type: "", arraySize: null } });
    binder.uploadUniforms(shader as never, new Map([["u_tint", [1, 0, 0]]]));
    expect(calls).toEqual([{ fn: "uniform3fv", name: "u_tint", length: 3 }]);
  });
});

describe("sky band uniforms (GU47 phase 2, sky-night-stars)", () => {
  it("a sky without bands sends full-length zero arrays, never zero-length ones", () => {
    const uniforms = skyUniforms(skyFrame({ model: "gradient", zenith: [0, 0, 0.1], horizon: [0, 0, 0.2], stars: { density: 1 } } as never), new Float32Array(16), 0);
    expect(uniforms.get("u_bandCount")).toBe(0);
    expect((uniforms.get("u_bandParams") as Float32Array).length).toBe(SKY_BAND_CAPACITY * 4);
    expect((uniforms.get("u_bandColors") as Float32Array).length).toBe(SKY_BAND_CAPACITY * 3);
    expect(Array.from(uniforms.get("u_bandParams") as Float32Array).every((v) => v === 0)).toBe(true);
  });

  it("packs bands into the leading slots", () => {
    const frame = skyFrame({
      model: "gradient",
      zenith: [0, 0, 0.1],
      horizon: [0, 0, 0.2],
      bands: [{ elevationDeg: 20, widthDeg: 5, color: [0.1, 0.9, 0.4], intensity: 2 }]
    } as never);
    const uniforms = skyUniforms(frame, new Float32Array(16), 0);
    expect(uniforms.get("u_bandCount")).toBe(1);
    expect(Array.from((uniforms.get("u_bandParams") as Float32Array).subarray(0, 4))).toEqual([20, 5, 2, 0]);
    expect((uniforms.get("u_bandColors") as Float32Array)[1]).toBeCloseTo(0.9, 5);
  });
});
