import assert from "node:assert/strict";
import test from "node:test";
import { Ray, Vector3 } from "@aura3d/math";
import { Scene } from "@aura3d/scene";
import {
  CommandHistory,
  CartoonSceneEditor,
  CameraPathEditor,
  CurveEditor,
  CreateNodeCommand,
  DeleteNodeCommand,
  EditorRuntime,
  EpisodeReviewPanel,
  InspectorModel,
  KeyframeEditor,
  MultiUserReviewWorkflow,
  NonlinearAnimationEditor,
  PickingService,
  PropertyPanel,
  RenderQueuePanel,
  SceneOutliner,
  Selection,
  SetPropertyCommand,
  TimelineClip,
  TimelineEditorController,
  TimelineModel,
  TimelineTrack,
  TransformCommand,
  TranslateGizmo,
  VisualReviewDashboard,
  collectEditorProjectEvidence,
  createTimelineRuntimeBridge,
  createTimelineTrackConfig,
  parseEditorProject,
  readTimelineKeyframes,
  serializeEditorProject,
  type Command,
  type EditorProjectDocument,
  type TimelineRuntimeAnimationApplication,
  type TimelineRuntimeSignalDispatch
} from "../src/index";
import { createAudioWaveformReviewData, type AudioWaveformData } from "../../audio/src/index";
import {
  createAuraVoiceVisemeTrack,
  createVisemeTimelineTrack,
  sampleVisemeTimelineTrack
} from "../../engine/src/agent-api/index";

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

test("TimelineEditorController edits clips with snapping, selection, undo, redo, copy, paste, and serialization", async () => {
  const controller = new TimelineEditorController({
    timeline: new TimelineModel({ id: "episode", duration: 6, frameRate: 24, loopMode: "none" }),
    snapInterval: 0.5
  });
  const animationTrack = await controller.addTrack("animation", "Character");
  assert.equal(animationTrack.type, "animation");
  assert.equal(animationTrack.properties.auraTrackKind, "animation");

  const clip = await controller.addClip(animationTrack.id, {
    id: "wave",
    name: "Wave",
    startTime: 0.26,
    duration: 1.25,
    clipName: "Wave",
    properties: { targetId: "toon" }
  });
  assert.equal(clip.startTime, 0.5);
  assert.equal(controller.snapshot().evidence.clipEditing, true);
  assert.equal(controller.snapshot().evidence.keyframeReadyTracks, true);

  await controller.moveClip("wave", 1.26);
  assert.equal(clip.startTime, 1.5);
  await controller.resizeClip("wave", 2);
  assert.equal(clip.duration, 2);
  controller.selectClip("wave");
  controller.copySelection();
  const pasted = await controller.pasteClips(animationTrack.id, 4);
  assert.equal(pasted.length, 1);
  assert.equal(pasted[0].startTime, 4);
  assert.deepEqual(controller.snapshot().selectedIds, [pasted[0].id]);

  await controller.undo();
  assert.equal(animationTrack.clips.length, 1);
  await controller.redo();
  assert.equal(animationTrack.clips.length, 2);

  const split = await controller.splitClip("wave", 2);
  assert.deepEqual(split.map((item) => item.id), ["wave-a", "wave-b"]);
  assert.equal(animationTrack.clips.length, 3);
  controller.scrubTo(2.49);
  assert.equal(controller.timeline.currentTime, 2.5);
  controller.handleKeyboardShortcut("ArrowLeft");
  assert.equal(Number(controller.timeline.currentTime.toFixed(4)), 2.4583);

  const serialized = controller.serializeTimeline();
  assert.equal(serialized.tracks?.[0]?.properties?.auraTrackKind, "animation");
  assert.equal(serialized.tracks?.[0]?.clips?.length, 3);
});

