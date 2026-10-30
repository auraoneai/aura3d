import { describe, expect, it } from "vitest";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { validatePostEffectNode } from "../../../../packages/engine/src/agent-api/postBridge";
import type { AuraEffectNode } from "../../../../packages/engine/src/agent-api/nodes/types";

// GU47 pass 4 (g07, g08, g09, g12): builders keep the authored name and the weather fields the lowering reads.
const json = (b: { toJSON(): unknown }) => b.toJSON() as AuraEffectNode & Record<string, unknown>;

describe("effect builder pass-through (pass 4)", () => {
  it("bloom keeps an authored name and validates clean", () => {
    const node = json(effects.bloom({ name: "court bloom", scatter: 0.4 } as never));
    expect(node.name).toBe("court bloom");
    expect(validatePostEffectNode(node)).toEqual([]);
    expect("name" in json(effects.bloom())).toBe(false);
  });

  it("rain and snow keep name, size, radius and seed when authored", () => {
    const snow = json(effects.snow({ name: "dust motes", size: [0.02, 0.04], radius: 12, seed: 7 }));
    expect(snow).toMatchObject({ name: "dust motes", size: [0.02, 0.04], radius: 12, seed: 7 });
    expect(json(effects.rain({ name: "storm" })).name).toBe("storm");
  });

  it("leaves default rain and snow nodes byte-identical", () => {
    for (const n of [json(effects.rain()), json(effects.snow())]) {
      for (const k of ["name", "size", "radius", "seed"]) expect(k in n, `${n.effect}.${k}`).toBe(false);
    }
  });
});
