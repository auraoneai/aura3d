import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AnimationAction,
  AnimationClip,
  AnimationLayer,
  AnimationMixer,
  AnimationTrack
} from "@aura3d/animation";

/**
 * muse3jsparity-PRD E3: every silent no-op path in the mixer/action/track/
 * layer/event surface throws or warns naming its API. Each case below pins
 * one path to its throw/warn contract.
 */

function vectorClip(name: string, duration = 1): AnimationClip {
  return new AnimationClip({
    name,
    duration,
    tracks: [
      new AnimationTrack({
        target: "hero.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: duration, value: [1, 0, 0] }
        ]
      })
    ]
  });
}

let warns: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  warns?.mockRestore();
});

function silenceWarns(): void {
  warns = vi.spyOn(console, "warn").mockImplementation(() => {});
}

function lastWarn(): string {
  return String(warns.mock.calls[warns.mock.calls.length - 1]?.[0] ?? "");
}

describe("E3 mixer no-op audit", () => {
  test("addAction duplicate warns naming AnimationMixer.addAction", () => {
    silenceWarns();
    const mixer = new AnimationMixer();
    const action = mixer.play(vectorClip("idle"));
    mixer.addAction(action);
    expect(lastWarn()).toMatch(/AnimationMixer\.addAction/);
  });

  test("addAction with a non-action throws naming AnimationMixer.addAction", () => {
    const mixer = new AnimationMixer();
    expect(() => mixer.addAction({} as never)).toThrow(/AnimationMixer\.addAction/);
  });

  test("addLayer duplicate warns naming AnimationMixer.addLayer", () => {
    silenceWarns();
    const mixer = new AnimationMixer();
    const layer = new AnimationLayer("base");
    mixer.addLayer(layer);
    mixer.addLayer(layer);
    expect(lastWarn()).toMatch(/AnimationMixer\.addLayer/);
  });

  test("stopAll with no actions warns naming AnimationMixer.stopAll", () => {
    silenceWarns();
    new AnimationMixer().stopAll();
    expect(lastWarn()).toMatch(/AnimationMixer\.stopAll/);
  });

  test("crossFade with a bad duration throws naming AnimationMixer.crossFade", () => {
    const mixer = new AnimationMixer();
    const from = mixer.play(vectorClip("a"));
    const to = new AnimationAction(vectorClip("b"));
    expect(() => mixer.crossFade(from, to, Number.NaN)).toThrow(/AnimationMixer\.crossFade/);
  });

  test("crossFade of an action into itself throws", () => {
    const mixer = new AnimationMixer();
    const action = mixer.play(vectorClip("a"));
    expect(() => mixer.crossFade(action, action, 0.2)).toThrow(/AnimationMixer\.crossFade/);
  });

  test("crossFade with an unregistered source warns naming AnimationMixer.crossFade", () => {
    silenceWarns();
    const mixer = new AnimationMixer();
    const from = new AnimationAction(vectorClip("a")).play();
    const to = new AnimationAction(vectorClip("b"));
    mixer.crossFade(from, to, 0.2);
    expect(lastWarn()).toMatch(/AnimationMixer\.crossFade/);
  });

  test("inertialCrossFade with a non-finite halfLife throws", () => {
    const mixer = new AnimationMixer();
    const from = mixer.play(vectorClip("a"));
    const to = new AnimationAction(vectorClip("b"));
    expect(() => mixer.inertialCrossFade(from, to, Number.POSITIVE_INFINITY)).toThrow(
      /AnimationMixer\.inertialCrossFade/
    );
  });

  test("update with no actions warns once naming AnimationMixer.update", () => {
    silenceWarns();
    const mixer = new AnimationMixer();
    expect(mixer.update(0.1)).toEqual([]);
    expect(mixer.update(0.1)).toEqual([]);
    const named = warns.mock.calls.filter((call) => String(call[0]).includes("AnimationMixer.update"));
    expect(named).toHaveLength(1);
  });

  test("update with a poisoned mixer timeScale throws naming AnimationMixer.update", () => {
    const mixer = new AnimationMixer();
    mixer.play(vectorClip("a"));
    mixer.timeScale = Number.NaN;
    expect(() => mixer.update(0.1)).toThrow(/AnimationMixer\.update/);
  });

  test("update with a poisoned layer weight throws naming AnimationMixer.update", () => {
    const mixer = new AnimationMixer();
    mixer.play(vectorClip("a"));
    const layer = new AnimationLayer("bad");
    layer.weight = -2;
    mixer.addLayer(layer);
    expect(() => mixer.update(0.1)).toThrow(/AnimationMixer\.update/);
  });

  test("onEvent with a non-function throws naming AnimationMixer.onEvent", () => {
    const mixer = new AnimationMixer();
    expect(() => mixer.onEvent(undefined as never)).toThrow(/AnimationMixer\.onEvent/);
  });

  test("setTimeScale with a bad value throws naming AnimationMixer.setTimeScale", () => {
    const mixer = new AnimationMixer();
    expect(() => mixer.setTimeScale(-1)).toThrow(/AnimationMixer\.setTimeScale/);
  });
});

