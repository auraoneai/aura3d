import assert from "node:assert/strict";
import test from "node:test";
import { Ray, Vector3 } from "@aura3d/math";
import { Scene } from "@aura3d/scene";
import {
  CommandHistory,
  CreateNodeCommand,
  DeleteNodeCommand,
  EditorRuntime,
  InspectorModel,
  PickingService,
  Selection,
  SetPropertyCommand,
  TimelineClip,
  TimelineModel,
  TimelineTrack,
  TransformCommand,
  TranslateGizmo,
  collectEditorProjectEvidence,
  createTimelineRuntimeBridge,
  parseEditorProject,
  serializeEditorProject,
  type Command,
  type EditorProjectDocument,
  type TimelineRuntimeAnimationApplication,
  type TimelineRuntimeSignalDispatch
} from "../src/index";

test("CommandHistory executes undo and redo deterministically", async () => {
  const target = { position: { x: 0, y: 0, z: 0 } };
  const history = new CommandHistory();

  await history.execute(new TransformCommand(target, { position: { x: 1, y: 2, z: 3 } }));
  assert.deepEqual(target.position, { x: 1, y: 2, z: 3 });
  await history.undo();
  assert.deepEqual(target.position, { x: 0, y: 0, z: 0 });
  await history.redo();
  assert.deepEqual(target.position, { x: 1, y: 2, z: 3 });
});

test("Selection emits changes and can prune deleted ids", () => {
  const selection = new Selection();
  const changes: unknown[] = [];
  selection.subscribe((change) => changes.push(change));
  selection.set(["a", "b"]);
  selection.prune((id) => id !== "a");
  assert.deepEqual(selection.current(), ["b"]);
  assert.equal(changes.length, 2);
});

test("Create, delete, and set-property commands mutate through public command contract", async () => {
  const nodes: string[] = [];
  const container = {
    add: (node: string) => nodes.push(node),
    remove: (node: string) => {
      const index = nodes.indexOf(node);
      if (index >= 0) nodes.splice(index, 1);
    }
  };
  const history = new CommandHistory();
  await history.execute(new CreateNodeCommand(container, "node-a"));
  await history.execute(new DeleteNodeCommand(container, "node-a"));
  assert.deepEqual(nodes, []);
  await history.undo();
  assert.deepEqual(nodes, ["node-a"]);

  const model = { transform: { visible: true } };
  await history.execute(new SetPropertyCommand(model, ["transform", "visible"], false));
  assert.equal(model.transform.visible, false);
  await history.undo();
  assert.equal(model.transform.visible, true);
});

test("CommandHistory transactions roll back partial execution", async () => {
  const history = new CommandHistory();
  const calls: string[] = [];
  const first: Command = {
    name: "first",
    execute() {
      calls.push("first:execute");
    },
    undo() {
      calls.push("first:undo");
    }
  };
  const second: Command = {
    name: "second",
    execute() {
      calls.push("second:execute");
      throw new Error("second failed");
    },
    undo() {
      calls.push("second:undo");
    }
  };

  await assert.rejects(() => history.executeTransaction([first, second]), /second failed/);
  assert.deepEqual(calls, ["first:execute", "second:execute", "first:undo"]);
  assert.equal(history.undoDepth, 0);
  assert.equal(history.redoDepth, 0);
});

test("CommandHistory transactions undo and redo as one history entry", async () => {
  const history = new CommandHistory();
  const values: string[] = [];
  const createPushCommand = (value: string): Command => ({
    name: `push ${value}`,
    execute() {
      values.push(value);
    },
    undo() {
      const index = values.lastIndexOf(value);
      if (index >= 0) {
        values.splice(index, 1);
      }
    }
  });

  await history.executeTransaction([createPushCommand("a"), createPushCommand("b")]);
  assert.deepEqual(values, ["a", "b"]);
  assert.equal(history.undoDepth, 1);

  await history.undo();
  assert.deepEqual(values, []);
  assert.equal(history.redoDepth, 1);

  await history.redo();
  assert.deepEqual(values, ["a", "b"]);
});

