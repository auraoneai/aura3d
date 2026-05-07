import { describe, expect, it } from "vitest";
import { Ray, Vector3 } from "@galileo3d/math";
import { Scene } from "@galileo3d/scene";
import {
  ActionMap,
  GamepadDevice,
  GestureRecognizer,
  InputSnapshot,
  InputSystem,
  InteractionSystem,
  pickingRayFromCamera
} from "@galileo3d/input";
import {
  AudioClip,
  type AudioContextLike,
  AudioContextManager,
  AudioSystem,
  AudioMixer,
  AudioListener,
  AudioSource,
  FilterEffect,
  ReverbEffect,
  SceneAudioBridge,
  SpatialAudio
} from "@galileo3d/audio";
import { BehaviorHost, BehaviorSystem, deserializeGraph, serializeGraph, validateGraph, VisualGraphExecutor, type VisualGraph } from "@galileo3d/scripting";
import {
  CommandHistory,
  CreateNodeCommand,
  DeleteNodeCommand,
  EditorRuntime,
  HierarchyModel,
  InspectorModel,
  MaterialVariantWorkflow,
  PickingService,
  PlayModeBridge,
  RotateGizmo,
  ScaleGizmo,
  Selection,
  SetPropertyCommand,
  TransformCommand,
  TranslateGizmo
} from "@galileo3d/editor-runtime";

class MockParam {
  value = 0;
}

class MockNode {
  readonly connections: unknown[] = [];
  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }
  disconnect(): void {
    this.connections.length = 0;
  }
}

class MockGain extends MockNode {
  gain = new MockParam();
}

class MockFilter extends MockNode {
  type: BiquadFilterType = "lowpass";
  frequency = new MockParam();
  Q = new MockParam();
}

class MockConvolver extends MockNode {
  buffer: AudioBuffer | null = null;
}

class MockPanner extends MockNode {
  panningModel: PanningModelType = "HRTF";
  distanceModel: DistanceModelType = "inverse";
  maxDistance = 0;
  refDistance = 0;
  rolloffFactor = 0;
  positionX = new MockParam();
  positionY = new MockParam();
  positionZ = new MockParam();
}

class MockSource extends MockNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

function createMockAudioContext(sourceNode = new MockSource()): AudioContextLike {
  let state = "suspended";
  const context: AudioContextLike = {
    get state() {
      return state;
    },
    destination: new MockNode() as unknown as AudioDestinationNode,
    currentTime: 0,
    resume: async () => {
      state = "running";
    },
    suspend: async () => {
      state = "suspended";
    },
    close: async () => {
      state = "closed";
    },
    createGain: () => new MockGain() as unknown as GainNode,
    createBufferSource: () => sourceNode as unknown as AudioBufferSourceNode,
    createPanner: () => new MockPanner() as unknown as PannerNode,
    createBiquadFilter: () => new MockFilter() as unknown as BiquadFilterNode,
    createConvolver: () => new MockConvolver() as unknown as ConvolverNode
  };
  return context;
}

