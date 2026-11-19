/**
 * 5.7.0 feel kit in @aura3d/game: createImpactRig, ScreenFx helpers, drainPopups and GameRng. The rig is checked frame
 * for frame against the verbatim pre-5.7.0 shared copy (legacy/feel.ts), and the game-side shared modules
 * must now be thin re-exports of the library functions.
 */
import { describe, expect, it } from "vitest";
import {
  GameRng, POPUP_LIMIT, REDUCED_FLASH_CAP, createImpactRig, createProceduralSfx, drainPopups, flashStrength, vignetteOpacity,
  type ScorePopup
} from "../../../packages/game/src/feel/index";
import { createImpactRig as legacyImpactRig } from "./legacy/feel";
import * as sharedFeel from "../../../apps/showcase-port-shared/feel";
import * as runnerRng from "../../../examples/shared/runner-kit/rng";
import * as runnerPopups from "../../../examples/shared/runner-kit/popups";
import * as runnerScreenFx from "../../../examples/shared/runner-kit/screen-fx";
import { createCountedRng } from "../../../packages/engine/src/qa/countedRng";

describe("createImpactRig", () => {
  it("freezes the sim on a hit and resumes on real frame time (never locks up)", () => {
    const rig = createImpactRig({ reducedMotion: false });
    rig.trigger({ freezeSeconds: 0.05 });
    const frozen = rig.step(0.016);
    expect(frozen.frozen).toBe(true);
    expect(frozen.simDt).toBe(0);
    let t = 0.016;
    while (rig.step(0.016).frozen) {
      t += 0.016;
      expect(t).toBeLessThan(0.2);
    }
    const resumed = rig.step(1 / 60);
    expect(resumed.frozen).toBe(false);
    expect(resumed.simDt).toBeCloseTo(1 / 60, 12);
  });

  it("caps the freeze at 0.14 s and clamps a long real frame to 0.1 s", () => {
    const rig = createImpactRig({ reducedMotion: true });
    rig.trigger({ freezeSeconds: 5 });
    let frozenFor = 0;
    while (rig.step(0.01).frozen) frozenFor += 0.01;
    expect(frozenFor).toBeLessThanOrEqual(0.15);
    expect(rig.step(3).simDt).toBe(0.1);
  });

  it("reduced motion zeroes the shake and FOV kick but keeps the hit-stop", () => {
    const rig = createImpactRig({ reducedMotion: true });
    rig.trigger({ freezeSeconds: 0.05, trauma: 1, fovKickDeg: 6 });
    const f = rig.step(0.016);
    expect(f.frozen).toBe(true);
    expect(f.shakeOffset).toEqual([0, 0, 0]);
    expect(f.shakeRoll).toBe(0);
    expect(f.fovDeltaDeg).toBe(0);
  });

  it("clamps the FOV kick to -8..10 degrees and decays it to exactly 0", () => {
    const rig = createImpactRig({ reducedMotion: false });
    for (let i = 0; i < 5; i += 1) rig.trigger({ fovKickDeg: 4 });
    const first = rig.step(0.001).fovDeltaDeg;
    expect(first).toBeLessThanOrEqual(10);
    expect(first).toBeGreaterThan(9.8);
    let last = first;
    for (let i = 0; i < 120; i += 1) {
      const d = rig.step(1 / 60).fovDeltaDeg;
      expect(d).toBeLessThanOrEqual(last);
      last = d;
    }
    expect(last).toBe(0);
    rig.trigger({ fovKickDeg: -50 });
    expect(rig.step(0.001).fovDeltaDeg).toBeGreaterThanOrEqual(-8);
    rig.reset();
    expect(rig.step(0.016)).toMatchObject({ frozen: false, fovDeltaDeg: 0, shakeRoll: 0 });
  });

  it("matches the pre-5.7.0 shared rig frame for frame over a recorded hit sequence", () => {
    const hits: Record<number, { freezeSeconds?: number; trauma?: number; fovKickDeg?: number }> = {
      3: { freezeSeconds: 0.045, trauma: 0.6, fovKickDeg: 3 },
      40: { trauma: 0.3 },
      41: { freezeSeconds: 0.2, fovKickDeg: -12 },
      90: { freezeSeconds: 0.03, trauma: 2, fovKickDeg: 14 }
    };
    const frames = [1 / 60, 1 / 120, 1 / 144, 0.05, 0.25, 0, -0.01];
    for (const reducedMotion of [false, true]) {
      const next = createImpactRig({ reducedMotion });
      const old = legacyImpactRig({ reducedMotion });
      for (let i = 0; i < 200; i += 1) {
        const hit = hits[i];
        if (hit) { next.trigger(hit); old.trigger(hit); }
        if (i === 150) { next.reset(); old.reset(); }
        const dt = frames[i % frames.length]!;
        expect(next.step(dt)).toStrictEqual(old.step(dt));
      }
    }
  });
});

