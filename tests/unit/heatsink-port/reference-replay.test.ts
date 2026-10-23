import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FRAME, Race } from "../../../examples/heatsink-port/race";
import { HudModel } from "../../../examples/heatsink-port/hud";
import { Track } from "../../../examples/heatsink-port/track";
import { expandSegments, parseInputScript, type PlayerSnapshot, type Snapshot, type TrackFingerprint } from "../../../tools/crayon-capture/heatsink-lib";

/**
 * Phase B (R-20), simulation half. `evidence/crayon-capture/heatsink-reference.json` is a remote capture of the ORIGINAL
 * game (hook-frozen requestAnimationFrame, `game.frame(1/60)` per step, Time Trial on Vesper Heights, inputs injected
 * through the game's own `window.__force`; every independent session and replay agrees exactly). Replaying its recorded
 * input script through this port must reproduce the original's player state, lap count and race clock at every snapshot.
 */

interface Reference {
  readonly track: TrackFingerprint;
  readonly script: { text: string; totalSteps: number };
  readonly tolerance: { player: number; game: number };
  readonly repeatability: { sessions: number; replays: number; allExact: boolean; trackIdentical: boolean };
  readonly reference: { outcome: string; steps: number; snapshots: Snapshot[] };
}

const reference = JSON.parse(readFileSync("evidence/crayon-capture/heatsink-reference.json", "utf8")) as Reference;
/** the port matches to float noise; hold it far tighter than the capture's own 1e-3 float32 floor */
const EPS = 1e-6;
/** the original only refreshes its smoothed meters/speed when its own render runs, which the capture freezes; only these DOM fields are pure functions of sim state */
const STATE_HUD = ["h-pos", "h-posof", "h-lap", "h-time", "h-best", "h-td"];

const NUMERIC: (keyof PlayerSnapshot)[] = ["s", "x", "dist", "v", "ab", "heat", "shield", "gunHeat", "theta", "phi", "yW", "vyW", "steerVal", "burning", "invuln", "burstT", "landT", "crashT"];

describe("the reference itself", () => {
  it("is exact across independent sessions and replays", () => {
    expect(reference.repeatability.sessions).toBeGreaterThanOrEqual(2);
    expect(reference.repeatability.replays).toBeGreaterThanOrEqual(2);
    expect(reference.repeatability.allExact).toBe(true);
    expect(reference.repeatability.trackIdentical).toBe(true);
  });
});

describe("Vesper Heights track vs the original's fingerprint", () => {
  const track = new Track();
  const fp = reference.track;

  it("matches length, sample count and step", () => {
    expect(track.n).toBe(fp.n);
    expect(Math.abs(track.length - fp.length)).toBeLessThan(1e-6);
    expect(Math.abs(track.step - fp.step)).toBeLessThan(1e-9);
  });

  it("matches all 48 sampled frames (position, heading, width, curvature)", () => {
    for (const s of fp.samples) {
      const f = track.frame(s.s);
      for (const k of ["x", "y", "z", "tx", "tz", "hw", "kappa", "psi"] as const) expect(Math.abs((f[k] as number) - s[k]), `${k} at s=${s.s}`).toBeLessThan(1e-6);
      expect(f.sec.key).toBe(s.sec);
    }
  });

  it("matches checkpoints, sections and the scatter objects", () => {
    expect(track.checkpoints.length).toBe(fp.checkpoints.length);
    track.checkpoints.forEach((c, i) => expect(Math.abs(c - (fp.checkpoints[i] as number))).toBeLessThan(1e-6));
    expect(track.sections.map((s) => [s.type.key, Math.round(s.start), Math.round(s.end)])).toEqual(fp.sections.map((s) => [s.type, Math.round(s.start), Math.round(s.end)]));
    expect(track.obstacles.length).toBe(fp.obstacles.count);
    expect(track.lavaPools.length).toBe(fp.lavaPools.count);
    if (fp.boostPads) {
      expect(track.boostPads.length).toBe(fp.boostPads.length);
      track.boostPads.forEach((p, i) => { expect(p.s).toBeCloseTo((fp.boostPads[i] as { s: number }).s, 6); expect(p.x).toBeCloseTo((fp.boostPads[i] as { x: number }).x, 6); });
      expect(track.pickups.map((p) => [p.kind, Math.round(p.s * 1e3), Math.round(p.x * 1e3)])).toEqual(fp.pickups.map((p) => [p.kind, Math.round(p.s * 1e3), Math.round(p.x * 1e3)]));
      expect(track.barrels.map((b) => [Math.round(b.s * 1e3), Math.round(b.x * 1e3)])).toEqual(fp.barrels.map((b) => [Math.round(b.s * 1e3), Math.round(b.x * 1e3)]));
    }
  });
});

