/**
 * parity-audio (L9-01/L9-02/L9-03) — the C10 double-attenuation regression plus
 * per-model Web Audio math, cone gain, and the listener→ctx.listener drive.
 *
 * Web Audio spec §6.4/§6.5, verified against Blink `DistanceEffect::Gain` /
 * `ConeEffect::Gain`: the PannerNode owns distance and cone gain whenever the
 * graph is connected, so `PositionalEmitter`'s software gain must NOT multiply
 * attenuation in a second time. The same formulas still run in software when
 * the panner cannot be built (headless), and are always reported as evidence.
 */
import { describe, expect, it } from "vitest";
import {
  AudioClip,
  AudioListener,
  PositionalEmitter,
  SpatialAudio,
  computeConeGain,
  computeDistanceAttenuation,
  type DistanceAttenuationModel,
  type DistanceAttenuationOptions
} from "../../../packages/audio/src";
import { FakeContext, FakeGain, FakePanner } from "./fake-context";
import type { ListenerLike } from "../../../packages/audio/src/game-sound/listenerSync";

const clip = () =>
  new AudioClip({ buffer: { duration: 1, length: 48_000, numberOfChannels: 1, sampleRate: 48_000 } as AudioBuffer });

/** Reference implementation of Web Audio §6.4 — written independently of AU/PositionalEmitter.ts. */
function specDistanceGain(distance: number, options: DistanceAttenuationOptions): number {
  const ref = Math.max(Number.EPSILON, options.refDistance ?? 1);
  const max = options.maxDistance ?? 10_000;
  const f = Math.max(0, options.rolloffFactor ?? 1);
  const model = options.model ?? "inverse";
  if (model === "linear") {
    const dRef = Math.min(ref, max);
    const dMax = Math.max(ref, max);
    if (dRef === dMax) return 1 - f;
    const d = Math.min(Math.max(distance, dRef), dMax);
    return 1 - Math.min(1, f) * ((d - dRef) / (dMax - dRef));
  }
  const d = Math.max(distance, ref);
  if (model === "exponential") return Math.pow(d / ref, -f);
  return ref / (ref + f * (d - ref));
}

const MODELS: readonly DistanceAttenuationModel[] = ["inverse", "linear", "exponential"];
const DISTANCES = [0, 0.5, 1, 2, 4, 8, 16, 33, 64, 128, 500];

describe("computeDistanceAttenuation — Web Audio §6.4 parity", () => {
  for (const model of MODELS) {
    it(`${model} matches the spec formula across a distance sweep`, () => {
      const options: DistanceAttenuationOptions = { model, refDistance: 1, maxDistance: 32, rolloffFactor: 1 };
      for (const d of DISTANCES) {
        expect(computeDistanceAttenuation(d, options), `${model} at d=${d}`).toBeCloseTo(specDistanceGain(d, options), 12);
      }
    });
  }

  it("maxDistance only bounds the linear model (inverse keeps decaying past it)", () => {
    // d >> maxDistance: the old code forced 0 here; the panner does not.
    const far = computeDistanceAttenuation(200, { model: "inverse", refDistance: 1, maxDistance: 10 });
    expect(far).toBeCloseTo(specDistanceGain(200, { model: "inverse", refDistance: 1, maxDistance: 10 }), 12);
    expect(far).toBeGreaterThan(0);
    expect(computeDistanceAttenuation(200, { model: "linear", refDistance: 1, maxDistance: 10 })).toBe(0);
    expect(computeDistanceAttenuation(200, { model: "exponential", refDistance: 1, rolloffFactor: 2 })).toBeCloseTo(1 / 40_000, 9);
  });
});

