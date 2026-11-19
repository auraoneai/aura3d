/**
 * Aura Diamond 3D first-contact warm (real-GPU QA: one black-outfield frame right after the first bat contact). The crack
 * and home-run flash lights (art/vfx.ts) are the presets that need the warm; the settle rule decides when the loading
 * still may lift. Measured numbers from the real-GPU probe are used as fixtures.
 */
import { describe, expect, it } from "vitest";
import { diamondVfxPresets, juiceFxKind } from "../../../apps/showcase-aura-diamond-3d/art/vfx";
import { CONTACT_WARM, contactWarmSettled, type ContactWarmSample } from "../../../apps/showcase-aura-diamond-3d/src/contactWarm";
import { PARK_ORDER } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const frames = (rows: ReadonlyArray<readonly [number, number]>, dtMs = 50): ContactWarmSample[] =>
  rows.map(([drawCalls, compiled], i) => ({ drawCalls, compiled, elapsedMs: (i + 1) * dtMs }));

describe("aura-diamond first-contact program warm", () => {
  it("the crack and every park's home-run celebration that carries a flash light is what the warm fires", () => {
    for (const park of PARK_ORDER) {
      const presets = diamondVfxPresets(park, { reducedMotion: false, reducedFlash: false });
      expect(presets[juiceFxKind("crack", park)].layers.some((l) => l.type === "light"), park).toBe(true);
      // Reduced flash has no light layers, so nothing needs warming (the game skips the warm then).
      const calm = diamondVfxPresets(park, { reducedMotion: false, reducedFlash: true });
      for (const spec of Object.values(calm)) expect(spec.layers.some((l) => l.type === "light")).toBe(false);
    }
  });

  it("waits through the real-GPU dip (draws 311 -> 181 while 48 programs compile) until draws recover and compiles stop", () => {
    const base = 311;
    const rows: Array<readonly [number, number]> = [[181, 146], [320, 146], [321, 149], [321, 149]];
    // Too early (inside the home-run light's 0.5 s life): not settled even though the counters look calm.
    expect(contactWarmSettled(base, frames(rows))).toBe(false);
    const long = frames([...rows, ...Array.from({ length: 14 }, () => [320, 149] as const)]);
    expect(long[long.length - 1]!.elapsedMs).toBeGreaterThanOrEqual(CONTACT_WARM.minMs);
    expect(contactWarmSettled(base, long)).toBe(true);
  });

  it("stays covered while draws are still missing or programs are still compiling", () => {
    const base = 311;
    const missing = frames(Array.from({ length: 20 }, (_, i) => [i % 2 ? 240 : 320, 149] as const));
    expect(contactWarmSettled(base, missing)).toBe(false);
    const compiling = frames(Array.from({ length: 20 }, (_, i) => [320, 149 + i] as const));
    expect(contactWarmSettled(base, compiling)).toBe(false);
  });

  it("never holds the boot past the cap", () => {
    const stuck = frames(Array.from({ length: 60 }, (_, i) => [100, 100 + i] as const));
    expect(stuck[stuck.length - 1]!.elapsedMs).toBeGreaterThanOrEqual(CONTACT_WARM.maxMs);
    expect(contactWarmSettled(311, stuck)).toBe(true);
    expect(contactWarmSettled(311, [])).toBe(false);
  });
});
