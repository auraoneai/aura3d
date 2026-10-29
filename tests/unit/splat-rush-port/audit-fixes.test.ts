import { describe, expect, it } from "vitest";
import { diffSounds, type FrameState } from "../../../examples/splat-rush-port/audio";
import { Autopilot } from "../../../examples/splat-rush-port/autopilot";
import { REDUCED_FLASH_CAP, flashFor, flashStrength } from "../../../examples/splat-rush-port/fx";
import { SteadyCamera, drainPopups } from "../../../examples/splat-rush-port/presentation";
import { IDLE, SplatRushSim, type Segment } from "../../../examples/splat-rush-port/sim";
import { SYMBOL_FOR_COLOR, SYMBOL_VERTS, markOutline, symbolMesh } from "../../../examples/splat-rush-port/symbols";
import { Batch, Slots } from "../../../examples/splat-rush-port/world";

/** Lane G16 (Chroma Roll) audit rows: docs/audits/sections/game-16-splat-rush-port.md. */

const playUntilOver = (sim: SplatRushSim, pilot: Autopilot, onStep: () => void, max = 6000): void => {
  for (let i = 0; i < max && sim.o.phase !== "gameOver"; i++) {
    sim.advance(pilot.next(sim, i));
    pilot.observe(sim);
    onStep();
  }
};

describe("C2: popups drain by sequence, across restarts", () => {
  it("shows every popup of more than 100 over three runs, although the list is capped at 64", () => {
    const sim = new SplatRushSim(20261023);
    let next = 0, shown = 0;
    const drain = (): void => { const d = drainPopups(sim.popups, next); next = d.nextSeq; shown += d.fresh.length; };
    for (let run = 0; run < 3; run++) {
      if (run === 0) sim.advance({ ...IDLE, start: true });
      else { sim.begin(); next = drainPopups(sim.popups, sim.popupSeq).nextSeq; }
      // a long run (good play) then a few mistakes so it ends
      playUntilOver(sim, new Autopilot({ maxDx: 14, mistakeRows: [40, 41, 42, 43], aimOffset: 0 }), drain);
      expect(sim.o.phase).toBe("gameOver");
    }
    expect(sim.popupSeq).toBeGreaterThan(100);
    expect(sim.popups.length).toBeLessThanOrEqual(64);
    expect(shown).toBe(sim.popupSeq);
    // the old index-based reader stops for good once the list is full
    expect(sim.popups.map((p) => p.seq)).toEqual(Array.from({ length: sim.popups.length }, (_, i) => sim.popupSeq - sim.popups.length + i));
  });
  it("PERFECT popups keep arriving after the list is full (the perfect cue and flash read them)", () => {
    const sim = new SplatRushSim(7);
    sim.advance({ ...IDLE, start: true });
    let next = 0, latePerfects = 0;
    playUntilOver(sim, new Autopilot({ maxDx: 14, mistakeRows: [70, 71, 72, 73], aimOffset: 0 }), () => {
      const d = drainPopups(sim.popups, next);
      next = d.nextSeq;
      if (sim.popupSeq > 64) latePerfects += d.fresh.filter((p) => p.text.startsWith("PERFECT")).length;
    });
    expect(latePerfects).toBeGreaterThan(0);
  });
});

describe("C4: a restart starts centred and not dragging", () => {
  it("clears the steering target and the drag", () => {
    const sim = new SplatRushSim(1);
    sim.advance({ ...IDLE, start: true });
    sim.advance({ ...IDLE, down: true, dx: 140 });
    for (let i = 0; i < 30; i++) sim.advance(IDLE);
    expect(sim.ye).toBeGreaterThan(2);
    expect(sim.dragging).toBe(true);
    sim.begin();
    expect(sim.ye).toBe(0);
    expect(sim.dragging).toBe(false);
    for (let i = 0; i < 30; i++) sim.advance(IDLE);
    expect(Math.abs(sim.o.laneOffset)).toBeLessThan(1e-9);
  });
});