describe("replaying the recorded input script", () => {
  const inputs = expandSegments(parseInputScript(reference.script.text));
  const snapshots = new Map(reference.reference.snapshots.map((s) => [s.step, s] as const));
  const race = new Race();
  const hud = new HudModel();
  const checked: { step: number; maxPlayer: number; maxGame: number }[] = [];
  const hudChecked: { step: number; got: Record<string, string>; want: Record<string, string> }[] = [];

  const first = snapshots.get(0) as Snapshot;
  const compare = (step: number, ref: Snapshot): void => {
    const p = race.player;
    let maxPlayer = 0;
    for (const k of NUMERIC) maxPlayer = Math.max(maxPlayer, Math.abs((p[k as keyof typeof p] as number) - (ref.player[k] as number)));
    const maxGame = Math.max(Math.abs(race.raceTime - ref.game.raceTime), Math.abs(race.countdown - ref.game.countdown), Math.abs(race.lapIdx - ref.game.lapIdx), Math.abs(race.bestLap - ref.game.bestLap));
    checked.push({ step, maxPlayer, maxGame });
    if (ref.hud && !("error" in ref.hud)) {
      const v = hud.update(FRAME, race);
      hudChecked.push({
        step,
        got: { "h-pos": v.pos, "h-posof": v.posOf, "h-lap": v.lap, "h-time": v.time, "h-best": v.best, "h-td": v.takedowns },
        want: Object.fromEntries(STATE_HUD.map((k) => [k, ref.hud![k] as string]))
      });
    }
  };

  compare(0, first);
  for (let step = 1; step <= inputs.length; step++) {
    race.frame(FRAME, inputs[step - 1]!);
    const ref = snapshots.get(step);
    if (ref) compare(step, ref);
  }

  it("covers the whole recorded run with snapshots", () => {
    expect(inputs.length).toBe(reference.script.totalSteps);
    expect(checked.length).toBeGreaterThanOrEqual(reference.reference.snapshots.length - 1);
  });

  it("reproduces player state at every snapshot (position, speed, meters, heading, hover)", () => {
    const worst = checked.reduce((m, c) => Math.max(m, c.maxPlayer), 0);
    expect(worst).toBeLessThan(EPS);
    expect(EPS).toBeLessThan(reference.tolerance.player);
  });

  it("reproduces the race clock, countdown, lap index and best lap", () => {
    const worst = checked.reduce((m, c) => Math.max(m, c.maxGame), 0);
    expect(worst).toBeLessThan(EPS);
  });

  it("exercises a crash/respawn, boost pads, a pickup and a lap boundary (the replay is not trivially straight)", () => {
    const kinds = new Set(race.events.map((e) => e.type));
    for (const k of ["crash", "boostPad", "pickup", "lap", "checkpoint"] as const) expect(kinds.has(k), k).toBe(true);
    expect(race.player.crashes).toBeGreaterThanOrEqual(1);
    expect(race.lapIdx).toBeGreaterThanOrEqual(1);
  });

  it("writes the same state-derived HUD text (position, lap, race clock, best lap, takedowns) as the original DOM", () => {
    expect(hudChecked.length).toBeGreaterThanOrEqual(5);
    for (const h of hudChecked) expect(h.got, `step ${h.step}`).toEqual(h.want);
  });

  it("smooths speed (k=9) and the meters (k=14) with the original's exponential filters", () => {
    const m = new HudModel();
    const r = new Race();
    r.player.v = 100;
    r.player.ab = 1;
    const v1 = m.update(1 / 60, r);
    expect(m.sm.speed).toBeCloseTo(100 * 3.6 * (1 - Math.exp(-9 / 60)), 9);
    expect(m.sm.ab).toBeCloseTo(1 - 0 * 0 - Math.exp(-14 / 60) * (1 - 0), 9);
    expect(v1.speed).toBe(String(Math.round(m.sm.speed)));
    expect(v1.pct.shield).toBe("100%");
  });
});

describe("browser replay fixture", () => {
  it("is the reference's input script and final snapshot, so the remote spec checks the same run", () => {
    const fx = JSON.parse(readFileSync("tests/browser/data/heatsink-reference-replay.json", "utf8")) as { script: { text: string; totalSteps: number }; reference: { snapshots: Snapshot[] } };
    expect(fx.script.text).toBe(reference.script.text);
    expect(fx.script.totalSteps).toBe(reference.script.totalSteps);
    expect(fx.reference.snapshots[1]).toEqual(reference.reference.snapshots[reference.reference.snapshots.length - 1]);
  });
});
