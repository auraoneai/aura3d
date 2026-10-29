import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DOOR_OPEN_ANGLE,
  INITIAL_OBJECT_STATE,
  LIFT_STEP_M,
  MOVE_SPEED,
  NEUTRAL_POSE,
  RISE_HEIGHT_M,
  Tweened,
  addPose,
  approachAngle,
  breathe,
  composeRotation,
  dampPose,
  ease,
  eulerZYXFromMatrix,
  gestureMotion,
  hingeSwingOffset,
  hopArc,
  isNeutral,
  moveDurationSec,
  phaseOf,
  placePiece,
  planObjectAction,
  popScale,
  proc,
  rollAngle,
  rotateYaw,
  rotateZYX,
  rotationMatrixZYX,
  runningPose,
  sampleGestureMotion,
  sampleLayer,
  sampleMove,
  sampleTransient,
  squashStretch,
  talkPulse,
  tipEdgeOffset,
  TOPPLE_ANGLE,
  transientSeconds,
  wag,
  wrapAngle,
  yawTowards,
  type EaseName,
  type StagePose,
  type Vec3
} from "../../../src/scenes/motion.js";
import type { MoveStyle, ObjectAction } from "../../../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..", "..", "..");

function close(a: number, b: number, digits = 6): void {
  expect(a).toBeCloseTo(b, digits);
}

function closeVec(a: Vec3, b: Vec3, digits = 6): void {
  close(a[0], b[0], digits);
  close(a[1], b[1], digits);
  close(a[2], b[2], digits);
}

const EASES: readonly EaseName[] = ["linear", "inQuad", "outQuad", "inOutQuad", "inOutSine", "outCubic", "inOutCubic", "outBackSoft", "outBounceSoft"];
const STYLES: readonly MoveStyle[] = ["walk", "run", "roll", "float", "hop", "drive", "fly", "slide"];

describe("easing", () => {
  it("every ease starts at 0, ends at 1 and clamps its input", () => {
    for (const name of EASES) {
      close(ease(name, 0), 0);
      close(ease(name, 1), 1);
      close(ease(name, -3), 0);
      close(ease(name, 7), 1);
    }
  });

  it("soft overshoot and soft bounce stay gentle (under 6% past the target)", () => {
    for (let i = 0; i <= 100; i += 1) {
      const t = i / 100;
      expect(ease("outBackSoft", t)).toBeLessThan(1.06);
      expect(ease("outBounceSoft", t)).toBeLessThanOrEqual(1);
      expect(ease("outBounceSoft", t)).toBeGreaterThan(-1e-9);
    }
  });
});

