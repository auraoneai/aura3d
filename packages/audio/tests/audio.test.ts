import assert from "node:assert/strict";
import test from "node:test";
import { Scene } from "@aura3d/scene";
import {
  AudioClip,
  AudioContextManager,
  AudioFileManager,
  AudioListener,
  AudioSource,
  AudioTimelineTrack,
  FootstepPlayer,
  PositionalEmitter,
  SceneAudioBridge,
  applyOcclusionToGain,
  attachFocusPolicy,
  computeDistanceAttenuation,
  computeDopplerShift,
  createAudioTimelineMixSnapshot,
  createAudioWaveformReviewData,
  createAnimationAudioMixer,
  createAudioWaveform,
  createAudioWaveformPath,
  createGameMixer,
  occlusionLowpassFrequency,
  resolveOcclusion,
  sampleAudioWaveformAtTime,
  validateAudioCaptionSync,
  validateEpisodeAudioAssets
} from "../src/index";

class MockParam {
  value = 0;
}

class MockNode {
  connections: unknown[] = [];
  connect(destination: unknown) {
    this.connections.push(destination);
    return destination;
  }
  disconnect() {
    this.connections = [];
  }
}

class MockGain extends MockNode {
  gain = new MockParam();
}

class MockSource extends MockNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

function createMockAudioBuffer(channels: readonly Float32Array[], sampleRate: number): AudioBuffer {
  return {
    duration: channels.length === 0 ? 0 : (channels[0]?.length ?? 0) / sampleRate,
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData(index: number) {
      const channel = channels[index];
      if (!channel) throw new Error(`Unknown channel: ${index}`);
      return channel;
    }
  } as AudioBuffer;
}

test("AudioContextManager unlocks, suspends, resumes, and disposes a mock context", async () => {
  const context = {
    state: "suspended",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    async resume() {
      this.state = "running";
    },
    async suspend() {
      this.state = "suspended";
    },
    async close() {
      this.state = "closed";
    },
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => new MockSource() as unknown as AudioBufferSourceNode,
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  const manager = new AudioContextManager({ context });

  assert.equal(manager.state, "locked");
  await manager.unlock();
  assert.equal(manager.state, "running");
  await manager.suspend();
  assert.equal(manager.state, "suspended");
  await manager.dispose();
  assert.equal(manager.state, "closed");
});

test("AudioSource guards missing clip and tracks play/stop state", () => {
  const sourceNode = new MockSource();
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => sourceNode as unknown as AudioBufferSourceNode,
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  const source = new AudioSource({ context });
  assert.throws(() => source.play(), /without an AudioClip/);

  source.clip = new AudioClip({
    buffer: { duration: 1, numberOfChannels: 1, sampleRate: 44100 } as AudioBuffer
  });
  source.play();
  assert.equal(source.state, "playing");
  assert.equal(sourceNode.started, true);
  source.stop();
  assert.equal(source.state, "stopped");
});

test("SceneAudioBridge syncs listener and spatial source positions from scene nodes", () => {
  const scene = new Scene();
  const listenerNode = scene.createNode("listener");
  const sourceNode = scene.createNode("source");
  scene.root.addChild(listenerNode);
  scene.root.addChild(sourceNode);
  listenerNode.transform.setPosition(1, 2, 3);
  sourceNode.transform.setPosition(4, 5, 6);

  const listener = new AudioListener();
  const spatial = {
    position: { x: 0, y: 0, z: 0 },
    setPosition(position: { readonly x: number; readonly y: number; readonly z: number }) {
      this.position = { ...position };
    }
  };
  const bridge = new SceneAudioBridge(scene);
  bridge.bindListener(listenerNode, listener);
  bridge.bindSource(sourceNode, spatial as never);
  bridge.update();

  assert.deepEqual(listener.position, { x: 1, y: 2, z: 3 });
  assert.deepEqual(spatial.position, { x: 4, y: 5, z: 6 });
});

test("AudioFileManager loads typed audio assets once and caches decoded clips", async () => {
  const decodedBuffer = createMockAudioBuffer([new Float32Array([0, 0.5, -0.5, 0])], 4);
  let fetchCount = 0;
  let decodeCount = 0;
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => new MockSource() as unknown as AudioBufferSourceNode,
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode,
    decodeAudioData: async () => {
      decodeCount++;
      return decodedBuffer;
    }
  };
  const manager = new AudioFileManager({
    context,
    fetch: async (url) => {
      fetchCount++;
      assert.equal(url, "/aura-assets/dialogue.wav");
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
      };
    }
  });
  const asset = {
    kind: "aura-asset-ref",
    id: "line1",
    type: "audio",
    format: "wav",
    url: "/aura-assets/dialogue.wav"
  };

  const [first, second] = await Promise.all([manager.load(asset), manager.load(asset)]);

  assert.equal(first, second);
  assert.equal(first.name, "line1");
  assert.equal(first.duration, 1);
  assert.equal(fetchCount, 1);
  assert.equal(decodeCount, 1);
  assert.equal(manager.getCached(asset), first);
  const selected = await manager.loadFirstSupported(
    [
      { input: "/aura-assets/dialogue.ogg", mimeType: "audio/ogg" },
      { input: asset, mimeType: "audio/wav" }
    ],
    (mimeType) => mimeType === "audio/wav" ? "probably" : ""
  );
  assert.equal(selected, first);
  assert.throws(() => manager.resolve({ ...asset, type: "model" }), /not an audio asset/);
  await assert.rejects(() => manager.loadFirstSupported([{ input: asset, mimeType: "audio/wav" }], () => ""), /No supported audio codec/);
});

