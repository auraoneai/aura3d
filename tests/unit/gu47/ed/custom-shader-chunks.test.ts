/**
 * GU47 E-D ED-3: `material.custom` access to the scene light.
 *
 *  - author chunks `a3d_scene` (built-in sun / hemisphere / fog uniforms beside `u_a3dSunDirection`), `a3d_lights`
 *    (`a3dDirect`), `a3d_ibl` (`a3dEnvDiffuse`, `a3dEnvSpecular`) and `a3d_rim`; chunks include each other and the adapter
 *    expands each one once per stage, so any combination bakes and compiles;
 *  - `fog: true` wraps the author's `main` and applies the scene fog (the built-in `environment_fog_common`);
 *  - the forward pass binds the built-ins from the pass state (reflection-guarded).
 */
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial, customFragmentOutputName } from "../../../../packages/engine/src/agent-api/compiler/customMaterial";
import { A3D_AUTHOR_GLSL_CHUNK_NAMES, MockRenderDevice, type RenderShaderProgram, type UniformValue } from "../../../../packages/rendering/src";
import { applyCustomShaderLightingUniforms, customShaderInverseViewProjection, type CustomShaderFrameCache } from "../../../../packages/rendering/src/ForwardPass";
import { LightUniforms } from "../../../../packages/rendering/src/LightUniforms";
import { TextureBinding } from "../../../../packages/rendering/src/TextureBinding";
import { invertMat4, lookAtMat4, multiplyMat4, perspectiveMat4, type Mat4 } from "../../../../packages/scene/src";

const VERTEX = "out vec3 vN;\nvoid main() { vN = normalMatrix * normal; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }";
const count = (source: string, needle: string) => source.split(needle).length - 1;

function fakeShader(names: readonly string[]): RenderShaderProgram {
  return { reflection: { uniforms: new Map(names.map((name) => [name, {}])), attributes: new Map() } } as unknown as RenderShaderProgram;
}

describe("GU47 ED-3 author chunks", () => {
  it("registers a3d_scene, a3d_lights, a3d_ibl and a3d_rim beside the existing chunks", () => {
    expect(A3D_AUTHOR_GLSL_CHUNK_NAMES).toEqual(expect.arrayContaining(["a3d_scene", "a3d_shadow", "a3d_lights", "a3d_ibl", "a3d_rim"]));
  });

  it("a lit custom surface (lights + ibl + shadow + rim) bakes every chunk once and compiles", () => {
    const material = createCustomShaderMaterial({
      glsl: {
        vertex: VERTEX,
        fragment: [
          "#include <a3d_lights>",
          "#include <a3d_ibl>",
          "#include <a3d_shadow>",
          "#include <a3d_rim>",
          "in vec3 vN; out vec4 outColor;",
          "void main() {",
          "  vec3 N = normalize(vN);",
          "  vec3 P = a3dFragWorldPosition();",
          "  vec3 V = normalize(cameraPosition - P);",
          "  vec3 albedo = vec3(0.6, 0.5, 0.4);",
          "  vec3 color = a3dDirect(N, V, albedo, 0.5) + albedo * a3dEnvDiffuse(N) + 0.04 * a3dEnvSpecular(reflect(-V, N), 0.5);",
          "  color += a3dRim(N, V, vec3(1.0, 0.6, 0.2), 3.0, 1.0) + a3dHemiLight(N) * 0.0 + a3dSunRadiance() * 0.0;",
          "  outColor = vec4(a3dSceneFog(color, length(cameraPosition - P)), 1.0);",
          "}"
        ].join("\n")
      }
    });
    const fragment = material.sources.glsl!.fragment;
    expect(fragment).not.toContain("#include");
    for (const declaration of ["uniform vec3 u_a3dSunDirection;", "uniform vec3 u_a3dSunColor;", "uniform float u_a3dSunIntensity;", "uniform vec3 u_a3dHemiSky;", "uniform vec3 u_a3dHemiGround;", "uniform vec3 u_a3dFogColor;", "uniform float u_a3dFogDensity;", "uniform mat4 u_a3dInverseViewProjection;", "uniform vec4 u_lightData[96];"]) {
      expect(count(fragment, declaration), declaration).toBe(1);
    }
    expect(count(fragment, "float a3dSunShadow(")).toBe(1);
    expect(count(fragment, "vec3 a3dEnvDiffuse(")).toBe(1);
    expect(count(fragment, "vec3 a3dDirect(vec3 N, vec3 V, vec3 albedo, float roughness)")).toBe(1);
    expect(material.compile(new MockRenderDevice()).ok).toBe(true);
    material.dispose();
  });

  it("a stage that includes each chunk once bakes the same text as before (include-once is invisible)", () => {
    const once = createCustomShaderMaterial({ glsl: { fragment: "#include <a3d_noise>\nout vec4 outColor;\nvoid main() { outColor = vec4(a3dHash11(1.0)); }" } });
    const twice = createCustomShaderMaterial({ glsl: { fragment: "#include <a3d_noise>\n#include <a3d_noise>\nout vec4 outColor;\nvoid main() { outColor = vec4(a3dHash11(1.0)); }" } });
    expect(twice.sources.glsl!.fragment.replace(/@aura3d-portable:[^\s]+/g, "")).toBe(once.sources.glsl!.fragment.replace(/@aura3d-portable:[^\s]+/g, ""));
    once.dispose();
    twice.dispose();
  });
});