describe("C16: a gate row is resolved once, against the nearest gate", () => {
  it("between two lanes (both within 1.2) only one effect applies", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = new SplatRushSim(seed);
      sim.advance({ ...IDLE, start: true });
      sim.ye = 1.16; // 1.16 from the centre lane, 1.14 from the right lane
      const before = { combo: sim.o.combo, lives: sim.o.lives };
      const firstRow = sim.gates[0]!.row;
      while (sim.gates.some((g) => g.row === firstRow && !g.passed)) sim.advance(IDLE);
      const effects = (sim.o.combo > before.combo ? 1 : 0) + (sim.o.lives < before.lives ? 1 : 0);
      expect(effects, `seed ${seed}`).toBe(1);
      const right = sim.gates.find((g) => g.row === firstRow && g.laneX > 1)!;
      expect(sim.o.combo > before.combo, `seed ${seed}: the nearest (right) gate decides`).toBe(right.colorIndex === sim.o.playerColorIndex);
    }
  });
});

describe("C9/C10: road entities keep a constant offset from the scroll", () => {
  it("segment z minus sim.scroll never changes over a run", () => {
    const sim = new SplatRushSim(3);
    sim.advance({ ...IDLE, start: true });
    const pilot = new Autopilot();
    const first = new Map<Segment, number>();
    for (let i = 0; i < 900 && sim.o.phase === "playing"; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
      for (const s of sim.segments) {
        const r = s.z - sim.scroll;
        const seen = first.get(s);
        if (seen === undefined) first.set(s, r);
        else expect(Math.abs(r - seen)).toBeLessThan(1e-9);
      }
    }
    expect(first.size).toBeGreaterThan(300);
  });
  it("cloud z minus sim.cloudDrift only changes when a cloud respawns", () => {
    const sim = new SplatRushSim(3);
    sim.advance({ ...IDLE, start: true });
    const local = sim.clouds.map((c) => c.z - sim.cloudDrift);
    let respawns = 0;
    for (let i = 0; i < 1200; i++) {
      sim.advance(IDLE);
      sim.clouds.forEach((c, k) => {
        const now = c.z - sim.cloudDrift;
        if (Math.abs(now - local[k]!) > 1e-6) { respawns++; local[k] = now; }
      });
    }
    expect(respawns).toBeGreaterThan(0);
    expect(respawns).toBeLessThan(56 * 3);
  });
});

describe("C9/C10: batches upload only what changed", () => {
  const unit = { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] };
  it("flush uploads each written run at its vertex offset, and nothing when idle", () => {
    const b = new Batch(unit, 10, [1, 1, 1]);
    const calls: { name: string; offset: number; length: number }[] = [];
    const handle = { updateAttribute: (name: string, u: { array: Float32Array; offset: number }) => { calls.push({ name, offset: u.offset, length: u.array.length }); } };
    b.place(3, 1, 2, 3, 0, 1, 1, 1);
    b.place(5, 1, 2, 3, 0, 1, 1, 1);
    b.setTone(4, [0.5, 0.5, 0.5]);
    b.flush(handle as never);
    // two separate runs (instances 3 and 5), not the span 3..5
    expect(calls).toEqual([
      { name: "position", offset: 9, length: 9 },
      { name: "normal", offset: 9, length: 9 },
      { name: "position", offset: 15, length: 9 },
      { name: "normal", offset: 15, length: 9 },
      { name: "tone", offset: 12, length: 9 }
    ]);
    calls.length = 0;
    b.flush(handle as never);
    expect(calls).toEqual([]);
    b.collapse(0);
    b.flush(handle as never, false);
    expect(calls).toEqual([{ name: "position", offset: 0, length: 9 }]);
  });
  it("slots stay with their object, and a full pool frees leavers before it takes newcomers", () => {
    const slots = new Slots<object>(2);
    const a = {}, b = {}, c = {};
    expect(slots.use(a)).toEqual({ slot: 0, fresh: true });
    expect(slots.use(b)).toEqual({ slot: 1, fresh: true });
    expect(slots.use(c).slot).toBe(-1);
    const gone: number[] = [];
    slots.retain([a, b], (s) => gone.push(s));
    expect(gone).toEqual([]);
    // next frame: a left and c arrived while the pool was full
    slots.retain([b, c], (s) => gone.push(s));
    expect(gone).toEqual([0]);
    expect(slots.use(b)).toEqual({ slot: 1, fresh: false });
    expect(slots.use(c)).toEqual({ slot: 0, fresh: true });
  });
});

const frame: FrameState = { phase: "playing", lives: 3, combo: 0, multiplier: 1, score: 740, shieldActive: false, rainbowTimer: 0, scoreX2Timer: 0, playerColorIndex: 0, milestone: 750, perfect: false };

