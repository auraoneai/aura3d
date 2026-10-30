// GU47 lane eint, E-A handoff: `effects.bloom` copies the v2 `knee` and
// `clampLuminance` onto the node so `mapBloomOptionsV2` reads them;
// `effects.colorGrade` keeps forwarding white balance and LUT intensity.
import { describe, expect, it } from "vitest";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { mapBloomOptionsV2 } from "../../../../packages/engine/src/agent-api/postBridge";

describe("GU47 eint: bloom knee/clampLuminance and grade white balance on the node", () => {
  it("copies authored knee and clampLuminance and the v2 bridge reads them", () => {
    const node = effects.bloom({ knee: 0.4, clampLuminance: 8 }).toJSON() as unknown as Record<string, unknown>;
    expect(node.knee).toBe(0.4);
    expect(node.clampLuminance).toBe(8);
    const { options } = mapBloomOptionsV2(node as never, 5);
    expect(options.knee).toBe(0.4);
    expect(options.clampLuminance).toBe(8);
  });

  it("adds no keys when knee/clampLuminance are not authored (node unchanged)", () => {
    const node = effects.bloom({ intensity: 0.3 }).toJSON() as unknown as Record<string, unknown>;
    expect("knee" in node).toBe(false);
    expect("clampLuminance" in node).toBe(false);
    const { options } = mapBloomOptionsV2(node as never, 5);
    expect(options.knee).toBe(0.25);
    expect(options.clampLuminance).toBe(64);
  });

  it("forwards grade temperature, tint and lutIntensity", () => {
    const node = effects.colorGrade({ temperature: 0.2, tint: -0.1, lutIntensity: 0.5 }).toJSON() as unknown as Record<string, unknown>;
    expect(node.temperature).toBe(0.2);
    expect(node.tint).toBe(-0.1);
    expect(node.lutIntensity).toBe(0.5);
  });
});