test("AudioWaveform computes deterministic peak data and canvas path points", () => {
  const buffer = createMockAudioBuffer([new Float32Array([-1, 1, 0.5, -0.5])], 4);
  const waveform = createAudioWaveform(buffer, { samplesPerPeak: 2 });

  assert.equal(waveform.duration, 1);
  assert.equal(waveform.peakCount, 2);
  assert.deepEqual(waveform.peaks[0], { min: -1, max: 1, rms: 1 });
  assert.deepEqual(waveform.peaks[1], { min: -0.5, max: 0.5, rms: 0.5 });
  assert.deepEqual(sampleAudioWaveformAtTime(waveform, 0.75), waveform.peaks[1]);

  const path = createAudioWaveformPath(waveform, { width: 100, height: 40 });
  assert.equal(path.length, 2);
  assert.equal(path[0]?.x, 0);
  assert.equal(path[1]?.x, 100);
  assert.equal(path[0]?.yMin, 0);
  assert.equal(path[0]?.yMax, 40);
});

test("AudioTimelineTrack edits clips, routes buses, and ducks music under dialogue", () => {
  const dialogue = new AudioTimelineTrack({ id: "dialogue", role: "dialogue" });
  const music = new AudioTimelineTrack({ id: "music", role: "music", volume: 0.8 });
  const sfx = new AudioTimelineTrack({ id: "sfx", role: "sfx" });

  dialogue.addClip({
    id: "line1",
    startTime: 1,
    duration: 2,
    envelope: [
      { time: 0, value: 0 },
      { time: 0.5, value: 1 },
      { time: 2, value: 1 }
    ]
  });
  music.addClip({ id: "bed", startTime: 0, duration: 5 });
  sfx.addClip({ id: "chime", startTime: 1.25, duration: 0.5, volume: 0.5 });

  assert.equal(dialogue.busName, "voice");
  assert.equal(sfx.busName, "sfx");
  assert.equal(dialogue.sampleAt(1.25)[0]?.volume, 0.5);

  const [left, right] = dialogue.splitClip("line1", 2, "line1b");
  assert.equal(left.duration, 1);
  assert.equal(right.startTime, 2);
  assert.equal(right.trimStart, 1);
  assert.equal(dialogue.activeClipsAt(2.25)[0]?.id, "line1b");

  const moved = sfx.moveClip("chime", 1.5);
  assert.equal(moved.startTime, 1.5);
  const trimmed = music.trimClip("bed", 1, 4);
  assert.equal(trimmed.duration, 3);

  const snapshot = createAudioTimelineMixSnapshot([dialogue, music, sfx], 2.25, {
    duckMusicDuringDialogue: true,
    duckingRatio: 0.25,
    masterVolume: 0.9
  });
  const musicBus = snapshot.buses.find((bus) => bus.busName === "music");
  const voiceBus = snapshot.buses.find((bus) => bus.busName === "voice");

  assert.equal(snapshot.dialogueActive, true);
  assert.equal(snapshot.duckingApplied, true);
  assert.equal(musicBus?.ducked, true);
  assert.equal(musicBus?.volume, 0.2);
  assert.equal(voiceBus?.volume, 1);
  assert.deepEqual(snapshot.activeSamples.map((sample) => sample.clipId).sort(), ["bed", "line1b"]);
});

