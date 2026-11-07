// The particle fountain (prefabs.particleFountain, particles.fountain, sceneKits.particleFountain) is the flagship
// benchmark scene kit. 5.1 started honouring lifetimeColorRamp / sizeOverLife / alphaOverLife, which the fountain layers
// once carried as inert data; the prefab must keep lowering exactly as on origin/main (5.0.2) so the look and the
// benchmark gates do not move. The fixture is the origin/main lowering of the same calls.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prefabs } from "../../../packages/engine/src/agent-api/nodes/prefabs/index";
import { particles } from "../../../packages/engine/src/agent-api/nodes/particles";
import { lowerEffectNode } from "../../../packages/engine/src/production-runtime/effects/EffectNodeLowering";

const fixture = JSON.parse(readFileSync(new URL("../../fixtures/particle-fountain/lowered-origin-main.json", import.meta.url), "utf8")) as {
  cases: Record<string, Record<string, unknown>>;
  lowered: Record<string, unknown[]>;
};

type Node = { kind?: string; effect?: string };
const lowerFountain = (nodes: readonly unknown[]): unknown[] =>
  (nodes as Node[]).filter((n) => n.kind === "effect" && n.effect === "particles").map((n) => JSON.parse(JSON.stringify(lowerEffectNode(n as never))));

describe("particle fountain keeps the 5.0.2 emitter look", () => {
  for (const [name, options] of Object.entries(fixture.cases)) {
    it(`prefabs.particleFountain(${JSON.stringify(options)}) lowers exactly as on origin/main`, () => {
      expect(lowerFountain(prefabs.particleFountain(options as never))).toEqual(fixture.lowered[name]);
      expect(lowerFountain(particles.fountain(options as never))).toEqual(fixture.lowered[name]);
    });
  }

  it("a user-supplied color wins on the plume (no lifetime ramp, no 5.1 curves)", () => {
    const lowered = lowerFountain(prefabs.particleFountain({ color: "#ff0000" })) as { emitter: Record<string, unknown> }[];
    expect(lowered[0]!.emitter.color).toEqual([1, 0, 0]);
    for (const layer of lowered) {
      for (const key of ["colorOverLife", "sizeOverLife", "alphaOverLife", "shape", "wind"]) expect(layer.emitter[key], key).toBeUndefined();
    }
  });
});
