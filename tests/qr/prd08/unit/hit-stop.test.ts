/**
 * `hit-stop.test.ts` — S5 scoped hit-stop on a two-fighter + bystander rig.
 *
 * Chain under test (all real, on main): `feel.emit("hit-heavy", {actors})` ->
 * `time.hitStop(0.07, {scope:[a,b]})` -> `handle.timeScale = 0` on those
 * handles only, restored on expiry; `ko` -> global 0.1 s -> `advance` returns
 * 0 and sim substeps don't run. Movers here scale their step by the handle's
 * own `timeScale` — the production interpolation path's exact semantics —
 * so "frozen" means the node's mover produced identical positions.
 *
 * Fixture: `tests/qr/prd08/fixtures/fighters.json` (minimal; swaps to
 * lane-09's fighter fixture when that lands — #370 G4-internal).
 */
import { describe, expect, it } from "vitest";
import { createFeelBus } from "@aura3d/engine/lanes";
import { createTimeController } from "@aura3d/engine/lanes";
import fighters from "../fixtures/fighters.json";

const DT = 1 / 60;
const HIT_AT = 0.3;

interface FakeHandle {
  id: string;
  timeScale: number;
  position: [number, number, number];
}

function mkHandles() {
  const handles = new Map<string, FakeHandle>();
  for (const f of fighters.fighters) {
    handles.set(f.id, { id: f.id, timeScale: 1, position: [...f.spawn] as [number, number, number] });
  }
  return handles;
}

/** Advance every fighter's script by dt*handle.timeScale (per-node freeze). */
function scriptStep(handles: Map<string, FakeHandle>, simTime: number, dt: number) {
  for (const [id, h] of handles) {
    const f = fighters.fighters.find((x) => x.id === id)!;
    const s = f.script as { kind: string; speed: number; axis: string; dir?: number; period?: number };
    const step = s.speed * dt * h.timeScale;
    if (s.kind === "advance") {
      const axis = s.axis === "x" ? 0 : s.axis === "y" ? 1 : 2;
      h.position[axis] += step * (s.dir ?? 1);
    } else if (s.kind === "wander") {
      const axis = s.axis === "z" ? 2 : 0;
      h.position[axis] += Math.cos((simTime * h.timeScale) / (s.period ?? 3) * Math.PI * 2) * step;
    }
  }
}

function build() {
  const handles = mkHandles();
  const time = createTimeController({
    resolveHandle: (id: string) => handles.get(id) as never
  });
  const feel = createFeelBus({
    time: { hitStop: (s, o) => time.hitStop(s, o) }
  });
  feel.preset("fighting");
  return { handles, time, feel };
}

