import {
  TimelineModel,
  collectEditorProjectEvidence,
  createTimelineRuntimeBridge,
  parseEditorProject,
  serializeEditorProject
} from "../../packages/editor-runtime/src/index";

const timeline = new TimelineModel({
  id: "package-smoke-timeline",
  duration: 1,
  tracks: [
    {
      id: "anim",
      name: "Animation",
      type: "animation",
      clips: [{ id: "idle", name: "Idle", startTime: 0, duration: 1, assetId: "fighter", clipName: "Idle", properties: { runtimeNodeId: "player" } }]
    },
    {
      id: "signals",
      name: "Signals",
      type: "signal",
      clips: [{ id: "hitbox", name: "Hitbox", startTime: 0.2, duration: 0.1, properties: { event: "hitbox.open", runtimeNodeId: "player" } }]
    }
  ]
});

const applications: unknown[] = [];
const signals: unknown[] = [];
const bridge = createTimelineRuntimeBridge({
  timeline,
  targets: [{
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
  }],
  bindings: [{ trackId: "anim", targetId: "player", assetId: "fighter" }]
});
const bridgeSnapshot = bridge.applyAt(0.25, { replaySignals: true });
const project = parseEditorProject(serializeEditorProject({
  schema: "a3d-editor-project",
  version: 1,
  name: "Editor Package Smoke",
  nodes: [{ id: "player", runtime: { id: "player" } }],
  assets: [{ id: "fighter", name: "Fighter", source: "tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb", license: "CC-BY-4.0", clips: ["Idle"], morphTargets: ["AA"] }],
  timelines: [{ ...timeline.toConfig(), bindings: [{ trackId: "anim", targetId: "player", assetId: "fighter" }] }],
  visualGraphs: [{ id: "graph", name: "Graph", nodes: [{ id: "frame", kind: "onFrame" }], edges: [], runtimeBindings: [{ nodeId: "frame", targetId: "player" }] }],
  evidence: { serializedBy: "editor-runtime", roundTripReady: true, browserWorkflowReady: true }
}));
const projectEvidence = collectEditorProjectEvidence(project);
const issues = [
  ...(bridgeSnapshot.evidence.animationClipBinding ? [] : ["Timeline bridge did not bind animation clips."]),
  ...(bridgeSnapshot.evidence.signalDispatch ? [] : ["Timeline bridge did not dispatch signals."]),
  ...(projectEvidence.roundTripReady ? [] : ["Project evidence is not roundTripReady."]),
  ...(projectEvidence.evidence.visualGraphSerialization ? [] : ["Project evidence missing visual graph serialization."])
];

const report = {
  ok: issues.length === 0,
  status: issues.length === 0 ? "pass" : "blocked",
  schema: "aura3d105-editor-tools-package-smoke",
  generatedAt: new Date().toISOString(),
  bridge: bridgeSnapshot.evidence,
  project: projectEvidence.evidence,
  issues
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

