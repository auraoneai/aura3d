import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { CONFIG, NO_KEYS, createCar, stateVector, stepCar, teleport } from "../../../examples/drift-and-deliver-port/sim";
import {
  READY_EXPRESSION,
  SCENARIOS,
  STATE_FIELDS,
  assembleReport,
  compareScenario,
  encodeScript,
  expandMasks,
  flatten,
  hashDoubles,
  keysFromMask,
  maskFromKeys,
  pageRunnerSource,
  parseMarkerBlocks,
  parseScript,
  toleranceFrom,
  totalSteps,
  validateReport,
  type ReferenceReport,
  type ScenarioResult,
  type SessionResult,
  type StateVector
} from "../../../tools/crayon-capture/drift-and-deliver-lib";

const reference = JSON.parse(readFileSync("evidence/crayon-capture/drift-and-deliver-reference.json", "utf8")) as ReferenceReport;

describe("browser fixture", () => {
  it("tests/browser/data/drift-and-deliver-reference.json is the evidence file (the remote image only ships tests/)", () => {
    expect(readFileSync("tests/browser/data/drift-and-deliver-reference.json", "utf8")).toBe(readFileSync("evidence/crayon-capture/drift-and-deliver-reference.json", "utf8"));
  });
});

describe("scripts", () => {
  it("round-trip through text", () => {
    for (const s of SCENARIOS) expect(parseScript(encodeScript(s.segments))).toEqual(s.segments);
  });

  it("masks and key maps agree", () => {
    for (let m = 0; m < 64; m++) expect(maskFromKeys(keysFromMask(m))).toBe(m);
    expect(expandMasks([{ steps: 3, keys: 5 }])).toEqual([5, 5, 5]);
    expect(totalSteps(SCENARIOS[0]!.segments)).toBe(672);
  });

  it("rejects malformed lines", () => {
    expect(() => parseScript("12 W")).toThrow();
    expect(parseScript("# comment\n\n4x-\n")).toEqual([{ steps: 4, keys: 0 }]);
  });
});

describe("state hash", () => {
  const fnv = (values: number[]): string => {
    const view = new DataView(new ArrayBuffer(8));
    let h = 0x811c9dc5n;
    for (const v of values) {
      view.setFloat64(0, v, true);
      for (let i = 0; i < 8; i++) h = ((h ^ BigInt(view.getUint8(i))) * 0x01000193n) & 0xffffffffn;
    }
    return h.toString(16).padStart(8, "0");
  };

  it("is FNV-1a over little-endian doubles (independent BigInt implementation agrees)", () => {
    for (const v of [[], [0], [1, 2, 3], [Math.PI, -0, 1e-300, 1e300], Array.from({ length: 64 }, (_, i) => Math.sin(i))]) expect(hashDoubles(v)).toBe(fnv(v));
  });

  it("changes when one bit of one value changes", () => {
    const base = [1, 2, 3, 4];
    expect(hashDoubles(base)).not.toBe(hashDoubles([1, 2, 3, 4 + Number.EPSILON * 8]));
  });
});

describe("reference report", () => {
  it("validates", () => {
    expect(validateReport(reference)).toEqual([]);
  });

  it("is rejected when scenarios are missing, sessions disagree or there is one session", () => {
    const missing = { ...reference, reference: { scenarios: reference.reference.scenarios.slice(1) } };
    expect(validateReport(missing).join(" ")).toMatch(/expected 4 scenarios/);
    expect(validateReport({ ...reference, variance: { ...reference.variance, allHashesEqual: false } }).join(" ")).toMatch(/not repeatable/);
    expect(validateReport({ ...reference, sessions: reference.sessions.slice(0, 1) }).join(" ")).toMatch(/two independent sessions/);
    expect(validateReport(null)).toEqual(["report is not an object"]);
  });

  it("tolerance is the float floor when sessions are identical, and scales with observed variance", () => {
    expect(toleranceFrom(0).perField).toBe(1e-9);
    expect(toleranceFrom(1e-6).perField).toBeCloseTo(1.5e-6, 12);
  });

  const sessionOf = (n: number, mutate?: (s: ScenarioResult) => ScenarioResult): SessionResult => ({
    schema: "a3d-crayon-capture-session/1",
    session: n,
    startedAt: "t",
    url: "u",
    world: reference.world,
    scenarios: reference.reference.scenarios.map((s) => (mutate ? mutate(s) : s))
  });

  it("assembling identical sessions is repeatable; one different hash breaks it", () => {
    const good = assembleReport([sessionOf(1), sessionOf(2)], { url: "u", capturedAt: "now" });
    expect(good.variance.allHashesEqual).toBe(true);
    expect(validateReport(good)).toEqual([]);
    const bad = assembleReport([sessionOf(1), sessionOf(2, (s) => ({ ...s, hash: "deadbeef", samples: s.samples.map((x, i) => (i === 3 ? { ...x, state: x.state.map((v) => v + 1e-3) as unknown as StateVector } : x)) }))], { url: "u", capturedAt: "now" });
    expect(bad.variance.allHashesEqual).toBe(false);
    expect(bad.variance.maxAbsDelta).toBeGreaterThan(1e-4);
    expect(validateReport(bad).join(" ")).toMatch(/not repeatable/);
  });

  it("compareScenario reports the worst field", () => {
    const a = reference.reference.scenarios[0]!;
    const b: ScenarioResult = { ...a, hash: "00000000", samples: a.samples.map((x, i) => (i === 2 ? { ...x, state: x.state.map((v, f) => (f === 3 ? v + 0.5 : v)) as unknown as StateVector } : x)) };
    const c = compareScenario(a, b);
    expect(c.identical).toBe(false);
    expect(c.worstField).toBe(STATE_FIELDS[3]);
    expect(c.maxAbsDelta).toBeCloseTo(0.5, 12);
    expect(compareScenario(a, a).identical).toBe(true);
  });

  it("extracts marker blocks and reports broken JSON", () => {
    const log = `noise\n@@DRIFT_CAPTURE_BEGIN:1\n{"a":1}\n@@DRIFT_CAPTURE_END:1\n@@DRIFT_CAPTURE_BEGIN:2\n{oops\n@@DRIFT_CAPTURE_END:2\n`;
    const blocks = parseMarkerBlocks(log) as Record<string, unknown>[];
    expect(blocks[0]).toEqual({ a: 1 });
    expect(String(blocks[1]!.error)).toMatch(/not valid JSON/);
  });
});

