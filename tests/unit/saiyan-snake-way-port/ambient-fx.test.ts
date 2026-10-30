import { describe, expect, it } from "vitest";
import { FLASH_EXPOSURE, createAmbientFx, strikeOffset, type AmbientInput } from "../../../examples/saiyan-snake-way-port/art/ambientFx";
import { serpentRainPreset, serpentVfxPresets } from "../../../examples/saiyan-snake-way-port/art/vfx";

const base = (over: Partial<AmbientInput> = {}): AmbientInput => ({
  S: { phase: "run", time: 10, wind: 0 }, look: { stageIndex: 1, storm: 0 }, time: 0, dt: 1 / 60, fast: false, reducedMotion: false, reducedFlash: false, ...over
});

/** Runs `seconds` of frames and returns the spawn kinds, strike count and flash frames. */
function run(seconds: number, over: Partial<AmbientInput> = {}) {
  const fx = createAmbientFx();
  const kinds: Record<string, number> = {};
  let flashFrames = 0;
  let maxFlashRun = 0, flashRun = 0;
  for (let f = 0; f < seconds * 60; f++) {
    const out = fx.step(base({ ...over, time: f / 60 }));
    for (const s of out.spawns) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
    if (out.exposureBoost > 0) { flashFrames++; flashRun++; maxFlashRun = Math.max(maxFlashRun, flashRun); } else flashRun = 0;
  }
  return { kinds, strikes: fx.strikes, flashFrames, maxFlashRun };
}

describe("serpentine-sky-run ambient weather and air (SSR-13)", () => {
  it("strikes lightning at least twice in 16 s at THE BROKEN SPINE, each flash 1-3 frames", () => {
    const storm = run(16, { look: { stageIndex: 5, storm: 1 } });
    expect(storm.strikes).toBeGreaterThanOrEqual(2);
    expect(storm.kinds["serpent-lightning"]).toBe(storm.strikes);
    expect(storm.maxFlashRun).toBeGreaterThanOrEqual(1);
    expect(storm.maxFlashRun).toBeLessThanOrEqual(3);
    expect(storm.kinds["serpent-rain"]).toBeGreaterThan(0);
    expect(FLASH_EXPOSURE).toBeGreaterThan(0.5);
    for (let w = 0; w < 20; w++) expect(strikeOffset(w)).toBeLessThan(5.5);
  });

  it("drops lightning entirely on reduced flash and halves spawn rates on reduced motion", () => {
    const calm = run(16, { look: { stageIndex: 5, storm: 1 }, reducedFlash: true });
    expect(calm.strikes).toBe(0);
    expect(calm.flashFrames).toBe(0);
    const full = run(4, { look: { stageIndex: 5, storm: 1 }, fast: true });
    const slow = run(4, { look: { stageIndex: 5, storm: 1 }, fast: true, reducedMotion: true });
    expect(slow.kinds["serpent-rain"]!).toBeLessThanOrEqual(Math.ceil(full.kinds["serpent-rain"]! / 2) + 8);
    expect(slow.kinds["serpent-wisp"]!).toBeLessThan(full.kinds["serpent-wisp"]!);
  });

  it("spawns wisps only when fast, petals at rose and sunburst, embers at copper and lacquer, nothing outside the run", () => {
    expect(run(2).kinds["serpent-wisp"]).toBeUndefined();
    expect(run(2, { fast: true }).kinds["serpent-wisp"]).toBeGreaterThan(10);
    expect(run(2, { look: { stageIndex: 0, storm: 0 } }).kinds["serpent-petals"]).toBeGreaterThan(3);
    expect(run(2, { look: { stageIndex: 7, storm: 0 } }).kinds["serpent-petals"]).toBeGreaterThan(3);
    expect(run(2, { look: { stageIndex: 3, storm: 0 } }).kinds["serpent-embers"]).toBeGreaterThan(3);
    expect(Object.keys(run(2, { S: { phase: "over", time: 10, wind: 0 }, fast: true, look: { stageIndex: 5, storm: 1 } }).kinds)).toEqual([]);
  });

  it("keeps rain streaks fast and narrow along the given direction and under 10k live particles", () => {
    const rain = serpentRainPreset([0.3, -0.95, 0]);
    const layer = rain.layers[0] as unknown as { direction: number[]; spread: number; count: number; speed: number[]; life: number[] };
    expect(layer.direction).toEqual([0.3, -0.95, 0]);
    expect(layer.spread).toBeLessThan(0.1);
    // 8 bursts per 0.08 s x count x max life
    expect((8 / 0.08) * layer.count * layer.life[1]!).toBeLessThan(10000);
    expect(serpentVfxPresets()["serpent-rain"].name).toBe("serpent-rain");
  });
});

describe("serpentine-sky-run set pieces (SSR-17)", () => {
  it("drifts mist over the road only at THE DROWSE and cracks the plates only at THE BROKEN SPINE", async () => {
    expect(run(2, { look: { stageIndex: 6, storm: 0, mist: 1 } }).kinds["serpent-mist"]).toBeGreaterThan(5);
    expect(run(2, { look: { stageIndex: 5, storm: 1, mist: 0 } }).kinds["serpent-mist"]).toBeUndefined();
    const { lookAt } = await import("../../../examples/saiyan-snake-way-port/art/colorScript");
    const { createLookDriver } = await import("../../../examples/saiyan-snake-way-port/art/lookRuntime");
    const writes = new Map<string, unknown>();
    const driver = createLookDriver({}, (id) => ({ setUniform: (n: string, v: unknown) => { writes.set(`${id}.${n}`, v); } }));
    const frame = { forward: [0, 0, -1] as const, time: 0, reducedMotion: false };
    driver.apply(lookAt(0, { mode: "script", pinnedStage: 5 }), frame);
    expect(writes.get("road.roadCrack")).toBe(1);
    driver.apply(lookAt(0, { mode: "script", pinnedStage: 4 }), frame);
    expect(writes.get("road.roadCrack")).toBe(0);
  });

  it("keeps the soul column to one instanced node shown near its stage", async () => {
    const { SOUL_COLUMN } = await import("../../../examples/saiyan-snake-way-port/world");
    const { STAGES } = await import("../../../examples/saiyan-snake-way-port/sim");
    expect(SOUL_COLUMN.s).toBeGreaterThan(STAGES[2]!.from);
    expect(SOUL_COLUMN.s).toBeLessThan(STAGES[3]!.from);
    expect(SOUL_COLUMN.count).toBeLessThanOrEqual(40);
  });
});