test("animation episode audio readiness reports missing typed audio assets", () => {
  const readiness = validateEpisodeAudioAssets([
    {
      kind: "aura-asset-ref",
      id: "moonGardenMusic",
      type: "audio",
      format: "ogg",
      url: "/aura-assets/moon-garden-music.ogg",
      license: "CC0"
    },
    {
      kind: "aura-asset-ref",
      id: "mikoLine1",
      type: "model",
      format: "glb",
      url: "/aura-assets/miko.glb",
      license: "CC0"
    }
  ], [
    { id: "mikoLine1", role: "dialogue", requireLicense: true },
    { id: "lumaLine1", role: "dialogue", requireLicense: true },
    { id: "moonGardenMusic", role: "music", requireLicense: true }
  ]);

  assert.equal(readiness.ok, false);
  assert.equal(readiness.requiredCount, 3);
  assert.equal(readiness.readyCount, 1);
  assert.deepEqual(readiness.missingAssetIds, ["lumaLine1"]);
  assert.deepEqual(readiness.diagnostics.map((issue) => issue.code), [
    "audio-asset-wrong-type",
    "audio-asset-missing"
  ]);
});

test("animation dialogue audio stems stay aligned with captions within one frame", () => {
  const dialogue = new AudioTimelineTrack({ id: "dialogue", role: "dialogue" });
  dialogue.addClip({ id: "miko-line-1", startTime: 1, duration: 1.5 });
  dialogue.addClip({ id: "luma-line-1", startTime: 3, duration: 1 });

  const synced = validateAudioCaptionSync([dialogue], [
    { id: "caption-1", audioClipId: "miko-line-1", startTime: 1 + 1 / 60, endTime: 2.5 },
    { id: "caption-2", audioClipId: "luma-line-1", startTime: 3, endTime: 4 }
  ], { frameRate: 30, toleranceFrames: 1 });
  const broken = validateAudioCaptionSync([dialogue], [
    { id: "caption-3", audioClipId: "miko-line-1", startTime: 1.25, endTime: 2.5 }
  ], { frameRate: 30, toleranceFrames: 1 });

  assert.equal(synced.ok, true);
  assert.equal(synced.checkedCueCount, 2);
  assert.equal(broken.ok, false);
  assert.equal(broken.issues[0]?.code, "caption-audio-start-out-of-sync");
});

test("animation audio waveform review data and mixer defaults expose route evidence", () => {
  const waveform = createAudioWaveform(createMockAudioBuffer([new Float32Array([-1, 1, 0.5, -0.5])], 4), {
    samplesPerPeak: 2
  });
  const reviewData = createAudioWaveformReviewData([
    { id: "miko-line-1", label: "Miko line 1", startTime: 1, waveform }
  ], { width: 120, height: 48 });
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => new MockSource() as unknown as AudioBufferSourceNode,
    createPanner: () => new MockNode() as unknown as PannerNode,
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  const animationMixer = createAnimationAudioMixer(context, { musicVolume: 0.4 });
  const evidence = animationMixer.evidence({ unlocked: true });

  assert.equal(reviewData.kind, "audio-waveform-review-data");
  assert.equal(reviewData.stemCount, 1);
  assert.equal(reviewData.stems[0]?.path.length, 2);
  assert.deepEqual(evidence.buses.map((bus) => bus.name).sort(), ["ambient", "master", "music", "sfx", "voice"]);
  assert.equal(evidence.buses.find((bus) => bus.name === "music")?.volume, 0.4);
  assert.equal(evidence.unlocked, true);
});

