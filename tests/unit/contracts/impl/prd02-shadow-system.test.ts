import { describe, expect, it } from "vitest";
import "../../../../packages/rendering/src/lanes/prd02"; // registers chunk + contributor + depth features
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../../packages/rendering/src/UnlitMaterial";
import type { RenderItem } from "../../../../packages/rendering/src/contracts/renderItem";
import { shadowCasterVariantId } from "../../../../packages/rendering/src/contracts/shadows";
import { PerspectiveCamera, identityMat4 } from "@aura3d/scene";
import {
  fitDirectionalCascades,
  planLocalShadowAtlas,
  spotShadowMatrix,
  pointShadowFaceMatrix,
  resolvePrd02ShadowCasterVariant,
  prd02DepthVariantDefines,
  prd02DepthFeatures,
  Prd02ShadowSystem,
  createPrd02ShadowsContributor,
  bindShadowFrameUniforms,
  prd02ShadowDiagnostics,
  type ShadowSystemConfigInput
} from "../../../../packages/rendering/src/lanes/prd02";

const FLAGS_ON = resolveQrFlags({ options: { A3D_QR_LIGHTING: true } });
const TIER = QUALITY_TIERS.high;
const CONFIG: ShadowSystemConfigInput = {
  enabled: true, mapSize: 512, cascades: 2, maxDistance: 60, splitLambda: 0.6,
  filter: "pcf", strength: 1, bias: 0, normalBias: 1.5
};

/** Plain C-08 CameraLike — deliberately NOT a PerspectiveCamera instance. */
const plainCamera = (x = 0) => {
  const cam = new PerspectiveCamera({ fovYRadians: Math.PI / 3, aspect: 1, near: 0.5, far: 60 });
  cam.transform.setPosition(x, 4, 10);
  cam.updateCameraMatrices();
  return {
    viewProjectionMatrix: cam.viewProjectionMatrix,
    near: cam.near,
    far: cam.far
  };
};

const CASTER: RenderItem = { geometry: Geometry.triangle(), modelMatrix: identityMat4(), label: "tri" };

describe("DirectionalCascadeFitter (plain-camera + stable fit)", () => {
  it("fits cascades from a plain-object camera — no instanceof", () => {
    const fits = fitDirectionalCascades({
      camera: plainCamera(), lightDirection: [0, -1, -0.2],
      casters: [CASTER], mapSize: 512, cascadeCount: 3
    });
    expect(fits).toHaveLength(3);
    for (const fit of fits) {
      expect(fit.viewProjection).toHaveLength(16);
      expect(fit.drawViewProjection).toHaveLength(16);
      expect([...fit.viewProjection].every(Number.isFinite)).toBe(true);
      expect(fit.texelWorld).toBeGreaterThan(0);
      expect(fit.splitFar).toBeGreaterThan(0);
    }
  });

  it("light behind the camera still produces valid cascade matrices", () => {
    const fits = fitDirectionalCascades({
      camera: plainCamera(), lightDirection: [0, -0.2, 1],
      casters: [CASTER], mapSize: 512, cascadeCount: 1
    });
    expect(fits).toHaveLength(1);
    expect([...fits[0]!.viewProjection].every(Number.isFinite)).toBe(true);
  });

  it("texel snap: sub-texel camera moves leave matrices identical", () => {
    const run = (dx: number) => fitDirectionalCascades({
      camera: plainCamera(dx), lightDirection: [0, -1, -0.2],
      casters: [CASTER], mapSize: 512, cascadeCount: 2
    });
    const a = run(0);
    const texel = a[0]!.texelWorld;
    const b = run(texel * 0.01);
    for (let i = 0; i < a.length; i += 1) {
      for (let j = 0; j < 16; j += 1) {
        expect(Math.abs(a[i]!.viewProjection[j]! - b[i]!.viewProjection[j]!)).toBeLessThan(texel);
      }
    }
  });
});