describe("createProceduralSfx", () => {
  it("is a silent no-op headless and toggles mute", () => {
    const sfx = createProceduralSfx();
    expect(sfx.muted).toBe(false);
    expect(() => sfx.play("impact", 2)).not.toThrow();
    sfx.setMuted(true);
    expect(sfx.muted).toBe(true);
    expect(() => sfx.play("tick")).not.toThrow();
  });
});

describe("screen fx helpers", () => {
  it("caps the flash under reduced motion", () => {
    expect(flashStrength(0.8, false)).toBe(0.8);
    expect(flashStrength(0.8, true)).toBe(REDUCED_FLASH_CAP);
    expect(flashStrength(0.05, true)).toBe(0.05);
  });

  it("shows no vignette below x2 and caps it at 0.5", () => {
    expect(vignetteOpacity(1, false, 3)).toBe(0);
    expect(vignetteOpacity(2, false, 0)).toBeCloseTo(0.1, 12);
    expect(vignetteOpacity(1, true, 0)).toBeCloseTo(0.38, 12);
    for (let s = 0; s < 3; s += 0.1) expect(vignetteOpacity(9, false, s)).toBeLessThanOrEqual(0.5);
  });
});

describe("drainPopups", () => {
  it("keeps draining by seq after the sim's list is full", () => {
    const list: ScorePopup[] = [];
    let seq = 0;
    let nextSeq = 0;
    let shown = 0;
    for (let round = 0; round < 10; round += 1) {
      for (let i = 0; i < 20; i += 1) {
        list.push({ n: 1, seq: seq++, text: "+1", color: "#fff", size: 1, at: round });
        if (list.length > POPUP_LIMIT) list.shift();
      }
      const out = drainPopups(list, nextSeq);
      shown += out.fresh.length;
      nextSeq = out.nextSeq;
    }
    expect(list).toHaveLength(POPUP_LIMIT);
    expect(shown).toBe(200);
    expect(drainPopups(list, nextSeq)).toEqual({ fresh: [], nextSeq });
  });
});

describe("GameRng", () => {
  it("is the seeded counted stream: same seed, same draws, every draw counted", () => {
    const a = new GameRng(20261101);
    const b = new GameRng(20261101);
    const ref = createCountedRng(20261101);
    for (let i = 0; i < 500; i += 1) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBe(ref.next());
    }
    expect(a.count).toBe(500);
    expect(new GameRng(1).next()).not.toBe(new GameRng(2).next());
  });
});

describe("game shared modules re-export the library kit", () => {
  it("feel, rng, popups and screen-fx are the library functions", () => {
    expect(sharedFeel.createImpactRig).toBe(createImpactRig);
    expect(sharedFeel.createProceduralSfx).toBe(createProceduralSfx);
    expect(runnerRng.GameRng).toBe(GameRng);
    expect(runnerPopups.drainPopups).toBe(drainPopups);
    expect(runnerPopups.POPUP_LIMIT).toBe(POPUP_LIMIT);
    expect(runnerScreenFx.flashStrength).toBe(flashStrength);
    expect(runnerScreenFx.vignetteOpacity).toBe(vignetteOpacity);
  });
});
