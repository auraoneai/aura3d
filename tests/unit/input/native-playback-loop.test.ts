import { describe, expect, it } from "vitest";
import { InputPlayback, InputRecorder } from "../../../packages/input/src/index";

function recording() {
  const recorder = new InputRecorder();
  recorder.start(100);
  recorder.recordKey("start", true, 100);
  recorder.recordKey("middle", true, 105);
  recorder.recordKey("end", false, 110);
  return recorder.stop(110);
}

describe("input playback looping", () => {
  it("emits every crossed cycle and the partial next cycle in order", () => {
    const playback = new InputPlayback({ loop: true });
    playback.load(recording());
    playback.play();

    expect(playback.update(25).map((event) => event.code)).toEqual([
      "start", "middle", "end",
      "start", "middle", "end",
      "start", "middle"
    ]);
    expect(playback.snapshot()).toMatchObject({ currentTimeMs: 5, loopCount: 2, emittedEvents: 8 });
    expect(playback.update(0)).toEqual([]);
    expect(playback.update(5).map((event) => event.code)).toEqual(["end"]);
  });

  it("starts the next cycle only after an exact loop boundary", () => {
    const playback = new InputPlayback({ loop: true });
    playback.load(recording());
    playback.play();

    expect(playback.update(10).map((event) => event.code)).toEqual(["start", "middle", "end"]);
    expect(playback.snapshot()).toMatchObject({ currentTimeMs: 0, loopCount: 1 });
    expect(playback.update(0).map((event) => event.code)).toEqual(["start"]);
    expect(playback.update(1)).toEqual([]);
  });

  it("rejects an excessive batch without advancing playback", () => {
    const playback = new InputPlayback({ loop: true });
    playback.load(recording());
    playback.play();
    const before = playback.snapshot();

    expect(() => playback.update(1_000_000)).toThrow(/limit/i);
    expect(playback.snapshot()).toEqual(before);
    expect(playback.update(5).map((event) => event.code)).toEqual(["start", "middle"]);
  });

  it("applies speed and seek before crossing a loop boundary", () => {
    const playback = new InputPlayback({ loop: true, speed: 2 });
    playback.load(recording());
    playback.seek(8);
    playback.play();

    expect(playback.update(3).map((event) => event.code)).toEqual(["end", "start"]);
    expect(playback.snapshot()).toMatchObject({ currentTimeMs: 4, loopCount: 1 });
  });

  it("advances empty loops without allocating one event batch per cycle", () => {
    const recorder = new InputRecorder();
    recorder.start(100);
    const playback = new InputPlayback({ loop: true });
    playback.load(recorder.stop(110));
    playback.play();

    expect(playback.update(1_000_000)).toEqual([]);
    expect(playback.snapshot()).toMatchObject({ currentTimeMs: 0, loopCount: 100_000 });
  });

  it("preserves non-looping playback and rejects overflowing time atomically", () => {
    const once = new InputPlayback();
    once.load(recording());
    once.play();
    expect(once.update(30).map((event) => event.code)).toEqual(["start", "middle", "end"]);
    expect(once.snapshot()).toMatchObject({ state: "stopped", currentTimeMs: 10 });
    expect(once.update(0)).toEqual([]);

    const fast = new InputPlayback({ loop: true, speed: 1e308 });
    fast.load(recording());
    fast.play();
    const before = fast.snapshot();
    expect(() => fast.update(2)).toThrow(/limit/i);
    expect(fast.snapshot()).toEqual(before);
    expect(fast.update(0).map((event) => event.code)).toEqual(["start"]);
  });
});
