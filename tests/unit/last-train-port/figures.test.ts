import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton, type HumanoidDriver, type HumanoidPoseInput } from "@aura3d/engine/animation";
import { IDOL_TRAM } from "../../../examples/last-train-port/idolModels";
import { FIGURE_KEYS, GUARD_ID, RIDER_FIGURE, figureBodyId, motormanPose, registerFigureDriver, seatedRiderInput, type FigureKey } from "../../../examples/last-train-port/figures";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";
import { buildWorld } from "../../../examples/last-train-port/world";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};
const glb = (key: FigureKey) => `apps/showcase-last-train-port/assets/idol/${key}.glb`;
const driverOf = (key: FigureKey): HumanoidDriver => createHumanoidDriver(readIdolSkeleton(parseGlbJson(readFileSync(glb(key)))));
type V = readonly [number, number, number];
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** A real Idol GLB behind a runtime handle: pose -> handle.setAnimationPose (clone) -> typed-GLB actor -> skinning palette. */
async function handleRig(key: FigureKey) {
  const bytes = readFileSync(glb(key));
  const url = `https://offline-idol.invalid/${key}.glb`;
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
  const actor = await createTypedGLBActor({
    asset: { type: "model", format: "glb", url } as never, id: "idol", name: "idol", width: 64, height: 64, shareTextures: false,
    imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
  } as never);
  vi.unstubAllGlobals();
  const assets = defineAuraAssets({ body: { type: "model", format: "glb", url, bounds: [1, 1, 1] } });
  const handle = createAuraRuntimeNodeRegistry(scene().add(model(assets.body, { name: "body", scaleMode: "world" }).runtime({ id: "body" })).toJSON()).require("body");
  return (pose: unknown) => {
    handle.setAnimationPose(pose as never);
    const result = actor.applyRetargetedPose(handle.animationPose() as never);
    const pal = Array.from(actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array);
    return { result, pal };
  };
}

