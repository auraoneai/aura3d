/**
 * Sky-kid hero mocap (fal text-to-motion clips through the shared humanoid driver, art/heroMotion.ts): the captured
 * clips exist, the run's planted gait legs keep a stance foot on the ground at sim speed, the captured jump peaks on the
 * sim's apex, the skeleton moves every frame at real frame time, and the live pose reaches the shipped GLB's skinning
 * palette at a frozen engine clock.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { dispatchActorAnimation } from "../../../packages/engine/src/agent-api/compiler/animation.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { MOTION_CLIPS } from "../../../apps/showcase-cloud-runner-port/src/motion.generated";
import { createHeroMotion, gaitTargets, heroBody, heroMotionRequest, runStride, solveIdolLeg, type HeroMotionFrame } from "../../../examples/kid-goku-beyond-the-clouds-port/art/heroMotion";
import { computeSkyKidHeroPose } from "../../../examples/kid-goku-beyond-the-clouds-port/art/proceduralModels";
import { advanceGaitPhase } from "../../../examples/kid-goku-beyond-the-clouds-port/gait";

const DT = 1 / 60;
const code = (clip: string, t: number, phase = 0, v = 0) => computeSkyKidHeroPose({ clip, clock: t, animT: t, gaitPhase: phase, groundSpeed: v, lean: 0 } as never);
const frame = (over: Partial<HeroMotionFrame> & { clip: string }, t = 0): HeroMotionFrame => ({ dt: DT, groundSpeed: 0, gaitPhase: 0, jump: 0, jumpVelocity: 0, falling: false, codePose: code(over.clip, t), ...over });

describe("Cumulus Dash sky-kid hero captured motion", () => {
  it("ships the captured clips and maps the hero's states onto them", () => {
    for (const k of ["Idle", "Run", "Jump", "Surf", "Strike", "Hit"]) expect(MOTION_CLIPS[k as keyof typeof MOTION_CLIPS].duration, k).toBeGreaterThan(1);
    const st = runStride();
    expect(st.stride).toBeGreaterThan(0.4);
    const req = (clip: string) => heroMotionRequest(frame({ clip }), st);
    expect(req("run")).toMatchObject({ clip: "Run" });
    expect(req("jump")).toMatchObject({ clip: "Jump" });
    expect(req("sit")).toMatchObject({ clip: "Surf" });
    expect(req("block")).toMatchObject({ clip: "Surf" });
    expect(req("attack")).toMatchObject({ clip: "Strike" });
    expect(req("hit")).toMatchObject({ clip: "Hit" });
    expect(req("idle")).toMatchObject({ clip: "Idle" });
    expect("pose" in req("cheer")).toBe(true);
    expect("pose" in heroMotionRequest(frame({ clip: "jump", falling: true }), st)).toBe(true);
  });

  it("two-bone leg IK puts the Idol ankle on its target", () => {
    const b = heroBody();
    const t: [number, number, number] = [b.hipJoint.left[0], 0.2, 0.25];
    const solved = solveIdolLeg({ rotations: {} }, "left", t);
    const a = b.driver.modelPositions(solved)[b.driver.map.roles.leftFoot!]!;
    expect(Math.hypot(a[0] - t[0], a[1] - t[1], a[2] - t[2])).toBeLessThan(0.002);
    expect(gaitTargets(14.5, 0).left[2]).toBeGreaterThan(0); // a touchdown lands ahead of the hips
  });

  it.each([6, 14.5, 19])("running at %d m/s keeps each stance foot planted within 5 cm", (v) => {
    const b = heroBody();
    const m = createHeroMotion();
    let ph = 0, x = 0, worst = 0, steps = 0;
    const plant: Record<"left" | "right", number[] | null> = { left: null, right: null };
    for (let f = 0; f < 240; f++) {
      ph = advanceGaitPhase(ph, v, DT); x += v * DT;
      const out = m.frame(frame({ clip: "run", groundSpeed: v, gaitPhase: ph, codePose: code("run", f * DT, ph, v) }));
      if (f < 30) continue;
      const P = b.driver.modelPositions(out.input);
      for (const side of ["left", "right"] as const) {
        const a = P[b.driver.map.roles[`${side}Foot`]!]!;
        const w = [a[0], a[1], a[2] + x]; // the hero moves +Z at the ground speed; root motion is never in the pose
        if (a[1] < b.ankleY[side] + 0.01) {
          const p = plant[side];
          if (!p) { plant[side] = w; steps++; } else worst = Math.max(worst, Math.hypot(w[0] - p[0]!, w[1] - p[1]!, w[2] - p[2]!));
        } else plant[side] = null;
      }
    }
    expect(steps).toBeGreaterThan(6);
    expect(worst).toBeLessThan(0.05);
    expect(m.current).toBe("Run");
  });

  it("the captured jump peaks on the sim's apex", () => {
    const g = 25, v0 = 13.4, apex = Number(MOTION_CLIPS.Jump.meta?.apexTime);
    const atApex = heroMotionRequest(frame({ clip: "jump", jump: (v0 * v0) / (2 * g), jumpVelocity: 0 }), runStride());
    expect("time" in atApex && atApex.time).toBeCloseTo(apex, 2);
    const early = heroMotionRequest(frame({ clip: "jump", jump: 0.3, jumpVelocity: v0 - 0.3 }), runStride());
    expect("time" in early && early.time!).toBeLessThan(apex);
  });

  it("the skeleton moves every frame at real frame time (idle, surf, strike)", () => {
    for (const clip of ["idle", "sit", "attack"]) {
      const m = createHeroMotion();
      const seen = new Set<string>();
      for (let f = 0; f < 20; f++) seen.add(JSON.stringify(m.frame(frame({ clip }, f * DT)).pose.bones));
      expect(seen.size, clip).toBeGreaterThan(15);
    }
  });

  it("world.ts drives the Idol hero from the captured motion every frame", () => {
    const src = readFileSync("examples/kid-goku-beyond-the-clouds-port/world.ts", "utf8");
    expect(src).toContain("const heroMotion = IDOL ? createHeroMotion() : null;");
    expect(src).toMatch(/heroMotion\.frame\(\{ clip, dt: phase === "paused" \? 0 : dt, groundSpeed, gaitPhase: gait\.phase/);
    expect(src).toContain("hero.setAnimationPose?.(m.pose)");
  });

  it("the captured run reaches the shipped GLB's skinning palette at a frozen engine clock", async () => {
    const bytes = readFileSync("examples/kid-goku-beyond-the-clouds-port/assets/idol/cdSkyKidHero.glb");
    const url = "https://offline-idol.invalid/cdSkyKidHero.glb";
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
    const actor = await createTypedGLBActor({
      asset: { type: "model", format: "glb", url } as never, id: "hero", name: "hero", width: 64, height: 64, shareTextures: false,
      imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
    } as never);
    vi.unstubAllGlobals();
    const assets = defineAuraAssets({ body: { type: "model", format: "glb", url, bounds: [1, 1, 1] } });
    const handle = createAuraRuntimeNodeRegistry(scene().add(model(assets.body, { name: "hero", scaleMode: "world" }).runtime({ id: "hero" })).toJSON()).require("hero");
    const identity = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
    const m = createHeroMotion();
    const palettes = new Set<string>();
    let ph = 0;
    for (let k = 0; k < 3; k++) {
      for (let f = 0; f < 8; f++) { ph = advanceGaitPhase(ph, 14.5, DT); handle.setAnimationPose(m.frame(frame({ clip: "run", groundSpeed: 14.5, gaitPhase: ph })).pose as never); }
      const warnings = new Set<string>();
      dispatchActorAnimation({ actor } as never, { animationPose: handle.animationPose() as never }, { kind: "model", runtime: { id: "hero" } } as never, 0, warnings, identity, () => {});
      expect([...warnings]).toEqual([]);
      const result = actor.applyRetargetedPose(handle.animationPose() as never);
      expect(result.missingTargets).toEqual([]);
      expect(result.transformTracksApplied).toBeGreaterThan(20);
      palettes.add(Array.from((actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array).slice(0, 16 * 28), (v) => v.toFixed(4)).join());
    }
    expect(palettes.size).toBe(3);
  });
});
