/**
 * GU47 E-D ED-8: `registerForwardDrawHook`, the per-draw uniform extension point in `ForwardPass` (left for lane E-E's
 * outline-target ID mask if it needs one). No hook is registered by default, so draws are unchanged.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../../packages/engine/src/agent-api/compiler/customMaterial";
import { ForwardPass, Geometry, MockRenderDevice } from "../../../../packages/rendering/src";
import { registerForwardDrawHook } from "../../../../packages/rendering/src/ForwardPass";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const FRAGMENT = "uniform float u_outlineMask;\nout vec4 outColor;\nvoid main() { outColor = vec4(u_outlineMask); }";
const unregisters: (() => void)[] = [];

afterEach(() => {
  while (unregisters.length > 0) unregisters.pop()!();
});

function drawOnce(label: string) {
  const material = createCustomShaderMaterial({ glsl: { fragment: FRAGMENT } });
  const device = new MockRenderDevice();
  device.beginFrame(8, 8);
  new ForwardPass({ items: [{ geometry: Geometry.triangle(), material, modelMatrix: IDENTITY, label }] }).execute({ device, width: 8, height: 8 });
  device.endFrame();
  const command = device.drawCommands.find((entry) => entry.label === label)!;
  material.dispose();
  return command;
}

describe("GU47 ED-8 ForwardPass draw hooks", () => {
  it("without a hook the draw carries no extra uniform", () => {
    expect(drawOnce("plain").uniforms!.has("u_outlineMask")).toBe(false);
  });

  it("a hook writes per-draw uniforms the program reflects, and unregisters cleanly", () => {
    const seen: string[] = [];
    const unregister = registerForwardDrawHook({
      id: "test.outline-mask",
      bind(item, shader, set) {
        seen.push(item.label ?? "");
        if (shader.reflection.uniforms.has("u_outlineMask")) set("u_outlineMask", item.label === "hero" ? 1 : 0);
      }
    });
    unregisters.push(unregister);
    expect(drawOnce("hero").uniforms!.get("u_outlineMask")).toBe(1);
    expect(drawOnce("crowd").uniforms!.get("u_outlineMask")).toBe(0);
    expect(seen).toEqual(["hero", "crowd"]);
    unregister();
    unregisters.pop();
    expect(drawOnce("after").uniforms!.has("u_outlineMask")).toBe(false);
  });

  it("a duplicate hook id throws", () => {
    unregisters.push(registerForwardDrawHook({ id: "test.dup", bind() {} }));
    expect(() => registerForwardDrawHook({ id: "test.dup", bind() {} })).toThrowError("FORWARD_DRAW_HOOK_DUPLICATE:test.dup");
  });
});
