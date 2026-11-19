/**
 * Audit 2026-11-19: rotors must read as spinning on screen. The craft rotor stepped 0.73..2.1 rad per 60 fps frame
 * (44..126 rad/s), so near full race speed the 4-blade pattern (period pi/2) strobed to a standstill or crawled
 * backwards; and the Idol sentry / gunship GLBs bake their wingtip duct rotors into one static mesh.
 */
import { describe, expect, it } from "vitest";
import { ROTOR_MAX_STEP, rotorStep, stepCraftArticulation, type CraftArticulationState } from "../../../examples/heatsink-port/presentation";
import { HEAVY_DUCTS, HEAVY_FIT, SENTRY_DUCTS, SENTRY_FIT, TARGET_FANS, targetFanPlacements } from "../../../examples/heatsink-port/art/idolModels";
import { TARGET_FAN_BLADES } from "../../../examples/heatsink-port/art/proceduralModels";
import { Operation } from "../../../examples/heatsink-port/operation";
import { Track } from "../../../examples/heatsink-port/track";
import { buildWorld } from "../../../examples/heatsink-port/world";
import { ION_IDOL } from "../../../apps/showcase-heatsink-port/src/idol-assets";

type JsonNode = { name?: string; runtime?: { id?: string }; children?: JsonNode[] };
const flat = (ns: readonly JsonNode[]): JsonNode[] => ns.flatMap((n) => [n, ...flat(n.children ?? [])]);

/** apparent per-frame rotation of a `blades`-fold rotor: the step folded into (-period/2, period/2] */
const apparent = (step: number, blades: number): number => {
  const period = (Math.PI * 2) / blades;
  const m = ((step % period) + period) % period;
  return m > period / 2 ? m - period : m;
};

describe("Ion Circuit rotor motion reads as a forward spin every frame", () => {
  it("rotorStep stays under a third of the 4-blade period and grows with rpm", () => {
    expect(ROTOR_MAX_STEP).toBeLessThan(Math.PI / 2 / 3);
    for (const dt of [1 / 30, 1 / 60, 1 / 120, 1 / 144]) {
      let prev = 0;
      for (let rpm = 5; rpm <= 200; rpm += 5) {
        const step = rotorStep(rpm, dt);
        expect(step).toBeGreaterThan(prev);
        expect(step).toBeLessThan(ROTOR_MAX_STEP);
        prev = step;
      }
    }
  });

  it("the craft rotor turns forward by 0.1..0.5 rad every 60 fps frame at any speed or boost (no strobe standstill or reverse)", () => {
    for (const speed of [0, 0.25, 0.5, 0.75, 0.9, 1]) {
      for (const boost of [0, 1]) {
        const s: CraftArticulationState = { rotorAngle: 0, flapPitch: 0, flapRoll: 0 };
        let last = 0;
        for (let f = 0; f < 120; f++) {
          const a = stepCraftArticulation(s, 1 / 60, speed, boost, false, 0).rotorAngle;
          const d = a - last;
          last = a;
          for (const blades of [3, 4]) {
            const seen = apparent(d, blades);
            expect(seen, `speed ${speed} boost ${boost} blades ${blades}`).toBeGreaterThan(0.1);
            expect(seen).toBeLessThanOrEqual(ROTOR_MAX_STEP);
          }
        }
      }
    }
  });

  it("the target fans have 4 blades, so their per-frame step is alias-free too", () => {
    expect(TARGET_FAN_BLADES).toBe(4);
    const d = rotorStep(70, 1 / 60);
    expect(apparent(d, TARGET_FAN_BLADES)).toBeCloseTo(d, 9);
    expect(d).toBeGreaterThan(0.3);
  });
});

describe("Ion Circuit Idol strike targets carry spinning duct fans", () => {
  it("every twilight target mounts two fan nodes; the original look has none", () => {
    const track = new Track();
    const ids = new Operation(track).targets.map((t) => t.id);
    const twilight = flat((buildWorld(track, "high", "?look=twilight").scene.toJSON() as unknown as { nodes: JsonNode[] }).nodes);
    const runtimeIds = new Set(twilight.map((n) => n.runtime?.id));
    for (const id of ids) for (let j = 0; j < TARGET_FANS; j++) expect(runtimeIds.has(`target-${id}-fan-${j}`), `target ${id} fan ${j}`).toBe(true);
    const original = flat((buildWorld(track, "high", "?look=original").scene.toJSON() as unknown as { nodes: JsonNode[] }).nodes);
    expect(original.some((n) => /^target-\d+-fan-/.test(n.runtime?.id ?? ""))).toBe(false);
  });

  it("each fan sits on its duct lip, inside the model's span and scaled to the duct's blade radius", () => {
    for (const [asset, fit, ducts] of [
      [ION_IDOL.ioncSentry, SENTRY_FIT, SENTRY_DUCTS],
      [ION_IDOL.ioncHeavy, HEAVY_FIT, HEAVY_DUCTS]
    ] as const) {
      const b = (asset as { bounds?: readonly number[] }).bounds ?? [];
      const k = fit.span / fit.generatedMaxDim;
      const drop = fit.centreY - ((b[1] ?? 0) * k) / 2;
      const fans = targetFanPlacements(ducts, k, drop);
      expect(fans).toHaveLength(TARGET_FANS);
      for (const f of fans) {
        const fanR = 0.57 * f.scale;
        // the whole fan disc stays inside the scaled model footprint
        expect(Math.abs(f.position[0]) + fanR).toBeLessThanOrEqual(((b[0] ?? 0) * k) / 2);
        expect(Math.abs(f.position[2]) + fanR).toBeLessThanOrEqual(((b[2] ?? 0) * k) / 2);
        // just above the lip of the baked blades, under the model's top
        expect(f.position[1]).toBeGreaterThan(drop + ducts.lipY * k);
        expect(f.position[1]).toBeLessThan(drop + ducts.lipY * k + 0.1);
        expect(f.position[1]).toBeLessThan(drop + (b[1] ?? 0) * k);
        expect(fanR).toBeCloseTo(ducts.bladeRadius * k, 6);
      }
    }
  });
});
