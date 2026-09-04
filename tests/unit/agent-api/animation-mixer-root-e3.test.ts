import { describe, expect, test, vi } from "vitest";
import {
  AnimationAction,
  AnimationClip,
  AnimationLayer,
  AnimationMixer,
  AnimationTrack,
  assignActionToAnimationLayer,
  attachAnimationLayer,
  createAnimationAction,
  createAnimationClip,
  createAnimationDebugOverlay,
  createAnimationEventMarker,
  createAnimationLayer,
  createAnimationMixer,
  createAnimationTrack,
  crossFadeAnimations,
  setAnimationTimeScale,
  subscribeAnimationEvents
} from "@aura3d/engine";

/** muse3jsparity-PRD E3: mixer/action/track/event/timeScale/crossfade/layers all root-reachable. */

function positionClip(name: string, from: [number, number, number], to: [number, number, number]) {
  return createAnimationClip({
    name,
    tracks: [
      createAnimationTrack({
        target: "hero.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: from },
          { time: 1, value: to }
        ]
      })
    ]
  });
}

describe("E3 root animation mixer breadth", () => {
  test("mixer is root-reachable with a live snapshot", () => {
    const mixer = createAnimationMixer();
    expect(mixer).toBeInstanceOf(AnimationMixer);
    expect(mixer.snapshot()).toMatchObject({ timeScale: 1, actionCount: 0 });
  });

  test("action is root-reachable with validated options", () => {
    const clip = positionClip("idle", [0, 0, 0], [0, 1, 0]);
    const action = createAnimationAction(clip, { weight: 0.5, timeScale: 2, loop: "once" });
    expect(action).toBeInstanceOf(AnimationAction);
    expect(action.snapshot()).toMatchObject({ weight: 0.5, timeScale: 2, loopMode: "once", playing: true });
    expect(() => createAnimationAction(clip, { loop: "sideways" as never })).toThrow(/createAnimationAction/);
    expect(() => createAnimationAction(undefined as never)).toThrow(/createAnimationAction/);
    expect(() => createAnimationAction(clip, { weight: -1 })).toThrow(/createAnimationAction/);
  });

  test("track is root-reachable and samples", () => {
    const track = createAnimationTrack({
      target: "hero.position",
      valueType: "vector3",
      keyframes: [
        { time: 0, value: [0, 0, 0] },
        { time: 1, value: [0, 2, 0] }
      ]
    });
    expect(track).toBeInstanceOf(AnimationTrack);
    expect(track.sample(0.5)).toEqual([0, 1, 0]);
    expect(() => createAnimationTrack({ target: "x", valueType: "nope" as never, keyframes: [] })).toThrow(
      /createAnimationTrack/
    );
  });

  test("events are root-reachable: markers fire through subscribed listeners", () => {
    const marker = createAnimationEventMarker({ name: "footstep", time: 0.5 });
    const clip = createAnimationClip({
      name: "walk",
      tracks: [
        createAnimationTrack({
          target: "hero.position",
          valueType: "vector3",
          keyframes: [
            { time: 0, value: [0, 0, 0] },
            { time: 1, value: [0, 0, 1] }
          ]
        })
      ],
      events: [marker]
    });
    const mixer = createAnimationMixer();
    mixer.addAction(createAnimationAction(clip));
    const received: string[] = [];
    const unsubscribe = subscribeAnimationEvents(mixer, (event) => {
      received.push(`${event.clipName}:${event.name}`);
    });
    mixer.update(0.6);
    expect(received).toEqual(["walk:footstep"]);
    unsubscribe();
    mixer.update(0.6);
    expect(received).toEqual(["walk:footstep"]);
    expect(() => subscribeAnimationEvents(mixer, undefined as never)).toThrow(/subscribeAnimationEvents/);
    expect(() => createAnimationEventMarker({ name: "", time: 0 })).toThrow(/createAnimationEventMarker/);
  });

  test("timeScale is root-reachable on mixers and actions", () => {
    const mixer = createAnimationMixer();
    const action = createAnimationAction(positionClip("run", [0, 0, 0], [0, 0, 2]));
    mixer.addAction(action);
    setAnimationTimeScale(mixer, 2);
    mixer.update(0.25);
    expect(action.time).toBeCloseTo(0.5, 10);
    setAnimationTimeScale(action, 0.5);
    mixer.update(0.25);
    expect(action.time).toBeCloseTo(0.75, 10);
    expect(() => setAnimationTimeScale(mixer, -1)).toThrow(/setAnimationTimeScale/);
    expect(() => setAnimationTimeScale({} as never, 1)).toThrow(/setAnimationTimeScale/);
  });

  test("crossfade is root-reachable, linear and inertial", () => {
    const mixer = createAnimationMixer();
    const idle = createAnimationAction(positionClip("idle", [0, 0, 0], [0, 0, 0]), { weight: 1 });
    const run = createAnimationAction(positionClip("run", [1, 1, 1], [2, 2, 2]), { weight: 0 });
    mixer.addAction(idle);
    mixer.addAction(run);
    crossFadeAnimations(mixer, idle, run, 0.4);
    mixer.update(0.2);
    expect(run.weight).toBeGreaterThan(0);
    expect(run.weight).toBeLessThan(1);
    mixer.update(0.2);
    expect(run.weight).toBeCloseTo(1, 10);

    const mixer2 = createAnimationMixer();
    const a = createAnimationAction(positionClip("a", [0, 0, 0], [0, 0, 0]));
    const b = createAnimationAction(positionClip("b", [1, 1, 1], [1, 1, 1]), { weight: 0 });
    mixer2.addAction(a);
    mixer2.addAction(b);
    crossFadeAnimations(mixer2, a, b, 1, { inertial: true, halfLife: 0.1 });
    mixer2.update(0.05);
    expect(b.weight).toBeGreaterThan(0);
    expect(() => crossFadeAnimations(mixer2, a, b, 1, { halfLife: 0.2 })).toThrow(/crossFadeAnimations/);
    expect(() => crossFadeAnimations(mixer2, a, a, 0.2)).toThrow(/different actions/);
    expect(() => crossFadeAnimations({} as never, a, b, 0.2)).toThrow(/crossFadeAnimations/);
  });

  test("layers are root-reachable with bone masks", () => {
    const mixer = createAnimationMixer();
    const body = createAnimationAction(
      createAnimationClip({
        name: "body",
        tracks: [
          createAnimationTrack({
            target: "hero.position",
            valueType: "vector3",
            keyframes: [
              { time: 0, value: [7, 7, 7] },
              { time: 1, value: [7, 7, 7] }
            ]
          })
        ]
      })
    );
    const arm = createAnimationAction(
      createAnimationClip({
        name: "arm",
        tracks: [
          createAnimationTrack({
            target: "hero.arm.rotation",
            valueType: "vector3",
            keyframes: [
              { time: 0, value: [0, 0, 0] },
              { time: 1, value: [1, 0, 0] }
            ]
          }),
          createAnimationTrack({
            target: "hero.position",
            valueType: "vector3",
            keyframes: [
              { time: 0, value: [999, 999, 999] },
              { time: 1, value: [999, 999, 999] }
            ]
          })
        ]
      })
    );
    mixer.addAction(body);
    mixer.addAction(arm);
    const layer = createAnimationLayer("upper-body", { mask: ["hero.arm"] });
    expect(layer).toBeInstanceOf(AnimationLayer);
    attachAnimationLayer(mixer, layer);
    assignActionToAnimationLayer(layer, arm);
    mixer.update(0.1);
    expect(mixer.getValue("hero.position")).toEqual([7, 7, 7]);
    expect(mixer.getValue("hero.arm.rotation")).toEqual([0.1, 0, 0]);
    expect(mixer.snapshot().layers).toEqual([
      { name: "upper-body", weight: 1, additive: false, mask: ["hero.arm"], actions: ["arm"] }
    ]);
    expect(() => createAnimationLayer("")).toThrow(/createAnimationLayer/);
  });

  test("debug overlay is root-reachable and renders states, weights, and events", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const mixer = createAnimationMixer();
      const idle = createAnimationAction(positionClip("idle", [0, 0, 0], [0, 0, 0]));
      const run = createAnimationAction(
        createAnimationClip({
          name: "run",
          tracks: [
            createAnimationTrack({
              target: "hero.position",
              valueType: "vector3",
              keyframes: [
                { time: 0, value: [0, 0, 0] },
                { time: 1, value: [1, 0, 0] }
              ]
            })
          ],
          events: [createAnimationEventMarker({ name: "stride", time: 0.2 })]
        }),
        { weight: 0 }
      );
      mixer.addAction(idle);
      mixer.addAction(run);
      const overlay = createAnimationDebugOverlay({ mixer });
      const box: { innerHTML: string } = { innerHTML: "" };
      overlay.mount(box);
      overlay.update(0.3);
      const snapshot = overlay.snapshot();
      expect(snapshot.states.map((state) => state.clipName).sort()).toEqual(["idle", "run"]);
      expect(snapshot.weights).toMatchObject({ "idle#0": 1, "run#1": 0 });
      expect(snapshot.lastEventCount).toBe(1);
      expect(snapshot.events[0]).toMatchObject({ name: "stride", clipName: "run" });
      const html = overlay.toHTML();
      expect(html).toContain("idle");
      expect(html).toContain("run");
      expect(html).toContain("stride");
      expect(html).toContain("1.000");
      expect(box.innerHTML).toContain("stride");
      expect(() => overlay.update(-1)).toThrow(/AnimationDebugOverlay\.update/);
      overlay.dispose();
      expect(() => overlay.update(0.1)).toThrow(/AnimationDebugOverlay\.update/);
      expect(AnimationClip).toBeTypeOf("function");
    } finally {
      warn.mockRestore();
    }
  });
});
