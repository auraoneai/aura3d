/**
 * GU47 E-D ED-4 / ED-5: `material.custom` in the shadow pass and on instanced nodes.
 *
 *  - `castShadow: true` publishes a depth program (the material's baked vertex stage + a depth-only fragment) and
 *    `DepthPass` draws the caster with it: the light's view-projection rides the matrix built-ins, the material's own
 *    uniforms and `u_time` are bound, so a time-driven sway moves the shadow (pixel proof: phase 2);
 *  - a vertex stage reading `instanceMatrix` / `instanceColor` draws every instance in one call (forward and depth).
 */
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../../packages/engine/src/agent-api/compiler/customMaterial";
import { DepthPass, ForwardPass, Geometry, MockRenderDevice, PBRMaterial, globalShaderSource, type RenderItem } from "../../../../packages/rendering/src";
import { customDepthShaderKeyOf } from "../../../../packages/rendering/src/DepthPass";

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const LIGHT_VP = new Float32Array([0.1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, -0.05, 0, 0, 0, -0.5, 1]);
const SWAY_VERTEX = [
  "void main() {",
  "  vec3 p = position;",
  "  p.x += sin(uTime * 2.0 + p.y) * uSway * p.y;",
  "  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);",
  "}"
].join("\n");
const FRAGMENT = "out vec4 outColor;\nvoid main() { outColor = vec4(0.8, 0.7, 0.5, 1.0); }";
const INSTANCED_VERTEX = "out vec4 vColor;\nvoid main() { vColor = instanceColor; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }";
const INSTANCED_FRAGMENT = "in vec4 vColor; out vec4 outColor;\nvoid main() { outColor = vColor; }";

function swayCard() {
  return createCustomShaderMaterial({ glsl: { vertex: SWAY_VERTEX, fragment: FRAGMENT }, uniforms: { uSway: { type: "f32", value: 0.35 } }, castShadow: true, side: "double" });
}

function translation(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function runDepth(casters: readonly RenderItem[], timeSeconds: number) {
  const device = new MockRenderDevice();
  device.beginFrame(256, 256);
  new DepthPass({ casters, viewProjectionMatrix: LIGHT_VP, timeSeconds }).execute({ device, width: 256, height: 256 });
  device.endFrame();
  return device.drawCommands;
}

describe("GU47 ED-4 castShadow on material.custom", () => {
  it("publishes a depth program made of the author's baked vertex stage and a depth-only fragment", () => {
    const material = swayCard();
    const key = material.customDepthShaderKey!;
    expect(key).toBe(`${material.shaderKey}/depth`);
    const pair = globalShaderSource(key)!;
    expect(pair.vertex).toContain("sin(uTime * 2.0 + p.y) * uSway * p.y");
    expect(pair.vertex).toContain(`@aura3d-portable:${key}`);
    expect(pair.fragment).toContain(`@aura3d-portable:${key}`);
    expect(pair.fragment).toContain("a3dDepthColor = vec4(1.0);");
    expect(customDepthShaderKeyOf(material)).toBe(key);
    material.dispose();
    expect(globalShaderSource(key)).toBeUndefined();
  });

  it("without castShadow there is no depth program and the caster keeps the position-only depth shader", () => {
    const plain = createCustomShaderMaterial({ glsl: { vertex: SWAY_VERTEX, fragment: FRAGMENT }, uniforms: { uSway: { type: "f32", value: 0.35 } } });
    expect(plain.customDepthShaderKey).toBeUndefined();
    const commands = runDepth([{ geometry: Geometry.litCube(1), material: plain, modelMatrix: IDENTITY, label: "plain" }], 1);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.label).toBe("plain");
    expect(commands[0]!.uniforms!.has("u_time")).toBe(false);
    plain.dispose();
    const pbr = new PBRMaterial({ name: "pbr" });
    expect(customDepthShaderKeyOf(pbr)).toBeUndefined();
  });

  it("DepthPass runs the author vertex stage with the light matrices, the material uniforms and the frame clock", () => {
    const material = swayCard();
    const caster: RenderItem = { geometry: Geometry.litCube(1), material, modelMatrix: new Float32Array(translation(1, 0, -2)), label: "card", castShadow: true };
    const [first] = runDepth([caster], 1.25);
    const [second] = runDepth([caster], 2.5);
    expect(first!.label).toBe("card:custom-depth");
    expect(first!.shader.reflection.uniforms.has("u_uSway")).toBe(true);
    const uniforms = first!.uniforms!;
    expect(uniforms.get("u_uSway")).toBe(0.35);
    expect(uniforms.get("u_time")).toBe(1.25);
    expect(second!.uniforms!.get("u_time")).toBe(2.5);
    expect(Array.from(uniforms.get("u_projectionMatrix") as ArrayLike<number>)).toEqual(Array.from(LIGHT_VP));
    expect(Array.from(uniforms.get("u_viewMatrix") as ArrayLike<number>)).toEqual(Array.from(IDENTITY));
    expect(Array.from(uniforms.get("u_modelMatrix") as ArrayLike<number>)).toEqual(translation(1, 0, -2));
    expect(first!.renderState?.cullMode).toBe("none");
    // a runtime setUniform write reaches the shadow too
    material.setParameter("u_uSway", 0.9);
    expect(runDepth([caster], 1.25)[0]!.uniforms!.get("u_uSway")).toBe(0.9);
    material.dispose();
  });
});