describe("building blocks", () => {
  it("hop arc is 0 at both ends and the full height in the middle", () => {
    close(hopArc(0, 0.3), 0);
    close(hopArc(1, 0.3), 0);
    close(hopArc(0.5, 0.3), 0.3);
  });

  it("squash and stretch preserves volume", () => {
    for (const amount of [-0.3, -0.1, 0, 0.1, 0.25]) {
      const [sx, sy, sz] = squashStretch(amount);
      close(sx * sy * sz, 1);
    }
  });

  it("rolling without slipping: one circumference is one full turn", () => {
    close(rollAngle(2 * Math.PI * 0.25, 0.25), 2 * Math.PI);
    close(rollAngle(1, 0), 0);
  });

  it("pop swells softly then shrinks to nothing", () => {
    close(popScale(0), 1);
    expect(popScale(0.4)).toBeLessThan(1.2);
    close(popScale(1), 0);
  });

  it("wag is a symmetric yaw wiggle", () => {
    close(wag(0, 0.3, 2), 0);
    close(wag(0.125, 0.3, 2), 0.3);
  });

  it("talking pulse is a gentle squash/bob within its strength (never more)", () => {
    for (let i = 0; i <= 60; i += 1) {
      const p = talkPulse(i / 30, 0.05);
      expect(p.sy).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(p.sy).toBeLessThanOrEqual(1.05 + 1e-9);
      close(p.sx * p.sy * p.sz, 1);
    }
  });

  it("highlight breathing stays within 1..1+amount and is slow", () => {
    for (let i = 0; i <= 100; i += 1) {
      const s = breathe(i / 20, 0.05);
      expect(s).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(s).toBeLessThanOrEqual(1.05 + 1e-9);
    }
    close(breathe(0, 0.05), 1);
    close(breathe(1.2, 0.05, 2.4), 1.05);
  });

  it("wraps and approaches angles the short way round", () => {
    close(wrapAngle(3 * Math.PI), Math.PI);
    close(wrapAngle(-Math.PI / 2 - 2 * Math.PI), -Math.PI / 2);
    close(approachAngle(3, -3, 0.1), 3 + 0.1);
    close(approachAngle(0, 0.05, 0.1), 0.05);
  });

  it("yawTowards faces +Z at 0 and +X at +90 degrees", () => {
    close(yawTowards([0, 0, 0], [0, 0, 5]), 0);
    close(yawTowards([0, 0, 0], [3, 0, 0]), Math.PI / 2);
    close(yawTowards([0, 0, 0], [-3, 0, 0]), -Math.PI / 2);
  });

  it("phaseOf is deterministic and in [0, 1)", () => {
    expect(phaseOf("momo")).toBe(phaseOf("momo"));
    for (const id of ["momo", "lulu", "ball", "balloon-1", ""]) {
      expect(phaseOf(id)).toBeGreaterThanOrEqual(0);
      expect(phaseOf(id)).toBeLessThan(1);
    }
  });

  it("combines and damps pose offsets", () => {
    const a = addPose({ ...NEUTRAL_POSE, dy: 0.2, sy: 1.1 }, { ...NEUTRAL_POSE, dy: 0.1, sy: 1.2, rz: 0.3 });
    close(a.dy, 0.3);
    close(a.sy, 1.32);
    close(a.rz, 0.3);
    const d = dampPose(a, 0.5);
    close(d.dy, 0.15);
    close(d.sy, 1.16);
    expect(isNeutral(dampPose(a, 0))).toBe(true);
  });
});

describe("rotation math (engine ZYX order)", () => {
  it("rotateZYX matches Rz * Ry * Rx on basis vectors", () => {
    closeVec(rotateZYX([0, Math.PI / 2, 0], [0, 0, 1]), [1, 0, 0]);
    closeVec(rotateZYX([Math.PI / 2, 0, 0], [0, 1, 0]), [0, 0, 1]);
    closeVec(rotateZYX([0, 0, Math.PI / 2], [1, 0, 0]), [0, 1, 0]);
    // X first, then Y: +Y -> +Z (x 90) -> +X (y 90).
    closeVec(rotateZYX([Math.PI / 2, Math.PI / 2, 0], [0, 1, 0]), [1, 0, 0]);
    closeVec(rotateYaw(Math.PI, [0, 0, 1]), [0, 0, -1]);
  });

  it("euler -> matrix -> euler round-trips", () => {
    for (const r of [[0.3, -0.6, 1.1], [-1.2, 0.4, -0.2], [0, 0, 0], [2.5, 1.0, -2.8]] as Vec3[]) {
      const back = eulerZYXFromMatrix(rotationMatrixZYX(r));
      const v: Vec3 = [0.3, -0.7, 0.64];
      closeVec(rotateZYX(back, v), rotateZYX(r, v));
    }
  });

  it("composeRotation carries a piece's local rotation through its node rotation", () => {
    const outer: Vec3 = [0.1, Math.PI / 2, 0.05];
    const inner: Vec3 = [0, 0, Math.PI / 2];
    const composed = composeRotation(outer, inner);
    for (const v of [[0, 1, 0], [1, 0, 0], [0.2, 0.5, -0.4]] as Vec3[]) {
      closeVec(rotateZYX(composed, v), rotateZYX(outer, rotateZYX(inner, v)));
    }
    // A sideways axle (cylinder rotated 90 degrees about Z) follows the train when it turns to face +X.
    const axle = rotateZYX(composeRotation([0, Math.PI / 2, 0], [0, 0, Math.PI / 2]), [0, 1, 0]);
    closeVec(axle, [0, 0, 1]);
  });

  it("placePiece grounds pieces at their base pivot and keeps a rolling ball's centre fixed", () => {
    const base: Vec3 = [1, 0, -0.5];
    const standing: StagePose = { base, rotation: [0, 0, 0], scale: [1, 1, 1], pivot: "base", centerHeight: 0.2 };
    closeVec(placePiece(standing, [0, 0.2, 0.1]), [1, 0.2, -0.4]);
    // A fitted model ball pivots at its lowest point; with a centre pivot its centre must not move as it rolls.
    const r = 0.2;
    for (const roll of [0, 0.7, 2.1, 4.4]) {
      const rolling: StagePose = { base, rotation: [roll, 0.6, 0], scale: [1, 1, 1], pivot: "center", centerHeight: r };
      const modelOrigin = placePiece(rolling, [0, 0, 0]);
      const centre = rotateZYX(rolling.rotation, [0, r, 0]);
      closeVec([modelOrigin[0] + centre[0], modelOrigin[1] + centre[1], modelOrigin[2] + centre[2]], [1, r, -0.5]);
      // A primitive sphere (centre at r) stays put as well.
      closeVec(placePiece(rolling, [0, r, 0]), [1, r, -0.5]);
    }
  });

  it("squash keeps the feet on the ground for base-pivot pieces", () => {
    const pose: StagePose = { base: [0, 0, 0], rotation: [0, 0, 0], scale: [1.1, 0.8, 1.1], pivot: "base", centerHeight: 0.5 };
    closeVec(placePiece(pose, [0, 0.5, 0]), [0, 0.4, 0]);
  });
});

