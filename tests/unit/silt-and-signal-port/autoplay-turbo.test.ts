/**
 * Duneglide owner fixes (2026-11-18):
 * 1. Turbo-start "broken world": a ring-pass burst light recompiled every lit program mid-flight (draws skipped while
 *    compiling: props, trees, rider and skiff vanished). No runtime VFX may add a light.
 * 2. `?autoplay=1`: hands-free viewer mode on the real sim (progress, no stuck state >= 5 s, scenes and chapters advance,
 *    the journey loops after the last chapter).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim, stepSim, STEP, targetOf } from "../../../examples/silt-and-signal-port/sim";
import { AUTOPLAY_STUCK_SECONDS, autoplayChapterSearch, autoplayPilot, createAutoplayWatchdog } from "../../../examples/silt-and-signal-port/autopilot";
import { siltVfxPresets } from "../../../examples/silt-and-signal-port/art/vfx";
import { CHAPTERS } from "../../../examples/silt-and-signal-port/chapters-data";

describe("Duneglide Turbo start keeps the whole world drawn", () => {
  it("no runtime VFX preset carries a light layer (a burst light switches every lit material to a new program variant)", () => {
    for (const chapter of [0, 2, 4]) {
      const presets = siltVfxPresets({ chapter });
      for (const [kind, spec] of Object.entries(presets)) {
        const lights = spec.layers.filter((layer) => (layer as { type?: string }).type === "light");
        expect(lights, `${kind} in chapter ${chapter}`).toEqual([]);
      }
    }
  });
});

describe("Duneglide ?autoplay=1", () => {
  it("is the hands-free mode: skips the title, flies the reference controller, auto-advances cards", () => {
    const src = readFileSync("examples/silt-and-signal-port/main.ts", "utf8");
    expect(src).toMatch(/autopilot: readAutoplayFlag\(params\)/);
    expect(src).toMatch(/const skipTitle = startParam \|\| config\.autoplay;/);
    expect(src).toMatch(/if \(config\.autoplay\) setTimeout\(continueScene, AUTOPLAY_CARD_MS\)/);
    expect(src).toMatch(/if \(config\.autoplay\) setTimeout\(\(\) => \{ if \(mode === "done"\) \{ clearJourney\(session\); goToChapter\(0\); \} \}, AUTOPLAY_CARD_MS\)/);
  });

  it("keeps autoplay across chapter reloads and loops after the last chapter", () => {
    expect(autoplayChapterSearch(3, true)).toBe("?chapter=3&start=1&autoplay=1");
    expect(autoplayChapterSearch(CHAPTERS.length, true, CHAPTERS.length)).toBe("?chapter=0&start=1&autoplay=1");
    expect(autoplayChapterSearch(2, false)).toBe("?chapter=2&start=1");
  });

  it("flies every chapter to its end on the real sim, with no stretch of 5 s or more without progress", () => {
    for (let chapter = 0; chapter < CHAPTERS.length; chapter++) {
      let sim = createSim(chapter, 0);
      const watchdog = createAutoplayWatchdog();
      let rings = 0, completed = 0, done = false;
      let lastKey = "", sinceProgress = 0, worstStall = 0, best = Number.POSITIVE_INFINITY, hold = 0;
      for (let step = 0; step < 150 / STEP && !done; step++) {
        // main.ts: a scene card continues after AUTOPLAY_CARD_MS; the chapter's last scene reloads into the next chapter
        if (sim.state.scene) { if (sim.state.pendingChapter !== null) { done = true; break; } sim.state.scene = null; }
        if (sim.state.completed) { done = true; break; }
        if (watchdog.update(sim, STEP)) sim = createSim(sim.state.chapter, sim.state.objective);
        const events = stepSim(sim, autoplayPilot(sim), STEP);
        rings += events.filter((e) => e.type === "point").length;
        completed += events.filter((e) => e.type === "complete").length;
        const s = sim.state;
        const key = `${s.objective}:${s.point}`;
        const t = targetOf(s);
        const d = Math.hypot(t.x - s.x, t.z - s.z);
        if (key !== lastKey) { lastKey = key; best = d; hold = s.hold; sinceProgress = 0; }
        else if (d < best - 1 || s.hold > hold) { best = Math.min(best, d); hold = Math.max(hold, s.hold); sinceProgress = 0; }
        else sinceProgress += STEP;
        worstStall = Math.max(worstStall, sinceProgress);
      }
      expect(done, `chapter ${chapter} reaches its end in 150 s (objectives ${completed}, rings ${rings})`).toBe(true);
      expect(completed, `chapter ${chapter} objectives`).toBe(CHAPTERS[chapter]!.objectives.length);
      expect(worstStall, `chapter ${chapter}: longest stretch without progress (s)`).toBeLessThan(AUTOPLAY_STUCK_SECONDS + 0.5);
    }
  });

  it("the watchdog restarts a wedged flight after AUTOPLAY_STUCK_SECONDS and never during progress", () => {
    const sim = createSim(0, 0);
    const watchdog = createAutoplayWatchdog();
    let fired = -1;
    for (let step = 0; step < 8 / STEP; step++) if (watchdog.update(sim, STEP) && fired < 0) fired = step * STEP; // never stepped: no progress
    expect(fired).toBeGreaterThanOrEqual(AUTOPLAY_STUCK_SECONDS - STEP * 2);
    expect(fired).toBeLessThan(AUTOPLAY_STUCK_SECONDS + 0.1);
  });
});
