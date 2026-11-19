import { describe, expect, it, vi } from "vitest";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";

const makeBinder = () => {
  const gl = {
    getUniformLocation: vi.fn((_program: unknown, name: string) => (name === "u_inactive" || name === "u_inactive[0]" ? null : { name })),
    uniform1f: vi.fn(), uniform1i: vi.fn(), uniform1ui: vi.fn(), uniform3fv: vi.fn(), uniform2iv: vi.fn(), uniformMatrix4fv: vi.fn()
  };
  const counters = { uniformLocationLookupCount: 0, inactiveUniformBindCount: 0 };
  const binder = new WebGL2DrawCallBinder({ counters, stateCache: { onInvalidate() {} }, gl } as never);
  const lookups = { has: 0, details: 0 };
  class CountingSet extends Set<string> { override has(name: string) { lookups.has += 1; return super.has(name); } }
  class CountingMap extends Map<string, { type: string }> { override get(name: string) { lookups.details += 1; return super.get(name); } }
  const shader = {
    handle: {},
    reflection: {
      uniforms: new CountingSet(["u_scale", "u_count", "u_tint", "u_cells", "u_world", "u_inactive"]),
      uniformDetails: new CountingMap([
        ["u_scale", { type: "float" }], ["u_count", { type: "int" }], ["u_tint", { type: "vec3" }],
        ["u_cells", { type: "ivec2" }], ["u_world", { type: "mat4" }], ["u_inactive", { type: "float" }]
      ])
    }
  };
  return { gl, counters, binder, shader, lookups };
};

describe("per-program uniform slot cache", () => {
  it("dispatches by declared type, resolves each location once and skips unknown names", () => {
    const { gl, counters, binder, shader, lookups } = makeBinder();
    const world = new Float32Array(16).fill(1);
    let frame = 0;
    const upload = () => {
      frame += 1;
      binder.uploadUniforms(shader as never, new Map<string, unknown>([
        ["u_unknown", 7], ["u_scale", frame], ["u_count", frame], ["u_tint", [frame, 0, 0]],
        ["u_cells", [frame, 2]], ["u_world", world], ["u_inactive", frame]
      ]));
    };
    upload(); upload(); upload();
    expect(gl.uniform1f).toHaveBeenCalledTimes(3);
    expect(gl.uniform1i).toHaveBeenCalledTimes(3);
    expect(gl.uniform3fv).toHaveBeenCalledTimes(3);
    expect(gl.uniform2iv).toHaveBeenCalledTimes(3);
    expect(gl.uniformMatrix4fv).toHaveBeenCalledTimes(1); // unchanged matrix skips after the first upload
    expect(gl.uniform1i.mock.calls.map((call) => call[1])).toEqual([1, 2, 3]);
    // Five active names plus the inactive name and its [0] fallback, looked up exactly once each.
    expect(gl.getUniformLocation.mock.calls.filter((call) => call[1] !== "u_unknown")).toHaveLength(7);
    expect(counters.uniformLocationLookupCount).toBe(6);
    expect(counters.inactiveUniformBindCount).toBe(3);
    // Reflection is consulted when a name is first seen, not on every draw
    // (the location-less name keeps re-resolving so each bind is still counted).
    expect(lookups.has).toBe(7 + 2);
    expect(lookups.details).toBe(6 + 2);
  });

  it("re-resolves locations after the context's GPU objects are invalidated", () => {
    const { gl, binder, shader } = makeBinder();
    const upload = (value: number) => binder.uploadUniforms(shader as never, new Map<string, unknown>([["u_scale", value]]));
    upload(1);
    binder.invalidateGpuObjects();
    upload(1);
    expect(gl.getUniformLocation.mock.calls.filter((call) => call[1] === "u_scale")).toHaveLength(2);
    expect(gl.uniform1f).toHaveBeenCalledTimes(2);
  });
});