describe("GU47 ED-3 material.custom({ fog: true })", () => {
  const FRAGMENT = "out vec4 fragColor;\nvoid main() { fragColor = vec4(0.2, 0.4, 0.8, 1.0); }";

  it("wraps the author's main and fogs its colour output with the built-in scene fog", () => {
    const material = createCustomShaderMaterial({ glsl: { fragment: FRAGMENT }, fog: true });
    const fragment = material.sources.glsl!.fragment;
    expect(fragment).toContain("void a3dAuthorMain()");
    expect(fragment).toContain("fragColor.rgb = a3dApplyEnvironmentFog(fragColor.rgb, a3dFragWorldPosition());");
    expect(fragment).toContain("uniform float u_environmentFogEnabled;");
    expect(fragment).toContain("float a3dEnvironmentFogFactor(vec3 worldPosition)");
    expect(count(fragment, "void main()")).toBe(1);
    expect(material.customDiagnostics.some((line) => line.includes("CUSTOM_FOG_UNAPPLIED"))).toBe(false);
    expect(material.compile(new MockRenderDevice()).ok).toBe(true);
    material.dispose();
  });

  it("without fog: true nothing is wrapped", () => {
    const material = createCustomShaderMaterial({ glsl: { fragment: FRAGMENT } });
    expect(material.sources.glsl!.fragment).not.toContain("a3dAuthorMain");
    expect(material.sources.glsl!.fragment).not.toContain("u_environmentFogEnabled");
    material.dispose();
  });

  it("names a stage it cannot wrap instead of silently dropping fog", () => {
    expect(customFragmentOutputName("layout(location = 0) out highp vec4 color;")).toBe("color");
    expect(customFragmentOutputName("in vec4 v;")).toBeUndefined();
  });

  it("composes with an author include of a3d_shadow (no duplicate definitions)", () => {
    const material = createCustomShaderMaterial({ glsl: { fragment: `#include <a3d_shadow>\n${FRAGMENT}` }, fog: true, receiveShadow: true });
    expect(count(material.sources.glsl!.fragment, "vec3 a3dFragWorldPosition()")).toBe(1);
    expect(material.compile(new MockRenderDevice()).ok).toBe(true);
    material.dispose();
  });
});