test("KeyframeEditor and CurveEditor author deterministic bezier keyframes on timeline clips", async () => {
  const clip = new TimelineClip({ id: "camera-move", name: "Camera Move", startTime: 0, duration: 2 });
  const keyframes = new KeyframeEditor();
  await keyframes.addKeyframe(clip, { id: "x0", propertyPath: "transform.position.x", time: 0, value: 0, interpolation: "bezier", outHandle: { time: 0.3, value: 4 } });
  await keyframes.addKeyframe(clip, { id: "x1", propertyPath: "transform.position.x", time: 2, value: 10, interpolation: "linear", inHandle: { time: -0.3, value: -2 } });
  assert.equal(readTimelineKeyframes(clip).length, 2);

  const curve = new CurveEditor(keyframes.commandHistory);
  assert.equal(curve.sample(clip, "transform.position.x", 0).value, 0);
  assert.equal(curve.sample(clip, "transform.position.x", 2).value, 10);
  assert.equal(typeof curve.sample(clip, "transform.position.x", 1).value, "number");

  await curve.setBezierHandles(clip, "x1", { inHandle: { time: -0.25, value: -1 }, outHandle: { time: 0.25, value: 1 } });
  assert.equal(readTimelineKeyframes(clip).find((keyframe) => keyframe.id === "x1")?.interpolation, "bezier");
  const moved = await keyframes.moveKeyframes(clip, ["x0", "x1"], 0.5);
  assert.deepEqual(moved.map((keyframe) => keyframe.time), [0.5, 2.5]);
  const copy = keyframes.copyKeyframes(clip, ["x0"]);
  const pasted = await keyframes.pasteKeyframes(clip, copy, { timeOffset: 1, idPrefix: "copy" });
  assert.equal(pasted[0].id, "copy-x0-0");
  assert.equal(readTimelineKeyframes(clip).length, 3);

  await keyframes.commandHistory.undo();
  assert.equal(readTimelineKeyframes(clip).length, 2);
  assert.equal(curve.evidence(clip, "transform.position.x").evidence.deterministicSampling, true);
});

test("CartoonSceneEditor, AssetDropZone, SceneOutliner, and PropertyPanel compose and edit cartoon scene nodes", async () => {
  const editor = new CartoonSceneEditor();
  const reviewPanel = new EpisodeReviewPanel({
    packageId: "moon-garden-001",
    packageHash: "sha256-review",
    status: "needs-review",
    notes: [],
    rejectedFrames: []
  });
  const renderQueue = new RenderQueuePanel([
    { id: "episode-webm", label: "Episode WebM", status: "running", progress: 0.25, currentFrame: 45, totalFrames: 180 }
  ]);
  editor.setEpisodeState({
    shots: ["intro", "dialogue"],
    assets: ["typed-toon"],
    captions: ["caption-1"],
    visemes: ["miko-aa"],
    renderState: renderQueue.snapshot(),
    reviewState: reviewPanel.snapshot()
  });
  const node = await editor.placeAsset(
    {
      kind: "aura-asset-ref",
      id: "typed-toon",
      name: "Typed Toon",
      type: "glb",
      source: "typed-catalog",
      license: "CC0",
      category: "character",
      clips: ["Idle", "Wave"],
      lipSyncReady: true
    },
    { position: { x: 1, y: 0, z: 2 } }
  );

  assert.equal(node.kind, "character");
  assert.equal(node.transform.position.x, 1);
  assert.deepEqual(editor.runtime.currentSelection(), [node.id]);
  assert.equal(editor.snapshot().placedAssetCount, 1);
  assert.equal(editor.snapshot().episode.shotCount, 2);
  assert.equal(editor.snapshot().episode.hasRenderState, true);
  assert.equal(editor.snapshot().episode.hasReviewState, true);
  assert.equal(editor.snapshot().evidence.episodeState, true);

  await editor.setTransform(node.id, { scale: { x: 2, y: 2, z: 2 } });
  assert.equal(node.transform.scale.x, 2);
  await editor.runtime.history.undo();
  assert.equal(node.transform.scale.x, 1);
  await editor.runtime.history.redo();
  assert.equal(node.transform.scale.x, 2);

  const outliner = new SceneOutliner();
  const outlinerItems = outliner.describe(editor.root, new Set(editor.runtime.currentSelection()));
  assert.equal(outlinerItems.find((item) => item.id === node.id)?.icon, "[CHAR]");
  assert.equal(outlinerItems.find((item) => item.id === node.id)?.selected, true);

  const panel = new PropertyPanel({ history: editor.runtime.history });
  const fields = panel.describe(node);
  assert.equal(fields.some((field) => field.label === "transform.position.x" && field.editable), true);
  await panel.edit(node, ["transform", "position", "x"], 3);
  assert.equal(node.transform.position.x, 3);
  await editor.runtime.history.undo();
  assert.equal(node.transform.position.x, 1);

  const serialized = editor.serializeScene();
  const restored = new CartoonSceneEditor();
  restored.loadScene(serialized);
  assert.equal(restored.snapshot().nodeCount, 2);

  await assert.rejects(() => editor.placeAsset({
    id: "raw-url-character",
    name: "Raw URL Character",
    type: "glb",
    uri: "https://example.test/raw-character.glb",
    category: "character",
    clips: ["Idle"],
    lipSyncReady: true
  }), /typed Aura3D asset reference/);
});

