import { describe, expect, it, vi } from "vitest";
import { WebGL2DrawCallBinder } from "../../../packages/rendering/src/webgl2/MultiDraw";

describe("WebGL float uniform cache", () => {
  it("compares native float values while detecting changes to a reused input vector", () => {
    const uniform3fv = vi.fn();
    const binder = new WebGL2DrawCallBinder({
      counters: { uniformLocationLookupCount: 0 },
      stateCache: { onInvalidate() {} },
      gl: { getUniformLocation: () => ({}), uniform3fv },
    } as never);
    const shader = {
      handle: {},
      reflection: {
        uniforms: new Set(["u_tint"]),
        uniformDetails: new Map([["u_tint", { type: "vec3" }]]),
      },
    };
    const tint = [0.1, 0.2, 0.3];
    const uniforms = new Map([["u_tint", tint]]);
    const draw = () => binder.uploadUniforms(shader as never, uniforms);
    draw();
    tint[0] = tint[0]! + Number.EPSILON;
    draw();
    expect(uniform3fv).toHaveBeenCalledTimes(1);
    tint[1] = 0.25;
    draw();
    expect(uniform3fv).toHaveBeenCalledTimes(2);
  });
});
