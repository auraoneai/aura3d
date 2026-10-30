/**
 * IRON CROWN GU47 IC47-AN1: upper-body attack layering is the default now that the engine forwards the layer `speed`;
 * `?iclayer=0` keeps the full-body attack clips. The layer speeds match the full-body playback speeds the hit frames
 * were tuned for.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attackLayerEnabled, THROW_CLIP_SPEED } from "../../../apps/showcase-iron-crown/src/game/fighters";

describe("iron-crown attack layering (GU47 IC47-AN1)", () => {
  it("is on by default and off only for ?iclayer=0", () => {
    expect(attackLayerEnabled(new URLSearchParams(""))).toBe(true);
    expect(attackLayerEnabled(new URLSearchParams("iclayer=1"))).toBe(true);
    expect(attackLayerEnabled(new URLSearchParams("iclayer=0"))).toBe(false);
  });

  it("forwards each attack's playback speed to playLayer", () => {
    const main = readFileSync("apps/showcase-iron-crown/src/main.ts", "utf8");
    expect(main).toContain(`ATTACK_LAYER_SPEED: Record<AttackKind, number> = { light: 2.6, heavy: 1.85, special: 2.8, throw: THROW_CLIP_SPEED }`);
    expect(main).toMatch(/playLayer\(ATTACK_LAYER, clip, \{.*speed: ATTACK_LAYER_SPEED\[kind\] \}\)/);
    expect(THROW_CLIP_SPEED).toBeGreaterThan(1);
  });
});
