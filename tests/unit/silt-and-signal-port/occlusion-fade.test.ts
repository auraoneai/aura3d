/** Line-of-sight fade: a tree on the camera->courier sightline fades to 25% within ~0.15 s; trees off it stay opaque. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createColumnOcclusionFade, createOcclusionFade, FADE_OPACITY, segmentHitsColumn, segmentHitsSphere } from "../../../examples/silt-and-signal-port/occlusionFade";

const eye: [number, number, number] = [0, 6, 10];
const rider: [number, number, number] = [0, 3.4, 0];

describe("Duneglide line-of-sight fade", () => {
  it("fades a tree on the sightline to 25% over ~0.15 s and restores it once the view clears", () => {
    const fade = createOcclusionFade([{ x: 0, y: 4.6, z: 5, r: 1.5 }, { x: 9, y: 4, z: 5, r: 1.5 }]);
    let changed = false;
    for (let f = 0; f < 4; f++) changed = fade.update(eye, rider, 1 / 60) || changed;
    expect(changed).toBe(true);
    expect(fade.opacity[0]).toBeLessThan(1);
    expect(fade.opacity[0]).toBeGreaterThan(FADE_OPACITY);
    for (let f = 0; f < 12; f++) fade.update(eye, rider, 1 / 60);
    expect(fade.opacity[0]).toBeCloseTo(FADE_OPACITY, 5);
    expect(fade.opacity[1]).toBe(1);
    expect(fade.faded).toEqual([0]);
    // the courier moves on: the tree is off the sightline and eases back to opaque
    for (let f = 0; f < 15; f++) fade.update([20, 6, 10], [20, 3.4, 0], 1 / 60);
    expect(fade.opacity[0]).toBe(1);
    expect(fade.faded).toEqual([]);
  });

  it("never fades more than the slot count, nearest first", () => {
    const row = Array.from({ length: 8 }, (_, i) => ({ x: 0, y: 4.5, z: 1 + i, r: 0.6 }));
    const fade = createOcclusionFade(row, { maxFaded: 4 });
    for (let f = 0; f < 20; f++) fade.update(eye, rider, 1 / 60);
    expect(fade.faded.length).toBe(4);
    expect(segmentHitsSphere(eye, rider, { x: 5, y: 4.6, z: 5, r: 0.2 })).toBe(false);
  });

  it("is wired into the chase camera every frame and moves faded trees and stone piers into transparent slots", () => {
    const world = readFileSync("examples/silt-and-signal-port/world.ts", "utf8");
    expect(world).toMatch(/applyTreeFade\(treeFade\.update\(safe\.position/);
    expect(world).toMatch(/applyPierFade\(pierFade\.update\(safe\.position/);
    expect(world).toMatch(/runtime\(\{ id: `tree-fade-\$\{k\}` \}\)/);
    expect(world).toMatch(/runtime\(\{ id: `pier-fade-\$\{k\}` \}\)/);
    expect(world).toMatch(/setOpacity\?\.\(treeFade\.opacity\[i\]!\)/);
    expect(world).toMatch(/setOpacity\?\.\(pierFade\.opacity\[i\]!\)/);
  });

  it("fades a stone arch pier slicing across the foreground camera sightline", () => {
    const pier = { x: -1.4, z: 7.5, r: 0.9, bottom: 0, top: 18 };
    const distant = { x: 18, z: 7.5, r: 0.9, bottom: 0, top: 18 };
    expect(segmentHitsColumn(eye, rider, pier, 1.85)).toBe(true);
    expect(segmentHitsColumn(eye, rider, distant, 1.85)).toBe(false);
    const fade = createColumnOcclusionFade([pier, distant], { maxFaded: 4, pad: 1.85 });
    for (let f = 0; f < 16; f++) fade.update(eye, rider, 1 / 60);
    expect(fade.opacity[0]).toBeLessThanOrEqual(FADE_OPACITY + 1e-5);
    expect(fade.opacity[1]).toBe(1);
    expect(fade.faded).toEqual([0]);
  });
});