describe("door hinge", () => {
  it("keeps the hinge edge fixed while the door swings", () => {
    const width = 0.9;
    close(hingeSwingOffset(width, 0)[0], 0);
    for (const angle of [DOOR_OPEN_ANGLE, -0.6, 0.4]) {
      const offset = hingeSwingOffset(width, angle);
      const hinge = rotateYaw(angle, [-width / 2, 0, 0]);
      closeVec([hinge[0] + offset[0], hinge[1] + offset[1], hinge[2] + offset[2]], [-width / 2, 0, 0]);
    }
  });
});

describe("tipping over", () => {
  it("a toppled box turns about its bottom edge and lies on the floor, never sinking into it", () => {
    const w = 0.45;
    const h = 0.45;
    closeVec(tipEdgeOffset(w / 2, 0), [0, 0, 0]);
    for (const angle of [TOPPLE_ANGLE, -TOPPLE_ANGLE, 0.6, -0.3]) {
      const tip = tipEdgeOffset(w / 2, angle);
      const pose: StagePose = { base: [tip[0], tip[1], tip[2]], rotation: [0, 0, angle], scale: [1, 1, 1], pivot: "base", centerHeight: h / 2 };
      // The bottom edge on the side it falls toward stays where it was.
      const edge = -Math.sign(angle) * (w / 2);
      closeVec(placePiece(pose, [edge, 0, 0]), [edge, 0, 0]);
      // Every corner of the box stays on or above the floor.
      const lowest = Math.min(...[[-w / 2, 0], [w / 2, 0], [-w / 2, h], [w / 2, h]].map(([x, y]) => placePiece(pose, [x ?? 0, y ?? 0, 0])[1]));
      close(lowest, 0);
      // It falls toward -X for a positive angle and toward +X for a negative one.
      const middle = placePiece(pose, [0, h / 2, 0]);
      expect(Math.sign(middle[0])).toBe(-Math.sign(angle));
    }
  });
});