describe("input runtime contracts", () => {
  it("produces stable key transitions, normalized pointer buttons, action alternatives, and axes", () => {
    const input = new InputSystem();
    const actions = new ActionMap();
    actions.bind("jump", [
      { type: "keyboard", code: "Space" },
      { type: "pointer", button: 0 }
    ]);
    actions.bind("editor.undo", [{ type: "keyboard-chord", codes: ["ControlLeft", "KeyZ"] }]);
    actions.bindAxis("moveX", [{ type: "keyboard-axis", negative: "KeyA", positive: "KeyD", scale: 2 }]);
    input.actions.bind("jump", [{ type: "keyboard", code: "Space" }]);
    input.actions.bindAxis("moveX", [{ type: "keyboard-axis", negative: "KeyA", positive: "KeyD", scale: 2 }]);

    input.keyboard.keyDown({ code: "Space" });
    input.keyboard.keyDown({ code: "ControlLeft" });
    input.keyboard.keyDown({ code: "KeyZ" });
    input.pointer.down({ clientX: 5, clientY: 7, button: 0 });
    input.keyboard.keyDown({ code: "KeyD" });
    let snapshot = input.update();

    expect(snapshot.key("Space")).toMatchObject({ pressed: true, down: true, released: false });
    expect(actions.pressed("jump", snapshot)).toBe(true);
    expect(actions.pressed("editor.undo", snapshot)).toBe(true);
    expect(actions.down("editor.undo", snapshot)).toBe(true);
    expect(actions.axis("moveX", snapshot)).toBe(2);
    expect(input.actions.pressed("jump")).toBe(true);
    expect(input.actions.axis("moveX")).toBe(2);

    input.endFrame();
    snapshot = input.update();
    expect(snapshot.key("Space")).toMatchObject({ pressed: false, down: true, released: false });

    input.keyboard.keyUp({ code: "Space" });
    input.keyboard.keyUp({ code: "KeyZ" });
    snapshot = input.update();
    expect(snapshot.key("Space")).toMatchObject({ pressed: false, down: false, released: true });
    expect(actions.released("editor.undo", snapshot)).toBe(true);
  });

  it("creates camera picking rays and emits interaction events without mutating scene targets", () => {
    const scene = new Scene();
    const camera = scene.createPerspectiveCamera({ aspect: 1 });
    scene.root.addChild(camera);
    camera.setViewport({ x: 0, y: 0, width: 100, height: 100 });

    const ray = pickingRayFromCamera(camera, 50, 50);
    expect(ray.direction.equals(new Vector3(0, 0, -1), 1e-6)).toBe(true);

    const target = scene.createNode("target");
    target.transform.setPosition(1, 2, 3);
    const events: string[] = [];
    const interaction = new InteractionSystem(
      () => new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)),
      () => [{ id: "target", bounds: { min: [-1, -1, 0], max: [1, 1, 1] } }]
    );
    interaction.subscribe((event) => events.push(event.type));

    const down = new InputSnapshot({ pointer: { buttons: new Map([[0, { down: true, pressed: false, released: false }]]) } });
    const hit = interaction.update(down);
    const up = new InputSnapshot({ pointer: { buttons: new Map() }, previousPointerButtons: new Set([0]) });
    interaction.update(up);

    expect(hit?.target.id).toBe("target");
    expect(events).toEqual(["hover-enter", "pointer-down", "click"]);
    expect(target.transform.position).toEqual([1, 2, 3]);
  });

  it("normalizes gamepad dead zones and recognizes tap, pan, and pinch gestures", () => {
    const gamepads = new GamepadDevice();
    const first = gamepads.poll([
      {
        id: "pad",
        index: 0,
        connected: true,
        axes: [0.05, -0.5],
        buttons: [{ pressed: false, value: 0.8 }]
      }
    ]);
    const second = gamepads.poll([
      {
        id: "pad",
        index: 0,
        connected: true,
        axes: [0.2, 0],
        buttons: [{ pressed: false, value: 0 }]
      }
    ]);

    expect(first[0]?.axes).toEqual([0, -0.5]);
    expect(first[0]?.buttons[0]).toEqual({ down: true, pressed: true, released: false });
    expect(second[0]?.axes).toEqual([0.2, 0]);
    expect(second[0]?.buttons[0]).toEqual({ down: false, pressed: false, released: true });

    const gestures = new GestureRecognizer();
    const pan = gestures.update(
      new InputSnapshot({
        pointer: { x: 10, y: 20, deltaX: 3, deltaY: 4, buttons: new Map([[0, { down: true, pressed: true, released: false }]]) }
      })
    );
    const tap = gestures.update(new InputSnapshot({ pointer: { x: 10, y: 20 }, previousPointerButtons: new Set([0]) }));
    gestures.update(new InputSnapshot({ pointer: { touches: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 10, y: 0 }] } }));
    const pinch = gestures.update(new InputSnapshot({ pointer: { touches: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 20, y: 0 }] } }));

    expect(pan).toEqual([{ type: "pan", deltaX: 3, deltaY: 4 }]);
    expect(tap).toEqual([{ type: "tap", x: 10, y: 20 }]);
    expect(pinch).toEqual([{ type: "pinch", scale: 2 }]);
  });
});