test("Timeline track type helpers create cartoon timeline lanes compatible with route playback", () => {
  const dialogue = createTimelineTrackConfig("dialogue", "Dialogue");
  const captions = createTimelineTrackConfig("caption", "Captions");
  const shots = createTimelineTrackConfig("shot", "Shots");
  const routeCalls: string[] = [];
  const timeline = new TimelineModel({
    duration: 3,
    tracks: [
      { ...shots, clips: [{ id: "shot-open", name: "Open", startTime: 0.5, duration: 1, properties: { shotId: "open" } }] },
      { ...dialogue, clips: [{ id: "line", name: "Line", startTime: 0, duration: 1, properties: { speaker: "Narrator" } }] },
      { ...captions, clips: [{ id: "caption", name: "Caption", startTime: 0, duration: 1, properties: { text: "Hello" } }] }
    ]
  });
  const controller = new TimelineEditorController({
    timeline,
    routeBinding: {
      play: () => routeCalls.push("play"),
      pause: () => routeCalls.push("pause"),
      scrub: (time) => routeCalls.push(`scrub:${time}`),
      jumpToShot: (shotId, time) => routeCalls.push(`shot:${shotId}:${time}`)
    }
  });

  assert.equal(timeline.tracks[1].type, "audio");
  assert.equal(timeline.tracks[1].properties.auraTrackKind, "dialogue");
  assert.equal(timeline.tracks[2].type, "generic");
  assert.equal(timeline.snapshot().trackCount, 3);
  assert.equal(controller.jumpToShot("open"), 0.5);
  controller.togglePlayback();
  controller.togglePlayback();
  assert.deepEqual(routeCalls, ["scrub:0.5", "shot:open:0.5", "play", "pause"]);
});

test("EpisodeReviewPanel and RenderQueuePanel serialize approval and render progress", () => {
  const review = new EpisodeReviewPanel({
    packageId: "moon-garden-001",
    status: "needs-review",
    notes: [],
    rejectedFrames: []
  });
  review.addNote({ id: "note-1", author: "director", text: "Caption clears action.", time: 2 });
  const approved = review.approve("reviewer", "2026-06-06T00:00:00.000Z");
  const rejected = new EpisodeReviewPanel({
    packageId: "moon-garden-002",
    status: "needs-review",
    notes: [],
    rejectedFrames: []
  });
  rejected.rejectFrame({ id: "frame-12", time: 1.2, reason: "mouth shape is static" });
  const queue = new RenderQueuePanel([
    { id: "png-sequence", label: "PNG Sequence", status: "queued", progress: 0 },
    { id: "episode-webm", label: "Episode WebM", status: "running", progress: 0.5, currentFrame: 90, totalFrames: 180 }
  ]);
  const done = queue.updateProgress("episode-webm", 1, {
    status: "done",
    currentFrame: 180,
    totalFrames: 180,
    outputPath: "dist/episodes/moon-garden-001/episode.webm"
  });

  assert.equal(approved.approvalRecorded, true);
  assert.equal(approved.noteCount, 1);
  assert.equal(rejected.snapshot().rejectedFrameCount, 1);
  assert.throws(() => rejected.approve("reviewer"), /rejected frames/);
  assert.equal(done.doneCount, 1);
  assert.equal(done.runningCount, 0);
  assert.deepEqual(done.outputPaths, ["dist/episodes/moon-garden-001/episode.webm"]);
});

