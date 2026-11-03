import { describe, expect, it, vi } from "vitest";
import { AnimationAction, AnimationClip, AnimationLayer, AnimationMixer, AnimationTrack, collectAnimationEvents, type AnimationEvent, type LoopMode } from "@aura3d/animation";

function clip(): AnimationClip {
  return new AnimationClip({
    name: "cycle",
    duration: 1,
    tracks: [new AnimationTrack({ target: "root.position", valueType: "vector3", keyframes: [
      { time: 0, value: [0, 0, 0] }, { time: 1, value: [1, 0, 0] }
    ] })],
    events: [
      { name: "zero", time: 0 }, { name: "quarter", time: 0.25 },
      { name: "three-quarter", time: 0.75 }, { name: "end", time: 1 }
    ]
  });
}

function compact(events: readonly AnimationEvent[]): string[] {
  return events.map(event => `${event.name}:${event.direction}:${event.loopCount}`);
}

describe("native playback traversal", () => {
  it("delivers every repeated marker in travel order across several wraps", () => {
    const action = new AnimationAction(clip()).play();
    expect(compact(action.update(2.5))).toEqual([
      "quarter:1:0", "three-quarter:1:0", "end:1:0", "zero:1:1",
      "quarter:1:1", "three-quarter:1:1", "end:1:1", "zero:1:2", "quarter:1:2"
    ]);
    expect(action.time).toBeCloseTo(0.5);
    expect(action.consumePlaybackSignals()).toEqual({ loopDelta: 2, finishedDirection: 0, eventOverflow: 0 });
  });

  it("reflects marker direction and delivers each reflected endpoint once", () => {
    const action = new AnimationAction(clip()).setLoop("pingpong").play();
    expect(compact(action.update(2.5))).toEqual([
      "quarter:1:0", "three-quarter:1:0", "end:1:0",
      "three-quarter:-1:1", "quarter:-1:1", "zero:-1:1", "quarter:1:2"
    ]);
    expect(action.time).toBeCloseTo(0.5);
  });

  it.each(["repeat", "pingpong"] as const)("produces the same markers and state for large and small %s steps", (mode: LoopMode) => {
    const large = new AnimationAction(clip()).setLoop(mode).play();
    const small = new AnimationAction(clip()).setLoop(mode).play();
    const largeEvents = large.update(2.5);
    const smallEvents = Array.from({ length: 10 }, () => small.update(0.25)).flat();
    expect(compact(largeEvents)).toEqual(compact(smallEvents));
    expect(large.time).toBeCloseTo(small.time);
    expect(large.consumePlaybackSignals()).toEqual(small.consumePlaybackSignals());
  });

  it.each(["repeat", "pingpong"] as const)("produces the same reverse %s traversal for equivalent steps", (mode: LoopMode) => {
    const large = new AnimationAction(clip()).setLoop(mode).play().setTimeScale(-1);
    const small = new AnimationAction(clip()).setLoop(mode).play().setTimeScale(-1);
    const largeEvents = large.update(2.5);
    const smallEvents = Array.from({ length: 10 }, () => small.update(0.25)).flat();
    expect(compact(largeEvents)).toEqual(compact(smallEvents));
    expect(large.time).toBeCloseTo(small.time);
    expect(large.consumePlaybackSignals()).toEqual(small.consumePlaybackSignals());
  });

  it.each(["repeat", "pingpong"] as const)("keeps %s traversal stable from interior and endpoint seeks", (mode: LoopMode) => {
    for (const start of [0, 0.25, 0.5, 0.75, 1]) {
      for (const direction of [-1, 1]) {
        const large = new AnimationAction(clip()).setLoop(mode).play().seek(start).setTimeScale(direction);
        const small = new AnimationAction(clip()).setLoop(mode).play().seek(start).setTimeScale(direction);
        const largeEvents = large.update(2.5);
        const smallEvents = Array.from({ length: 10 }, () => small.update(0.25)).flat();
        expect(compact(largeEvents), `${mode} from ${start} direction ${direction}`).toEqual(compact(smallEvents));
        expect(large.time).toBeCloseTo(small.time);
        expect(large.consumePlaybackSignals()).toEqual(small.consumePlaybackSignals());
      }
    }
  });

  it.each(["repeat", "pingpong"] as const)("lands on %s boundaries consistently with decimal frame steps", (mode: LoopMode) => {
    const large = new AnimationAction(clip()).setLoop(mode).play();
    const small = new AnimationAction(clip()).setLoop(mode).play();
    const largeEvents = large.update(1);
    const smallEvents = Array.from({ length: 10 }, () => small.update(0.1)).flat();
    expect(compact(largeEvents)).toEqual(compact(smallEvents));
    expect(large.time).toBeCloseTo(small.time);
    expect(large.consumePlaybackSignals()).toEqual(small.consumePlaybackSignals());
  });

  it("finishes at the correct reflected boundary and excludes the final repeat seam entry", () => {
    const pong = new AnimationAction(clip()).setLoop("pingpong", 2).play();
    pong.clampWhenFinished = true;
    expect(compact(pong.update(5)).slice(-1)).toEqual(["zero:-1:1"]);
    expect(pong.time).toBe(0);
    expect(pong.paused).toBe(true);
    expect(pong.consumePlaybackSignals()).toMatchObject({ loopDelta: 1, finishedDirection: 1 });

    const repeat = new AnimationAction(clip()).setLoop("repeat", 2).play();
    expect(compact(repeat.update(5)).slice(-2)).toEqual(["three-quarter:1:1", "end:1:1"]);
    expect(repeat.time).toBe(1);
    expect(repeat.playing).toBe(false);
    expect(repeat.consumePlaybackSignals()).toMatchObject({ loopDelta: 1, finishedDirection: 1 });
  });

  it("bounds callback work and surfaces the exact number of omitted occurrences", () => {
    const mixer = new AnimationMixer();
    const action = mixer.play(clip());
    action.maxEventCatchUp = 3;
    const dropped: number[] = [];
    mixer.addEventListener("overflow", event => dropped.push(event.dropped));
    expect(compact(mixer.update(1000))).toEqual(["quarter:1:0", "three-quarter:1:0", "end:1:0"]);
    expect(dropped).toEqual([3997]);
    expect(action.time).toBe(0);
    expect(mixer.update(0)).toEqual([]);
    expect(dropped).toEqual([3997]);
  });

  it("accounts for a billion wraps without iterating the playhead", () => {
    const action = new AnimationAction(clip()).setLoop("pingpong").play();
    action.maxEventCatchUp = 2;
    expect(compact(action.update(1_000_000_000))).toEqual(["quarter:1:0", "three-quarter:1:0"]);
    expect(action.consumePlaybackSignals()).toEqual({ loopDelta: 1_000_000_000, finishedDirection: 0, eventOverflow: 2_999_999_998 });
    expect(action.time).toBe(0);
  });

  it("clamps finite repetitions even when the requested step would exceed safe crossing counts", () => {
    const action = new AnimationAction(clip()).setLoop("once").play();
    expect(action.update(1e30).map(event => event.name)).toEqual(["quarter", "three-quarter", "end"]);
    expect(action.time).toBe(1);
    expect(action.consumePlaybackSignals().finishedDirection).toBe(1);
  });

  it("rejects invalid traversal inputs and hard limits configured catch-up", () => {
    const action = new AnimationAction(clip()).play();
    action.maxEventCatchUp = 65_537;
    expect(() => action.update(1)).toThrow(/maxEventCatchUp/);
    expect(() => collectAnimationEvents([{ name: "bad", time: 2 }], "c", 0, 1, 1, "once")).toThrow(/marker time/);
    expect(() => collectAnimationEvents([], "c", NaN, 1, 1, "once")).toThrow(/finite times/);
  });

  it("orders markers sharing an instant deterministically in both directions", () => {
    const markers = [{ name: "é", time: 0.5 }, { name: "z", time: 0.5 }, { name: "a", time: 0.5 }];
    expect(collectAnimationEvents(markers, "clip", 0, 1, 1, "once").events.map(event => event.name)).toEqual(["a", "z", "é"]);
    expect(collectAnimationEvents(markers, "clip", 1, 0, 1, "once").events.map(event => event.name)).toEqual(["a", "z", "é"]);
  });

  it("halts motion while paused or stopped, rejects invalid limits, and handles zero-duration clips", () => {
    const mixer = new AnimationMixer();
    const action = mixer.play(clip());
    mixer.update(0.25);
    action.pause();
    expect(mixer.update(2)).toEqual([]);
    expect(action.time).toBe(0.25);
    action.stop();
    expect(mixer.update(2)).toEqual([]);
    expect(mixer.getValue("root.position")).toBeUndefined();
    action.play();
    action.maxEventCatchUp = -1;
    expect(() => mixer.update(1)).toThrow(/maxEventCatchUp/);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const empty = new AnimationAction(new AnimationClip({ name: "empty", duration: 0, tracks: [] })).play();
    expect(empty.update(100)).toEqual([]);
    expect(empty.time).toBe(0);
    warn.mockRestore();
  });

  it("advances timed fades on mixer time and accumulates signed reverse root motion", () => {
    const motion: number[] = [];
    const mixer = new AnimationMixer({ consumeRootMotion: sample => motion.push(sample.delta[0]) }, { applyRootMotion: true });
    const action = mixer.play(clip());
    action.fadeTo(0.5, 1).setTimeScale(-1);
    mixer.update(0.5);
    expect(action.weight).toBeCloseTo(0.75);
    expect(motion[0]).toBeCloseTo(-0.5);
    mixer.update(0.5);
    expect(action.weight).toBeCloseTo(0.5);
    expect(motion[1]).toBeCloseTo(-0.5);
  });
});

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("deterministic animation state restoration", () => {
  it("restores reflected direction, finite loop progress, fades, and undrained signals", () => {
    const source = new AnimationAction(clip()).setLoop("pingpong", 3).play();
    source.clampWhenFinished = true;
    source.maxEventCatchUp = 3;
    source.fadeTo(0.2, 4);
    source.update(1.25);

    const saved = jsonRoundTrip(source.serialize());
    const restored = new AnimationAction(clip()).restore(saved);
    expect(restored.snapshot()).toEqual(source.snapshot());
    expect(restored.consumePlaybackSignals()).toEqual(source.consumePlaybackSignals());

    for (const delta of [0.2, 0.7, 0.4, 0.8]) {
      expect(restored.update(delta)).toEqual(source.update(delta));
      expect(restored.consumePlaybackSignals()).toEqual(source.consumePlaybackSignals());
      expect(restored.snapshot()).toEqual(source.snapshot());
    }
    expect(restored.paused).toBe(true);
    expect(restored.playing).toBe(true);
    expect(restored.time).toBe(1);
  });

  it("encodes unlimited repetition in JSON and preserves reverse repeat endpoints", () => {
    const source = new AnimationAction(clip()).setLoop("repeat").play().seek(1).setTimeScale(-1);
    source.update(1);
    const saved = jsonRoundTrip(source.serialize());
    const restored = new AnimationAction(clip()).restore(saved);
    expect(restored.repetitions).toBe(Infinity);
    expect(restored.time).toBe(0);
    for (const delta of [0.25, 0.75, 1.25]) {
      expect(restored.update(delta)).toEqual(source.update(delta));
      expect(restored.consumePlaybackSignals()).toEqual(source.consumePlaybackSignals());
      expect(restored.snapshot()).toEqual(source.snapshot());
    }
  });

  it("retains an unrepresentable pending overflow across JSON serialization", () => {
    const source = new AnimationAction(clip()).play();
    source.maxEventCatchUp = 0;
    source.update(Number.MAX_SAFE_INTEGER);
    const saved = jsonRoundTrip(source.serialize());
    expect(saved.state!.signals.eventOverflow).toBeNull();
    const restored = new AnimationAction(clip()).restore(saved);
    expect(restored.consumePlaybackSignals()).toEqual(source.consumePlaybackSignals());
    expect(restored.consumePlaybackSignals().eventOverflow).toBe(0);
  });

  it("integrates and restores a warp that reverses direction without losing markers", () => {
    const make = () => new AnimationAction(clip()).play().seek(0.5).warp(-2, 2, 1);
    const large = make();
    const small = make();
    const largeEvents = large.update(1);
    const smallEvents = Array.from({ length: 4 }, () => small.update(0.25)).flat();
    expect(compact(largeEvents)).toEqual(compact(smallEvents));
    expect(largeEvents.length).toBeGreaterThan(0);
    expect(large.time).toBeCloseTo(small.time);
    expect(large.timeScale).toBe(2);

    const source = make();
    source.update(0.3);
    const restored = new AnimationAction(clip()).restore(jsonRoundTrip(source.serialize()));
    expect(restored.consumePlaybackSignals()).toEqual(source.consumePlaybackSignals());
    for (const delta of [0.2, 0.3, 0.4]) {
      expect(restored.update(delta)).toEqual(source.update(delta));
      expect(restored.consumePlaybackSignals()).toEqual(source.consumePlaybackSignals());
      expect(restored.snapshot()).toEqual(source.snapshot());
    }
  });

  it("freezes an unfinished warp at the exact finite-playback endpoint", () => {
    const make = () => {
      const action = new AnimationAction(clip()).setLoop("once").play().seek(0.25).warp(0.25, 2, 2);
      action.clampWhenFinished = true;
      return action;
    };
    const large = make();
    const small = make();
    const events = large.update(3);
    const incremental = Array.from({ length: 30 }, () => small.update(0.1)).flat();
    expect(events).toEqual(incremental);
    expect(large.time).toBe(1);
    expect(large.paused).toBe(true);
    expect(small.paused).toBe(true);
    expect(large.snapshot().state!.warp!.elapsed).toBeCloseTo(small.snapshot().state!.warp!.elapsed, 10);
    const restored = new AnimationAction(clip()).restore(jsonRoundTrip(large.serialize()));
    restored.play();
    large.play();
    expect(restored.update(0.2)).toEqual(large.update(0.2));
    expect(restored.snapshot()).toEqual(large.snapshot());
  });

  it("freezes warp progress while paused and pauses on a warp to zero", () => {
    const action = new AnimationAction(clip()).play().warp(1, 0, 1);
    action.pause();
    action.update(0.5);
    expect(action.snapshot().state!.warp!.elapsed).toBe(0);
    const restored = new AnimationAction(clip()).restore(jsonRoundTrip(action.serialize()));
    action.play();
    restored.play();
    expect(restored.update(1)).toEqual(action.update(1));
    expect(action.time).toBeCloseTo(0.5);
    expect(action.paused).toBe(true);
    expect(restored.snapshot()).toEqual(action.snapshot());
  });

  it("cancels a prior warp when synchronizing to another action", () => {
    const leader = new AnimationAction(clip()).play().seek(0.75).setTimeScale(-0.5);
    const follower = new AnimationAction(clip()).play().warp(1, 3, 2);
    follower.update(0.25);
    follower.synchronizePlayback(leader);
    expect(follower.snapshot().state!.warp).toBeNull();
    expect(follower.update(0.5)).toEqual(leader.update(0.5));
    expect(follower.time).toBeCloseTo(leader.time);
  });

  it("restores a paused or stopped action without accidentally restarting it", () => {
    for (const stopped of [false, true]) {
      const source = new AnimationAction(clip()).play().seek(0.4).fadeTo(0.25, 2);
      source.update(0.2);
      if (stopped) source.stop();
      else source.pause();
      const restored = new AnimationAction(clip()).restore(jsonRoundTrip(source.serialize()));
      expect(restored.update(0.5)).toEqual(source.update(0.5));
      expect(restored.snapshot()).toEqual(source.snapshot());
      restored.play();
      source.play();
      expect(restored.update(0.3)).toEqual(source.update(0.3));
      expect(restored.snapshot()).toEqual(source.snapshot());
    }
  });

  it("restores duplicate-named actions, layer membership, fade weights, and bound output", () => {
    function setup() {
      const poses: unknown[] = [];
      const mixer = new AnimationMixer({ setAnimationValue: (_target, value) => poses.push(value) });
      const first = new AnimationAction(clip());
      const second = new AnimationAction(clip());
      mixer.addAction(first);
      mixer.addAction(second);
      const layer = new AnimationLayer("body", { weight: 0.8, mask: ["root"] });
      layer.add(second);
      layer.add(first);
      mixer.addLayer(layer);
      return { mixer, first, second, layer, poses };
    }

    const source = setup();
    source.first.play().setWeight(0.8);
    source.second.play().seek(0.25).setWeight(0.2);
    source.mixer.crossFade(source.first, source.second, 2);
    source.mixer.setTimeScale(0.75);
    source.mixer.update(0.6);
    expect(() => source.mixer.serialize()).toThrow(/target|callback/i);
    const saved = jsonRoundTrip(source.mixer.serialize({ externalTarget: "rebind" }));

    const restored = setup();
    restored.mixer.restore(saved);
    expect(restored.mixer.snapshot()).toEqual(source.mixer.snapshot());
    const sourceSignals: string[] = [];
    const restoredSignals: string[] = [];
    for (const [mixer, signals] of [[source.mixer, sourceSignals], [restored.mixer, restoredSignals]] as const) {
      mixer.addEventListener("loop", event => signals.push(`loop:${event.loopDelta}`));
      mixer.addEventListener("finished", event => signals.push(`finished:${event.direction}`));
    }
    for (const delta of [0.2, 0.5, 1, 0.6]) {
      expect(restored.mixer.update(delta)).toEqual(source.mixer.update(delta));
      expect(restored.mixer.getValue("root.position")).toEqual(source.mixer.getValue("root.position"));
      expect(restored.poses.at(-1)).toEqual(source.poses.at(-1));
      expect(restored.mixer.snapshot()).toEqual(source.mixer.snapshot());
      expect(restoredSignals).toEqual(sourceSignals);
    }
    // applyWeight uses each layer's captured base weight, not the current action weight.
    source.layer.applyWeight();
    restored.layer.applyWeight();
    expect(restored.first.weight).toBe(source.first.weight);
    expect(restored.second.weight).toBe(source.second.weight);
  });

  it("restores an in-flight inertial crossfade and its action references", () => {
    function setup() {
      const mixer = new AnimationMixer();
      const from = new AnimationAction(clip()).play();
      const to = new AnimationAction(clip());
      mixer.addAction(from);
      mixer.addAction(to);
      return { mixer, from, to };
    }
    const source = setup();
    source.mixer.inertialCrossFade(source.from, source.to, 0.3);
    source.mixer.update(0.2);
    const restored = setup();
    restored.mixer.restore(jsonRoundTrip(source.mixer.serialize()));
    for (const delta of [0.1, 0.25, 0.5, 1.5]) {
      expect(restored.mixer.update(delta)).toEqual(source.mixer.update(delta));
      expect(restored.mixer.snapshot()).toEqual(source.mixer.snapshot());
    }
  });

  it("restores old action and mixer snapshots with explicit fresh-playback defaults", () => {
    const legacyAction = {
      clipName: "cycle", duration: 1, time: 0.5, weight: 0.75, timeScale: -1,
      playing: true, paused: false, loopMode: "pingpong" as const
    };
    const action = new AnimationAction(clip()).restore(legacyAction);
    expect(action).toMatchObject({ time: 0.5, weight: 0.75, timeScale: -1, playing: true, paused: false, repetitions: Infinity });
    expect(compact(action.update(0.25))).toEqual(["quarter:-1:0"]);

    const mixer = new AnimationMixer();
    const mixerAction = new AnimationAction(clip());
    mixer.addAction(mixerAction);
    mixer.restore({ timeScale: 0.5, actionCount: 1, actions: [legacyAction], layers: [], values: {}, applyErrors: [] });
    expect(mixer.timeScale).toBe(0.5);
    expect(mixerAction.time).toBe(0.5);
    expect(mixerAction.repetitions).toBe(Infinity);
    expect(compact(mixer.update(0.5))).toEqual(["quarter:-1:0"]);
  });

  it("rejects mismatched clips, malformed state, and nonserializable marker payloads", () => {
    const source = new AnimationAction(clip()).play();
    source.update(0.5);
    const saved = jsonRoundTrip(source.serialize());
    const differentClip = new AnimationClip({
      name: "cycle", duration: 1,
      tracks: [new AnimationTrack({ target: "root.position", valueType: "vector3", keyframes: [
        { time: 0, value: [0, 0, 0] }, { time: 1, value: [2, 0, 0] }
      ] })],
      events: clip().events
    });
    expect(() => new AnimationAction(differentClip).restore(saved)).toThrow(/clip.*identity|identity.*clip/i);

    for (const corrupt of [
      (value: any) => { value.state.loopsCompleted = -1; },
      (value: any) => { value.state.pingPongForward = "yes"; },
      (value: any) => { value.state.fade = { duration: 1, elapsed: 2, startWeight: 1, targetWeight: 0 }; },
      (value: any) => { value.state.warp = { duration: 0, elapsed: 0, from: 1, to: 2 }; },
      (value: any) => { value.state.version = 99; },
      (value: any) => { value.state.callback = () => {}; },
      (value: any) => { value.active = false; },
      (value: any) => { value.enabled = false; }
    ]) {
      const invalid = jsonRoundTrip(saved);
      corrupt(invalid);
      const destination = new AnimationAction(clip()).play().seek(0.3);
      const before = destination.snapshot();
      expect(() => destination.restore(invalid)).toThrow();
      expect(destination.snapshot()).toEqual(before);
    }

    const callbackClip = new AnimationClip({
      name: "callback", duration: 1, tracks: [],
      events: [{ name: "marker", time: 0.5, payload: { callback: () => {} } }]
    });
    expect(() => new AnimationAction(callbackClip).serialize()).toThrow(/serializ|callback|function/i);
    const cyclic: any = {};
    cyclic.self = cyclic;
    const cycleClip = new AnimationClip({
      name: "cycle-payload", duration: 1, tracks: [],
      events: [{ name: "marker", time: 0.5, payload: cyclic }]
    });
    expect(() => new AnimationAction(cycleClip).serialize()).toThrow(/cycle/i);
    const modified = clip();
    let invoked = false;
    (modified.tracks as any).map = () => { invoked = true; return []; };
    expect(() => new AnimationAction(modified).serialize()).toThrow(/serializ|array/i);
    expect(invoked).toBe(false);
  });

  it("rejects negative zero rather than silently changing it during JSON capture", () => {
    const action = new AnimationAction(clip()).play().setTimeScale(-0);
    expect(() => action.serialize()).toThrow(/negative zero|-0/i);
    const mixer = new AnimationMixer();
    mixer.addAction(new AnimationAction(clip()));
    mixer.setTimeScale(-0);
    expect(() => mixer.serialize()).toThrow(/negative zero|-0/i);
  });

  it("rejects callbacks and inconsistent mixer state before mutating any action", () => {
    const source = new AnimationMixer();
    source.addAction(new AnimationAction(clip()).play());
    source.addAction(new AnimationAction(clip()).play().seek(0.5));
    const unsubscribeMarker = source.onEvent(() => {});
    expect(() => source.serialize()).toThrow(/callback|listener/i);
    unsubscribeMarker();
    const unsubscribeLoop = source.addEventListener("loop", () => {});
    expect(() => source.serialize()).toThrow(/callback|listener/i);
    unsubscribeLoop();

    const saved = jsonRoundTrip(source.serialize());
    const destination = new AnimationMixer();
    destination.addAction(new AnimationAction(clip()).play().seek(0.25));
    destination.addAction(new AnimationAction(clip()).play().seek(0.75));
    const before = destination.snapshot();
    const invalid = jsonRoundTrip(saved);
    (invalid.actions[1] as any).state.loopsCompleted = -1;
    expect(() => destination.restore(invalid)).toThrow();
    expect(destination.snapshot()).toEqual(before);
    expect(() => new AnimationMixer().restore(saved)).toThrow(/action/i);
  });

  it("fails closed on mismatched target, layer, transition, and numeric state", () => {
    const source = new AnimationMixer({ setAnimationValue: () => {} }, { applyRootMotion: true });
    const first = new AnimationAction(clip()).play();
    const second = new AnimationAction(clip()).play();
    source.addAction(first);
    source.addAction(second);
    const layer = new AnimationLayer("body", { mask: ["root"] });
    layer.add(first);
    source.addLayer(layer);
    source.inertialCrossFade(first, second, 0.3);
    const saved = jsonRoundTrip(source.serialize({ externalTarget: "rebind" }));

    const makeDestination = (rootMotion = true) => {
      const mixer = new AnimationMixer({ setAnimationValue: () => {} }, { applyRootMotion: rootMotion });
      const a = new AnimationAction(clip()).play().seek(0.2);
      const b = new AnimationAction(clip()).play().seek(0.7);
      mixer.addAction(a);
      mixer.addAction(b);
      const targetLayer = new AnimationLayer("body", { mask: ["root"] });
      targetLayer.add(a);
      mixer.addLayer(targetLayer);
      return mixer;
    };
    expect(() => makeDestination(false).restore(saved)).toThrow(/options/i);
    for (const corrupt of [
      (value: any) => { value.state.target.setAnimationValue = false; },
      (value: any) => { value.state.layers[0].actionIndices = [1]; },
      (value: any) => { value.state.layers[0].baseWeights = [-1]; },
      (value: any) => { value.state.inertialTransition.from = 2; },
      (value: any) => { value.state.inertialTransition.to = value.state.inertialTransition.from; },
      (value: any) => { value.timeScale = NaN; },
      (value: any) => { value.unserializable = () => {}; }
    ]) {
      const invalid = jsonRoundTrip(saved);
      corrupt(invalid);
      const destination = makeDestination();
      const before = destination.snapshot();
      expect(() => destination.restore(invalid)).toThrow();
      expect(destination.snapshot()).toEqual(before);
    }
  });

  it("preserves external root-motion configuration and compares subsequent motion", () => {
    function setup() {
      const deltas: number[] = [];
      const mixer = new AnimationMixer(
        { consumeRootMotion: sample => deltas.push(sample.delta[0]) },
        { applyRootMotion: true, rootMotionScale: 2 }
      );
      mixer.addAction(new AnimationAction(clip()));
      return { mixer, deltas };
    }
    const source = setup();
    const initial = {
      clipName: "cycle", duration: 1, time: 0.6, weight: 1, timeScale: -1,
      playing: true, paused: false, loopMode: "repeat" as const
    };
    const initialState = { timeScale: 1, actionCount: 1, actions: [initial], layers: [], values: {}, applyErrors: [] };
    source.mixer.restore(initialState);
    source.mixer.update(0.2);
    const saved = jsonRoundTrip(source.mixer.serialize({ externalTarget: "rebind" }));
    const restored = setup();
    restored.mixer.restore(saved);
    for (const delta of [0.3, 0.8, 0.5]) {
      expect(restored.mixer.update(delta)).toEqual(source.mixer.update(delta));
      expect(restored.deltas.at(-1)).toBeCloseTo(source.deltas.at(-1)!);
      expect(restored.mixer.getValue("root.position")).toEqual(source.mixer.getValue("root.position"));
    }
  });

  it("requires a quiescent mixer and leaves external callbacks and target ownership intact", () => {
    let saved: ReturnType<AnimationMixer["serialize"]>;
    let targetCalls = 0;
    let mixer: AnimationMixer;
    mixer = new AnimationMixer({
      setAnimationValue: () => {
        targetCalls++;
        expect(() => mixer.serialize({ externalTarget: "rebind" })).toThrow(/during an update/i);
        expect(() => mixer.restore(saved)).toThrow(/during an update/i);
      }
    });
    mixer.addAction(new AnimationAction(clip()).play());
    saved = mixer.serialize({ externalTarget: "rebind" });
    expect(targetCalls).toBe(0);
    mixer.restore(saved);
    expect(targetCalls).toBe(0);
    mixer.update(0.25);
    expect(targetCalls).toBe(1);
  });
});
