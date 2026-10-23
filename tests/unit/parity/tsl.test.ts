import { describe, expect, it } from "vitest";
import { material, texture, tsl } from "../../../packages/engine/src/agent-api/index.js";
import { applyCustomUniformWrites, createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors.js";
import { MaterialBinding, MockRenderDevice, isTextureBinding, type TextureBinding } from "../../../packages/rendering/src";
import type { TslNode } from "../../../packages/engine/src/agent-api/nodes/tsl/index.js";

// SH-01 / L1-11 — TSL subset: type inference, constant folding, GLSL emission,
// reference interpreter, compile-through and runtime uniform writes.

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof AuraRuntimeError ? error.code : `non-aura:${String(error)}`;
  }
  return undefined;
};

const constValue = (node: TslNode): readonly number[] | undefined =>
  node.data.k === "const" ? node.data.value : undefined;

/** Structural GLSL checks (no GPU here): balance, no unresolved includes, temps declared before use, output assigned. */
function glslProblems(source: string, stage: "vertex" | "fragment"): string[] {
  const problems: string[] = [];
  if (!source.startsWith("#version 300 es")) problems.push("missing #version 300 es");
  if (/#include/.test(source)) problems.push("unresolved #include");
  for (const [open, close] of [["{", "}"], ["(", ")"]] as const) {
    if (source.split(open).length !== source.split(close).length) problems.push(`unbalanced ${open}${close}`);
  }
  const declared = new Set<string>();
  const lines = source.split("\n");
  for (const line of lines) {
    for (const match of line.matchAll(/\b(t\d+|tslv\d+|tslLoopI\d+)\b/g)) {
      const name = match[1]!;
      const declaration = new RegExp(`(?:float|int|bool|vec[234])\\s+${name}\\b|int\\s+${name}\\s*=`).test(line);
      if (declaration) declared.add(name);
      else if (!declared.has(name)) problems.push(`${name} used before declaration: ${line.trim()}`);
    }
  }
  if (stage === "fragment" && !/outColor\s*=/.test(source)) problems.push("fragment never assigns outColor");
  if (stage === "vertex" && !/gl_Position\s*=/.test(source)) problems.push("vertex never assigns gl_Position");
  return problems;
}

describe("tsl type inference", () => {
  it("promotes scalars and vectors like GLSL", () => {
    const n = tsl.uniform(3, { type: "int" });
    expect(tsl.add(n, n).type).toBe("int");
    expect(tsl.add(n, tsl.float(1)).type).toBe("float");
    expect(tsl.div(n, n).type).toBe("float");
    expect(tsl.add(tsl.positionLocal, 1).type).toBe("vec3");
    expect(tsl.mul(tsl.uv(), tsl.time).type).toBe("vec2");
    expect(tsl.dot(tsl.positionLocal, tsl.normalLocal).type).toBe("float");
    expect(tsl.length(tsl.positionLocal).type).toBe("float");
    expect(tsl.cross(tsl.positionLocal, tsl.normalLocal).type).toBe("vec3");
    expect(tsl.lessThan(tsl.time, 1).type).toBe("bool");
    expect(tsl.select(tsl.lessThan(tsl.time, 1), tsl.positionLocal, tsl.normalLocal).type).toBe("vec3");
    expect(tsl.texture({}, tsl.uv()).type).toBe("vec4");
  });

  it("types swizzles and constructors, and rejects invalid ones", () => {
    expect(tsl.positionLocal.xy.type).toBe("vec2");
    expect(tsl.positionLocal.z.type).toBe("float");
    expect(tsl.positionLocal.rgb.type).toBe("vec3");
    expect(tsl.vec3(tsl.uv(), 0).type).toBe("vec3");
    expect(tsl.vec4(tsl.positionLocal, 1).type).toBe("vec4");
    expect(codeOf(() => tsl.positionLocal.w)).toBe("tsl-type-mismatch");
    expect(codeOf(() => tsl.uv().xyz)).toBe("tsl-type-mismatch");
    expect(codeOf(() => tsl.vec3(tsl.uv(), tsl.uv()))).toBe("tsl-type-mismatch");
    expect(codeOf(() => tsl.add(tsl.positionLocal, tsl.uv()))).toBe("tsl-type-mismatch");
    expect(codeOf(() => tsl.cross(tsl.uv(), tsl.uv()))).toBe("tsl-type-mismatch");
    expect(codeOf(() => tsl.normalize(tsl.time))).toBe("tsl-type-mismatch");
    expect(codeOf(() => tsl.add(tsl.lessThan(tsl.time, 1), 1))).toBe("tsl-type-mismatch");
  });

  it("rejects unsupported TSL names and uv sets with named errors, never undefined", () => {
    expect(codeOf(() => (tsl as unknown as Record<string, unknown>).triplanarTexture)).toBe("tsl-unsupported-node");
    expect(codeOf(() => (tsl as unknown as Record<string, unknown>).viewportUV)).toBe("tsl-unsupported-node");
    expect(codeOf(() => (tsl as unknown as Record<string, unknown>).storage)).toBe("tsl-unsupported-node");
    expect(codeOf(() => tsl.uv(1))).toBe("tsl-unsupported-node");
    for (const name of tsl.supportedNames) expect((tsl as unknown as Record<string, unknown>)[name]).toBeDefined();
  });
});

describe("tsl constant folding", () => {
  it("folds all-constant ops to constants", () => {
    expect(constValue(tsl.add(1, 2))).toEqual([3]);
    expect(constValue(tsl.mul(tsl.vec3(1, 2, 3), 2))).toEqual([2, 4, 6]);
    expect(constValue(tsl.mix(tsl.vec3(0, 0, 0), tsl.vec3(1, 1, 1), 0.25))).toEqual([0.25, 0.25, 0.25]);
    expect(constValue(tsl.vec3(1, 2, 3).xy)).toEqual([1, 2]);
    expect(constValue(tsl.sin(0))).toEqual([0]);
    expect(constValue(tsl.clamp(5, 0, 1))).toEqual([1]);
    expect(constValue(tsl.cross(tsl.vec3(1, 0, 0), tsl.vec3(0, 1, 0)))).toEqual([0, 0, 1]);
    expect(constValue(tsl.vec3(0.5))).toEqual([0.5, 0.5, 0.5]);
    expect(constValue(tsl.lessThan(1, 2))).toEqual([1]);
  });

  it("keeps ops that depend on a runtime value", () => {
    expect(tsl.add(tsl.time, 1).data.k).toBe("op");
    expect(tsl.uniform(1).mul(2).data.k).toBe("op");
  });
});

describe("tsl reference interpreter (numeric)", () => {
  it("matches hand-computed values", () => {
    const smooth = (x: number): number => x * x * (3 - 2 * x);
    const mixed = tsl.mix(tsl.vec3(1, 0, 0), tsl.vec3(0, 0, 1), tsl.smoothstep(0, 1, tsl.uv().x));
    const out = tsl.evaluate(mixed, { uv: [0.25, 0] });
    expect(out.value[0]).toBeCloseTo(1 - smooth(0.25), 12);
    expect(out.value[1]).toBeCloseTo(0, 12);
    expect(out.value[2]).toBeCloseTo(smooth(0.25), 12);

    expect(tsl.evaluate(tsl.length(tsl.positionLocal), { positionLocal: [3, 4, 12] }).value[0]).toBeCloseTo(13, 12);
    expect(tsl.evaluate(tsl.dot(tsl.positionLocal, tsl.normalLocal), { positionLocal: [1, 2, 3], normalLocal: [0, 1, 0] }).value[0]).toBe(2);
    expect(tsl.evaluate(tsl.normalize(tsl.positionLocal), { positionLocal: [0, 3, 4] }).value).toEqual([0, 0.6, 0.8]);
    expect(tsl.evaluate(tsl.fract(tsl.time.mul(2)), { time: 1.3 }).value[0]).toBeCloseTo(0.6, 12);
    expect(tsl.evaluate(tsl.mod(tsl.time, 3), { time: -1 }).value[0]).toBe(2);
    expect(tsl.evaluate(tsl.float(0.5).step(tsl.time), { time: 0.7 }).value[0]).toBe(1);
    expect(tsl.evaluate(tsl.float(0.5).step(tsl.time), { time: 0.2 }).value[0]).toBe(0);
    expect(tsl.evaluate(tsl.pow(tsl.time, 3), { time: 2 }).value[0]).toBe(8);
    expect(tsl.evaluate(tsl.select(tsl.time.greaterThan(1), 10, 20), { time: 2 }).value[0]).toBe(10);
    expect(tsl.evaluate(tsl.select(tsl.time.greaterThan(1), 10, 20), { time: 0 }).value[0]).toBe(20);
    expect(tsl.evaluate(tsl.oneMinus(tsl.positionLocal), { positionLocal: [0.25, 1, 0] }).value).toEqual([0.75, 0, 1]);
    expect(tsl.evaluate(tsl.vec4(tsl.positionLocal, tsl.time), { positionLocal: [1, 2, 3], time: 4 }).value).toEqual([1, 2, 3, 4]);
  });

  it("reads uniforms, honours per-node overrides, and selects uniformArray elements", () => {
    const u = tsl.uniform(2, { name: "uScale" });
    const expr = u.mul(3);
    expect(tsl.evaluate(expr).value[0]).toBe(6);
    expect(tsl.evaluate(expr, { uniforms: new Map([[u, 5]]) }).value[0]).toBe(15);
    const palette = tsl.uniformArray([1, 2, 3], "float", { name: "uPalette" });
    expect(tsl.evaluate(palette.element(2)).value[0]).toBe(3);
    const index = tsl.uniform(1, { type: "int", name: "uIndex" });
    expect(tsl.evaluate(palette.element(index)).value[0]).toBe(2);
    expect(codeOf(() => palette.element(3))).toBe("invalid-tsl-graph");
  });

  it("executes Fn / Loop / If / ElseIf / Else blocks", () => {
    const sum = tsl.Fn(() => {
      const acc = tsl.float(0).toVar();
      tsl.Loop(4, ({ i }) => {
        acc.addAssign(i);
      });
      return acc;
    });
    expect(tsl.evaluate(sum()).value[0]).toBe(6);

    const sign = tsl.Fn((x) => {
      const out = tsl.float(0).toVar();
      tsl.If(x.greaterThan(0.5), () => { out.assign(1); })
        .ElseIf(x.lessThan(-0.5), () => { out.assign(-1); })
        .Else(() => { out.assign(0); });
      return out;
    });
    expect(tsl.evaluate(sign(tsl.time), { time: 0.9 }).value[0]).toBe(1);
    expect(tsl.evaluate(sign(tsl.time), { time: -0.9 }).value[0]).toBe(-1);
    expect(tsl.evaluate(sign(tsl.time), { time: 0.1 }).value[0]).toBe(0);

    const vecAccum = tsl.Fn(() => {
      const v = tsl.vec3(0, 0, 0).toVar();
      tsl.Loop({ start: 1, end: 4 }, ({ i }) => {
        v.addAssign(tsl.vec3(1, 2, 3).mul(i));
      });
      return v;
    });
    expect(tsl.evaluate(vecAccum()).value).toEqual([6, 12, 18]);
  });

  it("rejects statements outside Fn and bad conditions", () => {
    expect(codeOf(() => tsl.float(1).toVar())).toBe("tsl-statement-outside-fn");
    expect(codeOf(() => tsl.If(tsl.lessThan(tsl.time, 1), () => undefined))).toBe("tsl-statement-outside-fn");
    expect(codeOf(() => tsl.Loop(3, () => undefined))).toBe("tsl-statement-outside-fn");
    expect(codeOf(() => tsl.Fn(() => { tsl.If(tsl.time, () => undefined); return tsl.float(0); })())).toBe("tsl-type-mismatch");
    expect(codeOf(() => tsl.Fn(() => undefined)())).toBe("invalid-tsl-graph");
    expect(codeOf(() => tsl.Fn(() => { tsl.Loop(5000, () => undefined); return tsl.float(0); })())).toBe("invalid-tsl-graph");
  });
});

describe("material.node GLSL emission", () => {
  it("emits a colour graph", () => {
    const tint = tsl.uniform("#ff8800", { name: "uTint" });
    const pulse = tsl.sin(tsl.time.mul(2)).mul(0.5).add(0.5);
    const result = tsl.compile({ colorNode: tint.mul(pulse) });
    expect(result.vertex).toBe("");
    expect(result.uniforms).toEqual([{ name: "uTint", type: "vec3", specType: "color3" }]);
    expect(result.fragment).toMatchInlineSnapshot(`
      "out vec4 outColor;
      void main() {
        float t0 = (uTime * 2.0);
        float t1 = sin(t0);
        float t2 = (t1 * 0.5);
        float t3 = (t2 + 0.5);
        vec3 t4 = (uTint * t3);
        vec3 tslColor = t4;
        vec3 tslRgb = tslColor.rgb;
        float tslAlpha = 1.0;
        outColor = vec4(tslRgb, tslAlpha);
      }"
    `);
  });

  it("emits positionNode displacement, varyings, opacity, emissive and alphaTest", () => {
    const wave = tsl.sin(tsl.positionLocal.y.add(tsl.time)).mul(tsl.uniform(0.1, { name: "uAmp" }));
    const result = tsl.compile({
      positionNode: tsl.positionLocal.add(tsl.normalLocal.mul(wave)),
      colorNode: tsl.vec4(tsl.normalWorld.mul(0.5).add(0.5), 1),
      emissiveNode: tsl.color("#102030"),
      opacityNode: tsl.uv().x,
      alphaTest: 0.25
    });
    expect(result.vertex).toMatchInlineSnapshot(`
      "out vec3 vTslNormalWorld;
      out vec2 vTslUv;
      void main() {
        float t0 = (position.y + uTime);
        float t1 = sin(t0);
        float t2 = (t1 * uAmp);
        vec3 t3 = (normal * t2);
        vec3 t4 = (position + t3);
        vec3 tslPosition = t4;
        vTslNormalWorld = normalize(normalMatrix * normal);
        vTslUv = uv;
        gl_Position = modelViewProjectionMatrix * vec4(tslPosition, 1.0);
      }"
    `);
    expect(result.fragment).toMatchInlineSnapshot(`
      "out vec4 outColor;
      in vec3 vTslNormalWorld;
      in vec2 vTslUv;
      void main() {
        vec3 t0 = normalize(vTslNormalWorld);
        vec3 t1 = (t0 * 0.5);
        vec3 t2 = (t1 + 0.5);
        vec4 t3 = vec4(t2, 1.0);
        vec4 tslColor = t3;
        vec3 tslRgb = tslColor.rgb;
        float tslAlpha = tslColor.a;
        tslRgb += vec3(0.06274509803921569, 0.12549019607843137, 0.18823529411764706);
        tslAlpha *= vTslUv.x;
        if (tslAlpha < 0.25) discard;
        outColor = vec4(tslRgb, tslAlpha);
      }"
    `);
  });

  it("emits texture lookups, uniform arrays, Fn, If and Loop", () => {
    const palette = tsl.uniformArray(["#ff0000", "#00ff00", "#0000ff"], "color", { name: "uPalette" });
    const shade = tsl.Fn((base) => {
      const acc = tsl.vec3(0, 0, 0).toVar();
      tsl.Loop(3, ({ i }) => {
        acc.addAssign(palette.element(i).mul(base.x));
      });
      tsl.If(tsl.time.greaterThan(1), () => {
        acc.mulAssign(0.5);
      }).Else(() => {
        acc.assign(acc.add(0.1));
      });
      return acc;
    });
    const result = tsl.compile({ colorNode: shade(tsl.texture({}, tsl.uv().mul(2), { name: "uMap" })) });
    expect(result.fragment).toMatchInlineSnapshot(`
      "out vec4 outColor;
      in vec2 vTslUv;
      void main() {
        vec2 t0 = (vTslUv * 2.0);
        vec4 t1 = texture(uMap, t0);
        vec3 tslv0 = vec3(0.0, 0.0, 0.0);
        for (int tslLoopI1 = 0; tslLoopI1 < 3; tslLoopI1++) {
          vec3 t2 = (tslLoopI1 == 0 ? uPalette_0 : (tslLoopI1 == 1 ? uPalette_1 : uPalette_2));
          vec3 t3 = (t2 * t1.x);
          tslv0 += t3;
        }
        bool t4 = (uTime > 1.0);
        if (t4) {
          tslv0 *= 0.5;
        } else {
          vec3 t5 = (tslv0 + 0.1);
          tslv0 = t5;
        }
        vec3 tslColor = tslv0;
        vec3 tslRgb = tslColor.rgb;
        float tslAlpha = 1.0;
        outColor = vec4(tslRgb, tslAlpha);
      }"
    `);
    expect(result.uniforms.map((u) => u.name).sort()).toEqual(["uMap", "uPalette_0", "uPalette_1", "uPalette_2"]);
  });

  it("evaluates Fn arguments at the call site, outside the body's loops and branches", () => {
    const body = tsl.Fn((base) => {
      const acc = tsl.vec3(0, 0, 0).toVar();
      tsl.Loop(3, () => { acc.addAssign(base.x); });
      return acc;
    });
    const fragment = tsl.compile({ colorNode: body(tsl.texture({}, tsl.uv(), { name: "uMap" })) }).fragment;
    expect(fragment.indexOf("texture(uMap")).toBeGreaterThan(-1);
    expect(fragment.indexOf("texture(uMap")).toBeLessThan(fragment.indexOf("for ("));
  });

  it("is deterministic and orders auto-named uniforms by first use", () => {
    const build = () => tsl.compile({ colorNode: tsl.vec3(tsl.uniform(1), tsl.uniform(2), tsl.uniform(3)) });
    const a = build();
    const b = build();
    expect(a.fragment).toBe(b.fragment);
    expect(a.uniforms.map((u) => u.name)).toEqual(["tslUniform0", "tslUniform1", "tslUniform2"]);
  });

  it("rejects unsupported outputs, the WGSL backend, bad types and duplicate uniform names", () => {
    expect(codeOf(() => material.node({ normalNode: tsl.normalWorld }))).toBe("tsl-unsupported-output");
    expect(codeOf(() => material.node({ roughnessNode: tsl.float(0.5) }))).toBe("tsl-unsupported-output");
    expect(codeOf(() => material.node({ metalnessNode: tsl.float(1) }))).toBe("tsl-unsupported-output");
    expect(codeOf(() => material.node({ backend: "wgsl", colorNode: tsl.color("#fff") }))).toBe("tsl-requires-glsl-backend");
    expect(codeOf(() => material.node({ colorNode: tsl.float(1) }))).toBe("tsl-type-mismatch");
    expect(codeOf(() => material.node({ opacityNode: tsl.vec3(1, 1, 1) }))).toBe("tsl-type-mismatch");
    expect(codeOf(() => material.node({ positionNode: tsl.uv() }))).toBe("tsl-type-mismatch");
    expect(codeOf(() => material.node({ alphaTest: 2 }))).toBe("invalid-tsl-graph");
    expect(codeOf(() => material.node({ colorNode: tsl.vec3(tsl.uniform(1, { name: "uA" }), tsl.uniform(2, { name: "uA" }), 0) }))).toBe("invalid-tsl-graph");
    // an authored name that lowers into a reserved built-in is rejected by the shared material.custom validation
    expect(codeOf(() => material.node({ colorNode: tsl.vec3(tsl.uniform(1, { name: "time" }), 0, 0) }))).toBe("invalid-material-spec");
  });
});

describe("material.node compile-through (material.custom path)", () => {
  const graphs: Record<string, () => Parameters<typeof material.node>[0]> = {
    colour: () => ({ colorNode: tsl.uniform("#ff8800", { name: "uTint" }).mul(tsl.sin(tsl.time).mul(0.5).add(0.5)) }),
    displaced: () => ({
      positionNode: tsl.positionLocal.add(tsl.normalLocal.mul(tsl.sin(tsl.positionLocal.y.add(tsl.time)).mul(0.1))),
      colorNode: tsl.normalWorld.mul(0.5).add(0.5),
      opacityNode: tsl.uv().x,
      transparent: true
    }),
    worldFog: () => ({ colorNode: tsl.mix(tsl.color("#223344"), tsl.color("#ffffff"), tsl.saturate(tsl.distance(tsl.positionWorld, tsl.cameraPosition).div(50))) }),
    palette: () => {
      const handle = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 128, 0, 255]) });
      const palette = tsl.uniformArray(["#ff0000", "#00ff00", "#0000ff"], "color", { name: "uPalette" });
      const shade = tsl.Fn((base) => {
        const acc = tsl.vec3(0, 0, 0).toVar();
        tsl.Loop(3, ({ i }) => { acc.addAssign(palette.element(i).mul(base.x)); });
        return acc;
      });
      return { colorNode: shade(tsl.texture(handle, tsl.uv().mul(2), { name: "uMap" })) };
    },
    loop: () => ({
      colorNode: tsl.Fn(() => {
        const acc = tsl.vec3(0, 0, 0).toVar();
        tsl.Loop(4, ({ i }) => {
          tsl.If(tsl.float(i).greaterThan(1), () => { acc.addAssign(tsl.vec3(0.1, 0.2, 0.3)); }).Else(() => { acc.subAssign(0.05); });
        });
        return acc.abs();
      })()
    })
  };

  for (const [name, build] of Object.entries(graphs)) {
    it(`${name}: produces a custom spec whose baked GLSL is structurally valid and compiles on the mock device`, () => {
      const spec = material.node(build());
      expect(spec.kind).toBe("custom");
      const instance = createCustomShaderMaterial(spec.custom!);
      expect(glslProblems(instance.sources.glsl.fragment, "fragment")).toEqual([]);
      expect(glslProblems(instance.sources.glsl.vertex!, "vertex")).toEqual([]);
      const compiled = instance.compile(new MockRenderDevice());
      expect(compiled.ok).toBe(true);
      expect(compiled.program).toBeDefined();
      instance.dispose();
    });
  }

  it("a fragment-only graph keeps the default vertex stage; one using positionNode or varyings supplies its own", () => {
    expect(tsl.compile({ colorNode: tsl.color("#ff0000") }).spec.glsl.vertex).toBeUndefined();
    expect(tsl.compile({ colorNode: tsl.vec3(tsl.uv(), 0) }).spec.glsl.vertex).toContain("vTslUv = uv;");
    expect(tsl.compile({ positionNode: tsl.positionLocal.mul(2) }).spec.glsl.vertex).toContain("vec3 tslPosition");
  });

  it("transparent / side / blending / depth options pass through to the custom spec", () => {
    const spec = material.node({ colorNode: tsl.color("#fff"), transparent: true, side: "double", blending: "additive", depthWrite: false, depthTest: false, fog: false });
    expect(spec.custom).toMatchObject({ transparent: true, side: "double", blending: "additive", depthWrite: false, depthTest: false, fog: false });
  });

  it("setUniform on a named uniform node updates the parameter without changing the shader key", () => {
    const glow = tsl.uniform(0.5, { name: "uGlow" });
    const spec = material.node({ colorNode: tsl.vec3(glow, glow.mul(0.5), 0) });
    const instance = createCustomShaderMaterial(spec.custom!);
    const shaderKey = instance.shaderKey;
    expect(instance.getParameter("u_uGlow")).toBe(0.5);
    expect(applyCustomUniformWrites(instance, new Map([["uGlow", 2]]))).toBe(1);
    expect(instance.getParameter("u_uGlow")).toBe(2);
    expect(instance.shaderKey).toBe(shaderKey);
    // reflected in the CPU reference too
    expect(tsl.evaluate(glow.mul(0.5), { uniforms: new Map([[glow, 2]]) }).value[0]).toBe(1);
    instance.dispose();
  });

  it("a texture node lowers to a texture2d uniform and samples in the fragment stage", () => {
    const handle = texture.data({ width: 1, height: 1, data: new Uint8Array([255, 128, 0, 255]) });
    const spec = material.node({ colorNode: tsl.texture(handle, tsl.uv().mul(2), { name: "uMap" }).rgb });
    expect(spec.custom!.uniforms!.uMap).toMatchObject({ type: "texture2d" });
    const instance = createCustomShaderMaterial(spec.custom!);
    expect(instance.sources.glsl.fragment).toContain("uniform sampler2D u_uMap;");
    expect(instance.sources.glsl.fragment).toMatch(/texture\(uMap, /);
    expect(instance.compile(new MockRenderDevice()).ok).toBe(true);
    instance.dispose();
  });
});