test("EpisodeReviewPanel supports waveform review lanes, manual viseme edits, and visual review dashboard evidence", () => {
  const waveform: AudioWaveformData = {
    duration: 1,
    sampleRate: 4,
    channels: 1,
    peakCount: 4,
    samplesPerPeak: 1,
    normalized: true,
    peaks: [
      { min: -0.2, max: 0.25, rms: 0.18 },
      { min: -0.7, max: 0.8, rms: 0.56 },
      { min: -1, max: 0.9, rms: 0.72 },
      { min: -0.1, max: 0.2, rms: 0.12 }
    ]
  };
  const waveformReview = createAudioWaveformReviewData([
    { id: "miko-dialogue", label: "Miko dialogue", startTime: 2, waveform }
  ], { width: 240, height: 48 });
  const sourceVisemes = createAuraVoiceVisemeTrack({
    episodeId: "moon-garden",
    language: "en-US",
    frameRate: 24,
    cues: [{
      id: "source-aa",
      characterId: "miko",
      startTime: 2,
      endTime: 2.25,
      visemeId: "aa",
      mouthOpenness: 0.4,
      weight: 0.7
    }]
  });
  const editedVisemes = createVisemeTimelineTrack({
    episodeId: "moon-garden",
    language: "en-US",
    frameRate: 24,
    sourceTrack: sourceVisemes,
    manualEdits: [{
      id: "manual-oh",
      reason: "director adjusted close-up mouth shape",
      cue: {
        id: "manual-oh-cue",
        characterId: "miko",
        startTime: 2.08,
        endTime: 2.32,
        visemeId: "oh",
        mouthOpenness: 0.82,
        weight: 1
      }
    }]
  });
  assert.equal(sampleVisemeTimelineTrack(editedVisemes, 2.12, "miko").visemeId, "oh");

  const review = new EpisodeReviewPanel({
    packageId: "moon-garden-review",
    status: "needs-review",
    notes: [],
    rejectedFrames: []
  });
  review.setWaveformLanes(waveformReview.stems.map((stem) => ({
    id: stem.id,
    label: stem.label,
    startTime: stem.startTime,
    duration: stem.duration,
    peakCount: stem.peakCount,
    pathPointCount: stem.path.length
  })));
  review.applyManualVisemeEdit({
    id: editedVisemes.manualEdits[0].id,
    characterId: editedVisemes.manualEdits[0].cue.characterId,
    visemeId: editedVisemes.manualEdits[0].cue.visemeId,
    startTime: editedVisemes.manualEdits[0].cue.startTime,
    endTime: editedVisemes.manualEdits[0].cue.endTime,
    reason: editedVisemes.manualEdits[0].reason
  });
  review.addNote({ id: "note-mouth", author: "director", text: "Hold OH through the close-up.", time: 2.1 });
  review.rejectFrame({ id: "frame-51", time: 2.125, reason: "mouth shape drifts before manual edit" });

  const snapshot = review.snapshot();
  assert.equal(snapshot.waveformLaneCount, 1);
  assert.equal(snapshot.manualVisemeEditCount, 1);
  assert.equal(snapshot.reviewUiEvidence.waveformReview, true);
  assert.equal(snapshot.reviewUiEvidence.manualVisemeEdits, true);
  assert.equal(snapshot.reviewUiEvidence.reviewerNotes, true);
  assert.equal(snapshot.reviewUiEvidence.visualFrameReview, true);

  const dashboard = new VisualReviewDashboard([snapshot]).snapshot();
  assert.equal(dashboard.kind, "visual-review-dashboard");
  assert.deepEqual(dashboard.approvalBlockedPackageIds, ["moon-garden-review"]);
  assert.equal(dashboard.failedFrames[0].reason, "mouth shape drifts before manual edit");
  assert.equal(dashboard.reviewerNotes[0].text, "Hold OH through the close-up.");
  assert.equal(dashboard.waveformLanes[0].pathPointCount, 4);
  assert.equal(dashboard.manualVisemeEdits[0].visemeId, "oh");
  assert.equal(dashboard.evidence.listsFailedFrames, true);
  assert.equal(dashboard.evidence.listsReviewerNotes, true);
  assert.equal(dashboard.evidence.waveformReview, true);
  assert.equal(dashboard.evidence.manualVisemeEdits, true);
  assert.equal(dashboard.evidence.approvalBlocking, true);
});