describe("procedural motion", () => {
  it("non-looping layers start and end neutral", () => {
    for (const layer of [proc("hop", 0.8, 0.2, 2), proc("rock", 1.2, 0.1, 2), proc("wag", 1.2, 0.3, 3), proc("nod", 1, 0.2, 2), proc("pulse", 2, 0.05)]) {
      expect(isNeutral(sampleLayer(layer, 0, false), 1e-6)).toBe(true);
      expect(isNeutral(sampleLayer(layer, layer.durationSec, false), 1e-6)).toBe(true);
    }
  });

  it("hold gestures keep their end pose (hide stays low)", () => {
    const hide = gestureMotion([proc("duck", 0.9, 0.5)], { hold: true });
    const end = sampleGestureMotion(hide, hide.durationSec, false);
    close(end.sy, 0.5);
    const later = sampleGestureMotion(hide, 30, false);
    close(later.sy, 0.5);
  });

  it("looping layers repeat every period", () => {
    const float = proc("float", 2.6, 0.08);
    const a = sampleLayer(float, 0.7, true);
    const b = sampleLayer(float, 0.7 + 2.6 * 3, true);
    close(a.dy, b.dy);
  });

  it("is deterministic: same time, same pose", () => {
    const spec = gestureMotion([proc("hop", 1.3, 0.16, 2), proc("rock", 1.3, 0.05, 2)]);
    expect(sampleGestureMotion(spec, 0.42, false)).toEqual(sampleGestureMotion(spec, 0.42, false));
  });

  it("keeps amplitudes calm (no gesture moves a node more than 0.35 m or tilts past 0.45 rad)", () => {
    const spec = gestureMotion([proc("hop", 1.5, 0.22, 2), proc("rock", 1.5, 0.16, 3), proc("peek", 1.6, 0.22)]);
    for (let i = 0; i <= 120; i += 1) {
      const p = sampleGestureMotion(spec, (i / 120) * 1.6, false);
      expect(Math.abs(p.dy)).toBeLessThanOrEqual(0.35);
      expect(Math.abs(p.rz)).toBeLessThanOrEqual(0.45);
    }
  });
});

describe("moves", () => {
  it("start at `from`, end at `to` for every style", () => {
    const from: Vec3 = [-6.5, 0, 0.1];
    const to: Vec3 = [-1.3, 0, 0.1];
    for (const style of STYLES) {
      closeVec(sampleMove(style, from, to, 0, 0, false).position, from);
      closeVec(sampleMove(style, from, to, 1, 3, false).position, to);
      expect(isNeutral(sampleMove(style, from, to, 1, 3, false).pose)).toBe(true);
    }
  });

  it("reduced motion keeps the path and drops the bounce", () => {
    for (const style of STYLES) {
      const sample = sampleMove(style, [0, 0, 0], [2, 0, 0], 0.37, 1.1, true);
      expect(isNeutral(sample.pose)).toBe(true);
      expect(sample.position[0]).toBeGreaterThan(0);
      expect(sample.position[0]).toBeLessThan(2);
    }
  });

  it("reports the travel heading and distance (for rolling)", () => {
    const sample = sampleMove("roll", [0, 0, 0], [2, 0, 0], 1, 1.25, false);
    close(sample.heading ?? 0, Math.PI / 2);
    close(sample.travelled, 2);
    expect(sampleMove("float", [0, 1, 0], [0, 2, 0], 0.5, 0.5, false).heading).toBeNull();
  });

  it("hop style hops (positive arc) and walk bobs gently", () => {
    let maxHop = 0;
    let maxWalk = 0;
    for (let i = 1; i < 50; i += 1) {
      maxHop = Math.max(maxHop, sampleMove("hop", [0, 0, 0], [1.8, 0, 0], i / 50, i / 25, false).pose.dy);
      maxWalk = Math.max(maxWalk, sampleMove("walk", [0, 0, 0], [1.8, 0, 0], i / 50, i / 25, false).pose.dy);
    }
    expect(maxHop).toBeGreaterThan(0.1);
    expect(maxHop).toBeLessThanOrEqual(0.17);
    expect(maxWalk).toBeGreaterThan(0);
    expect(maxWalk).toBeLessThanOrEqual(0.04);
  });

  it("durations follow distance over a calm speed, kept between 0.6 s and 3.2 s", () => {
    close(moveDurationSec("walk", 2.2), 2.2 / MOVE_SPEED.walk);
    close(moveDurationSec("walk", 0.01), 0.6);
    close(moveDurationSec("walk", 40), 3.2);
    close(moveDurationSec("run", 40), 2.2);
    for (const style of STYLES) expect(MOVE_SPEED[style]).toBeLessThanOrEqual(2.2);
  });
});