describe("GU47 ED-3 forward-pass built-ins for custom programs", () => {
  const sun = {
    kind: "directional", color: [1, 0.9, 0.8], intensity: 2.5, direction: [0, -1, 0], position: [0, 0, 0], range: 0,
    spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 1, source: { id: "sun", name: "sun" }
  } as never;
  const frame = (overrides: Partial<CustomShaderFrameCache> = {}): CustomShaderFrameCache => ({
    lights: () => LightUniforms.pack([sun]),
    inverseViewProjection: () => new Float32Array([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]),
    ...overrides
  });

  it("binds sun, hemisphere, fog, lights and the inverse view-projection only when declared", () => {
    const names = ["u_a3dSunColor", "u_a3dSunIntensity", "u_a3dHemiSky", "u_a3dHemiGround", "u_a3dFogColor", "u_a3dFogDensity", "u_lightCount", "u_lightData", "u_a3dInverseViewProjection"];
    const uniforms = new Map<string, UniformValue>();
    applyCustomShaderLightingUniforms(
      { lights: [sun], environmentLighting: { color: [0.2, 0.2, 0.2], intensity: 1, hemisphere: { sky: [0.3, 0.4, 0.5], ground: [0.1, 0.08, 0.05], direction: [0, 1, 0] } } as never },
      { mode: "linear", color: [0.5, 0.6, 0.7], near: 10, far: 50, density: 0 },
      fakeShader(names),
      uniforms,
      frame()
    );
    expect(uniforms.get("u_a3dSunColor")).toEqual([1, 0.9, 0.8]);
    expect(uniforms.get("u_a3dSunIntensity")).toBe(2.5);
    expect(uniforms.get("u_a3dHemiSky")).toEqual([0.3, 0.4, 0.5]);
    expect(uniforms.get("u_a3dFogColor")).toEqual([0.5, 0.6, 0.7]);
    // linear fog: the exp2 density reaching 98% at far
    const density = uniforms.get("u_a3dFogDensity") as number;
    expect(1 - Math.exp(-((density * 50) ** 2))).toBeCloseTo(0.98, 6);
    expect(uniforms.get("u_lightCount")).toBe(1);
    expect((uniforms.get("u_lightData") as Float32Array).length).toBe(96 * 4);
    expect(Array.from(uniforms.get("u_a3dInverseViewProjection") as Float32Array)[0]).toBe(2);
    const none = new Map<string, UniformValue>();
    applyCustomShaderLightingUniforms({ lights: [sun] }, undefined, fakeShader([]), none, frame());
    expect(none.size).toBe(0);
  });

  it("binds the a3d_ibl sources: ambient, SH probe, procedural sky, equirect map (fallback when absent)", () => {
    const names = ["u_a3dEnvAmbient", "u_a3dEnvSh", "u_a3dEnvShEnabled", "u_a3dEnvSky", "u_a3dEnvHorizon", "u_a3dEnvGround", "u_a3dEnvMap", "u_a3dEnvMapEnabled", "u_a3dEnvMapIntensity", "u_a3dEnvMapRotation", "u_a3dEnvMapMaxLod", "u_a3dEnvMapEncoding"];
    const sh9 = new Float32Array(27).fill(0.25);
    const uniforms = new Map<string, UniformValue>();
    applyCustomShaderLightingUniforms(
      { environmentLighting: { color: [0.5, 0.5, 0.5], intensity: 0.8, environmentProbe: { sh9 }, proceduralMap: { skyColor: [0.2, 0.4, 0.8], horizonColor: [0.6, 0.6, 0.6], groundColor: [0.2, 0.15, 0.1], specularColor: [1, 1, 1], intensity: 0.5, specularIntensity: 1 } } as never },
      undefined,
      fakeShader(names),
      uniforms,
      frame()
    );
    expect(uniforms.get("u_a3dEnvAmbient")).toEqual([0.4, 0.4, 0.4]);
    expect(uniforms.get("u_a3dEnvSh")).toBe(sh9);
    expect(uniforms.get("u_a3dEnvShEnabled")).toBe(1);
    expect(uniforms.get("u_a3dEnvSky")).toEqual([0.1, 0.2, 0.4]);
    expect(uniforms.get("u_a3dEnvMapEnabled")).toBe(0);
    expect(uniforms.get("u_a3dEnvMapIntensity")).toBe(0);
    expect((uniforms.get("u_a3dEnvMap") as TextureBinding).texture).toBeNull();
  });

  it("inverse view-projection undoes the camera (world position reconstruction)", () => {
    const view = lookAtMat4([3, 2, 6], [0, 0, 0], [0, 1, 0]);
    const projection = perspectiveMat4(Math.PI / 4, 16 / 9, 0.1, 100);
    const inverse = customShaderInverseViewProjection({ cameraViewMatrix: view, auraFrameCamera: { projectionMatrix: projection } } as never);
    const product = multiplyMat4(Array.from(inverse) as unknown as Mat4, multiplyMat4(projection, view));
    for (let index = 0; index < 16; index += 1) expect(product[index]).toBeCloseTo(index % 5 === 0 ? 1 : 0, 4);
    expect(Array.from(inverse)[0]).toBeCloseTo(invertMat4(multiplyMat4(projection, view))[0], 5);
  });
});