test("CameraPathEditor edits shot camera moves through timeline keyframes and route playback evidence", async () => {
  const routeCalls: string[] = [];
  const shots = createTimelineTrackConfig("shot", "Shots");
  const camera = createTimelineTrackConfig("camera", "Camera");
  const timeline = new TimelineModel({
    duration: 5,
    frameRate: 24,
    tracks: [
      { ...shots, clips: [{ id: "shot-open", name: "Open", startTime: 1, duration: 2, properties: { shotId: "open" } }] },
      { ...camera, clips: [{ id: "camera-open", name: "Open Camera", startTime: 1, duration: 2, properties: { shotId: "open" } }] }
    ]
  });
  const controller = new TimelineEditorController({
    timeline,
    routeBinding: {
      scrub: (time) => routeCalls.push(`scrub:${time}`),
      jumpToShot: (shotId, time) => routeCalls.push(`shot:${shotId}:${time}`)
    }
  });
  const cameraClip = timeline.tracks[1].clips[0];
  const cameraEditor = new CameraPathEditor();

  await cameraEditor.setCameraKeyframe(cameraClip, {
    id: "open-start",
    time: 1,
    position: [0, 1.6, 4],
    target: [0, 1.2, 0],
    fov: 42,
    focusDistance: 4,
    shake: 0,
    interpolation: "linear"
  });
  await cameraEditor.setCameraKeyframe(cameraClip, {
    id: "open-end",
    time: 3,
    position: [1, 1.8, 3],
    target: [0.2, 1.4, 0],
    fov: 32,
    focusDistance: 3,
    shake: 0.08,
    interpolation: "linear"
  });
  await cameraEditor.setCameraKeyframe(cameraClip, {
    id: "open-end",
    time: 3,
    position: [1.5, 1.8, 2.8],
    target: [0.25, 1.4, 0],
    fov: 30,
    focusDistance: 2.8,
    shake: 0.05,
    interpolation: "linear"
  });

  const keyframes = cameraEditor.readCameraPathKeyframes(cameraClip);
  assert.equal(keyframes.length, 2);
  assert.deepEqual(keyframes[1].position, [1.5, 1.8, 2.8]);
  assert.equal(readTimelineKeyframes(cameraClip).length, 18);

  const sample = cameraEditor.sample(cameraClip, 2);
  assert.deepEqual(sample.position, [0.75, 1.7, 3.4]);
  assert.equal(sample.fov, 36);

  const evidence = cameraEditor.evidence(cameraClip);
  assert.equal(evidence.cameraKeyframeCount, 2);
  assert.equal(evidence.editablePropertyCount, 9);
  assert.equal(evidence.evidence.shotCameraMoveEditing, true);
  assert.equal(evidence.evidence.cameraPositionCurves, true);
  assert.equal(evidence.evidence.cameraTargetCurves, true);
  assert.equal(evidence.evidence.fovCurve, true);

  assert.equal(controller.jumpToShot("open"), 1);
  assert.deepEqual(routeCalls, ["scrub:1", "shot:open:1"]);
  assert.equal(controller.serializeTimeline().tracks?.[1]?.clips?.[0]?.properties?.cameraPathEdited, "true");
});

