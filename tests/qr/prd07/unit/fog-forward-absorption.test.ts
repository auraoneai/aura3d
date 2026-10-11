// #187 / #82 (Q-07-3) — real C-21 `setFog({ mode: "absorption" })` on forward
// geometry. The prd07.fog contributor publishes the packed §8.4 uniforms to the
// forward-fog store during collect; the `prd07.fog` ShaderFeature binds them per
// draw (ForwardPass → bindShaderFeatureUniforms). Before this, generated forward
// programs spliced a3dApplyFog but every u_fog* uniform stayed 0 (mode 0, no fog).
// The GPU compile/link + pixel proof is a macos-14 run (no GL in vitest).

import { afterEach, describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd07";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { shaderFeaturesFor } from "../../../../packages/rendering/src/contracts/program";
import { frameContributors } from "../../../../packages/rendering/src/contracts/frameGraph";
import { bindShaderFeatureUniforms } from "../../../../packages/rendering/src/program/FeatureSelect";
import {
  bindPrd07FogUniforms,
  prd07ForwardFog,
  setPrd07ForwardFog
} from "../../../../packages/rendering/src/atmosphere/fogUniformStore";
import { FOG_MODE, absorptionTransmittance, type Vec3 } from "../../../../packages/rendering/src/atmosphere/HeightFog";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";

const OCEAN: Vec3 = [0.45, 0.09, 0.06];
const WATER: Vec3 = [0.02, 0.12, 0.2];
const V2_FLAGS = resolveQrFlags({ options: ["core", "vfx", "vfx.fog"] });
const ITEM = { geometry: {}, material: { shaderKey: "pbr" } } as unknown as RenderItem;

function fogContributor(flags = V2_FLAGS) {
  const c = frameContributors(flags).find((x) => x.id === "prd07.fog");
  if (!c?.collect) throw new Error("prd07.fog contributor not active");
  return c;
}

function runCollect(resolveFog: () => Record<string, unknown> | null, flags = V2_FLAGS) {
  const blackboard = new Map<string, unknown>();
  const ctx = {
    source: { atmosphere: { resolveFog, fogVolumes: () => [], sky: null } },
    camera: { position: [0, -4, 0], viewMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), far: 500 },
    flags,
    blackboard,
    timeSeconds: 0
  };
  fogContributor(flags).collect!([], ctx as never);
  return blackboard;
}

function bound(): Map<string, unknown> {
  const out = new Map<string, unknown>();
  bindPrd07FogUniforms((name, value) => out.set(name, value));
  return out;
}

afterEach(() => setPrd07ForwardFog(null));

describe("#187 absorption fog on forward geometry", () => {
  it("no live fog node → forward programs bind mode 0 only (IC-0, no default height fog)", () => {
    runCollect(() => null);
    expect(prd07ForwardFog()).toBeNull();
    expect([...bound().entries()]).toEqual([["u_fogMode", 0]]);
  });

  it("absorption spec on the C-02 path → mode 5 with per-channel σ, not the luminance collapse", () => {
    runCollect(() => ({ mode: "absorption", absorption: OCEAN, color: "#05203a" }));
    const u = bound();
    expect(u.get("u_fogMode")).toBe(FOG_MODE.absorption);
    expect(u.get("u_fogAbsorption")).toEqual(OCEAN);
    expect(u.get("u_cameraPosition")).toEqual([0, -4, 0]);
    expect(u.get("u_fogVolumes")).toBeInstanceOf(Float32Array);
    for (const name of ["u_fogA", "u_fogB", "u_fogColor", "u_fogNear", "u_fogFar", "u_sunDirection", "u_sunColor"]) {
      expect(u.has(name), name).toBe(true);
    }
  });

  it("bound uniforms through the GLSL mode-5 formula give T = exp(-σ·d) per channel", () => {
    runCollect(() => ({ mode: "absorption", absorption: OCEAN, color: [WATER[0], WATER[1], WATER[2]] }));
    const u = bound();
    const sigma = u.get("u_fogAbsorption") as Vec3;
    const fogColor = u.get("u_fogColor") as Vec3;
    // a3dApplyFog mode 5: color * T + u_fogColor * (1 - T), T = exp(-σ·|r|)
    const d = 10;
    const T = sigma.map((s) => Math.exp(-s * d));
    const expected = absorptionTransmittance(OCEAN, d);
    for (let i = 0; i < 3; i++) expect(T[i]).toBeCloseTo(expected[i]!, 6);
    const out = [0, 1, 2].map((i) => 1 * T[i]! + fogColor[i]! * (1 - T[i]!));
    // Red is absorbed fastest underwater: red transmittance < green < blue.
    expect(T[0]).toBeLessThan(T[1]!);
    expect(T[1]).toBeLessThan(T[2]!);
    expect(out[0]).toBeLessThan(out[2]!);
  });

  it("legacy generator (core off) keeps the parity slots — mode 6, unchanged", () => {
    const legacy = resolveQrFlags({ options: ["vfx", "vfx.fog"] });
    runCollect(() => ({ mode: "absorption", absorption: OCEAN }), legacy);
    expect(bound().get("u_fogMode")).toBe(FOG_MODE.legacyParity);
  });

  it("a frame without atmosphere clears the store", () => {
    runCollect(() => ({ mode: "absorption", absorption: OCEAN }));
    expect(prd07ForwardFog()).not.toBeNull();
    const ctx = { source: {}, camera: null, flags: V2_FLAGS, blackboard: new Map(), timeSeconds: 0 };
    fogContributor().collect!([], ctx as never);
    expect(prd07ForwardFog()).toBeNull();
  });

  it("the prd07.fog ShaderFeature binds the store per draw via bindShaderFeatureUniforms", () => {
    const feature = shaderFeaturesFor(V2_FLAGS).find((f) => f.id === "prd07.fog");
    expect(feature?.bindUniforms).toBeTypeOf("function");
    runCollect(() => ({ mode: "absorption", absorption: OCEAN }));
    const u = new Map<string, unknown>();
    bindShaderFeatureUniforms({ "prd07.fog": "height" }, V2_FLAGS, ITEM, (n, v) => u.set(n, v));
    expect(u.get("u_fogMode")).toBe(FOG_MODE.absorption);
    expect(u.get("u_fogAbsorption")).toEqual(OCEAN);
    // A draw that did not select prd07.fog binds nothing from the store.
    const none = new Map<string, unknown>();
    bindShaderFeatureUniforms({}, V2_FLAGS, ITEM, (n, v) => none.set(n, v));
    expect(none.has("u_fogMode")).toBe(false);
  });
});

describe("#187 parity gate matches the forward generator gate (qrCoreGeneratorOn)", () => {
  const spec = () => ({ mode: "absorption", absorption: OCEAN });
  it.each([
    [{ env: { A3D_QR_CORE: "v2", A3D_QR_VFX: "1", A3D_QR_VFX_FOG: "1" } }, FOG_MODE.absorption],
    [{ options: ["core", "vfx", "vfx.fog"] }, FOG_MODE.absorption],
    [{ env: { A3D_QR_CORE: "v2", A3D_QR_CORE_GENERATOR: "0", A3D_QR_VFX: "1", A3D_QR_VFX_FOG: "1" } }, FOG_MODE.legacyParity]
  ] as const)("%j → u_fogMode %d", (input, mode) => {
    runCollect(spec, resolveQrFlags(input as never));
    expect(bound().get("u_fogMode")).toBe(mode);
  });
});
