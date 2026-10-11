import { describe, expect, it } from "vitest";

import { createSideViewGameRenderPreset, createTopDownGameRenderPreset } from "../../../../packages/engine/src/production-runtime/GameRenderPreset";
import { probeHdrTargetFormat } from "../../../../packages/rendering/src/contracts/output";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";

/** #67 (R-14-06): game presets take their target format from C-05 probeHdrTargetFormat. */

describe("#67 game render presets honour probeHdrTargetFormat", () => {
  it("default stays rgba8 (no default-path change)", () => {
    expect(createSideViewGameRenderPreset().postprocess.targetFormat).toBe("rgba8");
    expect(createTopDownGameRenderPreset().postprocess.targetFormat).toBe("rgba8");
  });

  it("passes the probed format through on both presets", () => {
    const device = new MockRenderDevice();
    // probeHdrTargetFormat returns rgba16f or rgba8 (HdrTargetFormat also names r11f_g11f_b10f, which post targets do not use).
    const probed = probeHdrTargetFormat(device) === "rgba16f" ? "rgba16f" : "rgba8";
    expect(createSideViewGameRenderPreset({ hdrTargetFormat: probed }).postprocess.targetFormat).toBe(probed);
    expect(createTopDownGameRenderPreset({ hdrTargetFormat: "rgba16f" }).postprocess.targetFormat).toBe("rgba16f");
    expect(createSideViewGameRenderPreset({ hdrTargetFormat: "rgba16f" }).postprocess.targetFormat).toBe("rgba16f");
  });
});