describe("tsl.texture() binds authored textures (R-26)", () => {
  const data = (fill: number): Uint8Array => new Uint8Array(16).fill(fill);
  const bindingOf = (instance: ReturnType<typeof createCustomShaderMaterial>): TextureBinding => {
    const found = [...instance.getParameters().values()].find(isTextureBinding);
    expect(found).toBeDefined();
    return found as TextureBinding;
  };

  it("tsl.texture(texture.data(...), uv()) samples the data texture, not the white fallback", () => {
    const handle = texture.data({ width: 2, height: 2, data: data(200) });
    const spec = material.node({ colorNode: tsl.texture(handle, tsl.uv(), { name: "uMap" }) });
    const instance = createCustomShaderMaterial(spec.custom!);
    const binding = bindingOf(instance);
    expect(binding.texture).toBe(handle.texture);
    expect(instance.customDiagnostics).toEqual([]);
    const compiled = instance.compile(new MockRenderDevice());
    expect(compiled.ok).toBe(true);
    const bound = new MaterialBinding().bind(instance, compiled.program!);
    expect(bound.warnings.join("\n")).not.toContain("using fallback texture");
    instance.dispose();
  });

  it("setUniform on the texture node's name swaps the bound texture without a program change", () => {
    const first = texture.data({ width: 2, height: 2, data: data(10) });
    const second = texture.data({ width: 2, height: 2, data: data(240) });
    const spec = material.node({ colorNode: tsl.texture(first, tsl.uv(), { name: "uMap" }) });
    const instance = createCustomShaderMaterial(spec.custom!);
    const shaderKey = instance.shaderKey;
    expect(applyCustomUniformWrites(instance, new Map([["uMap", second]]))).toBe(1);
    expect(bindingOf(instance).texture).toBe(second.texture);
    expect(applyCustomUniformWrites(instance, new Map([["uMap", second]]))).toBe(0);
    expect(instance.shaderKey).toBe(shaderKey);
    instance.dispose();
  });

  it("a texture node left without a texture is named in customDiagnostics", () => {
    const spec = material.node({ colorNode: tsl.texture(undefined, tsl.uv(), { name: "uMap" }) });
    const instance = createCustomShaderMaterial(spec.custom!);
    expect(instance.customDiagnostics.some((line) => line.includes("[CUSTOM_TEXTURE_UNBOUND]"))).toBe(true);
    instance.dispose();
  });
});