describe("PositionalEmitter — attenuation applied exactly once (C10 regression)", () => {
  it("connected: the panner owns distance gain; the source gain carries volume only", () => {
    for (const model of MODELS) {
      const ctx = new FakeContext();
      const emitter = new PositionalEmitter({
        context: ctx,
        clip: clip(),
        position: { x: 0, y: 0, z: 0 },
        volume: 0.8,
        attenuation: { model, refDistance: 1, maxDistance: 32, rolloffFactor: 1 }
      });
      expect(emitter.connected).toBe(true);
      const panner = ctx.ofKind<FakePanner>("panner")[0];
      expect(panner.distanceModel, `${model} must reach the panner`).toBe(model);

      const evidence = emitter.update({ x: 4, y: 0, z: 0 });
      const expected = specDistanceGain(4, { model, refDistance: 1, maxDistance: 32, rolloffFactor: 1 });
      expect(evidence.attenuationGain).toBeCloseTo(expected, 12);
      expect(evidence.distanceModel).toBe(model);

      // C10: the gain node must NOT contain attenuation — that would square it
      // with the panner's own distance gain. Connected ⇒ software applies it 0×.
      const gain = emitter.source.gain as unknown as FakeGain;
      expect(gain.gain.value, `${model}: gain must be volume, not volume×attenuation`).toBeCloseTo(0.8, 12);
      emitter.dispose();
    }
  });

  it("headless: no panner → the software gain applies the formula exactly once", () => {
    const broken = new FakeContext();
    broken.createPanner = () => {
      throw new Error("panner unavailable");
    };
    for (const model of MODELS) {
      const emitter = new PositionalEmitter({
        context: broken,
        clip: clip(),
        position: { x: 0, y: 0, z: 0 },
        volume: 0.8,
        attenuation: { model, refDistance: 1, maxDistance: 32, rolloffFactor: 1 }
      });
      expect(emitter.connected).toBe(false);
      const evidence = emitter.update({ x: 4, y: 0, z: 0 });
      const expected = specDistanceGain(4, { model, refDistance: 1, maxDistance: 32, rolloffFactor: 1 });
      const gain = emitter.source.gain as unknown as FakeGain;
      expect(gain.gain.value, `${model}: software fallback applies attenuation once`).toBeCloseTo(0.8 * expected, 12);
      expect(evidence.attenuationGain).toBeCloseTo(expected, 12);
      emitter.dispose();
    }
  });

  it("occlusion still rides the gain node on top of volume (and only once)", () => {
    const ctx = new FakeContext();
    const emitter = new PositionalEmitter({
      context: ctx,
      clip: clip(),
      volume: 0.8,
      attenuation: { model: "inverse", refDistance: 1 }
    });
    emitter.update({ x: 4, y: 0, z: 0 });
    emitter.setOcclusion(1); // fully blocked → 0.15 residual
    const gain = emitter.source.gain as unknown as FakeGain;
    expect(gain.gain.value).toBeCloseTo(0.8 * 0.15, 12);
    emitter.dispose();
  });
});