describe("S5 hit-stop — two fighters + bystander", () => {
  it("scoped hit-heavy freezes only the two actors ±1 step while bystander and feel decay continue", () => {
    const { handles, time, feel } = build();
    const a = handles.get("fighter-a")!;
    const b = handles.get("fighter-b")!;
    const bystander = handles.get("bystander")!;
    let simTime = 0;

    // Warm up 0.3 s of real frames (hit lands at fixture `hit.at`).
    while (simTime < HIT_AT) {
      const dt = time.advance(DT);
      if (dt > 0) {
        scriptStep(handles, simTime, dt);
        simTime += dt;
      }
      feel.advance(DT);
    }
    const preA = [...a.position];
    const preB = [...b.position];

    // The hit: hit-heavy -> 0.07 s scoped [a,b].
    feel.emit("hit-heavy", { actors: ["fighter-a", "fighter-b"] });

    // During the stop window (~4 frames at 60 Hz): a/b frozen, bystander
    // moves, feel uniforms carry non-zero energy on the frozen frames.
    let frozenFrames = 0;
    let bystanderMoved = 0;
    let energyOnFrozen = 0;
    const frames = Math.ceil(0.07 / DT);
    for (let i = 0; i < frames; i += 1) {
      const dt = time.advance(DT);
      scriptStep(handles, simTime, dt > 0 ? dt : DT); // sim still steps — the nodes' own scale gates
      feel.advance(DT);
      const uniforms = feel.screenUniforms();
      const aMoved = Math.hypot(a.position[0] - preA[0], a.position[1] - preA[1], a.position[2] - preA[2]);
      const bMoved = Math.hypot(b.position[0] - preB[0], b.position[1] - preB[1], b.position[2] - preB[2]);
      if (aMoved < 1e-9 && bMoved < 1e-9) {
        frozenFrames += 1;
        if (Object.values(uniforms).some((v) => v > 0)) energyOnFrozen += 1;
      }
      if (dt > 0) bystanderMoved += dt;
    }
    // ±1 step: frozen exactly the whole stop window ±1 frame.
    expect(frozenFrames).toBeGreaterThanOrEqual(frames - 1);
    expect(frozenFrames).toBeLessThanOrEqual(frames + 1);
    expect(bystanderMoved).toBeGreaterThan(0); // real dt advanced the bystander
    expect(energyOnFrozen).toBe(frozenFrames); // shake energy >0 every frozen frame

    // Post-window: scales restored to 1, both actors move again.
    const a2 = [...a.position];
    for (let i = 0; i < 10; i += 1) {
      const dt = time.advance(DT);
      scriptStep(handles, simTime, dt);
    }
    expect(a.timeScale).toBe(1);
    expect(b.timeScale).toBe(1);
    expect(Math.hypot(a.position[0] - a2[0], a.position[1] - a2[1], a.position[2] - a2[2])).toBeGreaterThan(0.2);
  });

  it("ko preset global hit-stop: advance returns 0 — sim substeps do not run for ~6 frames", () => {
    const { handles, time, feel } = build();
    const a = handles.get("fighter-a")!;
    const bystander = handles.get("bystander")!;
    let simTime = 0;
    while (simTime < HIT_AT) {
      const dt = time.advance(DT);
      scriptStep(handles, simTime, dt);
      simTime += dt;
      feel.advance(DT);
    }
    feel.emit("ko"); // global 0.10 s
    const preA = [...a.position];
    const preBy = [...bystander.position];
    let zeroSteps = 0;
    let ran = 0;
    const frames = Math.ceil(0.1 / DT);
    // TimeController decrements the stop inside advance and still returns 0
    // on the frame it expires — a 0.10 s stop therefore yields 7 zero-dt
    // frames at 60 Hz (the spec's "±1 step" window). Run one extra frame so
    // the post-window advance is observable here.
    for (let i = 0; i < frames + 1; i += 1) {
      const dt = time.advance(DT);
      if (dt === 0) zeroSteps += 1;
      else ran += 1;
      if (dt > 0) scriptStep(handles, simTime, dt);
      feel.advance(DT);
    }
    expect(zeroSteps).toBeGreaterThanOrEqual(frames);
    expect(zeroSteps).toBeLessThanOrEqual(frames + 1);
    expect(ran).toBeLessThanOrEqual(1);
    // No node moved while sim was frozen — global stop gates EVERYTHING.
    expect(a.position).toEqual(preA);
    expect(bystander.position).toEqual(preBy);
    // After expiry the sim resumes.
    const d = time.advance(DT * 2);
    expect(d).toBeGreaterThan(0);
  });

  it("re-issuing a stop extends rather than stacks: scopedHitStopCount stays 2", () => {
    const { time, feel } = build();
    feel.emit("hit-heavy", { actors: ["fighter-a", "fighter-b"] });
    time.advance(DT);
    feel.emit("hit-heavy", { actors: ["fighter-a", "fighter-b"] });
    expect(time.scopedHitStopCount).toBe(2);
    for (let i = 0; i < 12; i += 1) time.advance(DT);
    expect(time.scopedHitStopCount).toBe(0);
  });
});