describe("E3 action no-op audit", () => {
  test("play of a zero-duration clip warns naming AnimationAction.play", () => {
    silenceWarns();
    new AnimationAction(new AnimationClip({ name: "empty", duration: 0, tracks: [] })).play();
    expect(lastWarn()).toMatch(/AnimationAction\.play/);
  });

  test("play of a trackless clip warns naming AnimationAction.play", () => {
    silenceWarns();
    new AnimationAction(new AnimationClip({ name: "trackless", duration: 1, tracks: [] })).play();
    expect(lastWarn()).toMatch(/AnimationAction\.play/);
  });

  test("pause while stopped warns naming AnimationAction.pause", () => {
    silenceWarns();
    new AnimationAction(vectorClip("idle")).pause();
    expect(lastWarn()).toMatch(/AnimationAction\.pause/);
  });

  test("seek past the duration warns and clamps, naming AnimationAction.seek", () => {
    silenceWarns();
    const action = new AnimationAction(vectorClip("idle")).play();
    action.seek(9);
    expect(action.time).toBe(1);
    expect(lastWarn()).toMatch(/AnimationAction\.seek/);
    expect(() => action.seek(-1)).toThrow(/AnimationAction\.seek/);
  });

  test("update with poisoned fields throws naming AnimationAction.update", () => {
    const weighted = new AnimationAction(vectorClip("a")).play();
    weighted.weight = -1;
    expect(() => weighted.update(0.1)).toThrow(/AnimationAction\.update/);
    const scaled = new AnimationAction(vectorClip("a")).play();
    scaled.timeScale = Number.NaN;
    expect(() => scaled.update(0.1)).toThrow(/AnimationAction\.update/);
  });
});

describe("E3 layer no-op audit", () => {
  test("add duplicate warns naming AnimationLayer.add", () => {
    silenceWarns();
    const layer = new AnimationLayer("upper");
    const action = new AnimationAction(vectorClip("arm"));
    layer.add(action);
    layer.add(action);
    expect(lastWarn()).toMatch(/AnimationLayer\.add/);
  });

  test("add of a non-action throws naming AnimationLayer.add", () => {
    expect(() => new AnimationLayer("upper").add(undefined as never)).toThrow(/AnimationLayer\.add/);
  });

  test("setWeight with a bad value throws naming AnimationLayer.setWeight", () => {
    expect(() => new AnimationLayer("upper").setWeight(Number.NaN)).toThrow(/AnimationLayer\.setWeight/);
  });

  test("applyWeight with a poisoned weight throws naming AnimationLayer.applyWeight", () => {
    const layer = new AnimationLayer("upper");
    layer.add(new AnimationAction(vectorClip("arm")));
    layer.weight = Number.POSITIVE_INFINITY;
    expect(() => layer.applyWeight()).toThrow(/AnimationLayer\.applyWeight/);
  });

  test("applyWeight with no actions warns naming AnimationLayer.applyWeight", () => {
    silenceWarns();
    new AnimationLayer("empty").applyWeight();
    expect(lastWarn()).toMatch(/AnimationLayer\.applyWeight/);
  });

  test("capturesTarget with an empty target throws naming AnimationLayer.capturesTarget", () => {
    expect(() => new AnimationLayer("upper", { mask: ["hero.arm"] }).capturesTarget("")).toThrow(
      /AnimationLayer\.capturesTarget/
    );
  });
});

describe("E3 track no-op audit", () => {
  test("unknown valueType throws naming the track API", () => {
    expect(
      () =>
        new AnimationTrack({
          target: "hero.position",
          valueType: "nope" as never,
          keyframes: [{ time: 0, value: [0, 0, 0] }]
        })
    ).toThrow(/AnimationTrack/);
  });
});