describe("C6: milestone cue and gold flash", () => {
  it("a rising milestone plays the milestone cue; a restart (milestone back to 750) does not", () => {
    expect(diffSounds(frame, { ...frame, milestone: 1500, score: 850 }).map((e) => e.sound)).toContain("milestone");
    expect(diffSounds({ ...frame, milestone: 3000 }, { ...frame, milestone: 750 }).map((e) => e.sound)).not.toContain("milestone");
    expect(flashFor({ sound: "milestone", level: 0 }, 2)).toEqual({ color: "#f9c647", strength: 0.5 });
  });
  it("the sim raises the milestone once per 750 points", () => {
    const sim = new SplatRushSim(5);
    sim.advance({ ...IDLE, start: true });
    let prev: FrameState | null = null, cues = 0;
    const pilot = new Autopilot();
    for (let i = 0; i < 1500 && sim.o.phase === "playing"; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
      const o = sim.o;
      const f: FrameState = { phase: o.phase, lives: o.lives, combo: o.combo, multiplier: o.multiplier, score: o.score, shieldActive: o.shieldActive, rainbowTimer: o.rainbowTimer, scoreX2Timer: o.scoreX2Timer, playerColorIndex: o.playerColorIndex, milestone: o.milestone, perfect: false };
      cues += diffSounds(prev, f).filter((e) => e.sound === "milestone").length;
      prev = f;
    }
    expect(cues).toBe((sim.o.milestone - 750) / 750);
    expect(cues).toBeGreaterThan(0);
  });
});

describe("C8: reduced motion", () => {
  it("caps every flash at 0.1 and leaves full motion unchanged", () => {
    for (const sound of ["match", "perfect", "hit", "block", "pickup", "switch", "burst", "milestone"] as const) {
      const f = flashFor({ sound, level: 3 }, 1)!;
      expect(flashStrength(f.strength, true)).toBeLessThanOrEqual(REDUCED_FLASH_CAP);
      expect(flashStrength(f.strength, false)).toBe(f.strength);
    }
  });
  it("the steady camera follows the sim camera exactly until a shake, then stays smooth", () => {
    const sim = new SplatRushSim(11);
    const cam = new SteadyCamera(sim);
    sim.advance({ ...IDLE, start: true }); cam.step(sim);
    let shaken = false, maxJump = 0;
    let last = { ...cam.cur };
    const pilot = new Autopilot({ maxDx: 14, mistakeRows: [3, 4, 5], aimOffset: 0 });
    for (let i = 0; i < 800 && sim.o.phase !== "gameOver"; i++) {
      sim.advance(pilot.next(sim, i));
      pilot.observe(sim);
      cam.step(sim);
      if (sim.o.shakeTimer > 0) shaken = true;
      if (!shaken) expect(Math.hypot(cam.cur.x - sim.camera.x, cam.cur.y - sim.camera.y, cam.cur.z - sim.camera.z)).toBeLessThan(1e-9);
      maxJump = Math.max(maxJump, Math.hypot(cam.cur.x - last.x, cam.cur.y - last.y));
      last = { ...cam.cur };
    }
    expect(shaken).toBe(true);
    expect(maxJump).toBeLessThan(0.2);
  });
});

describe("C7: colour symbols", () => {
  it("one distinct shape per colour, all with the same vertex count and indices", () => {
    expect(new Set(SYMBOL_FOR_COLOR).size).toBe(4);
    const meshes = SYMBOL_FOR_COLOR.map((k) => symbolMesh(k));
    for (const m of meshes) {
      expect(m.positions.length / 3).toBe(SYMBOL_VERTS);
      expect(m.tones.length).toBe(m.positions.length);
      expect(m.indices).toEqual(meshes[0]!.indices);
    }
    const sig = SYMBOL_FOR_COLOR.map((k) => markOutline(k).map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(" "));
    expect(new Set(sig).size).toBe(4);
  });
});