test("CommandHistory preserves history entries when undo or redo fail", async () => {
  const undoHistory = new CommandHistory();
  const failingUndo: Command = {
    name: "failing undo",
    execute() {},
    undo() {
      throw new Error("undo failed");
    }
  };
  await undoHistory.execute(failingUndo);
  await assert.rejects(() => undoHistory.undo(), /undo failed/);
  assert.equal(undoHistory.undoDepth, 1);
  assert.equal(undoHistory.redoDepth, 0);

  const redoHistory = new CommandHistory();
  let failRedo = false;
  const failingRedo: Command = {
    name: "failing redo",
    execute() {
      if (failRedo) {
        throw new Error("redo failed");
      }
    },
    undo() {}
  };
  await redoHistory.execute(failingRedo);
  await redoHistory.undo();
  failRedo = true;
  await assert.rejects(() => redoHistory.redo(), /redo failed/);
  assert.equal(redoHistory.undoDepth, 0);
  assert.equal(redoHistory.redoDepth, 1);
});

test("DeleteNodeCommand restores scene parent and sibling order", async () => {
  const scene = new Scene();
  const parent = scene.createNode("parent");
  const child = scene.createNode("child");
  const sibling = scene.createNode("sibling");
  scene.root.addChild(parent);
  parent.addChild(child);
  parent.addChild(sibling);
  const container = {
    add: (node: typeof child) => parent.addChild(node),
    remove: (node: typeof child) => parent.removeChild(node)
  };
  const history = new CommandHistory();

  await history.execute(new DeleteNodeCommand(container, child));
  assert.equal(child.parent, null);
  assert.deepEqual(parent.children.map((node) => node.name), ["sibling"]);

  await history.undo();
  assert.equal(child.parent, parent);
  assert.deepEqual(parent.children.map((node) => node.name), ["child", "sibling"]);

  await history.redo();
  assert.equal(child.parent, null);
  assert.deepEqual(parent.children.map((node) => node.name), ["sibling"]);
});

test("DeleteNodeCommand falls back to generic containers for unparented scene-shaped nodes", async () => {
  const scene = new Scene();
  const node = scene.createNode("loose");
  const nodes = [node];
  const container = {
    add: (value: typeof node) => nodes.push(value),
    remove: (value: typeof node) => {
      const index = nodes.indexOf(value);
      if (index >= 0) {
        nodes.splice(index, 1);
      }
    }
  };
  const history = new CommandHistory();

  await history.execute(new DeleteNodeCommand(container, node));
  assert.deepEqual(nodes, []);

  await history.undo();
  assert.deepEqual(nodes, [node]);
});

test("PickingService and TranslateGizmo use command history for scene node edits", async () => {
  const scene = new Scene();
  const node = scene.createNode("editable");
  scene.root.addChild(node);
  const picking = new PickingService();
  picking.addTarget({ id: "editable", node, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } });
  picking.resizePickingBuffer(640, 360);

  const evidence = picking.snapshot();
  assert.equal(evidence.source, "origin-master-gpu-picking-adapted");
  assert.equal(evidence.registeredTargetCount, 1);
  assert.equal(evidence.width, 640);
  assert.equal(evidence.height, 360);
  assert.equal(evidence.sampleColorId?.targetId, "editable");
  assert.deepEqual(evidence.sampleColorId?.color, [1, 0, 0, 255]);
  assert.equal(evidence.decodedSampleTargetId, "editable");
  assert.equal(picking.targetIdFromColor([1, 0, 0, 255]), "editable");
  assert.equal(evidence.evidence.colorIdEncoding, true);
  assert.equal(evidence.evidence.colorIdDecoding, true);
  assert.equal(evidence.evidence.raycastFallback, true);
  assert.ok(evidence.blockedClaims.includes("production GPU framebuffer picking pass"));

  const hit = picking.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)));
  assert.equal(hit?.target.node, node);
  assert.equal(picking.snapshot().needsUpdate, false);
  picking.invalidatePickingBuffer();
  assert.equal(picking.snapshot().needsUpdate, true);
  assert.throws(() => picking.resizePickingBuffer(0, 360), /positive integers/);
  assert.throws(() => PickingService.idToColor(0), /1..16777215/);

  const history = new CommandHistory();
  const gizmo = new TranslateGizmo(history);
  gizmo.setTarget(node);
  await gizmo.drag({ axis: "x", delta: 2 });
  assert.equal(node.transform.position[0], 2);
  await history.undo();
  assert.equal(node.transform.position[0], 0);
});

