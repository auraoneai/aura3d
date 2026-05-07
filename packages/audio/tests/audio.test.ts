import assert from "node:assert/strict";
import test from "node:test";
import { Scene } from "@galileo3d/scene";
import { AudioClip, AudioContextManager, AudioListener, AudioSource, SceneAudioBridge } from "../src/index";

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
