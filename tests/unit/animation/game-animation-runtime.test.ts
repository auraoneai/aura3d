import { describe, expect, it } from "vitest";
import { AnimationClip } from "../../../packages/animation/src/AnimationClip";
import { AnimationController, type AnimationPose } from "../../../packages/animation/src/AnimationController";
import { AnimationMixer, type AnimationTarget } from "../../../packages/animation/src/AnimationMixer";
import { AnimationTrack } from "../../../packages/animation/src/AnimationTrack";

type ClipId = "idle" | "walk" | "jump" | "guard" | "attack" | "hit" | "ko";

function pose(label: string): AnimationPose {
  return {
    bones: {
      root: {
        position: { x: label.length, y: 0, z: 0 }
      }
    },
    metadata: { label }
  };
}

describe("game animation runtime semantics", () => {
  it("supports idle, walk, jump, guard, attack, hit, KO, restart, non-looping one-shots, and once event windows", () => {
    const controller = new AnimationController<ClipId>();
    const started: string[] = [];
    const ended: string[] = [];
    const looped: string[] = [];
    const sampled: string[] = [];

    controller.on("start", (state) => started.push(`${state.clipId}:${state.id}`));
    controller.on("end", (state) => ended.push(`${state.clipId}:${state.status}:${state.loopCount}`));
    controller.on("loop", (event) => looped.push(`${event.clipId}:${event.loopCount}`));
    controller.on("event", (event) => sampled.push(`${event.clipId}:${event.event.type ?? "marker"}:${event.event.name}`));

    controller.registerClip({ id: "idle", duration: 1, loop: true, sample: () => pose("idle") });
    controller.registerClip({ id: "walk", duration: 0.8, loop: true, sample: () => pose("walk") });
    controller.registerClip({ id: "jump", duration: 0.45, loop: false, sample: () => pose("jump") });
    controller.registerClip({ id: "guard", duration: 0.3, loop: true, sample: () => pose("guard") });
    controller.registerClip({
      id: "attack",
      duration: 0.36,
      loop: false,
      events: [{ name: "attack-active", type: "hitbox", time: 0.12, once: true }],
      sample: () => pose("attack")
    });
    controller.registerClip({ id: "hit", duration: 0.22, loop: false, sample: () => pose("hit") });
    controller.registerClip({ id: "ko", duration: 0.55, loop: true, sample: () => pose("ko") });

    controller.play("idle", { loop: "loop" });
    controller.update(1.05);
    expect(controller.state("idle")).toMatchObject({ status: "playing", loopCount: 1 });
    expect(looped).toEqual(["idle:1"]);

    controller.crossfade("walk", 0.1, { loop: "loop" });
    controller.update(0.1);
    expect(controller.snapshot().activeClipId).toBe("walk");

    controller.playOnce("jump");
    controller.update(0.5);
    expect(controller.state("jump")).toMatchObject({ status: "completed", completed: true, loopCount: 0 });

    controller.play("guard", { loop: "loop" });
    controller.update(0.1);
    expect(controller.state("guard")).toMatchObject({ status: "playing", loopMode: "loop" });

    const firstAttack = controller.playOnce("attack");
    controller.update(0.13);
    expect(sampled).toContain("attack:hitbox:attack-active");
    controller.update(0.3);
    expect(controller.state("attack")).toMatchObject({ status: "completed", completed: true, loopCount: 0 });

    const restartedAttack = controller.playOnce("attack");
    expect(restartedAttack.id).not.toBe(firstAttack.id);
    expect(restartedAttack).toMatchObject({ localTime: 0, previousLocalTime: 0, loopMode: "once", status: "playing" });
    controller.update(0.13);
    expect(sampled.filter((entry) => entry === "attack:hitbox:attack-active")).toHaveLength(2);

    controller.playOnce("hit");
    controller.update(0.23);
    expect(controller.state("hit")).toMatchObject({ status: "completed", loopCount: 0 });

    controller.playOnce("ko");
    controller.update(1.2);
    expect(controller.state("ko")).toMatchObject({ status: "completed", loopMode: "once", loopCount: 0 });
    expect(looped.some((entry) => entry.startsWith("ko:"))).toBe(false);

    expect(started).toEqual(expect.arrayContaining(["idle:idle:0", "walk:walk:1"]));
    expect(ended.some((entry) => entry.startsWith("ko:completed:0"))).toBe(true);
    expect(controller.state("ko")).toMatchObject({ completed: true, localTime: 0.55 });
    expect(controller.capturePose({ clipId: "ko", time: 0.55, emitEvent: false }).pose.metadata?.label).toBe("ko");
  });

  it("mixes gameplay clips with crossfade weights, root-motion policy, and one-shot event timing", () => {
    const idleClip = new AnimationClip({
      name: "idle",
      duration: 1,
      tracks: [new AnimationTrack({ target: "root.position", valueType: "vector3", keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [0, 0, 0] }] })]
    });
    const runClip = new AnimationClip({
      name: "run",
      duration: 1,
      tracks: [new AnimationTrack({ target: "root.position", valueType: "vector3", keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [1, 0, 0] }] })]
    });
    const attackClip = new AnimationClip({
      name: "attack",
      duration: 0.3,
      tracks: [new AnimationTrack({ target: "hand.position", valueType: "vector3", keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 0.3, value: [0.2, 0, 0] }] })],
      events: [{ name: "active", time: 0.12, payload: { hitbox: "fist" } }]
    });

    const appliedRootMotion: unknown[] = [];
    const appliedValues = new Map<string, unknown>();
    const target: AnimationTarget = {
      setAnimationValue(name, value) {
        appliedValues.set(name, value);
      },
      applyRootMotion(sample) {
        appliedRootMotion.push(sample);
      },
      position: [0, 0, 0]
    };

    const mixer = new AnimationMixer(target, { applyRootMotion: true, rootMotionTrack: "root.position" });
    const idle = mixer.play(idleClip);
    const run = new AnimationMixer().play(runClip).setWeight(0);
    mixer.crossFade(idle, run, 0.5);
    mixer.update(0.25);

    expect(idle.weight).toBeCloseTo(0.5);
    expect(run.weight).toBeCloseTo(0.5);
    expect(appliedRootMotion.length).toBeGreaterThan(0);
    expect(appliedValues.get("root.position")).toEqual([0.125, 0, 0]);

    const suppressedRootMotion: unknown[] = [];
    const suppressedMixer = new AnimationMixer({ applyRootMotion: (sample) => suppressedRootMotion.push(sample) });
    suppressedMixer.play(runClip);
    suppressedMixer.update(0.4);
    expect(suppressedRootMotion).toEqual([]);

    const eventMixer = new AnimationMixer();
    const attack = eventMixer.play(attackClip).setLoop("once");
    const events = [...eventMixer.update(0.13), ...eventMixer.update(0.3), ...eventMixer.update(0.3)];

    expect(attack.playing).toBe(false);
    expect(events.map((event) => `${event.clipName}:${event.name}`)).toEqual(["attack:active"]);
  });
});
