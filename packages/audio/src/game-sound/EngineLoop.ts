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
import type { SpatialNode } from "./SpatialVoice";
import { voiceAssetNeedsValidation } from "./Voice";
import type { VoiceAsset, VoiceBufferFor, VoiceBufferLoad, VoicePool, VoiceRecord } from "./Voice";

export interface EngineLayerSpec {
  readonly asset: VoiceAsset;
  readonly rpm: number;
}

interface LayerState {
  readonly rpm: number;
  asset?: VoiceAsset;
  record?: VoiceRecord;
  failed: boolean;
  readonly gain: SoundNodeLike;
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
  readonly bufferFor: VoiceBufferFor;
  /** A fresh, subscriber-cancellable load; the engine owns its cache policy. */
  readonly loadAsset?: VoiceBufferLoad;
  /** Inherited request policy may also require encoded-byte verification. */
  readonly requiresBufferedAsset?: (asset: VoiceAsset) => boolean;
  readonly startVoice: (buffer: AudioBuffer | undefined, input: SoundNodeLike, loop: true, asset?: VoiceAsset) => VoiceRecord | undefined;
}): EngineLoopHandleImpl {
  const { ctx, pool, spatial, busInput, idleRpm, maxRpm, bufferFor, loadAsset, requiresBufferedAsset, startVoice } = options;
  const rpmSpan = Math.max(1, maxRpm - idleRpm);
  const abort = new AbortController();
  let currentRpm = idleRpm;
  let currentLoad = 0;
  let stopped = false;
  let stoppedId = 0;
  let onLayers: LayerState[] = [];
  let offLayers: LayerState[] = [];
  const created: LayerState[] = [];

  const disconnect = (layer: LayerState): void => {
    try { layer.gain.disconnect(); } catch { /* Best-effort node cleanup. */ }
  };
  const release = (layer: LayerState): void => {
    if (layer.record) {
      try { pool.release(layer.record); } catch { /* Continue cleaning other layers. */ }
      layer.record = undefined;
    }
    layer.asset = undefined;
    disconnect(layer);
  };

  const buildSet = (layers: readonly EngineLayerSpec[]): LayerState[] =>
    layers.map((spec) => {
      const gain = gainNodeOf(ctx);
      const state: LayerState = {
        rpm: spec.rpm,
        asset: spec.asset,
        failed: false,
        gain,
        setGainLinear: (v, rampMs) => {
          const g = gain.gain as { value: number; setTargetAtTime?(x: number, t: number, tau: number): void };
          if (rampMs > 0 && g.setTargetAtTime) g.setTargetAtTime(v, ctx.currentTime, rampMs / 3000);
          else g.value = v;
        }
      };
      created.push(state);
      gain.connect(spatial ? spatial.input : busInput);
      const start = (buffer: AudioBuffer | undefined): void => {
        if (stopped) return;
        if (!buffer) { state.failed = true; state.asset = undefined; disconnect(state); return; }
        try {
          state.record = startVoice(buffer, gain, true, state.asset);
          state.asset = undefined;
          if (!state.record) { state.failed = true; disconnect(state); }
        } catch {
          state.failed = true;
          state.asset = undefined;
          disconnect(state);
        }
      };
      const inlineNeedsLoad = spec.asset.buffer !== undefined && requiresBufferedAsset?.(spec.asset) === true;
      const buffer = inlineNeedsLoad || voiceAssetNeedsValidation(spec.asset)
        ? undefined : spec.asset.buffer ?? bufferFor(spec.asset.url, spec.asset);
      if (buffer) start(buffer);
      else if (loadAsset) {
        // Invoke the loader immediately: it snapshots mutable request policy
        // before any asynchronous format probing or decoding can yield.
        try {
          void Promise.resolve(loadAsset(spec.asset, abort.signal)).then((loaded) => {
            start(loaded);
            if (!stopped) apply();
          }, () => { start(undefined); });
        } catch { start(undefined); }
      } else start(undefined);
      return state;
    });

  const mixSet = (layers: LayerState[], rpm: number, masterGain: number) => {
    if (layers.length === 0) return;
    const sorted = [...layers].sort((a, b) => a.rpm - b.rpm);
    const g = gainsForRpm(
      sorted.map((l) => l.rpm),
      rpm
    );
    sorted.forEach((layer, i) => {
      layer.setGainLinear(g[i] * masterGain, 50);
      const rate = clamp(rpm / Math.max(1, layer.rpm), 0.7, 1.4);
      const p = layer.record?.source.playbackRate;
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
  try {
    onLayers = buildSet(options.onLoad);
    offLayers = buildSet(options.offLoad ?? []);
    apply();
  } catch (error) {
    stopped = true;
    abort.abort();
    for (const layer of created) release(layer);
    throw error;
  }

  return {
    get id() {
      return onLayers.find((layer) => layer.record)?.record?.id ?? stoppedId;
    },
    get ended() {
      const layers = [...onLayers, ...offLayers];
      return stopped || (layers.length > 0 && layers.every((layer) => layer.failed));
    },
    setRpm(rpm) {
      if (stopped) return;
      currentRpm = clamp(rpm, 0, idleRpm + rpmSpan * 1.2);
      apply();
    },
    setLoad(load01) {
      if (stopped) return;
      currentLoad = clamp(load01, 0, 1);
      apply();
    },
    setPosition(p) {
      if (stopped) return;
      spatial?.setPosition(p);
    },
    stop(fadeMs = 0) {
      if (stopped) return;
      stopped = true;
      abort.abort();
      stoppedId = onLayers.find((layer) => layer.record)?.record?.id ?? 0;
      for (const layer of [...onLayers, ...offLayers]) {
        try { layer.setGainLinear(0, fadeMs); } catch { /* Still release the layer. */ }
        layer.asset = undefined;
        if (!layer.record || fadeMs <= 0) release(layer);
        else setTimeout(() => release(layer), fadeMs + 30).unref?.();
      }
      onLayers = [];
      offLayers = [];
      created.length = 0;
      if (spatial) {
        const disposeSpatial = (): void => { try { spatial.dispose(); } catch { /* Best-effort cleanup. */ } };
        if (fadeMs <= 0) disposeSpatial();
        else setTimeout(disposeSpatial, fadeMs + 30).unref?.();
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
