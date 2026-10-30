/**
 * GU47 E-D ED-2: `material.toon({ steps, ramp, shadowColor, rim })` lowers to a `material.custom` spec over the
 * `a3d_lights` / `a3d_toon` / `a3d_rim` author chunks (scene lights + sun shadow, fog, castShadow, instancing).
 */
import { describe, expect, it } from "vitest";
import { material, toonMaterial } from "../../../../packages/engine/src/agent-api/nodes/material";
import { createCustomShaderMaterial } from "../../../../packages/engine/src/agent-api/compiler/customMaterial";
import { parseAuraColor } from "../../../../packages/engine/src/contracts/sceneGraph";
import { MockRenderDevice } from "../../../../packages/rendering/src";

const rampAsset = { kind: "aura-asset-ref", type: "texture", id: "toon-ramp", url: "/ramp.png" } as never;

describe("GU47 ED-2 material.toon", () => {
  it("is exposed on the material namespace and returns a custom spec with fog and castShadow on", () => {
    const spec = material.toon({ color: "#ff8844" });
    expect(spec.kind).toBe("custom");
    expect(spec.custom?.fog).toBe(true);
    expect(spec.custom?.castShadow).toBe(true);
    expect(spec.custom?.glsl.fragment).toContain("#include <a3d_lights>");
    expect(spec.custom?.glsl.vertex).toContain("instanceMatrix");
  });

  it("lowers colours to linear rgb, clamps steps to 1..8 and defaults the shadow colour to 35% of the colour", () => {
    const spec = toonMaterial({ color: "#ff8844", steps: 12 });
    const uniforms = spec.custom!.uniforms as Record<string, { readonly value: unknown }>;
    const [r, g, b] = parseAuraColor("#ff8844");
    expect(uniforms.toonColor!.value).toEqual([r, g, b]);
    expect(uniforms.toonShadowColor!.value).toEqual([r * 0.35, g * 0.35, b * 0.35]);
    expect(uniforms.toonSteps!.value).toBe(8);
    expect(toonMaterial({ steps: 0 }).custom!.uniforms!.toonSteps).toEqual({ type: "f32", value: 1 });
    expect(spec.custom!.defines).toBeUndefined();
  });

  it("compiles on the mock device: banded lights, hemisphere fill, scene fog wrapper, depth program", () => {
    const instance = createCustomShaderMaterial(toonMaterial({ color: "#3366ff", steps: 4, shadowColor: "#101830" }).custom!);
    const fragment = instance.sources.glsl!.fragment;
    expect(fragment).toContain("a3dToonRamp(light, toonSteps, 0.08)");
    expect(fragment).toContain("vec3 a3dDirect(vec3 N, vec3 V, vec3 albedo, float roughness, vec3 worldPos)");
    expect(fragment).toContain("a3dApplyEnvironmentFog(outColor.rgb, a3dFragWorldPosition())");
    expect(fragment).not.toContain("a3dRim(");
    expect(instance.customDepthShaderKey).toBeDefined();
    expect(instance.compile(new MockRenderDevice()).ok).toBe(true);
    expect(instance.customDiagnostics).toEqual([]);
    instance.dispose();
  });

  it("rim and ramp switch on their own code paths", () => {
    const spec = toonMaterial({ color: "#ffffff", rim: { color: "#ffcc88", power: 40, intensity: 0.6 }, ramp: rampAsset });
    expect(spec.custom!.defines).toEqual({ A3D_TOON_RAMP: true, A3D_TOON_RIM: true });
    const uniforms = spec.custom!.uniforms as Record<string, { readonly type: string; readonly value: unknown }>;
    expect(uniforms.toonRimPower!.value).toBe(16);
    expect(uniforms.toonRamp!.type).toBe("texture2d");
    const instance = createCustomShaderMaterial(spec.custom!);
    const fragment = instance.sources.glsl!.fragment;
    expect(fragment).toContain("a3dRim(N, V, toonRimColor, toonRimPower, toonRimIntensity)");
    expect(fragment).toContain("texture(toonRamp, vec2(light, 0.5))");
    expect(fragment).not.toContain("a3dToonRamp(light, toonSteps, 0.08)");
    expect(instance.compile(new MockRenderDevice()).ok).toBe(true);
    instance.dispose();
  });
});
