/**
 * C-14 golden fixture test — `tests/qr/prd08/fixtures/legacy-frames.json`
 * pins the legacy `resolveCameraFrame` resolution (the flag-off path) at
 * every (case, time) tuple of the S4 parity suite.
 *
 * Two assertions per tuple, so the golden guards both sides:
 *  - `resolveCameraFrame` still returns the recorded eye/target (catches
 *    drift in the legacy path itself), and
 *  - `rigs.fromSpec` equals the recorded values within 1e-6.
 *
 * Re-record (PRD-08: only with a written reason, diff noted in
 * `evidence/prd08/goldens.md`):
 *   QR_RECORD_LEGACY=1 pnpm exec vitest run --config \
 *     tests/qr/prd08/vitest.config.ts tests/qr/prd08/unit/camera-controller.test.ts
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// T0-32: the legacy resolver is not on the package surface on main
// (#627 puts it on `@aura3d/engine/lanes`); import the leaf so this file
// runs both before and after that PR lands.
import { resolveCameraFrame } from "../../../../packages/engine/src/agent-api/compiler/camera.js";
import { createFromSpecRig } from "@aura3d/engine/lanes";
import {
  cases,
  ctx,
  EPS,
  fakeSnapshot,
  legacyDeps,
  type Case
} from "./legacyCases.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "legacy-frames.json"
);
const RECORD = process.env.QR_RECORD_LEGACY === "1";

interface Tuple {
  index: number;
  name: string;
  time: number;
  eye: readonly number[];
  target: readonly number[];
}

interface Fixture {
  note: string;
  recorded_from: string;
  base_commit: string;
  tuple_count: number;
  tuples: Tuple[];
}

function recordTuples(): Tuple[] {
  const out: Tuple[] = [];
  for (const [index, c] of cases.entries()) {
    const snapshot = fakeSnapshot((c.sceneNodes ?? []) as object[]);
    for (const t of c.times) {
      const frame = resolveCameraFrame(snapshot, c.spec, t, c.registry);
      out.push({ index, name: c.name, time: t, eye: frame.eye, target: frame.target });
    }
  }
  return out;
}

function loadFixture(): Fixture {
  if (RECORD) {
    const tuples = recordTuples();
    const fixture: Fixture = {
      note: "C-14 golden: resolveCameraFrame (legacy, flag-off path) eye+target per (case, time). Regenerate only with a written reason; record the diff in evidence/prd08/goldens.md.",
      recorded_from: "tests/qr/prd08/unit/camera-controller.test.ts (QR_RECORD_LEGACY=1)",
      base_commit: execSync("git rev-parse HEAD").toString().trim(),
      tuple_count: tuples.length,
      tuples
    };
    writeFileSync(FIXTURE, JSON.stringify(fixture, null, 2) + "\n");
    return fixture;
  }
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
}

const fixture = loadFixture();
const byKey = new Map(fixture.tuples.map((t) => [`${t.index}|${t.time}`, t]));

describe("C-14 — legacy golden frames (fixtures/legacy-frames.json)", () => {
  it(`fixture covers ${cases.length} cases, ${fixture.tuple_count} tuples`, () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(fixture.tuple_count).toBeGreaterThanOrEqual(cases.length);
  });

  for (const [i, c] of cases.entries()) {
    describe(`${String(i).padStart(2, "0")} ${c.name}`, () => {
      const spec = c.spec;
      for (const t of c.times) {
        const g = byKey.get(`${i}|${t}`);
        it(`t=${t}`, () => {
          expect(g, `missing golden tuple ${c.name} @${t}`).toBeDefined();
          const snapshot = fakeSnapshot((c.sceneNodes ?? []) as object[]);

          // Guard 1: the legacy path itself is pinned to the golden.
          const legacy = resolveCameraFrame(snapshot, spec, t, c.registry);
          expect(legacy.eye[0], "legacy eye.x").toBeCloseTo(g!.eye[0], 9);
          expect(legacy.eye[1], "legacy eye.y").toBeCloseTo(g!.eye[1], 9);
          expect(legacy.eye[2], "legacy eye.z").toBeCloseTo(g!.eye[2], 9);
          expect(legacy.target[0], "legacy target.x").toBeCloseTo(g!.target[0], 9);
          expect(legacy.target[1], "legacy target.y").toBeCloseTo(g!.target[1], 9);
          expect(legacy.target[2], "legacy target.z").toBeCloseTo(g!.target[2], 9);

          // Guard 2: fromSpec reproduces the golden within 1e-6.
          const rig = createFromSpecRig(spec, legacyDeps(spec, c.registry, (c.sceneNodes ?? []) as never));
          const pose = rig.update(ctx(t));
          for (const [k, a, b] of [
            ["position.x", pose.position[0], g!.eye[0]],
            ["position.y", pose.position[1], g!.eye[1]],
            ["position.z", pose.position[2], g!.eye[2]],
            ["target.x", pose.target[0], g!.target[0]],
            ["target.y", pose.target[1], g!.target[1]],
            ["target.z", pose.target[2], g!.target[2]]
          ] as const) {
            expect(Math.abs(a - b), `${k} @t=${t}`).toBeLessThanOrEqual(EPS);
          }
        });
      }
    });
  }
});

// Referenced only to keep `Case` from appearing unused in some lint modes.
export type { Case };