describe("Lamplight Line rigged figures (every human rigged and animated)", () => {
  it("riders are seated by code: thighs forward, knees bent, feet below the knees, hips lowered", () => {
    for (const kind of ["easy", "sightseer", "rushed", "sleeper"] as const) {
      const d = driverOf(RIDER_FIGURE[kind]);
      expect(d.map.ok, kind).toBe(true);
      const roles = d.map.roles as Record<string, string>;
      const stand = d.modelPositions({ rotations: {} });
      const sit = d.modelPositions(seatedRiderInput({ kind, seat: 3, t: 2, sway: 0, pitch: 0, gaze: 0 }));
      const h = d.map.hipHeight;
      for (const side of ["left", "right"]) {
        const hip = sit[roles[`${side}UpperLeg`]!]!, knee = sit[roles[`${side}LowerLeg`]!]!, foot = sit[roles[`${side}Foot`]!]!;
        expect(knee[2] - hip[2], `${kind} ${side} knee forward`).toBeGreaterThan(0.3 * h);
        expect(Math.abs(knee[1] - hip[1]), `${kind} ${side} thigh level`).toBeLessThan(0.2 * h);
        expect(knee[1] - foot[1], `${kind} ${side} shin down`).toBeGreaterThan(0.3 * h);
      }
      expect(stand[roles.hips!]![1] - sit[roles.hips!]![1], `${kind} hips lowered`).toBeGreaterThan(0.3 * h);
    }
  });

  it("the motorman's hands follow the throttle / brake and his head moves over time", () => {
    const d = driverOf("llMotorman");
    const roles = d.map.roles as Record<string, string>;
    const at = (accel: number, t: number) => d.modelPositions(motormanPose({ t, accel, speed: 8 }));
    const coast = at(0, 1), notched = at(1.6, 1), braking = at(-3, 1);
    expect(dist(coast[roles.rightHand!]!, notched[roles.rightHand!]!)).toBeGreaterThan(0.03);
    expect(dist(coast[roles.leftHand!]!, braking[roles.leftHand!]!)).toBeGreaterThan(0.03);
    // hands forward of the chest (on the controller), not hanging
    expect(coast[roles.rightHand!]![2] - coast[roles.chest ?? roles.spine!]![2]).toBeGreaterThan(0.1 * d.map.hipHeight);
    const later = at(0, 4.5);
    expect(dist(coast[roles.head!]!, later[roles.head!]!) + dist(coast[roles.rightHand!]!, later[roles.rightHand!]!)).toBeGreaterThan(0.005);
  });

  it("poses survive the runtime handle clone and change the skinning palette over time and with throttle", async () => {
    const motor = await handleRig("llMotorman");
    const d = driverOf("llMotorman");
    const a = motor(d.pose(motormanPose({ t: 1, accel: 0, speed: 8 })));
    const b = motor(d.pose(motormanPose({ t: 1, accel: 1.6, speed: 8 })));
    const c = motor(d.pose(motormanPose({ t: 5, accel: 0, speed: 8 })));
    expect(a.result.transformTracksApplied).toBeGreaterThan(15);
    const diff = (x: number[], y: number[]) => Math.max(...x.map((v, i) => Math.abs(v - y[i]!)));
    expect(diff(a.pal, b.pal)).toBeGreaterThan(1e-3);
    expect(diff(a.pal, c.pal)).toBeGreaterThan(1e-4);
    const rider = await handleRig("llPaxEasy");
    const rd = driverOf("llPaxEasy");
    const sit: HumanoidPoseInput = seatedRiderInput({ kind: "easy", seat: 2, t: 1, sway: 0, pitch: 0, gaze: 0 });
    const r0 = rider(rd.pose(sit)), r1 = rider(rd.pose(seatedRiderInput({ kind: "easy", seat: 2, t: 1, sway: 0.2, pitch: 0, gaze: 0 })));
    expect(r0.result.transformTracksApplied).toBeGreaterThan(15);
    expect(diff(r0.pal, r1.pal)).toBeGreaterThan(1e-3);
  }, 60_000);

  it("the runtime poses the motorman and a seated rider every frame from the tram's motion", { timeout: 120_000 }, () => {
    for (const key of FIGURE_KEYS) registerFigureDriver(key, driverOf(key));
    const world = buildWorld(data, "bands");
    const poses = new Map<string, string[]>();
    const visible = new Map<string, boolean>();
    const at = new Map<string, number[]>();
    const handle = (id: string) => ({
      setPosition(...p: number[]) { at.set(id, p); }, setRotation() {}, setMaterial() {}, setScale() {}, setLight() {}, setUniform() {}, updateAttribute() {}, setInstances() {},
      setVisible(v: boolean) { visible.set(id, v); },
      setAnimation() {},
      setAnimationPose(p: unknown) { const l = poses.get(id) ?? []; l.push(JSON.stringify(p)); poses.set(id, l); }
    });
    const mockApp = {
      effects: { runtime: "off", registerPreset() {}, spawn() {} },
      camera: { setPose() {} },
      setScene() {},
      nodes: { require: (id: string) => handle(id), get: (id: string) => handle(id) }
    };
    const runtime = world.bind(mockApp as unknown as Parameters<typeof world.bind>[0], data);
    const base = {
      leg: 0, distance: 20, roll: 0, rollVelocity: 0, timeOfDay: "day" as const, comfort: 100, score: 0, phase: "enroute",
      trips: [{ seat: 0, temperament: "easy" }],
      attempt: { id: 1, status: "active" as const, fares: 0, tips: 0, bonuses: 0, lost: 0, catches: 0, streak: 0, grade: "Gold" as const }
    };
    // accelerate for a while, then coast
    for (let f = 0; f < 30; f++) runtime.update({ ...base, speed: 2 + f * 0.05, distance: 20 + f * 0.05 } as unknown as Parameters<typeof runtime.update>[0], 1 + f / 60);
    for (let f = 0; f < 30; f++) runtime.update({ ...base, speed: 3.5, distance: 22 + f * 0.06 } as unknown as Parameters<typeof runtime.update>[0], 1.5 + f / 60);
    const motor = poses.get(figureBodyId("a3g-fx-tram-conductor"))!;
    const rider = poses.get(figureBodyId("pax-0-easy"))!;
    expect(motor.length).toBe(60);
    expect(rider.length).toBe(60);
    expect(visible.get("a3g-fx-tram-conductor")).toBe(true);
    expect(visible.get("pax-0-easy")).toBe(true);
    expect(visible.get("pax-1-easy")).toBe(false);
    // throttle vs coasting changes the motorman's pose; the rider's sway eases off once the tram stops accelerating
    expect(motor[25]).not.toBe(motor[59]);
    expect(rider[25]).not.toBe(rider[59]);
    // GPU QA: both cabs are crewed (motorman at the front controller, guard at the rear) and each stands inside its cab
    expect(visible.get(GUARD_ID)).toBe(true);
    expect(poses.get(figureBodyId(GUARD_ID))!.length).toBe(60);
    const body = at.get("tram-body")!, motorman = at.get("a3g-fx-tram-conductor")!, guard = at.get(GUARD_ID)!;
    for (const crew of [motorman, guard]) {
      const along = Math.hypot(crew[0]! - body[0]!, crew[2]! - body[2]!);
      expect(along).toBeGreaterThan(IDOL_TRAM.cabZ[0] - 0.01);
      expect(along).toBeLessThan(IDOL_TRAM.cabZ[1] + 0.2);
      expect(crew[1]! - body[1]!).toBeGreaterThan(IDOL_TRAM.floorY - 0.1); // standing on the cab floor, not under it
      expect(crew[1]! - body[1]!).toBeLessThan(IDOL_TRAM.floorY + 0.2);
    }
    // rigged figures are top-level nodes placed in world space from the tram pose: the seated rider is inside the tram
    // footprint, feet on the saloon floor, and the figure node that is placed is the node that is posed
    const pax = at.get("pax-0-easy")!;
    expect(Math.hypot(pax[0]! - body[0]!, pax[2]! - body[2]!)).toBeLessThan(IDOL_TRAM.saloonHalfLength + 0.2);
    expect(Math.abs(pax[1]! - body[1]! - IDOL_TRAM.floorY)).toBeLessThan(0.1);
    expect(figureBodyId("pax-0-easy")).toBe("pax-0-easy");
    expect(figureBodyId(GUARD_ID)).toBe(GUARD_ID);
    // and the pose keeps changing frame to frame (breathing, head scan), not a statue
    expect(new Set(motor.slice(40)).size).toBeGreaterThan(10);
  });
});