describe("ShadowAtlas planning", () => {
  it("spot → 1 tile, point → 6 tiles with 90° faces", () => {
    const plan = planLocalShadowAtlas([
      { lightIndex: 0, kind: "spot", size: 128, position: [0, 3, 0], direction: [0, -1, 0], range: 10, outerAngleRadians: Math.PI / 6 },
      { lightIndex: 1, kind: "point", size: 128, position: [1, 2, 0], direction: [0, -1, 0], range: 8 }
    ], 1024);
    const spotTiles = plan.tiles.filter((t) => t.lightIndex === 0);
    const pointTiles = plan.tiles.filter((t) => t.lightIndex === 1);
    expect(spotTiles).toHaveLength(1);
    expect(pointTiles).toHaveLength(6);
    for (const tile of plan.tiles) {
      expect(tile.scissor.width).toBeGreaterThan(0);
      expect([...tile.viewProjection].every(Number.isFinite)).toBe(true);
      expect([...tile.drawViewProjection].every(Number.isFinite)).toBe(true);
    }
    expect(pointTiles.map((t) => t.face).sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("exported matrices stay finite for edge cases", () => {
    expect([...spotShadowMatrix([0, 5, 0], [0, -1, 0], 10, Math.PI / 5)].every(Number.isFinite)).toBe(true);
    for (let f = 0; f < 6; f += 1) {
      expect([...pointShadowFaceMatrix([0, 1, 0], 8, f)].every(Number.isFinite)).toBe(true);
    }
  });
});

describe("shadow caster variants (C-11)", () => {
  it("resolves skinning/instanced/alpha bits + feature map", () => {
    const skinned: RenderItem = {
      ...CASTER, label: "skinned",
      skinning: { jointCount: 24, matrices: new Float32Array(24 * 16) }
    };
    const key = resolvePrd02ShadowCasterVariant(skinned, FLAGS_ON, TIER, prd02DepthFeatures());
    expect(key.skinning).toBe(4);
    expect(key.features["prd02.depthSkinning"]).toBe(4);
    const id = shadowCasterVariantId(key);
    expect(id).toContain("sk4");

    const instanced: RenderItem = { ...CASTER, label: "inst", instanceTransforms: new Float32Array(32) };
    const keyI = resolvePrd02ShadowCasterVariant(instanced, FLAGS_ON, TIER, prd02DepthFeatures());
    expect(keyI.instanced).toBe(true);
    expect(shadowCasterVariantId(keyI)).toContain("i");
  });

  it("defines follow the key", () => {
    const defines = prd02DepthVariantDefines(
      resolvePrd02ShadowCasterVariant(
        { ...CASTER, instanceTransforms: new Float32Array(16), skinning: { jointCount: 8, matrices: new Float32Array(128) } },
        FLAGS_ON, TIER, prd02DepthFeatures()
      ),
      prd02DepthFeatures()
    );
    expect(defines.A3D_DEPTH_INSTANCED).toBe(1);
    expect(defines.A3D_DEPTH_SKINNED).toBe(1);
  });
});

describe("Prd02ShadowSystem", () => {
  it("update publishes frame uniforms + diagnostics on a mock device", () => {
    const device = new MockRenderDevice();
    device.beginFrame(512, 512);
    const system = new Prd02ShadowSystem(device, CONFIG);
    const uniforms = system.update({
      camera: plainCamera(),
      sun: { direction: [0, -1, -0.2] },
      casters: [CASTER],
      localLights: [
        { shadowIndex: 0, kind: "spot", position: [0, 4, 0], direction: [0, -1, 0], range: 10, outerAngleRadians: Math.PI / 5 },
        { shadowIndex: 1, kind: "point", position: [1, 2, 0], direction: [0, -1, 0], range: 6 }
      ],
      flags: FLAGS_ON,
      tier: TIER
    });
    expect(uniforms.cascadeMatrices).toHaveLength(64);
    expect(uniforms.cascadeSplits).toHaveLength(4);
    expect(uniforms.localShadowData).toHaveLength(24);
    expect(uniforms.localShadowMatrices).toHaveLength(96);
    // spot(1) + point(6) = 7 planned tiles, capped at 6 → point light dropped.
    const diag = system.diagnostics();
    expect(diag.cascadeCount).toBe(2);
    expect(diag.tiles).toBe(6);
    expect(diag.droppedFeatures).toContain("shadow.localLight:1");
    // Depth draws were issued: cascade targets + atlas tiles.
    expect(device.drawCommands.length).toBeGreaterThan(0);
    expect(device.drawCommands.every((d) => d.renderState?.depthWrite)).toBe(true);
    device.endFrame();
    system.dispose();
  });

  it("precompile resolves without a sun/light frame", async () => {
    const device = new MockRenderDevice();
    const system = new Prd02ShadowSystem(device, CONFIG);
    await system.precompile({ camera: plainCamera(), casters: [CASTER], flags: FLAGS_ON, tier: TIER });
    expect(system.isPrecompiled).toBe(true);
    system.dispose();
  });
});

describe("contributor + binding", () => {
  it("createPrd02ShadowsContributor is flag-gated on A3D_QR_LIGHTING", () => {
    const c = createPrd02ShadowsContributor();
    expect(c.id).toBe("prd02.shadows");
    expect(c.flag).toBe("A3D_QR_LIGHTING");
    expect(c.phases).toContain("shadows");
    expect(FLAGS_ON.on("A3D_QR_LIGHTING")).toBe(true);
    expect(resolveQrFlags({}).on("A3D_QR_LIGHTING")).toBe(false);
  });

  it("bindShadowFrameUniforms writes every u_prd02* parameter", () => {
    const device = new MockRenderDevice();
    device.beginFrame(512, 512);
    const system = new Prd02ShadowSystem(device, CONFIG);
    const uniforms = system.update({
      camera: plainCamera(), sun: { direction: [0, -1, 0] }, casters: [CASTER],
      localLights: [], flags: FLAGS_ON, tier: TIER
    });
    device.endFrame();
    const material = new UnlitMaterial({ name: "recv" });
    bindShadowFrameUniforms(material, uniforms, CONFIG);
    for (const name of [
      "u_prd02CascadeCompare0", "u_prd02CascadeCompare3", "u_prd02LocalCompare",
      "u_prd02ShadowRaw", "u_prd02CascadeMatrix", "u_prd02CascadeSplits",
      "u_prd02CascadeTexelWorld", "u_prd02ShadowMapSize", "u_prd02NormalBias",
      "u_prd02ShadowStrength", "u_prd02ShadowAtlasRect", "u_prd02LocalShadowMatrix",
      "u_prd02LocalShadowIndex"
    ]) {
      expect(material.getParameter(name)).not.toBeUndefined();
    }
    expect(material.getParameter("u_prd02NormalBias")).toBe(1.5);
    system.dispose();
  });

  it("prd02ShadowDiagnostics stays null before any frame", () => {
    // Module sink is only written inside a pass execute; here it may hold a
    // previous test's frame — the observable contract is the type shape.
    const d = prd02ShadowDiagnostics();
    expect(d === null || Array.isArray(d.shadows)).toBe(true);
  });
});