describe("GU47 ED-5 instanced material.custom", () => {
  const transforms = new Float32Array([...translation(-1, 0, 0), ...translation(0, 0, 0), ...translation(1, 0, 0)]);
  const colors = new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]);

  it("the adapter declares instanceMatrix / instanceColor inputs only for stages that read them", () => {
    const instanced = createCustomShaderMaterial({ glsl: { vertex: INSTANCED_VERTEX, fragment: INSTANCED_FRAGMENT } });
    const vertex = instanced.sources.glsl!.vertex;
    expect(vertex).toContain("in vec4 a_instanceMatrix0;");
    expect(vertex).toContain("#define instanceMatrix (u_a3dInstancing > 0.5");
    expect(vertex).toContain("#define instanceColor (u_a3dInstancing > 0.5 && u_a3dInstanceColors > 0.5 ? a_instanceColor : vec4(1.0))");
    instanced.dispose();
    const plain = createCustomShaderMaterial({ glsl: { vertex: SWAY_VERTEX, fragment: FRAGMENT }, uniforms: { uSway: { type: "f32", value: 0 } } });
    expect(plain.sources.glsl!.vertex).not.toContain("a_instanceMatrix0");
    plain.dispose();
  });

  it("ForwardPass draws every instance in one call with per-instance matrix and colour attributes", () => {
    const material = createCustomShaderMaterial({ glsl: { vertex: INSTANCED_VERTEX, fragment: INSTANCED_FRAGMENT } });
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    new ForwardPass({ items: [{ geometry: Geometry.litCube(1), material, modelMatrix: IDENTITY, instanceTransforms: transforms, instanceColors: colors, label: "crowd" }] })
      .execute({ device, width: 8, height: 8 });
    device.endFrame();
    const draws = device.drawCommands.filter((command) => command.label?.startsWith("crowd"));
    expect(draws).toHaveLength(1);
    expect(draws[0]!.instanceCount).toBe(3);
    expect(draws[0]!.instanceAttributes!.map((attribute) => attribute.shaderName)).toEqual(["a_instanceMatrix0", "a_instanceMatrix1", "a_instanceMatrix2", "a_instanceMatrix3", "a_instanceColor"]);
    expect(draws[0]!.uniforms!.get("u_a3dInstancing")).toBe(1);
    expect(draws[0]!.uniforms!.get("u_a3dInstanceColors")).toBe(1);
    material.dispose();
  });

  it("a non-instanced draw of the same material reads identity / white", () => {
    const material = createCustomShaderMaterial({ glsl: { vertex: INSTANCED_VERTEX, fragment: INSTANCED_FRAGMENT } });
    const device = new MockRenderDevice();
    device.beginFrame(8, 8);
    new ForwardPass({ items: [{ geometry: Geometry.litCube(1), material, modelMatrix: IDENTITY, label: "single" }] }).execute({ device, width: 8, height: 8 });
    device.endFrame();
    const draw = device.drawCommands.find((command) => command.label === "single")!;
    expect(draw.uniforms!.get("u_a3dInstancing")).toBe(0);
    expect(draw.uniforms!.get("u_a3dInstanceColors")).toBe(0);
    material.dispose();
  });

  it("a castShadow instanced caster is one instanced depth draw; one without instanceMatrix draws each instance", () => {
    const instanced = createCustomShaderMaterial({ glsl: { vertex: INSTANCED_VERTEX, fragment: INSTANCED_FRAGMENT }, castShadow: true });
    const one = runDepth([{ geometry: Geometry.litCube(1), material: instanced, modelMatrix: IDENTITY, instanceTransforms: transforms, label: "trees" }], 0);
    expect(one).toHaveLength(1);
    expect(one[0]!.instanceCount).toBe(3);
    expect(one[0]!.uniforms!.get("u_a3dInstancing")).toBe(1);
    instanced.dispose();
    const perInstance = swayCard();
    const many = runDepth([{ geometry: Geometry.litCube(1), material: perInstance, modelMatrix: IDENTITY, instanceTransforms: transforms, label: "cards" }], 0);
    expect(many).toHaveLength(3);
    expect(Array.from(many[2]!.uniforms!.get("u_modelMatrix") as ArrayLike<number>)).toEqual(translation(1, 0, 0));
    perInstance.dispose();
  });
});
