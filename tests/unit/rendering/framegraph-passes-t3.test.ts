import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { DepthPrepass } from "../../../packages/rendering/src/production-runtime/passes/DepthPrepass.js";
import { OpaquePass } from "../../../packages/rendering/src/production-runtime/passes/OpaquePass.js";
import { ShadowPass } from "../../../packages/rendering/src/production-runtime/passes/ShadowPass.js";
import { SkyboxPass } from "../../../packages/rendering/src/production-runtime/passes/SkyboxPass.js";
import { ToneMappingPass } from "../../../packages/rendering/src/production-runtime/passes/ToneMappingPass.js";
import { TransparentPass } from "../../../packages/rendering/src/production-runtime/passes/TransparentPass.js";
import {
  PRODUCTION_PASS_ORDER,
  validatePassOrder,
  validatePassResourceFlow
} from "../../../packages/rendering/src/production-runtime/passes/FramegraphTopology.js";

const CONTEXT = { frameIndex: 7, width: 1280, height: 720 };

function canonicalPasses() {
  return [
    new DepthPrepass(),
    new ShadowPass(),
    new SkyboxPass(),
    new OpaquePass(),
    new TransparentPass(),
    new ToneMappingPass()
  ];
}

describe("T3 framegraph passes own real logic", () => {
  test("zero logic-less passes: every pass declares non-empty edges and executes", () => {
    for (const pass of canonicalPasses()) {
      assert.ok(pass.reads.length > 0, `${pass.id} reads`);
      assert.ok(pass.writes.length > 0, `${pass.id} writes`);
      assert.equal(pass.executionCount, 0);
      pass.execute(CONTEXT);
      pass.execute({ ...CONTEXT, frameIndex: 8 });
      assert.equal(pass.executionCount, 2);
      assert.equal(pass.lastExecutedFrame, 8);
    }
  });

  test("options validation fails closed per pass", () => {
    assert.throws(() => new DepthPrepass({ depthResource: "  " }), /non-empty/);
    assert.throws(() => new ShadowPass({ maxShadowCasters: 0 }), /positive integer/);
    assert.throws(() => new OpaquePass({ lightingResource: "" }), /non-empty/);
    assert.throws(() => new TransparentPass({ maxTransparentItems: -1 }), /positive integer/);
    assert.throws(() => new SkyboxPass({ skyResource: "" }), /non-empty/);
    assert.throws(() => new ToneMappingPass({ exposure: 0 }), /exposure/);
    assert.throws(() => new ToneMappingPass({ operator: "bogus" as never }), /operator/);
    const tone = new ToneMappingPass({ exposure: 1.2, operator: "reinhard" });
    assert.equal(tone.exposure, 1.2);
    assert.equal(tone.operator, "reinhard");
  });

  test("execute rejects invalid contexts; disabled passes skip bookkeeping", () => {
    const pass = new OpaquePass();
    assert.throws(() => pass.execute({ frameIndex: -1, width: 8, height: 8 }), /frameIndex/);
    assert.throws(() => pass.execute({ frameIndex: 0, width: 0, height: 8 }), /width/);
    assert.throws(() => pass.execute({ frameIndex: 0, width: 8, height: Number.NaN }), /height/);
    const disabled = new SkyboxPass({ enabled: false });
    disabled.execute(CONTEXT);
    assert.equal(disabled.executionCount, 0);
  });

  test("resource validation names the missing input", () => {
    const pass = new ShadowPass();
    assert.throws(() => pass.validateResources(["scene.casters"]), /shadow\.maps/);
    pass.validateResources(["scene.casters", "shadow.maps"]);
  });

  test("canonical order validates; missing/misordered/undocumented fail", () => {
    const passes = canonicalPasses();
    assert.deepEqual(
      passes.map((pass) => pass.id),
      [...PRODUCTION_PASS_ORDER]
    );
    assert.deepEqual(validatePassOrder(passes), []);
    assert.deepEqual(validatePassResourceFlow(passes), []);
    assert.ok(validatePassOrder(passes.slice(1)).some((error) => error.includes("Missing production pass: DepthPrepass")));
    assert.ok(validatePassOrder([...passes].reverse()).some((error) => error.includes("Misordered")));
    assert.ok(
      validatePassOrder([...passes, { id: "MysteryPass", kind: "opaque", reads: [], writes: [] }]).some((error) =>
        error.includes("Undocumented production pass")
      )
    );
  });

  test("Skybox survivors feed D3 sky; Shadow survivors feed B1", () => {
    const sky = new SkyboxPass();
    const shadow = new ShadowPass();
    assert.ok(sky.reads.includes("environment.sky"), "sky reads the D3 environment resource");
    assert.ok(shadow.writes.includes("shadow.mask"), "shadow writes the B1 mask resource");
    assert.ok(new OpaquePass().reads.includes("shadow.mask"), "opaque consumes the B1 mask");
  });
});
