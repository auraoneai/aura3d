import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { RoadsterGame } from "../../../apps/showcase-roadster-rush/src/native/game";
import { Player } from "../../../apps/showcase-roadster-rush/src/native/player";
import { Traffic } from "../../../apps/showcase-roadster-rush/src/native/traffic";
import { FreewayWorld } from "../../../apps/showcase-roadster-rush/src/native/world";
// @ts-expect-error plain ES module shared with the remote capture
import { runReference } from "../../support/rr-reference-run.mjs";

/**
 * Replays the scripted input run (tests/support/rr-reference-run.mjs) through the native simulation and compares it, sample by
 * sample, with the recorded run of the previously shipped build (tests/fixtures/roadster-rush-native/reference-<seed>.json.gz:
 * 6,000 fixed steps per seed with crashes, restarts, lane changes, hops, thrust, rolls, boosts, dives and every pickup kind).
 */

type Sample = Record<string, number | string>;
interface Run {
  seed: number;
  steps: number;
  every: number;
  samples: Sample[];
  details: Array<{ s: number; near: unknown[][]; sky: unknown[][]; picks: unknown[][] }>;
  modes: Array<[number, string]>;
}

const EXACT = ["mode", "bolts", "mult", "chain", "lane", "gr", "roll", "boost", "alive", "veh", "sky", "pick", "s"] as const;
const FLOAT = ["dist", "score", "x", "y", "z", "spd", "air", "rocket", "shield", "magnet", "vsum", "ssum", "psum"] as const;
const TOLERANCE = 2e-5;

function load(seed: number): Run {
  return JSON.parse(gunzipSync(readFileSync(resolve(`tests/fixtures/roadster-rush-native/reference-${seed}.json.gz`))).toString()) as Run;
}

function firstDivergence(reference: Run, native: Run): string | null {
  for (let i = 0; i < reference.samples.length; i++) {
    const a = reference.samples[i]!;
    const b = native.samples[i];
    if (!b) return `native run ended early at sample ${i}`;
    for (const key of EXACT) if (a[key] !== b[key]) return `step ${a.s} field ${key}: reference ${String(a[key])} native ${String(b[key])}`;
    for (const key of FLOAT) if (Math.abs((a[key] as number) - (b[key] as number)) > TOLERANCE * Math.max(1, Math.abs(a[key] as number))) return `step ${a.s} field ${key}: reference ${String(a[key])} native ${String(b[key])}`;
  }
  return null;
}

describe("native simulation replays the original build's recorded runs", () => {
  for (const seed of [42, 7, 20261023]) {
    it(`seed ${seed}: 6,000 steps match sample for sample`, () => {
      const reference = load(seed);
      const game = new RoadsterGame({ player: new Player(), traffic: new Traffic(), world: new FreewayWorld(), params: new URLSearchParams(`seed=${seed}`), storage: null });
      game.boot();
      const native = runReference(game, { seed, steps: reference.steps, every: reference.every }) as Run;
      expect(native.samples.length).toBe(reference.samples.length);
      expect(firstDivergence(reference, native)).toBeNull();
      expect(native.modes).toEqual(reference.modes);
      for (let i = 0; i < reference.details.length; i++) expect(native.details[i]).toEqual(reference.details[i]);
    });
  }
});