describe("audio runtime contracts", () => {
  it("unlocks, suspends, resumes, and disposes a browser-like audio context", async () => {
    const manager = new AudioContextManager({ context: createMockAudioContext() });

    expect(manager.state).toBe("locked");
    await manager.unlock();
    expect(manager.state).toBe("running");
    await manager.suspend();
    expect(manager.state).toBe("suspended");
    await manager.dispose();
    expect(manager.state).toBe("closed");
  });

  it("keeps audio system disposal safe when no browser audio context is available", async () => {
    const system = new AudioSystem();

    expect(system.contextManager.state).toBe("locked");
    await system.dispose();
    expect(system.contextManager.state).toBe("locked");
  });

  it("tracks clip playback state and routes scene listener/source transforms", () => {
    const sourceNode = new MockSource();
    const source = new AudioSource({ context: createMockAudioContext(sourceNode) });
    expect(() => source.play()).toThrow(/without an AudioClip/);

    source.clip = new AudioClip({ buffer: { duration: 1, numberOfChannels: 1, sampleRate: 44100 } as AudioBuffer });
    source.loop = true;
    source.setVolume(0.25);
    source.play();
    expect(source.state).toBe("playing");
    expect(sourceNode.started).toBe(true);
    source.stop();
    expect(source.state).toBe("stopped");
    source.play();
    source.dispose();
    expect(source.state).toBe("stopped");
    expect(sourceNode.stopped).toBe(true);

    const scene = new Scene();
    const listenerNode = scene.createNode("listener");
    const sourceSceneNode = scene.createNode("source");
    scene.root.addChild(listenerNode);
    scene.root.addChild(sourceSceneNode);
    listenerNode.transform.setPosition(1, 2, 3);
    sourceSceneNode.transform.setPosition(4, 5, 6);
    const listener = new AudioListener();
    const spatial = {
      position: { x: 0, y: 0, z: 0 },
      setPosition(position: { readonly x: number; readonly y: number; readonly z: number }) {
        this.position = { ...position };
      }
    };
    const bridge = new SceneAudioBridge(scene);
    bridge.bindListener(listenerNode, listener);
    bridge.bindSource(sourceSceneNode, spatial as never);
    bridge.update();

    expect(listener.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(spatial.position).toEqual({ x: 4, y: 5, z: 6 });
  });

  it("routes mixer buses and validates filter and reverb effects", () => {
    const context = createMockAudioContext();
    const mixer = new AudioMixer(context);
    const music = mixer.createBus("music");

    expect(mixer.getBus("music")).toBe(music);
    expect(() => mixer.createBus("music")).toThrow(/already exists/);

    music.setVolume(0.5);
    expect((music.output as unknown as MockGain).gain.value).toBe(0.5);
    music.mute();
    expect((music.output as unknown as MockGain).gain.value).toBe(0);
    music.mute(false);
    expect((music.output as unknown as MockGain).gain.value).toBe(0.5);
    expect(() => music.setVolume(-1)).toThrow(/non-negative/);

    const filter = new FilterEffect(context, "highpass");
    filter.setFrequency(880);
    filter.setQ(1.25);
    expect((filter.input as unknown as MockFilter).type).toBe("highpass");
    expect((filter.input as unknown as MockFilter).frequency.value).toBe(880);
    expect((filter.input as unknown as MockFilter).Q.value).toBe(1.25);
    expect(() => filter.setFrequency(0)).toThrow(/positive/);
    expect(() => filter.setQ(-1)).toThrow(/non-negative/);

    const impulse = { duration: 0.1 } as AudioBuffer;
    const reverb = new ReverbEffect(context);
    reverb.setImpulse(impulse);
    expect((reverb.input as unknown as MockConvolver).buffer).toBe(impulse);

    filter.connect(music.input);
    expect((filter.output as unknown as MockFilter).connections).toContain(music.input);
    filter.dispose();
    reverb.dispose();
    mixer.dispose();
  });

  it("updates spatial panner parameters and disconnects on disposal", () => {
    const context = createMockAudioContext();
    const spatial = new SpatialAudio({
      context,
      position: { x: 1, y: 2, z: 3 },
      maxDistance: 50,
      refDistance: 2,
      rolloffFactor: 0.5
    });
    const panner = spatial.panner as unknown as MockPanner;

    expect(panner.positionX.value).toBe(1);
    expect(panner.positionY.value).toBe(2);
    expect(panner.positionZ.value).toBe(3);
    expect(panner.maxDistance).toBe(50);
    expect(panner.refDistance).toBe(2);
    expect(panner.rolloffFactor).toBe(0.5);

    spatial.setPosition({ x: -4, y: 5, z: 6 });
    expect(panner.positionX.value).toBe(-4);
    expect(panner.positionY.value).toBe(5);
    expect(panner.positionZ.value).toBe(6);

    spatial.dispose();
    expect(panner.connections).toEqual([]);
  });
});

describe("scripting runtime contracts", () => {
  it("runs behavior lifecycle phases, captures errors, and honors disabled hosts", async () => {
    const calls: string[] = [];
    const host = new BehaviorHost();
    host.attach({
      onStart: () => {
        calls.push("start");
      },
      onFixedUpdate: () => {
        calls.push("fixed");
      },
      onUpdate: () => {
        calls.push("update");
      }
    });
    const disabled = new BehaviorHost();
    disabled.attach({
      enabled: false,
      onUpdate: () => {
        calls.push("disabled");
      }
    });
    const failing = new BehaviorHost();
    failing.attach({ onUpdate: () => { throw new Error("script boom"); } });

    const system = new BehaviorSystem();
    system.registerHost(host);
    system.registerHost(disabled);
    system.registerHost(failing);

    await system.fixedUpdate({ fixedDeltaSeconds: 1 / 60 });
    await system.update({ deltaSeconds: 1 / 30 });
    await system.update({ deltaSeconds: 1 / 30 });

    expect(calls).toEqual(["fixed", "start", "update", "update"]);
    expect(system.errors.map((error) => error.error).filter((error): error is Error => error instanceof Error).map((error) => error.message)).toContain("script boom");

    const disposableHost = new BehaviorHost();
    const disposableBehavior = {
      onDestroy: () => {
        calls.push("destroy");
      }
    };
    disposableHost.attach(disposableBehavior);
    expect(disposableHost.detach(disposableBehavior)).toBe(true);
    disposableHost.attach(disposableBehavior);
    await disposableHost.destroy();
    expect(disposableHost.list()).toEqual([]);
    expect(calls).toContain("destroy");
    expect(() => disposableHost.attach({})).toThrow(/destroyed/i);
  });

  it("validates, serializes, and executes visual graphs in dependency order", () => {
    const graph: VisualGraph = {
      nodes: [
        {
          id: "sum",
          kind: "add",
          ports: [
            { id: "in", direction: "input", type: "number" },
            { id: "out", direction: "output", type: "number" }
          ]
        },
        { id: "a", kind: "const", data: { value: 2 }, ports: [{ id: "out", direction: "output", type: "number" }] },
        { id: "b", kind: "const", data: { value: 3 }, ports: [{ id: "out", direction: "output", type: "number" }] },
        { id: "log", kind: "log", ports: [{ id: "in", direction: "input", type: "number" }] }
      ],
      edges: [
        { fromNode: "a", fromPort: "out", toNode: "sum", toPort: "in" },
        { fromNode: "b", fromPort: "out", toNode: "sum", toPort: "in" },
        { fromNode: "sum", fromPort: "out", toNode: "log", toPort: "in" }
      ]
    };

    expect(validateGraph(graph)).toEqual([]);
    const serialized = serializeGraph(graph);
    const restored = deserializeGraph(serialized);
    const result = new VisualGraphExecutor().execute(restored);

    expect(result.values.get("sum")).toBe(5);
    expect(result.values.get("log")).toBe(5);
    expect(result.executionOrder).toEqual(["a", "b", "sum", "log"]);
    expect(() =>
      validateGraph({
        nodes: [
          { id: "dup", kind: "const", ports: [{ id: "out", direction: "output", type: "number" }] },
          { id: "dup", kind: "const", ports: [{ id: "out", direction: "output", type: "number" }] }
        ],
        edges: []
      })
    ).not.toThrow();
    expect(
      validateGraph({
        nodes: [
          { id: "dup", kind: "const", ports: [{ id: "out", direction: "output", type: "number" }] },
          { id: "dup", kind: "const", ports: [{ id: "out", direction: "output", type: "number" }] }
        ],
        edges: []
      })
    ).toContain("Duplicate node id: dup");
    expect(
      validateGraph({
        nodes: [
          { id: "title", kind: "const", data: { value: "hello" }, ports: [{ id: "out", direction: "output", type: "string" }] },
          { id: "enabled", kind: "const", data: { value: true }, ports: [{ id: "out", direction: "output", type: "boolean" }] },
          { id: "data", kind: "const", data: { value: { id: 1 } }, ports: [{ id: "out", direction: "output", type: "object" }] },
          { id: "log", kind: "log", ports: [{ id: "in", direction: "input", type: "string" }] }
        ],
        edges: [{ fromNode: "enabled", fromPort: "out", toNode: "log", toPort: "in" }]
      })
    ).toContain("Port type mismatch: enabled.out -> log.in");
    const typedGraph: VisualGraph = {
      nodes: [
        { id: "title", kind: "const", data: { value: "hello" }, ports: [{ id: "out", direction: "output", type: "string" }] },
        { id: "log", kind: "log", ports: [{ id: "in", direction: "input", type: "string" }] }
      ],
      edges: [{ fromNode: "title", fromPort: "out", toNode: "log", toPort: "in" }]
    };
    expect(new VisualGraphExecutor().execute(deserializeGraph(serializeGraph(typedGraph))).values.get("log")).toBe("hello");
    expect(() =>
      new VisualGraphExecutor().execute({
        nodes: [
          {
            id: "a",
            kind: "add",
            ports: [
              { id: "in", direction: "input", type: "number" },
              { id: "out", direction: "output", type: "number" }
            ]
          },
          {
            id: "b",
            kind: "add",
            ports: [
              { id: "in", direction: "input", type: "number" },
              { id: "out", direction: "output", type: "number" }
            ]
          }
        ],
        edges: [
          { fromNode: "a", fromPort: "out", toNode: "b", toPort: "in" },
          { fromNode: "b", fromPort: "out", toNode: "a", toPort: "in" }
        ]
      })
    ).toThrow(/cycle/i);
  });

  it("dispatches behavior events through services and binds host targets", async () => {
    const events: string[] = [];
    const target = { id: "script-target", x: 0 };
    const host = new BehaviorHost({ target });
    host.attach({
      onStart: (context) => {
        const log = context.getService<string[]>("events");
        log?.push(`start:${(context.target as typeof target).id}`);
      },
      onUpdate: (context) => {
        const bound = context.target as typeof target;
        bound.x += context.deltaSeconds;
        context.getService<string[]>("events")?.push(`update:${bound.x}`);
      }
    });
    const system = new BehaviorSystem();
    system.setService("events", events);
    system.registerHost(host);

    await system.update({ deltaSeconds: 2 });

    expect(target.x).toBe(2);
    expect(events).toEqual(["start:script-target", "update:2"]);
  });
});

describe("editor runtime contracts", () => {
  it("executes commands, undo, redo, selection pruning, picking, and translate gizmo edits", async () => {
    const target = { position: { x: 0, y: 0, z: 0 } };
    const history = new CommandHistory();

    await history.execute(new TransformCommand(target, { position: { x: 1, y: 2, z: 3 } }));
    expect(target.position).toEqual({ x: 1, y: 2, z: 3 });
    await history.undo();
    expect(target.position).toEqual({ x: 0, y: 0, z: 0 });
    await history.redo();
    expect(target.position).toEqual({ x: 1, y: 2, z: 3 });

    await history.execute(new TransformCommand(target, { position: { x: 2, y: 2, z: 3 } }));
    await history.execute(new TransformCommand(target, { position: { x: 3, y: 2, z: 3 } }));
    expect(history.undoDepth).toBe(1);
    expect(target.position).toEqual({ x: 3, y: 2, z: 3 });
    await history.undo();
    expect(target.position).toEqual({ x: 0, y: 0, z: 0 });
    await history.redo();
    expect(target.position).toEqual({ x: 3, y: 2, z: 3 });

    const selection = new Selection();
    const changes: unknown[] = [];
    selection.subscribe((change) => changes.push(change));
    selection.set(["a", "b"]);
    selection.prune((id) => id !== "a");
    expect(selection.current()).toEqual(["b"]);
    expect(changes).toHaveLength(2);

    const nodes: string[] = [];
    const container = {
      add: (node: string) => nodes.push(node),
      remove: (node: string) => {
        const index = nodes.indexOf(node);
        if (index >= 0) nodes.splice(index, 1);
      }
    };
    const commandHistory = new CommandHistory();
    await commandHistory.execute(new CreateNodeCommand(container, "node-a"));
    await commandHistory.execute(new DeleteNodeCommand(container, "node-a"));
    expect(nodes).toEqual([]);
    await commandHistory.undo();
    expect(nodes).toEqual(["node-a"]);

    const model = { transform: { visible: true } };
    await commandHistory.execute(new SetPropertyCommand(model, ["transform", "visible"], false));
    expect(model.transform.visible).toBe(false);
    await commandHistory.undo();
    expect(model.transform.visible).toBe(true);

    const scene = new Scene();
    const node = scene.createNode("editable");
    scene.root.addChild(node);
    const picking = new PickingService();
    picking.addTarget({ id: "editable", node, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } });
    expect(picking.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)))?.target.node).toBe(node);

    const gizmo = new TranslateGizmo(commandHistory);
    gizmo.setTarget(node);
    await gizmo.drag({ axis: "x", delta: 2 });
    expect(node.transform.position[0]).toBe(2);
    await commandHistory.undo();
    expect(node.transform.position[0]).toBe(0);

    const rotate = new RotateGizmo(commandHistory);
    rotate.setTarget(node);
    await rotate.drag({ axis: "z", delta: 0.25 });
    expect(node.transform.rotation[2]).toBeGreaterThan(0.24);
    await commandHistory.undo();
    expect(node.transform.rotation[2]).toBe(0);

    const scale = new ScaleGizmo(commandHistory);
    scale.setTarget(node);
    await scale.drag({ axis: "uniform", delta: 1 });
    expect(node.transform.scale).toEqual([2, 2, 2]);
    await commandHistory.undo();
    expect(node.transform.scale).toEqual([1, 1, 1]);
  });

  it("rolls back failed editor commands without polluting undo history", async () => {
    const state = { value: 0 };
    const history = new CommandHistory();

    await expect(
      history.execute({
        name: "partial failure",
        execute: () => {
          state.value = 1;
          throw new Error("command failed");
        },
        undo: () => {
          state.value = 0;
        }
      })
    ).rejects.toThrow(/command failed/);

    expect(state.value).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it("snapshots and restores a scene in play mode and exposes nested inspector data", () => {
    const runtime = new EditorRuntime();
    expect(runtime.mode).toBe("edit");

    const scene = new Scene();
    const node = scene.createNode("play-target");
    scene.root.addChild(node);
    node.transform.setPosition(1, 2, 3);

    const bridge = new PlayModeBridge({
      capture: () => [...node.transform.position] as [number, number, number],
      restore: (snapshot: [number, number, number]) => {
        node.transform.setPosition(...snapshot);
      }
    });

    bridge.enter();
    runtime.setMode("play");
    node.transform.setPosition(9, 8, 7);
    expect(node.transform.position).toEqual([9, 8, 7]);
    expect(() => bridge.enter()).toThrow(/already active/);

    bridge.exit();
    runtime.setMode("edit");
    expect(node.transform.position).toEqual([1, 2, 3]);
    expect(runtime.mode).toBe("edit");

    const inspector = new InspectorModel();
    const properties = inspector.describe({
      name: "play-target",
      visible: true,
      transform: {
        x: node.transform.position[0],
        y: node.transform.position[1]
      }
    });

    expect(properties.find((property) => property.path.join(".") === "transform")?.editable).toBe(false);
    expect(properties.find((property) => property.path.join(".") === "transform.x")).toMatchObject({
      type: "number",
      value: 1,
      editable: true
    });

    runtime.dispose();
    expect(() => runtime.setMode("play")).toThrow(/disposed/);
  });

  it("owns play-mode bridge transitions and restores snapshots on exit or dispose", () => {
    const scene = new Scene();
    const node = scene.createNode("runtime-play-target");
    scene.root.addChild(node);
    node.transform.setPosition(1, 0, 0);
    const bridge = new PlayModeBridge({
      capture: () => [...node.transform.position] as [number, number, number],
      restore: (snapshot: [number, number, number]) => {
        node.transform.setPosition(...snapshot);
      }
    });
    const runtime = new EditorRuntime();

    runtime.enterPlayMode(bridge);
    expect(runtime.mode).toBe("play");
    node.transform.setPosition(5, 0, 0);
    runtime.pausePlayMode();
    expect(runtime.mode).toBe("paused");
    runtime.resumePlayMode();
    expect(runtime.mode).toBe("play");
    runtime.exitPlayMode();
    expect(runtime.mode).toBe("edit");
    expect(node.transform.position).toEqual([1, 0, 0]);

    runtime.enterPlayMode(bridge);
    node.transform.setPosition(9, 0, 0);
    runtime.exitPlayMode({ restore: false });
    expect(node.transform.position).toEqual([9, 0, 0]);

    runtime.enterPlayMode(bridge);
    node.transform.setPosition(12, 0, 0);
    runtime.dispose();
    expect(node.transform.position).toEqual([9, 0, 0]);
    expect(() => runtime.enterPlayMode(bridge)).toThrow(/disposed/);
  });

  it("guards edit command execution while play mode is active", async () => {
    const runtime = new EditorRuntime();
    const target = { transform: { visible: true } };
    runtime.selection.set(["node-a"]);
    runtime.setTool("translate");
    await runtime.executeCommand(new SetPropertyCommand(target, ["transform", "visible"], false));
    expect(target.transform.visible).toBe(false);
    expect(runtime.snapshot()).toMatchObject({
      mode: "edit",
      activeTool: "translate",
      selection: ["node-a"],
      canUndo: true,
      canRedo: false,
      undoDepth: 1,
      redoDepth: 0
    });
    await runtime.undo();
    expect(target.transform.visible).toBe(true);
    expect(runtime.snapshot()).toMatchObject({ canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1 });
    await runtime.redo();
    expect(target.transform.visible).toBe(false);

    const values: string[] = [];
    await runtime.executeTransaction([
      { name: "push-a", execute: () => { values.push("a"); }, undo: () => { values.pop(); } },
      { name: "push-b", execute: () => { values.push("b"); }, undo: () => { values.pop(); } }
    ]);
    expect(values).toEqual(["a", "b"]);
    expect(runtime.history.undoDepth).toBe(2);

    const bridge = new PlayModeBridge({
      capture: () => ({ visible: target.transform.visible, values: [...values] }),
      restore: (snapshot: { readonly visible: boolean; readonly values: readonly string[] }) => {
        target.transform.visible = snapshot.visible;
        values.splice(0, values.length, ...snapshot.values);
      }
    });
    runtime.enterPlayMode(bridge);
    expect(runtime.snapshot()).toMatchObject({ mode: "play", activeTool: "translate", selection: ["node-a"] });
    expect(() => runtime.setTool("rotate")).toThrow(/edit mode/);
    await expect(runtime.executeCommand(new SetPropertyCommand(target, ["transform", "visible"], true))).rejects.toThrow(/edit mode/);
    await expect(runtime.executeTransaction([{ name: "bad", execute: () => { values.push("bad"); }, undo: () => { values.pop(); } }])).rejects.toThrow(/edit mode/);
    await expect(runtime.undo()).rejects.toThrow(/edit mode/);
    await expect(runtime.redo()).rejects.toThrow(/edit mode/);
    expect(target.transform.visible).toBe(false);
    expect(values).toEqual(["a", "b"]);

    runtime.exitPlayMode();
    await runtime.undo();
    expect(values).toEqual([]);
    expect(runtime.snapshot()).toMatchObject({ mode: "edit", activeTool: "translate", canUndo: true, canRedo: true });
    expect(() => runtime.setTool("   ")).toThrow(/tool name/);
  });

  it("prunes deleted selections through the editor runtime owner and blocks pruning during play mode", () => {
    const runtime = new EditorRuntime();
    runtime.selection.set(["alive", "deleted", 42]);

    runtime.pruneSelection((id) => id !== "deleted");
    expect(runtime.snapshot().selection).toEqual(["alive", 42]);

    const bridge = new PlayModeBridge({
      capture: () => runtime.snapshot().selection,
      restore: () => {}
    });
    runtime.enterPlayMode(bridge);
    expect(() => runtime.pruneSelection((id) => id === "alive")).toThrow(/edit mode/);
    expect(runtime.snapshot().selection).toEqual(["alive", 42]);
  });

  it("exposes runtime-owned inspector and hierarchy data bound to current selection", () => {
    const runtime = new EditorRuntime();
    const scene = new Scene();
    const parent = scene.createNode("parent");
    const child = scene.createNode("child");
    const hidden = scene.createNode("hidden-child");
    hidden.visible = false;
    scene.root.addChild(parent);
    parent.addChild(child);
    parent.addChild(hidden);
    runtime.selection.set([child.id]);

    const inspectorProperties = runtime.inspect({
      name: child.name,
      visible: child.visible,
      transform: {
        x: child.transform.position[0],
        y: child.transform.position[1],
        z: child.transform.position[2]
      }
    });
    const hierarchy = runtime.describeHierarchy(scene.root);
    const flat = runtime.flattenHierarchy(scene.root);
    const standaloneHierarchy = new HierarchyModel().describe(scene.root, new Set([parent.id]));

    expect(inspectorProperties.find((property) => property.path.join(".") === "transform")?.editable).toBe(false);
    expect(inspectorProperties.find((property) => property.path.join(".") === "transform.z")).toMatchObject({
      type: "number",
      value: 0,
      editable: true
    });
    expect(() => runtime.inspector.createSetPropertyCommand({ transform: { z: 0 } }, ["transform"], 1)).toThrow(/not editable/);
    expect(hierarchy).toMatchObject({ id: scene.root.id, name: scene.root.name, depth: 0, childCount: 1, selected: false });
    expect(hierarchy.children[0]).toMatchObject({ id: parent.id, name: "parent", depth: 1, childCount: 2, selected: false });
    expect(hierarchy.children[0]?.children[0]).toMatchObject({ id: child.id, name: "child", depth: 2, visible: true, selected: true });
    expect(hierarchy.children[0]?.children[1]).toMatchObject({ id: hidden.id, name: "hidden-child", depth: 2, visible: false, selected: false });
    expect(flat.map((node) => node.name)).toEqual([scene.root.name, "parent", "child", "hidden-child"]);
    expect(standaloneHierarchy.children[0]?.selected).toBe(true);
    runtime.dispose();
    expect(() => runtime.inspect({ value: 1 })).toThrow(/disposed/);
    expect(() => runtime.describeHierarchy(scene.root)).toThrow(/disposed/);
  });

  it("executes typed inspector property edits through runtime history and edit-mode guards", async () => {
    const runtime = new EditorRuntime();
    const model = {
      label: "key-light",
      enabled: true,
      transform: {
        intensity: 1,
        nested: { locked: false }
      }
    };

    await runtime.editInspectedProperty(model, ["transform", "intensity"], 2.5);
    await runtime.editInspectedProperty(model, ["enabled"], false);
    expect(model.transform.intensity).toBe(2.5);
    expect(model.enabled).toBe(false);
    expect(runtime.snapshot()).toMatchObject({ undoDepth: 2, redoDepth: 0 });

    await runtime.undo();
    expect(model.enabled).toBe(true);
    await runtime.undo();
    expect(model.transform.intensity).toBe(1);
    await runtime.redo();
    expect(model.transform.intensity).toBe(2.5);
    expect(() => runtime.inspector.createSetPropertyCommand(model, ["transform"], 1)).toThrow(/not editable/);
    expect(() => runtime.inspector.createSetPropertyCommand(model, ["label"], false)).toThrow(/expected string/);
    expect(() => runtime.inspector.createSetPropertyCommand(model, ["missing"], true)).toThrow(/does not exist/);

    runtime.enterPlayMode(new PlayModeBridge({
      capture: () => ({ ...model.transform }),
      restore: () => {}
    }));
    await expect(runtime.editInspectedProperty(model, ["label"], "play")).rejects.toThrow(/edit mode/);
    expect(model.label).toBe("key-light");
  });

  it("owns material variant selection workflows for asset-backed editor UIs", () => {
    const variants = new MaterialVariantWorkflow();
    expect(variants.register("vehicle.gltf", ["red", "blue"], "red")).toMatchObject({
      assetId: "vehicle.gltf",
      variants: ["red", "blue"],
      selected: "red"
    });
    expect(variants.renderOptions("vehicle.gltf")).toEqual({ materialVariant: "red" });
    expect(variants.select("vehicle.gltf", null)).toMatchObject({ selected: null });
    expect(variants.renderOptions("vehicle.gltf")).toEqual({});
    expect(() => variants.select("vehicle.gltf", "green")).toThrow(/not available/);
    expect(() => variants.register("bad.gltf", ["red", "red"])).toThrow(/duplicate/);

    const runtime = new EditorRuntime();
    runtime.registerMaterialVariants("hero.gltf", ["default", "damaged"]);
    expect(runtime.setMaterialVariant("hero.gltf", "damaged")).toMatchObject({ selected: "damaged" });
    expect(runtime.materialVariantState("hero.gltf")).toMatchObject({ selected: "damaged" });
    expect(runtime.materialVariants.renderOptions("hero.gltf")).toEqual({ materialVariant: "damaged" });
    expect(runtime.snapshot().materialVariants).toEqual([
      { assetId: "hero.gltf", variants: ["default", "damaged"], selected: "damaged" }
    ]);

    const bridge = new PlayModeBridge({
      capture: () => runtime.snapshot().materialVariants,
      restore: () => {}
    });
    runtime.enterPlayMode(bridge);
    expect(() => runtime.setMaterialVariant("hero.gltf", "default")).toThrow(/edit mode/);
    expect(() => runtime.registerMaterialVariants("other.gltf", ["clean"])).toThrow(/edit mode/);
    expect(runtime.materialVariantState("hero.gltf")).toMatchObject({ selected: "damaged" });
    runtime.exitPlayMode();
    runtime.dispose();
    expect(() => runtime.materialVariantState("hero.gltf")).toThrow(/disposed/);
  });
});