test("InspectorModel and EditorRuntime apply typed inspector edits through undo history", async () => {
  const target = {
    name: "cube",
    visible: true,
    transform: {
      x: 1,
      y: 2
    }
  };
  const inspector = new InspectorModel();
  const history = new CommandHistory();

  await history.execute(inspector.createSetPropertyCommand(target, ["transform", "x"], 4));
  assert.equal(target.transform.x, 4);
  await history.undo();
  assert.equal(target.transform.x, 1);
  assert.throws(() => inspector.createSetPropertyCommand(target, ["transform"], 0), /not editable/);
  assert.throws(() => inspector.createSetPropertyCommand(target, ["visible"], "false"), /expected boolean/);
  assert.throws(() => inspector.createSetPropertyCommand(target, ["missing"], true), /does not exist/);

  const runtime = new EditorRuntime();
  await runtime.editInspectedProperty(target, ["name"], "hero");
  assert.equal(target.name, "hero");
  await runtime.undo();
  assert.equal(target.name, "cube");
});

test("EditorRuntime exposes public selection, picking, transform, and diagnostics operations", async () => {
  const scene = new Scene();
  const node = scene.createNode("runtime-owned");
  scene.root.addChild(node);
  const runtime = new EditorRuntime();

  runtime.select([node.id]);
  assert.deepEqual(runtime.currentSelection(), [node.id]);

  runtime.setPickTargets([{ id: node.id, node, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } }]);
  const hit = runtime.pick(new Ray(new Vector3(0, 0, 5), new Vector3(0, 0, -1)));
  assert.equal(hit?.target.id, node.id);
  assert.equal(runtime.snapshot().picking.decodedSampleTargetId, node.id);

  await runtime.translateTarget(node, { axis: "x", delta: 1.5 });
  assert.equal(node.transform.position[0], 2);
  assert.equal(runtime.snapshot().undoDepth, 1);

  const diagnostics = runtime.updateDiagnostics({
    frameTimeMs: 2,
    drawCalls: 1,
    nodeCount: 1,
    assetCount: 0,
    physicsBodies: 0,
    resources: [{ id: "shader-runtime", label: "Runtime shader", kind: "shader", status: "warning" }]
  });
  assert.equal(diagnostics.warnings, 1);
  assert.equal(runtime.diagnosticsSnapshot().shaderWarnings[0]?.id, "shader-runtime");

  runtime.clearSelection();
  assert.deepEqual(runtime.currentSelection(), []);
});

test("DiagnosticsOverlayModel validates profiler resource and shader diagnostics", () => {
  const runtime = new EditorRuntime();
  const snapshot = runtime.updateDiagnostics({
    frameTimeMs: 4.5,
    drawCalls: 2,
    triangleCount: 12,
    nodeCount: 3,
    assetCount: 1,
    physicsBodies: 1,
    resources: [
      { id: "shader-main", label: "Main shader", kind: "shader", status: "warning", detail: "Missing normal map" },
      { id: "asset-model", label: "model.glb", kind: "asset", status: "ok" }
    ]
  });

  assert.equal(snapshot.warnings, 1);
  assert.equal(snapshot.errors, 0);
  assert.equal(snapshot.shaderWarnings[0]?.id, "shader-main");
  assert.equal(runtime.snapshot().diagnostics.drawCalls, 2);

  assert.throws(() => runtime.updateDiagnostics({
    frameTimeMs: -1,
    drawCalls: 0,
    nodeCount: 0,
    assetCount: 0,
    physicsBodies: 0
  }), /frame time/);
});