describe("tweens", () => {
  it("ease to the target and stay there", () => {
    const t = new Tweened(0);
    t.set(1, 1, "linear");
    t.step(0.25);
    close(t.value, 0.25);
    expect(t.active).toBe(true);
    t.step(2);
    close(t.value, 1);
    expect(t.active).toBe(false);
  });

  it("a new target continues from the current value (no jump)", () => {
    const t = new Tweened(0);
    t.set(1, 1, "linear");
    t.step(0.5);
    t.set(0, 1, "linear");
    close(t.value, 0.5);
    t.step(0.5);
    close(t.value, 0.25);
    t.jump(2);
    close(t.value, 2);
  });
});

describe("object actions", () => {
  const ctx = { door: false, container: false, x: 0.5 };

  it("covers every ObjectAction without throwing", () => {
    const actions: readonly ObjectAction[] = [
      "roll", "pop", "open", "close", "bounce", "wobble", "spin", "fall", "rise", "glow",
      "shrink", "grow", "bloom", "wash", "dry", "up", "down", "stack", "topple", "eat",
      "tint", "shake", "ring", "go", "stop"
    ];
    for (const action of actions) {
      const plan = planObjectAction(action, INITIAL_OBJECT_STATE, ctx);
      expect(plan.durationSec).toBeGreaterThanOrEqual(0);
      if (plan.transient) expect(plan.durationSec).toBeCloseTo(transientSeconds(plan.transient), 6);
    }
  });

  it("pop and eat end hidden; show can bring them back", () => {
    for (const action of ["pop", "eat"] as const) {
      const plan = planObjectAction(action, INITIAL_OBJECT_STATE, ctx);
      expect(plan.hideAtEnd).toBe(true);
      expect(plan.next.gone).toBe(true);
    }
  });

  it("rise floats up and down comes all the way back; up/down step one floor", () => {
    const risen = planObjectAction("rise", INITIAL_OBJECT_STATE, ctx).next;
    close(risen.lift, RISE_HEIGHT_M);
    expect(planObjectAction("down", risen, ctx).next.lift).toBe(0);
    const up1 = planObjectAction("up", INITIAL_OBJECT_STATE, ctx).next;
    close(up1.lift, LIFT_STEP_M);
    const up2 = planObjectAction("up", up1, ctx).next;
    close(planObjectAction("down", up2, ctx).next.lift, LIFT_STEP_M);
    close(planObjectAction("down", INITIAL_OBJECT_STATE, ctx).next.lift, 0);
  });

  it("doors swing open and closed; boxes hop their lid", () => {
    const door = { door: true, container: false, x: -1 };
    const opened = planObjectAction("open", INITIAL_OBJECT_STATE, door);
    expect(opened.next.open).toBe(true);
    expect(opened.transient).toBeNull();
    expect(planObjectAction("close", opened.next, door).next.open).toBe(false);
    expect(planObjectAction("open", INITIAL_OBJECT_STATE, { door: false, container: true, x: 0 }).transient).toBe("lidHop");
  });

  it("roll without a destination heads toward the middle of the stage", () => {
    expect(planObjectAction("roll", INITIAL_OBJECT_STATE, { ...ctx, x: 1.5 }).rollBy).toBeLessThan(0);
    expect(planObjectAction("roll", INITIAL_OBJECT_STATE, { ...ctx, x: -1.5 }).rollBy).toBeGreaterThan(0);
  });

  it("go keeps a vehicle running until stop, which also stops any move", () => {
    const going = planObjectAction("go", INITIAL_OBJECT_STATE, ctx).next;
    expect(going.running).toBe(true);
    const stopped = planObjectAction("stop", going, ctx);
    expect(stopped.next.running).toBe(false);
    expect(stopped.stopMove).toBe(true);
    expect(isNeutral(runningPose(0.37, true))).toBe(true);
  });

  it("glow and bloom show the soft halo; grow and shrink stay within bounds", () => {
    expect(planObjectAction("glow", INITIAL_OBJECT_STATE, ctx).halo).toBe(true);
    expect(planObjectAction("bloom", INITIAL_OBJECT_STATE, ctx).halo).toBe(true);
    let state = INITIAL_OBJECT_STATE;
    for (let i = 0; i < 10; i += 1) state = planObjectAction("grow", state, ctx).next;
    expect(state.scaleMul).toBeLessThanOrEqual(2.2);
    for (let i = 0; i < 20; i += 1) state = planObjectAction("shrink", state, ctx).next;
    expect(state.scaleMul).toBeGreaterThanOrEqual(0.35);
  });

  it("topple lies the object down; stack stands it back up", () => {
    const toppled = planObjectAction("topple", INITIAL_OBJECT_STATE, ctx).next;
    expect(Math.abs(toppled.toppled)).toBe(1);
    expect(planObjectAction("stack", toppled, ctx).next.toppled).toBe(0);
  });

  it("transients start neutral and settle back (pop and eat shrink to zero)", () => {
    for (const kind of ["bounce", "wobble", "spin", "glow", "bloom", "wash", "dry", "shake", "ring", "brake", "pulse", "lidHop", "sway"] as const) {
      const start = sampleTransient(kind, 0, transientSeconds(kind), false);
      expect(isNeutral(start, 1e-6)).toBe(true);
    }
    close(sampleTransient("pop", transientSeconds("pop"), transientSeconds("pop"), false).sy, 0);
    close(sampleTransient("eat", transientSeconds("eat"), transientSeconds("eat"), false).sy, 0);
    close(sampleTransient("drop", transientSeconds("drop"), transientSeconds("drop"), false).dy, 0);
  });

  it("reduced motion halves transient amplitudes", () => {
    const full = sampleTransient("wobble", 0.1, 1, false);
    const reduced = sampleTransient("wobble", 0.1, 1, true);
    close(reduced.rz, full.rz / 2);
    expect(Math.abs(sampleTransient("shake", 0.2, 0.9, true).dx)).toBeLessThanOrEqual(0.016);
  });
});

