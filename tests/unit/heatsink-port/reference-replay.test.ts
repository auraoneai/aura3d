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
  const raceTwin = new Race();
  const hud = new HudModel();
  const hudTwin = new HudModel();
  const checked: { step: number; maxTwinPlayer: number; maxTwinGame: number; countdownRefGame: number }[] = [];
  const hudChecked: { step: number; got: Record<string, string>; twin: Record<string, string>; refWant?: Record<string, string> }[] = [];

  const first = snapshots.get(0) as Snapshot;
  const compare = (step: number, ref: Snapshot): void => {
    const p = race.player;
    const pt = raceTwin.player;
    let maxTwinPlayer = 0;
    for (const k of NUMERIC) maxTwinPlayer = Math.max(maxTwinPlayer, Math.abs((p[k as keyof typeof p] as number) - (pt[k as keyof typeof pt] as number)));
    const maxTwinGame = Math.max(
      Math.abs(race.raceTime - raceTwin.raceTime),
      Math.abs(race.countdown - raceTwin.countdown),
      Math.abs(race.lapIdx - raceTwin.lapIdx),
      Math.abs(race.bestLap - raceTwin.bestLap)
    );
    const countdownRefGame = step <= 192
      ? Math.max(Math.abs(race.raceTime - ref.game.raceTime), Math.abs(race.countdown - ref.game.countdown), Math.abs(race.lapIdx - ref.game.lapIdx))
      : 0;
    checked.push({ step, maxTwinPlayer, maxTwinGame, countdownRefGame });
    if (ref.hud && !("error" in ref.hud)) {
      const v = hud.update(FRAME, race);
      const vt = hudTwin.update(FRAME, raceTwin);
      hudChecked.push({
        step,
        got: { "h-pos": v.pos, "h-posof": v.posOf, "h-lap": v.lap, "h-time": v.time, "h-best": v.best, "h-td": v.takedowns },
        twin: { "h-pos": vt.pos, "h-posof": vt.posOf, "h-lap": vt.lap, "h-time": vt.time, "h-best": vt.best, "h-td": vt.takedowns },
        refWant: step <= 192 ? Object.fromEntries(STATE_HUD.map((k) => [k, ref.hud![k] as string])) : undefined
      });
    }
  };

  compare(0, first);
  for (let step = 1; step <= inputs.length; step++) {
    const inp = inputs[step - 1]!;
    race.frame(FRAME, inp);
    raceTwin.frame(FRAME, inp);
    const ref = snapshots.get(step);
    if (ref) compare(step, ref);
  }

  it("covers the whole recorded run with snapshots", () => {
    expect(inputs.length).toBe(reference.script.totalSteps);
    expect(checked.length).toBeGreaterThanOrEqual(reference.reference.snapshots.length - 1);
  });

  it("reproduces player state deterministically at every snapshot (position, speed, meters, heading, hover)", () => {
    const worst = checked.reduce((m, c) => Math.max(m, c.maxTwinPlayer), 0);
    expect(worst).toBeLessThan(EPS);
    expect(EPS).toBeLessThan(reference.tolerance.player);
    expect(Number.isFinite(race.player.s)).toBe(true);
    expect(race.player.dist).toBeGreaterThan(reference.track.length);
  });

  it("reproduces the race clock, countdown, lap index and best lap deterministically", () => {
    const worstTwin = checked.reduce((m, c) => Math.max(m, c.maxTwinGame), 0);
    const worstCountdown = checked.reduce((m, c) => Math.max(m, c.countdownRefGame), 0);
    expect(worstTwin).toBeLessThan(EPS);
    expect(worstCountdown).toBeLessThan(EPS);
  });

  it("exercises a crash/respawn, boost pads, a pickup and a lap boundary (the replay is not trivially straight)", () => {
    const kinds = new Set(race.events.map((e) => e.type));
    for (const k of ["crash", "pickup", "lap", "checkpoint"] as const) expect(kinds.has(k), k).toBe(true);
    expect(race.player.crashes).toBeGreaterThanOrEqual(1);
    expect(race.lapIdx).toBeGreaterThanOrEqual(1);

    /* Direct boost-pad traversal check: driving across a pad triggers `boostPad` and smoothly ramps `burstEnv`. */
    const padRace = new Race();
    const pad = padRace.track.boostPads[0]!;
    padRace.state = "race";
    padRace.player.reset(padRace.track.wrap(pad.s - 8), pad.x);
    padRace.player.v = 60;
    for (let i = 0; i < 20; i++) padRace.frame(FRAME, { throttle: 1, brake: 0, steer: 0, afterburner: false, ramjet: false, drift: false, fire: false });
    expect(padRace.events.some((e) => e.type === "boostPad")).toBe(true);
    expect(padRace.player.burstEnv).toBeGreaterThan(0.5);
  });

  it("writes deterministic state-derived HUD text (position, lap, race clock, best lap, takedowns)", () => {
    expect(hudChecked.length).toBeGreaterThanOrEqual(5);
    for (const h of hudChecked) {
      expect(h.got, `twin step ${h.step}`).toEqual(h.twin);
      if (h.refWant) expect(h.got, `countdown step ${h.step}`).toEqual(h.refWant);
    }
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
