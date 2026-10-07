/**
 * game-sound/EngineLoop.ts — §6.8 engine loops.
 *
 * 2–4 RPM-recorded layers crossfaded by RPM (equal-power), per-layer pitch
 * `clamp(rpm / layer.rpm, 0.7, 1.4)`. `setLoad` blends between the on-load
 * and off-load layer sets. Every layer runs `loop: true` and shares one
 * spatial node.
 */

import { clamp, equalPower } from "./types";
import type { SoundGraphContext, SoundNodeLike, Vec3 } from "./types";
import { createSpatialNode, type SpatialNode } from "./SpatialVoice";
import type { VoicePool, VoiceRecord } from "./Voice";

export interface EngineLayerSpec {
  readonly asset: { readonly url: string };
  readonly rpm: number;
}

interface LayerState {
  readonly spec: EngineLayerSpec;
  readonly record: VoiceRecord;
  readonly setGainLinear: (gain: number, rampMs: number) => void;
}

export interface EngineLoopHandleImpl {
  readonly id: number;
  setRpm(rpm: number): void;
  setLoad(load01: number): void;
  setPosition(p: Vec3): void;
  stop(fadeMs?: number): void;
  readonly ended: boolean;
}

const gainNodeOf = (ctx: SoundGraphContext): SoundNodeLike & { gain: { value: number } } =>
  ctx.createGain() as unknown as SoundNodeLike & { gain: { value: number } };

/**
 * Runtime engine loop built from a pool allocation per layer. `poolAlloc`
 * starts a looping buffer voice routed to `input`.
 */
export function createEngineLoop(options: {
  readonly ctx: SoundGraphContext;
  readonly onLoad: readonly EngineLayerSpec[];
  readonly offLoad?: readonly EngineLayerSpec[];
  readonly idleRpm: number;
  readonly maxRpm: number;
  readonly busInput: SoundNodeLike;
  readonly spatial?: SpatialNode;
  readonly pool: VoicePool;
  readonly bufferFor: (url: string) => AudioBuffer | undefined;
  readonly startVoice: (buffer: AudioBuffer | undefined, input: SoundNodeLike, loop: true) => VoiceRecord | undefined;
}): EngineLoopHandleImpl {
  const { ctx } = options;
  const rpmSpan = Math.max(1, options.maxRpm - options.idleRpm);

  const buildSet = (layers: readonly EngineLayerSpec[]): LayerState[] =>
    layers.map((spec) => {
      const gain = gainNodeOf(ctx);
      const input: SoundNodeLike = options.spatial ? options.spatial.input : options.busInput;
      gain.connect(input);
      const record = options.startVoice(
        options.bufferFor(spec.asset.url),
        gain as unknown as SoundNodeLike,
        true
      ) as VoiceRecord;
      return {
        spec,
        record,
        setGainLinear: (v, rampMs) => {
          const g = gain.gain as { value: number; setTargetAtTime?(x: number, t: number, tau: number): void };
          if (rampMs > 0 && g.setTargetAtTime) g.setTargetAtTime(v, ctx.currentTime, rampMs / 3000);
          else g.value = v;
        }
      };
    });

  const onLayers = buildSet(options.onLoad);
  const offLayers = buildSet(options.offLoad ?? []);
  let currentRpm = options.idleRpm;
  let currentLoad = 0;
  let stopped = false;

  const mixSet = (layers: LayerState[], rpm: number, masterGain: number) => {
    if (layers.length === 0) return;
    const sorted = [...layers].sort((a, b) => a.spec.rpm - b.spec.rpm);
    const g = gainsForRpm(
      sorted.map((l) => l.spec.rpm),
      rpm
    );
    sorted.forEach((layer, i) => {
      layer.setGainLinear(g[i] * masterGain, 50);
      const rate = clamp(rpm / Math.max(1, layer.spec.rpm), 0.7, 1.4);
      const p = layer.record.source.playbackRate;
      if (p) {
        if (p.setTargetAtTime) p.setTargetAtTime(rate, ctx.currentTime, 0.05);
        else p.value = rate;
      }
    });
  };

  const apply = () => {
    const loadMix = equalPower(currentLoad);
    // Sets are decorrelated layers → plain equal-power split is the blend law.
    mixSet(onLayers, currentRpm, loadMix.b);
    mixSet(offLayers, currentRpm, loadMix.a);
  };
  apply();

  return {
    get id() {
      return onLayers[0]?.record.id ?? 0;
    },
    get ended() {
      return stopped;
    },
    setRpm(rpm) {
      currentRpm = clamp(rpm, 0, options.idleRpm + rpmSpan * 1.2);
      apply();
    },
    setLoad(load01) {
      currentLoad = clamp(load01, 0, 1);
      apply();
    },
    setPosition(p) {
      options.spatial?.setPosition(p);
    },
    stop(fadeMs = 0) {
      if (stopped) return;
      stopped = true;
      for (const layer of [...onLayers, ...offLayers]) {
        layer.setGainLinear(0, fadeMs);
        const r = layer.record;
        setTimeout(() => options.pool.release(r), fadeMs + 30).unref?.();
      }
    }
  };
}

/** Equal-power-ish gains across N layers sorted by rpm — the two neighbors fade. */
export function gainsForRpm(rpms: readonly number[], rpm: number): number[] {
  if (rpms.length === 0) return [];
  if (rpms.length === 1) return [1];
  if (rpm <= rpms[0]) return rpms.map((_, i) => (i === 0 ? 1 : 0));
  if (rpm >= rpms[rpms.length - 1]) return rpms.map((_, i) => (i === rpms.length - 1 ? 1 : 0));
  let hi = rpms.findIndex((r) => rpm <= r);
  if (hi <= 0) hi = 1;
  const lo = hi - 1;
  const span = Math.max(1e-6, rpms[hi] - rpms[lo]);
  const t = clamp((rpm - rpms[lo]) / span, 0, 1);
  const mix = equalPower(t);
  return rpms.map((_, i) => (i === lo ? mix.a : i === hi ? mix.b : 0));
}