test("distance attenuation matches panner models at the boundaries", () => {
  assert.equal(computeDistanceAttenuation(0.5, { refDistance: 1 }), 1);
  assert.equal(computeDistanceAttenuation(10_000, { maxDistance: 100 }), 0);
  assert.ok(Math.abs(computeDistanceAttenuation(4, { refDistance: 1, rolloffFactor: 1 }) - 1 / 4) < 1e-9);
  assert.equal(computeDistanceAttenuation(55, { refDistance: 10, maxDistance: 100, rolloffFactor: 1, model: "linear" }), 0.5);
  assert.ok(computeDistanceAttenuation(2, { refDistance: 1, rolloffFactor: 2, model: "exponential" }) < 0.26);
});

test("doppler shift is 1 at rest and rises on approach", () => {
  const rest = computeDopplerShift({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  assert.equal(rest, 1);
  const approaching = computeDopplerShift(
    { x: 10, y: 0, z: 0 }, { x: -10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }
  );
  const receding = computeDopplerShift(
    { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }
  );
  assert.ok(approaching > 1);
  assert.ok(receding < 1);
});

test("occlusion helpers clamp and map to gain + lowpass", () => {
  assert.equal(resolveOcclusion(undefined, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 0);
  assert.equal(resolveOcclusion(7, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 1);
  assert.equal(resolveOcclusion(() => 0.5, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), 0.5);
  assert.equal(applyOcclusionToGain(0), 1);
  assert.ok(Math.abs(applyOcclusionToGain(1) - 0.15) < 1e-9);
  assert.equal(occlusionLowpassFrequency(0), 20_000);
  assert.equal(occlusionLowpassFrequency(1), 400);
});

class MockPanner extends MockNode {
  panningModel = "";
  distanceModel = "";
  maxDistance = 0;
  refDistance = 0;
  rolloffFactor = 0;
  positionX = new MockParam();
  positionY = new MockParam();
  positionZ = new MockParam();
}

class MockFilter extends MockNode {
  type = "";
  frequency = new MockParam();
}

function createSpatialContext() {
  const panners: MockPanner[] = [];
  const filters: MockFilter[] = [];
  const sources: MockSource[] = [];
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => {
      const source = new MockSource() as unknown as AudioBufferSourceNode & { playbackRate: { value: number } };
      (source as unknown as { playbackRate: { value: number } }).playbackRate = { value: 1 };
      sources.push(source as unknown as MockSource);
      return source;
    },
    createPanner: () => {
      const panner = new MockPanner();
      panners.push(panner);
      return panner as unknown as PannerNode;
    },
    createBiquadFilter: () => {
      const filter = new MockFilter();
      filters.push(filter);
      return filter as unknown as BiquadFilterNode;
    },
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  return { context, panners, filters, sources };
}

test("PositionalEmitter chains source into filter into panner and reports evidence", () => {
  const { context, panners, filters } = createSpatialContext();
  const emitter = new PositionalEmitter({
    context,
    clip: new AudioClip({ buffer: { duration: 1, numberOfChannels: 1, sampleRate: 44100 } as AudioBuffer }),
    position: { x: 3, y: 0, z: 0 },
    volume: 0.8
  });
  assert.equal(emitter.connected, true);
  assert.equal(panners.length, 1);
  assert.equal(filters.length, 1);
  // source gain feeds the occlusion filter, which feeds the panner.
  assert.equal(filters[0]?.connections[0], panners[0]);

  const evidence = emitter.update({ x: 0, y: 0, z: 0 });
  assert.equal(evidence.kind, "positional-emitter-evidence");
  assert.ok(Math.abs(evidence.attenuationGain - 1 / 3) < 1e-9);
  assert.equal(evidence.dopplerShift, 1);
  assert.equal(evidence.occlusion, 0);
  assert.deepEqual(evidence.position, { x: 3, y: 0, z: 0 });

  emitter.setVelocity({ x: -34.3, y: 0, z: 0 });
  const doppler = emitter.update({ x: 0, y: 0, z: 0 });
  assert.ok(doppler.dopplerShift > 1);
  assert.equal(emitter.source.playbackRate, doppler.dopplerShift);

  emitter.setOcclusion(1);
  assert.equal(emitter.evidence().occlusion, 1);
  emitter.update({ x: 0, y: 0, z: 0 });
  assert.ok(emitter.source.gain.gain.value < 0.8 * (1 / 3) + 1e-9);

  emitter.play();
  assert.equal(emitter.source.state, "playing");
  emitter.dispose();
});

test("PositionalEmitter without panner support still reports math, never fake-connected", () => {
  const context = {
    state: "running",
    destination: new MockNode() as unknown as AudioNode,
    currentTime: 0,
    resume: async () => {},
    suspend: async () => {},
    close: async () => {},
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => new MockSource() as unknown as AudioBufferSourceNode,
    createPanner: () => {
      throw new Error("panner unavailable");
    },
    createBiquadFilter: () => new MockNode() as unknown as BiquadFilterNode,
    createConvolver: () => new MockNode() as unknown as ConvolverNode
  };
  const emitter = new PositionalEmitter({ context, position: { x: 9, y: 0, z: 0 } });
  assert.equal(emitter.connected, false);
  const evidence = emitter.update({ x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(evidence.attenuationGain - 1 / 9) < 1e-9);
  emitter.dispose();
});

test("createGameMixer builds music/sfx/voice buses with dialogue ducking", () => {
  const { context } = createSpatialContext();
  const mixer = createGameMixer(context, { musicVolume: 0.8 });
  assert.equal(mixer.evidence().music.volume, 0.8);
  assert.equal(mixer.evidence().duckingActive, false);

  const ducked = mixer.setDialogueActive(true);
  assert.equal(ducked.duckingActive, true);
  assert.ok(Math.abs(ducked.music.volume - 0.8 * 0.35) < 1e-9);
  // sfx/voice are untouched by dialogue ducking.
  assert.equal(ducked.sfx.volume, 0.9);
  assert.equal(ducked.voice.volume, 1);

  const restored = mixer.setDialogueActive(false);
  assert.equal(restored.duckingActive, false);
  assert.ok(Math.abs(restored.music.volume - 0.8) < 1e-9);

  const muted = mixer.setMuted(true);
  assert.equal(muted.muted, true);
  mixer.setMuted(false);
  assert.throws(() => mixer.setDuckingRatio(2), /between 0 and 1/);
});

test("focus policy ducks on blur and restores on focus without a DOM", () => {
  const { context } = createSpatialContext();
  const mixer = createGameMixer(context);
  const listeners = new Map<string, Array<() => void>>();
  const target = {
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
    }
  };
  const detach = attachFocusPolicy(target, mixer, "duck-on-blur");
  for (const listener of listeners.get("blur") ?? []) listener();
  assert.equal(mixer.evidence().duckingActive, true);
  for (const listener of listeners.get("focus") ?? []) listener();
  assert.equal(mixer.evidence().duckingActive, false);
  detach();
  assert.equal(listeners.get("blur")?.length ?? 0, 0);
  assert.equal(mixer.evidence().duckingActive, false);
});

test("FootstepPlayer round-robins per surface and falls back honestly", () => {
  const player = new FootstepPlayer({ surfaces: { grass: ["step-grass-a", "step-grass-b"] }, fallback: "step-default" });
  assert.equal(player.onPlant({ foot: "left", surface: "grass" }), "step-grass-a");
  assert.equal(player.onPlant({ foot: "right", surface: "grass" }), "step-grass-b");
  assert.equal(player.onPlant({ foot: "left", surface: "grass" }), "step-grass-a");
  assert.equal(player.onPlant({ foot: "left", surface: "metal" }), "step-default");
  assert.equal(player.evidence().plantCount, 4);
  assert.equal(player.evidence().lastCue, "step-default");

  const bare = new FootstepPlayer();
  assert.equal(bare.onPlant({ foot: "left", surface: "grass" }), null);
  assert.equal(bare.evidence().plantCount, 0);
  assert.throws(() => bare.registerSurface("empty", []), /at least one cue/);
});