test("TimelineModel ports bounded track, clip, easing, loop, lock, mute, and signal evidence", () => {
  const timeline = new TimelineModel({
    id: "timeline-port",
    duration: 2,
    loopMode: "loop",
    speed: 1.5,
    frameRate: 60,
    tracks: [
      {
        id: "animation-track",
        name: "Animation",
        type: "animation",
        clips: [
          {
            id: "run",
            name: "Run",
            startTime: 0,
            duration: 1,
            easeInDuration: 0.5,
            easeIn: "ease-in-out",
            blendMode: "mix",
            weight: 0.8,
            clipInOffset: 0.2
          }
        ]
      },
      {
        id: "signal-track",
        name: "Signals",
        type: "signal",
        locked: true,
        clips: [{ id: "footstep", name: "Footstep", clipName: "footstep", startTime: 0.25, duration: 0.1 }]
      },
      {
        id: "muted-guide",
        name: "Muted Guide",
        type: "audio",
        muted: true,
        clips: [{ id: "beat", name: "Beat", startTime: 0, duration: 2 }]
      }
    ]
  });

  timeline.seek(0.25);
  const snapshot = timeline.snapshot();
  assert.equal(snapshot.activeClipCount, 2);
  assert.equal(snapshot.activeClips.find((clip) => clip.clipId === "run")?.blendWeight, 0.4);
  assert.equal(snapshot.activeClips.find((clip) => clip.clipId === "run")?.assetTime, 0.45);
  assert.deepEqual(snapshot.signalEvents, ["footstep"]);
  assert.equal(snapshot.evidence.oldCodebasePort, true);
  assert.equal(snapshot.evidence.clipEasing, true);
  assert.equal(snapshot.evidence.clipBlending, true);
  assert.equal(snapshot.evidence.muteLockState, true);
  assert.equal(snapshot.evidence.loopPlayback, true);
  assert.equal(snapshot.evidence.signalMarkers, true);

  timeline.play();
  timeline.tick(2);
  assert.equal(timeline.snapshot().time, 1.25);

  const lockedTrack = timeline.tracks.find((track) => track.id === "signal-track");
  assert.throws(() => lockedTrack?.addClip(new TimelineClip({ name: "Late Signal", startTime: 1, duration: 0.1 })), /locked timeline track/);
});

test("TimelineRuntimeBridge applies editor-authored clips and signals to runtime targets", () => {
  const timeline = new TimelineModel({
    id: "combat-timeline",
    duration: 1.5,
    loopMode: "none",
    tracks: [
      {
        id: "fighter-animation",
        name: "Fighter Animation",
        type: "animation",
        weight: 0.5,
        clips: [
          {
            id: "light-punch",
            name: "Light Punch",
            startTime: 0,
            duration: 0.8,
            assetId: "fighter-glb",
            clipName: "LightPunch",
            blendMode: "mix",
            weight: 0.8,
            clipInOffset: 0.1,
            properties: {
              runtimeNodeId: "player",
              authoringLane: "upper-body"
            }
          }
        ]
      },
      {
        id: "combat-events",
        name: "Combat Events",
        type: "signal",
        clips: [
          {
            id: "hitbox-open",
            name: "Hitbox Open",
            startTime: 0.25,
            duration: 0.05,
            properties: {
              event: "hitbox.open",
              targetId: "player",
              hitbox: "right-fist"
            }
          }
        ]
      }
    ]
  });
  const applications: TimelineRuntimeAnimationApplication[] = [];
  const signals: TimelineRuntimeSignalDispatch[] = [];
  const bridge = createTimelineRuntimeBridge({
    timeline,
    bindings: [
      {
        trackId: "fighter-animation",
        targetId: "player",
        assetId: "fighter-glb",
        clipNameMap: { LightPunch: "LightPunch" }
      }
    ],
    targets: [
      {
        id: "player",
        applyTimelineAnimation(application) {
          applications.push(application);
        },
        applyTimelineSignal(signal) {
          signals.push(signal);
        },
        snapshot() {
          return { applications: applications.length, signals: signals.length };
        }
      }
    ]
  });

  const first = bridge.applyAt(0.25);
  assert.equal(applications.length, 1);
  assert.equal(applications[0]?.targetId, "player");
  assert.equal(applications[0]?.clipName, "LightPunch");
  assert.equal(applications[0]?.assetTime, 0.35);
  assert.equal(applications[0]?.blendWeight, 0.4);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.event, "hitbox.open");
  assert.equal(first.kind, "aura-editor-timeline-runtime-bridge");
  assert.equal(first.evidence.timelineToRuntimeBridge, true);
  assert.equal(first.evidence.animationClipBinding, true);
  assert.equal(first.evidence.signalDispatch, true);
  const targetSnapshot = first.targets[0]?.snapshot as { applications: number } | undefined;
  assert.equal(targetSnapshot?.applications, 1);

  bridge.applyAt(0.26);
  assert.equal(signals.length, 1);
  bridge.applyAt(0.25, { replaySignals: true });
  assert.equal(signals.length, 2);
});

