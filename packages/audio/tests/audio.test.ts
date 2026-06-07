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
  SceneAudioBridge,
  createAudioTimelineMixSnapshot,
  createAudioWaveform,
  createAudioWaveformPath,
  sampleAudioWaveformAtTime
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
  assert.throws(() => manager.resolve({ ...asset, type: "model" }), /not an audio asset/);
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