describe("cone gain (AU-02)", () => {
  it("computeConeGain mirrors the spec cone: full inside, outerGain behind, linear between", () => {
    const cone = { innerAngle: 60, outerAngle: 120, outerGain: 0.2 };
    // Source at origin facing +z; listener positions around it.
    expect(computeConeGain({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 5 }, cone)).toBe(1);
    expect(computeConeGain({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -5 }, cone)).toBe(0.2);
    // 90° off-axis: halfway through the 60–120 cone → x = (90-30)/(60-30) = 2 → wait, compute:
    // halfInner=30, halfOuter=60; angle 45° → x = (45-30)/(60-30) = 0.5 → gain = 0.5 + 0.2*0.5 = 0.6
    expect(
      computeConeGain({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: Math.SQRT1_2 * 5, y: 0, z: Math.SQRT1_2 * 5 }, cone)
    ).toBeCloseTo(0.6, 9);
  });

  it("omni and degenerate orientations give unity gain", () => {
    const at = { x: 3, y: 4, z: 0 };
    expect(computeConeGain({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, at, { innerAngle: 30, outerAngle: 60, outerGain: 0 })).toBe(1);
    expect(computeConeGain({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, at)).toBe(1);
    expect(computeConeGain(at, { x: 1, y: 0, z: 0 }, at, { innerAngle: 30, outerAngle: 60, outerGain: 0 })).toBe(1);
  });

  it("emitter forwards cone + orientation to the panner and reports coneGain once", () => {
    const ctx = new FakeContext();
    const emitter = new PositionalEmitter({
      context: ctx,
      clip: clip(),
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 1 },
      cone: { innerAngle: 60, outerAngle: 120, outerGain: 0.1 },
      attenuation: { model: "linear", refDistance: 1, maxDistance: 64 }
    });
    const panner = ctx.ofKind<FakePanner>("panner")[0];
    expect(panner.coneInnerAngle).toBe(60);
    expect(panner.coneOuterAngle).toBe(120);
    expect(panner.coneOuterGain).toBe(0.1);
    expect(panner.orientationZ.value).toBe(1);

    // Listener in front: cone open → coneGain 1, software gain still volume-only.
    let evidence = emitter.update({ x: 0, y: 0, z: 5 });
    expect(evidence.coneGain).toBe(1);
    const gain = emitter.source.gain as unknown as FakeGain;
    expect(gain.gain.value).toBeCloseTo(1, 9); // volume 1 × occlusion 1, nothing else

    // Listener behind the cone: panner applies 0.1 — software must not.
    evidence = emitter.update({ x: 0, y: 0, z: -5 });
    expect(evidence.coneGain).toBeCloseTo(0.1, 9);
    expect(gain.gain.value, "cone gain lives on the panner, not the gain node").toBeCloseTo(1, 9);

    emitter.setOrientation({ x: 0, y: 0, z: -1 }); // now faces the listener
    expect(emitter.evidence().coneGain).toBe(1);
    expect(panner.orientationZ.value).toBe(-1);
    emitter.dispose();
  });
});

describe("AudioListener — drives ctx.listener (AU-01)", () => {
  it("setTransform ramps positionX…upZ on the bound context listener via syncListener", () => {
    const ctx = new FakeContext();
    ctx.currentTime = 2;
    const listener = new AudioListener({ context: ctx });
    listener.setTransform({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    const native = ctx.listener;
    expect(native.positionX.calls[0]).toEqual({ method: "setTargetAtTime", args: [1, 2, 0.02] });
    expect(native.positionZ.calls[0]?.args[0]).toBe(3);
    expect(native.forwardZ.calls[0]?.args[0]).toBe(-1);
    expect(listener.position).toEqual({ x: 1, y: 2, z: 3 });
    // Repeated frames keep driving — the bridge path (SceneAudioBridge.update)
    // only calls setTransform, so the write must happen inside it.
    listener.setTransform({ x: 4, y: 5, z: 6 });
    expect(native.positionX.calls.at(-1)?.args[0]).toBe(4);
  });

  it("uses the legacy setPosition/setOrientation path when params are absent", () => {
    const ctx = new FakeContext();
    const calls: number[] = [];
    const legacy: ListenerLike = {
      setPosition: (x, y, z) => calls.push(x, y, z),
      setOrientation: (fx, fy, fz, ux, uy, uz) => calls.push(fx, fy, fz, ux, uy, uz)
    };
    (ctx as unknown as { listener: ListenerLike }).listener = legacy;
    const listener = new AudioListener({ context: ctx });
    expect(listener.sync()).toBe("legacy");
    calls.length = 0; // drop the first sync's initial pose
    listener.setTransform({ x: 7, y: 8, z: 9 });
    expect(calls.slice(0, 3)).toEqual([7, 8, 9]);
    expect(calls.slice(3, 9)).toEqual([0, 0, -1, 0, 1, 0]); // forward + up via setOrientation
  });

  it("stays a pure pose holder with no context — the old constructor contract", () => {
    const listener = new AudioListener();
    listener.setTransform({ x: 1, y: 1, z: 1 });
    expect(listener.position).toEqual({ x: 1, y: 1, z: 1 });
    expect(listener.nativeListener).toBeUndefined();
    expect(listener.sync()).toBe("none");
  });
});

describe("SpatialAudio panner options (AU-02)", () => {
  it("wires distanceModel + cone + orientation onto the panner", () => {
    const ctx = new FakeContext();
    const spatial = new SpatialAudio({
      context: ctx,
      position: { x: 1, y: 0, z: 0 },
      orientation: { x: 0, y: 1, z: 0 },
      distanceModel: "exponential",
      refDistance: 2,
      maxDistance: 40,
      rolloffFactor: 0.7,
      coneInnerAngle: 45,
      coneOuterAngle: 90,
      coneOuterGain: 0.25
    });
    const panner = spatial.panner as unknown as FakePanner;
    expect(panner.distanceModel).toBe("exponential");
    expect(panner.refDistance).toBe(2);
    expect(panner.maxDistance).toBe(40);
    expect(panner.rolloffFactor).toBe(0.7);
    expect(panner.coneInnerAngle).toBe(45);
    expect(panner.coneOuterAngle).toBe(90);
    expect(panner.coneOuterGain).toBe(0.25);
    expect(panner.orientationY.value).toBe(1);
    expect(spatial.orientation).toEqual({ x: 0, y: 1, z: 0 });
    spatial.setOrientation({ x: -1, y: 0, z: 0 });
    expect(panner.orientationX.value).toBe(-1);
    spatial.dispose();
    expect(panner.connectedTo.length).toBe(0);
  });
});