test("ProjectSerializer round-trips editor timelines, runtime bindings, asset provenance, and visual graph hooks", () => {
  const timeline = new TimelineModel({
    id: "episode-timeline",
    name: "Episode Timeline",
    duration: 2,
    tracks: [
      {
        id: "character-animation",
        name: "Character Animation",
        type: "animation",
        clips: [{ id: "idle", name: "Idle", startTime: 0, duration: 2, assetId: "toon-glb", clipName: "Idle" }]
      },
      {
        id: "markers",
        name: "Markers",
        type: "signal",
        clips: [{ id: "mouth-aa", name: "Mouth AA", startTime: 0.4, duration: 0.05, properties: { event: "viseme", targetId: "toon", viseme: "AA" } }]
      }
    ]
  });
  const project: EditorProjectDocument = {
    schema: "a3d-editor-project",
    version: 105,
    name: "1.0.5 Editor Workflow",
    nodes: [{ id: "toon", name: "Typed Toon", runtimeNodeId: "toon" }],
    assets: [
      {
        id: "toon-glb",
        name: "toon.glb",
        type: "glb",
        uri: "assets/toon.glb",
        source: "Aura3D typed asset catalog fixture",
        license: "CC0",
        clips: ["Idle"],
        morphTargets: ["AA"]
      }
    ],
    timelines: [
      {
        ...timeline.toConfig(),
        bindings: [{ trackId: "character-animation", targetId: "toon", assetId: "toon-glb" }],
        evidence: {
          authoredInEditor: true,
          runtimeReplay: true,
          animationEvents: true
        }
      }
    ],
    visualGraphs: [
      {
        id: "graph-viseme",
        name: "Viseme Graph",
        nodes: [{ id: "on-viseme", type: "event" }],
        edges: [],
        runtimeBindings: [{ nodeId: "on-viseme", targetId: "toon", event: "viseme" }]
      }
    ],
    editor: {
      selectedNodeId: "toon",
      activeTool: "timeline",
      activeTimelineId: "episode-timeline",
      playMode: "edit"
    },
    evidence: {
      serializedBy: "editor-runtime",
      roundTripReady: true,
      browserWorkflowReady: false
    }
  };

  const serialized = serializeEditorProject(project);
  assert.match(serialized, /"timelines"/);
  assert.match(serialized, /"visualGraphs"/);
  const parsed = parseEditorProject(serialized);
  assert.equal(parsed.timelines?.[0]?.bindings?.[0]?.targetId, "toon");
  assert.equal(parsed.timelines?.[0]?.tracks?.[1]?.clips?.[0]?.properties?.event, "viseme");

  const evidence = collectEditorProjectEvidence(parsed);
  assert.equal(evidence.kind, "aura-editor-project-evidence");
  assert.equal(evidence.timelineCount, 1);
  assert.equal(evidence.visualGraphCount, 1);
  assert.equal(evidence.timelineBindingCount, 1);
  assert.equal(evidence.signalMarkerCount, 1);
  assert.equal(evidence.typedAssetEvidenceCount, 1);
  assert.equal(evidence.roundTripReady, true);
  assert.equal(evidence.evidence.timelineSerialization, true);
  assert.equal(evidence.evidence.visualGraphSerialization, true);
  assert.equal(evidence.evidence.runtimeReplayBindings, true);
  assert.equal(evidence.evidence.sourceLicenseAssetEvidence, true);

  assert.throws(() => serializeEditorProject({
    ...project,
    timelines: [{ ...timeline.toConfig(), bindings: [{ trackId: "character-animation", targetId: "" }] }]
  }), /targetId is required/);
});
