/**
 * C-05 / T0-07: a configured legacy post chain under A3D_QR_CORE_OUTPUT keeps
 * its authored effects. The frame takes the legacy chain, which encodes itself,
 * and bypasses OutputPass instead of dropping the chain. Before this, scene
 * 18-game-scene lost its bloom on L4 (LPIPS -core_output 0.026 vs core 0.068;
 * flags-bisect 38188725947).
 */

import { describe, expect, it } from "vitest";
import {
  CORE_OUTPUT_LEGACY_POST_MESSAGE,
  legacyPostEffects,
  resolveCoreOutputPostRoute,
  withCoreOutputOff
} from "../../../../packages/rendering/src/renderer/coreOutputPostRoute";
import { qrCoreGeneratorOn, qrCoreOutputOn } from "../../../../packages/rendering/src/renderer/qrSubFlags";
import { prd07OpaqueColorResource } from "../../../../packages/rendering/src/vfx/contributors";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";

const coreFlags: QrFlags = {
  values: { A3D_QR_CORE: "v2" },
  on: (name) => name === "A3D_QR_CORE"
};

describe("core-output legacy post route", () => {
  it("frames without a legacy chain take the v2 OutputPass path (unchanged)", () => {
    expect(resolveCoreOutputPostRoute(true, undefined)).toEqual({ qrOutput: true, skipped: null });
  });

  it("flag off: legacy path, nothing reported", () => {
    expect(resolveCoreOutputPostRoute(false, { bloom: { strength: 0.7 } })).toEqual({ qrOutput: false, skipped: null });
    expect(resolveCoreOutputPostRoute(false, undefined)).toEqual({ qrOutput: false, skipped: null });
  });

  it("a legacy chain under core_output keeps the chain (no OutputPass) and reports the residue", () => {
    const route = resolveCoreOutputPostRoute(true, { bloom: { strength: 0.7, threshold: 0.85 }, toneMapping: true, targetFormat: "rgba16f", temporal: true });
    expect(route.qrOutput).toBe(false);
    expect(route.skipped).toEqual({
      code: "post-v2-unmigrated",
      message: CORE_OUTPUT_LEGACY_POST_MESSAGE,
      effects: ["bloom", "toneMapping"]
    });
  });

  it("legacyPostEffects lists enabled effects only", () => {
    expect(legacyPostEffects({ bloom: {}, ssao: false, fxaa: true, targetFormat: "rgba8" })).toEqual(["bloom", "fxaa"]);
  });

  it("withCoreOutputOff turns only the output sub-flag off for the frame", () => {
    const frame = withCoreOutputOff(coreFlags);
    expect(qrCoreOutputOn(coreFlags)).toBe(true);
    expect(qrCoreOutputOn(frame)).toBe(false);
    expect(qrCoreGeneratorOn(frame)).toBe(true);
    expect(frame.on("A3D_QR_CORE")).toBe(true);
    expect(coreFlags.values.A3D_QR_CORE_OUTPUT).toBeUndefined();
  });

  it("frame contributors pick the legacy colour resource on a legacy-routed frame", () => {
    const ctx = (flags: QrFlags) => ({ flags }) as never;
    expect(prd07OpaqueColorResource(ctx(coreFlags))).toBe("aura.scene.color.opaque");
    expect(prd07OpaqueColorResource(ctx(withCoreOutputOff(coreFlags)))).toBe("color");
  });
});
