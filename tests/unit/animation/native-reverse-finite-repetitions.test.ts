import { describe, expect, it } from "vitest";
import { AnimationAction, AnimationClip, AnimationMixer, AnimationTrack, type AnimationEvent } from "@aura3d/animation";

function makeClip(): AnimationClip {
  return new AnimationClip({
    name: "reverse-cycle",
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

describe("finite reverse-repeat terminal boundaries", () => {
  it("signals completion and holds the zero pose on the update that reaches it", () => {
    const mixer = new AnimationMixer();
    const action = mixer.play(makeClip()).setLoop("repeat", 1).seek(1).setTimeScale(-1);
    action.clampWhenFinished = true;
    const finished: number[] = [];
    mixer.addEventListener("finished", event => finished.push(event.direction));

    expect(compact(mixer.update(1))).toEqual([
      "three-quarter:-1:0", "quarter:-1:0", "zero:-1:0"
    ]);
    expect(finished).toEqual([-1]);
    expect(action.time).toBe(0);
    expect(action.playing).toBe(true);
    expect(action.paused).toBe(true);
    expect(mixer.getValue("root.position")).toEqual([0, 0, 0]);
    expect(mixer.update(0)).toEqual([]);
    expect(finished).toEqual([-1]);
  });

  it("matches exact-boundary large and small steps without entering the final seam", () => {
    const large = new AnimationAction(makeClip()).setLoop("repeat", 2).play().seek(1).setTimeScale(-1);
    const small = new AnimationAction(makeClip()).setLoop("repeat", 2).play().seek(1).setTimeScale(-1);
    const largeEvents = large.update(2);
    const smallEvents = Array.from({ length: 8 }, () => small.update(0.25)).flat();

    expect(compact(largeEvents)).toEqual([
      "three-quarter:-1:0", "quarter:-1:0", "zero:-1:0", "end:-1:1",
      "three-quarter:-1:1", "quarter:-1:1", "zero:-1:1"
    ]);
    expect(compact(smallEvents)).toEqual(compact(largeEvents));
    expect(large.time).toBe(0);
    expect(small.time).toBe(0);
    expect(large.playing).toBe(false);
    expect(small.playing).toBe(false);
    expect(large.consumePlaybackSignals()).toEqual({ loopDelta: -1, finishedDirection: -1, eventOverflow: 0 });
    expect(small.consumePlaybackSignals()).toEqual({ loopDelta: -1, finishedDirection: -1, eventOverflow: 0 });
  });

  it("keeps a nonterminal zero visible until the next reverse update enters the seam", () => {
    const action = new AnimationAction(makeClip()).setLoop("repeat", 2).play().seek(1).setTimeScale(-1);
    expect(compact(action.update(1)).slice(-1)).toEqual(["zero:-1:0"]);
    expect(action.time).toBe(0);
    expect(action.playing).toBe(true);
    expect(action.consumePlaybackSignals()).toEqual({ loopDelta: 0, finishedDirection: 0, eventOverflow: 0 });
    expect(compact(action.update(0.25))).toEqual(["end:-1:1", "three-quarter:-1:1"]);
    expect(action.time).toBe(0.75);
  });

  it("treats a negative mixer clock as reverse travel at the exact terminal boundary", () => {
    const mixer = new AnimationMixer();
    const action = mixer.play(makeClip()).setLoop("repeat", 1).seek(0.5);
    const finished: number[] = [];
    mixer.addEventListener("finished", event => finished.push(event.direction));
    mixer.setTimeScale(-1);

    expect(compact(mixer.update(0.5))).toEqual(["quarter:-1:0", "zero:-1:0"]);
    expect(action.time).toBe(0);
    expect(action.playing).toBe(false);
    expect(finished).toEqual([-1]);
  });
});