describe("determinism guard", () => {
  const files = [
    "src/scenes/motion.ts",
    "src/scenes/spots.ts",
    "src/scenes/stand-ins.ts",
    "src/scenes/stage.ts",
    "src/scenes/looks.ts",
    "src/scenes/worlds.ts",
    "src/scenes/meadow.ts",
    "src/scenes/music-garden.ts",
    "src/scenes/peekaboo-barn.ts",
    "src/scenes/station.ts",
    "src/scenes/learning-cloud.ts",
    "src/scenes/home-nook.ts",
    "src/characters/momo.ts",
    "src/characters/lulu.ts",
    "src/characters/sheru.ts",
    "src/characters/gogo.ts",
    "src/characters/lumi.ts",
    "src/characters/peeko.ts",
    "src/characters/character-registry.ts",
    "src/runtime/animation-director.ts",
    "src/runtime/asset-preloader.ts"
  ];

  it("stage code has no clocks, randomness, three.js, raw GLB URLs, unsafe casts or vignette", () => {
    for (const file of files) {
      const source = readFileSync(join(appRoot, file), "utf8");
      expect(source, file).not.toMatch(/Math\.random\s*\(/);
      expect(source, file).not.toMatch(/Date\.now\s*\(/);
      expect(source, file).not.toMatch(/performance\.now\s*\(/);
      expect(source, file).not.toMatch(/from\s+["']three["']/);
      expect(source, file).not.toMatch(/GLTFLoader/);
      expect(source, file).not.toMatch(/\.glb["']/);
      expect(source, file).not.toMatch(/as any\b|as never\b/);
      expect(source, file).not.toMatch(/effects\.vignette\s*\(/);
      // The chick is Peeko; "Pip" is only allowed when naming the other shipped game.
      expect(source, file).not.toMatch(/\bPip\b(?!'s Big Leap)/);
    }
  });
});
