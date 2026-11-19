import { describe, expect, it } from "vitest";
import { REFINED_LOOKS } from "../../../apps/showcase-iron-crown/src/game/refinedLook";

/** owner (22:58): Crown Arena "still too much orange" — the image-based light and the key must be near-neutral white */
const warmth = (hex: string) => { const r = parseInt(hex.slice(1, 3), 16), b = parseInt(hex.slice(5, 7), 16); return r / Math.max(1, b); };

describe("Crown Arena lights are near-neutral (warmth only in the braziers)", () => {
  const crown = REFINED_LOOKS["crown-arena"]!;
  it("no warm image-based light probe", () => {
    expect(crown.hdri).not.toBe("warm_bar");
  });
  it("key, follow-spot and ring key are within ~5500-6500 K (red/blue ratio <= 1.06)", () => {
    const key = (crown.overrides as any).key?.color as string;
    expect(key).toBeDefined();
    for (const c of [key, crown.followSpot!.color, crown.ringKey.color]) expect(warmth(c), c).toBeLessThanOrEqual(1.06);
  });
  it("grade does not warm the frame", () => {
    expect((crown.overrides as any).grade.temperature).toBeLessThanOrEqual(0);
  });
});