test("MultiUserReviewWorkflow blocks publish until assigned notes resolve and reviewer quorum approves", () => {
  const workflow = new MultiUserReviewWorkflow({
    packageId: "moon-garden-001",
    requiredReviewerCount: 2,
    participants: [
      { id: "director", name: "Director", role: "owner" },
      { id: "animation", name: "Animation Reviewer", role: "reviewer" },
      { id: "audio", name: "Audio Reviewer", role: "reviewer" }
    ],
    threads: [],
    decisions: []
  });

  const open = workflow.addThread({
    id: "thread-mouth-shape",
    authorId: "director",
    text: "Miko mouth shape misses the long vowel.",
    time: 1.25,
    frame: 30,
    assignedTo: "animation",
    resolved: false
  });
  assert.equal(open.canPublish, false);
  assert.equal(open.unresolvedThreadCount, 1);
  assert.equal(open.evidence.assignmentWorkflow, true);

  workflow.recordDecision({ reviewerId: "animation", status: "approved", at: "2026-06-06T00:00:00.000Z" });
  assert.equal(workflow.snapshot().canPublish, false);
  workflow.resolveThread("thread-mouth-shape");
  const approved = workflow.recordDecision({ reviewerId: "audio", status: "approved", at: "2026-06-06T00:01:00.000Z" });

  assert.equal(approved.status, "approved");
  assert.equal(approved.canPublish, true);
  assert.equal(approved.evidence.multiUserReview, true);
  assert.equal(approved.evidence.reviewerQuorum, true);
});

test("NonlinearAnimationEditor edits bins, sequences, nested timelines, and clip operations", async () => {
  const editor = new NonlinearAnimationEditor({
    activeSequenceId: "main",
    binAssets: [
      { id: "miko-wave", name: "Miko Wave", kind: "animation", assetId: "assets.miko", clipName: "Wave", duration: 1.5 },
      { id: "line-voice", name: "Line Voice", kind: "audio", assetId: "assets.mikoDialogueStem", duration: 2 }
    ],
    sequences: [
      { id: "main", name: "Main Sequence", timeline: { duration: 8, frameRate: 24, loopMode: "none" } },
      { id: "reaction", name: "Reaction Insert", timeline: { duration: 2, frameRate: 24, loopMode: "none" } }
    ]
  });
  const animationTrack = await editor.addTrack("animation", "Character Animation");
  await editor.addTrack("dialogue", "Dialogue");
  const clipId = await editor.insertAssetClip(animationTrack, "miko-wave", { id: "wave-1", startTime: 0 });

  await editor.trimClip(clipId, 1.25);
  const splitIds = await editor.splitClip(clipId, 0.5);
  assert.deepEqual(splitIds, ["wave-1-a", "wave-1-b"]);
  const duplicateId = await editor.duplicateClip("wave-1-b", 1);
  await editor.moveClip(duplicateId, 3);
  await editor.insertNestedSequence(animationTrack, "reaction", { id: "reaction-nest", startTime: 5 });

  const snapshot = editor.snapshot();
  assert.equal(snapshot.kind, "nonlinear-animation-editor");
  assert.equal(snapshot.sequenceCount, 2);
  assert.equal(snapshot.nestedSequenceClipCount, 1);
  assert.equal(snapshot.evidence.nonlinearSequences, true);
  assert.equal(snapshot.evidence.trimSplitMoveDuplicate, true);
  assert.equal(snapshot.evidence.multiTrackTimeline, true);
  assert.equal(editor.serialize().sequences.find((sequence) => sequence.id === "main")?.timeline?.tracks?.length, 2);
});