describe("in-page runner", () => {
  /** A fake game page built from the port's physics, exposing the same QA surface the original does. */
  function fakeWindow() {
    const car = createCar();
    const S: Record<string, unknown> = { phase: "splash", boost: 1, drifting: false, boosting: false, speed: 0, heading: 0, shake: 0 };
    const P = { position: { x: car.x, y: 0, z: car.z }, userData: { footprint: reference.world.footprint } };
    const sync = () => {
      Object.assign(S, { boost: car.boost, drifting: car.drifting, boosting: car.boosting, speed: car.speed, heading: car.heading, shake: car.shake });
      P.position.x = car.x;
      P.position.z = car.z;
    };
    const w: Record<string, unknown> = {
      __game: { state: S, CONFIG: { ...CONFIG }, renderer: { toneMapping: 7, toneMappingExposure: 1.34 } },
      __gameEntities: { player: P },
      __dbg: { nearSolids: () => [], camera: { fov: 56, near: 0.4, far: 2400 }, THREE: { REVISION: "fake" } },
      __diag: () => ({ solids: 0 }),
      __crayonGfx: null,
      __tp: (x: number, z: number, h?: number) => { teleport(car, x, z, h); sync(); },
      __sim: (n: number, keys: Record<string, boolean>, dt: number) => {
        for (let i = 0; i < n; i++) stepCar(car, dt, { ...NO_KEYS, ...keys }, [], reference.world.footprint);
        sync();
        return [];
      }
    };
    return { w, car };
  }

  it("the ready expression accepts the QA surface and rejects an empty page", () => {
    const { w } = fakeWindow();
    expect(vm.runInNewContext(READY_EXPRESSION, { window: w })).toBe(true);
    expect(vm.runInNewContext(READY_EXPRESSION, { window: {} })).toBe(false);
  });

  it("drives every scenario one step at a time and hashes what the physics produced", () => {
    const { w } = fakeWindow();
    const out = JSON.parse(vm.runInNewContext(pageRunnerSource(SCENARIOS, 10), { window: w }) as string) as { scenarios: ScenarioResult[]; world: { footprint: unknown; config: Record<string, number> } };
    expect(out.scenarios.map((s) => s.id)).toEqual(SCENARIOS.map((s) => s.id));
    expect(out.world.config.CAR_MAX_SPEED).toBe(58);

    const car = createCar();
    for (const def of SCENARIOS) {
      teleport(car, def.spawn.x, def.spawn.z, def.spawn.heading);
      const vectors: StateVector[] = [];
      for (const seg of def.segments) for (let i = 0; i < seg.steps; i++) { stepCar(car, 1 / 60, keysFromMask(seg.keys), [], reference.world.footprint); vectors.push(stateVector(car)); }
      const got = out.scenarios.find((s) => s.id === def.id)!;
      expect(got.steps).toBe(vectors.length);
      expect(got.hash).toBe(hashDoubles(flatten(vectors)));
      expect(got.samples.length).toBe(Math.floor(vectors.length / 10));
      expect(got.contacts).toBe(0);
    }
  });

  it("counts a contact when a probe point overlaps a nearby solid", () => {
    const { w } = fakeWindow();
    (w.__dbg as { nearSolids: () => unknown[] }).nearSolids = () => [{ x: 30, z: -250, hw: 20, hd: 20 }];
    const out = JSON.parse(vm.runInNewContext(pageRunnerSource([SCENARIOS[0]!], 10), { window: w }) as string) as { scenarios: ScenarioResult[] };
    expect(out.scenarios[0]!.contacts).toBeGreaterThan(0);
    expect(out.scenarios[0]!.firstContactStep).not.toBeNull();
  });
});
