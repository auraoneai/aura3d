/** Idol wow pass (MOVING-PARTS.md): the Idol craft's rotors are separate spinning nodes seated in its rotor ducts. */
import { describe, expect, it } from "vitest";
import { stepCraftArticulation } from "../../../examples/heatsink-port/presentation";
import { Track } from "../../../examples/heatsink-port/track";
import { ROTOR_SCALE, buildWorld } from "../../../examples/heatsink-port/world";
import { ION_IDOL } from "../../../apps/showcase-heatsink-port/src/idol-assets";

type JsonNode = { name?: string; runtime?: { id?: string }; children?: JsonNode[] };
const flat = (ns: readonly JsonNode[]): JsonNode[] => ns.flatMap((n) => [n, ...flat(n.children ?? [])]);

describe("Ion Circuit Idol craft moving parts", () => {
  it("mounts four spinning rotor nodes on the twilight craft, scaled into the Idol ducts", () => {
    const nodes = flat((buildWorld(new Track(), "high", "?look=twilight").scene.toJSON() as unknown as { nodes: JsonNode[] }).nodes);
    for (let i = 0; i < 4; i++) expect(nodes.some((n) => n.runtime?.id === `drone-rotor-${i}`), `rotor ${i}`).toBe(true);
    expect(ROTOR_SCALE).toBeLessThan(0.6);
    // the Idol hull is 3.48 m wide and 4.2 m long: the 1.3 m rotor offsets (+0.27 m throat) stay inside its half-width
    const bounds = (ION_IDOL.ioncDrone as { bounds?: readonly number[] }).bounds;
    expect(1.3 + 0.27).toBeLessThanOrEqual(Math.max(bounds?.[0] ?? 0, bounds?.[2] ?? 0) / 2 + 0.05);
  });

  it("spins the rotors with flight time and faster with speed", () => {
    const state = { rotorAngle: 0, flapPitch: 0, flapRoll: 0, nozzle: 1 } as unknown as Parameters<typeof stepCraftArticulation>[0];
    const a0 = stepCraftArticulation(state, 1 / 60, 0.2, 0, false, 0).rotorAngle;
    const a1 = stepCraftArticulation(state, 1 / 60, 0.2, 0, false, 0).rotorAngle;
    const slow = a1 - a0;
    const a2 = stepCraftArticulation(state, 1 / 60, 1, 0, false, 0).rotorAngle;
    expect(slow).toBeGreaterThan(0);
    expect(a2 - a1).toBeGreaterThan(slow);
  });
});
