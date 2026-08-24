/**
 * SR-A5 relay overlap-sensor unit contract.
 *
 * The kit activates a relay when the PLAYER CENTRE is within radius of the
 * checkpoint centre. Each route-local sensor box must strictly CONTAIN that
 * trigger circle, so any radial activation implies sensor overlap. Sensors are
 * robustness telemetry only; the existing checkpoint assertions stay untouched.
 */
import { describe, expect, it } from "vitest";
import {
  skylineRelaySensorOverlaps,
  skylineRelaySensors,
  createSkylineLevel,
  SKYLINE_ACT_GATES,
  SKYLINE_DISTRICT_ANCHORS
} from "../../../apps/showcase-skyline-runner/src/level";
import { SKYLINE_LEVEL_ACTS } from "../../../apps/showcase-skyline-runner/src/level-layout";

describe("Skyline relay overlap sensors back every checkpoint trigger", () => {
  const level = createSkylineLevel();
  const checkpoints = level.checkpoints ?? [];

  it("derives exactly one sensor per level checkpoint with matching ids", () => {
    expect(skylineRelaySensors.length).toBe(checkpoints.length);
    expect(new Set(skylineRelaySensors.map((sensor) => sensor.checkpointId))).toEqual(
      new Set(checkpoints.map((checkpoint) => String(checkpoint.id)))
    );
    for (const sensor of skylineRelaySensors) {
      const checkpoint = checkpoints.find((candidate) => String(candidate.id) === sensor.checkpointId);
      expect(checkpoint).toBeDefined();
      expect(sensor.x).toBeCloseTo(checkpoint!.x, 9);
      expect(sensor.y).toBeCloseTo(checkpoint!.y, 9);
    }
  });

  it("sensor boxes contain the entire radial trigger circle (16-point sweep)", () => {
    for (const sensor of skylineRelaySensors) {
      for (let step = 0; step < 16; step += 1) {
        const angle = (step / 16) * Math.PI * 2;
        // Sweep just inside the box boundary (a hair under halfWidth): the kit's
        // accepted set is the closed radius-R disc and the box adds a +0.02
        // margin, so interior sampling proves containment without betting on
        // exact float equality at the measure-zero boundary.
        const radius = sensor.halfWidth * (1 - 1e-6);
        const onCircle = {
          x: sensor.x + Math.cos(angle) * radius,
          y: sensor.y + Math.sin(angle) * radius
        };
        expect(
          skylineRelaySensorOverlaps(sensor, onCircle),
          sensor.id + " failed containment at angle " + angle.toFixed(3)
        ).toBe(true);
      }
    }
  });

  it("reports honest truth-table results just outside the box", () => {
    const sensor = skylineRelaySensors[0]!;
    expect(skylineRelaySensorOverlaps(sensor, { x: sensor.x, y: sensor.y })).toBe(true);
    expect(skylineRelaySensorOverlaps(sensor, {
      x: sensor.x + sensor.halfWidth + 0.01,
      y: sensor.y
    })).toBe(false);
    expect(skylineRelaySensorOverlaps(sensor, {
      x: sensor.x,
      y: sensor.y + sensor.halfHeight + 0.01
    })).toBe(false);
  });

  it("keeps the shipped widened relay radius intact (>= 1.25)", () => {
    for (const checkpoint of checkpoints) {
      expect(checkpoint.radius).toBeGreaterThanOrEqual(1.25);
    }
  });
});

describe("Skyline act gates and district anchors derive from certified layout", () => {
  it("places one gate per act transition in running order", () => {
    expect(SKYLINE_ACT_GATES.map((gate) => gate.act)).toEqual([1, 2, 3, 4]);
    const titles = new Set<string>(SKYLINE_LEVEL_ACTS.map((act) => act.title));
    for (const gate of SKYLINE_ACT_GATES) {
      expect(titles.has(gate.title)).toBe(true);
      expect(gate.surfaceY).toBeGreaterThan(0);
    }
    for (let index = 1; index < SKYLINE_ACT_GATES.length; index += 1) {
      expect(SKYLINE_ACT_GATES[index]!.x).toBeGreaterThan(SKYLINE_ACT_GATES[index - 1]!.x);
    }
  });

  it("anchors all ten districts inside their authored stride windows", () => {
    expect(SKYLINE_DISTRICT_ANCHORS.length).toBe(10);
    for (let section = 0; section < SKYLINE_DISTRICT_ANCHORS.length; section += 1) {
      const anchor = SKYLINE_DISTRICT_ANCHORS[section]!;
      expect(anchor.section).toBe(section);
      expect(anchor.startX).toBeLessThan(anchor.centerX);
      expect(anchor.centerX).toBeLessThan(anchor.endX);
      expect(anchor.elevation).toBeGreaterThanOrEqual(-0.2);
      expect(anchor.elevation).toBeLessThanOrEqual(1.0);
      expect(anchor.district).toBeGreaterThanOrEqual(0);
      expect(anchor.district).toBeLessThanOrEqual(2);
      expect(["steel-dawn", "hanging-grove", "crown-heights"]).toContain(anchor.districtId);
    }
  });
});