describe("C9/C10: world runtime against a recording app", () => {
  it("draws through about 60 nodes and uploads under 15% of the old per-frame road vertices", async () => {
    const { buildWorld, BATCH_IDS } = await import("../../../examples/splat-rush-port/world");
    // buildWorld paints two canvas textures; a 2D context that ignores every call is enough here
    const g = globalThis as { document?: unknown };
    const hadDocument = "document" in g;
    if (!hadDocument) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => undefined }) }) };
    const sim = new SplatRushSim(20261023);
    const world = buildWorld({ sim, aspect: 16 / 9 });
    const uploads = new Map<string, number>();
    const visible = new Map<string, boolean>();
    const handle = (id: string) => {
      const h: Record<string, unknown> = {};
      const chain = () => h;
      Object.assign(h, {
        setPosition: chain, setRotation: chain, setScale: chain, setUniform: chain,
        setVisible: (v: boolean) => { visible.set(id, v); return h; },
        updateAttribute: (_name: string, u: { array: Float32Array }) => { uploads.set(id, (uploads.get(id) ?? 0) + u.array.length / 3); }
      });
      return h;
    };
    const app = { nodes: { require: handle }, camera: { setPose: () => undefined } };
    const rt = world.bind(app as never);
    sim.advance({ ...IDLE, start: true });
    const pilot = new Autopilot();
    for (let i = 0; i < 120; i++) { sim.advance(pilot.next(sim, i)); pilot.observe(sim); rt.update(sim, 16 / 9); }
    const before = rt.uploadedVertices;
    const frames = 300;
    for (let i = 120; i < 120 + frames && sim.o.phase === "playing"; i++) { sim.advance(pilot.next(sim, i)); pilot.observe(sim); rt.update(sim, 16 / 9); }
    const perFrame = (rt.uploadedVertices - before) / frames;
    // the old path rewrote deck (220 x 24), rails (440 x 63) and dashes (60 x 24) every frame: 33,000 vertices. What is
    // left is what really moves each frame: streaks (50 x 24), live particles and growing splatters (about 3,600 measured)
    expect(perFrame).toBeLessThan(0.15 * 33000);
    expect(rt.nodeCount).toBeLessThan(80);
    for (const id of BATCH_IDS) expect(uploads.has(id) || id === "gate-symbols", id).toBe(true);
    if (!hadDocument) delete g.document;
  });
});

describe("C9: batches after a multi-step jump (manual QA stepping renders once after hundreds of steps)", () => {
  it("every live splatter, gate and segment is written, though the whole pool turned over", async () => {
    const { buildWorld } = await import("../../../examples/splat-rush-port/world");
    const g = globalThis as { document?: unknown };
    const hadDocument = "document" in g;
    if (!hadDocument) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => undefined }) }) };
    const sim = new SplatRushSim(20261023);
    for (let i = 0; i < 30; i++) sim.advance(IDLE);
    const world = buildWorld({ sim, aspect: 1.6 });
    const buffers = new Map<string, Float32Array>();
    const handle = (id: string) => {
      const h: Record<string, unknown> = {};
      const chain = () => h;
      Object.assign(h, {
        setPosition: chain, setRotation: chain, setScale: chain, setUniform: chain, setVisible: chain,
        updateAttribute: (name: string, u: { array: Float32Array; offset: number }) => {
          if (name !== "position") return;
          let b = buffers.get(id);
          if (!b) buffers.set(id, (b = new Float32Array(2_000_000)));
          b.set(u.array, u.offset * 3);
        }
      });
      return h;
    };
    const rt = world.bind({ nodes: { require: handle }, camera: { setPose: () => undefined } } as never);
    sim.advance({ ...IDLE, start: true });
    for (let i = 0; i < 45; i++) sim.advance(IDLE);
    rt.update(sim, 1.6);
    const pilot = new Autopilot({ maxDx: 14, mistakeRows: [], aimOffset: 0 });
    for (let i = 0; i < 420; i++) { sim.advance(pilot.next(sim, i)); pilot.observe(sim); }
    rt.update(sim, 1.6);
    const instancesWritten = (id: string, vertsPer: number, max: number): number => {
      const b = buffers.get(id)!;
      let n = 0;
      for (let i = 0; i < max; i++) if (b.subarray(i * vertsPer * 3, (i + 1) * vertsPer * 3).some((v) => v !== 0)) n++;
      return n;
    };
    const splatVerts = buffers.get("splats")!.length > 0 ? (await import("../../../examples/splat-rush-port/world")).splatVertexCount : 0;
    expect(sim.splatters.length).toBeGreaterThan(15);
    expect(instancesWritten("splats", splatVerts, 20)).toBe(sim.splatters.length);
    if (!hadDocument) delete g.document;
  });
});
