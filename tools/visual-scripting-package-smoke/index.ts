import {
  VisualGraphExecutor,
  createVisualNode,
  validateGraph
} from "../../packages/scripting/src/index";

const graph = {
  nodes: [
    createVisualNode("onFrame", "frame"),
    createVisualNode("translate", "move", { nodeId: "player", delta: [2, 0, 0] }),
    createVisualNode("crossFade", "attack", { controllerId: "anim", clip: "lightPunch", duration: 0.08 }),
    createVisualNode("onAnimationEvent", "event", { controllerId: "anim", eventType: "hitbox.open" }),
    createVisualNode("openHitbox", "hitbox", { hitboxId: "player.lightPunch", ownerId: "player", damage: 8 }),
    createVisualNode("captureSnapshot", "evidence", { label: "visual-scripting-package-smoke" })
  ],
  edges: [
    { fromNode: "frame", fromPort: "out", toNode: "move", toPort: "in" },
    { fromNode: "frame", fromPort: "out", toNode: "attack", toPort: "in" },
    { fromNode: "event", fromPort: "out", toNode: "hitbox", toPort: "in" },
    { fromNode: "frame", fromPort: "out", toNode: "evidence", toPort: "in" }
  ]
};

const context = {
  frame: 3,
  time: 0.05,
  dt: 1 / 60,
  runtimeNodes: {
    player: { id: "player", position: [0, 0, 0] as const }
  },
  animationControllers: {
    anim: { id: "anim", clips: ["idle", "lightPunch"], currentClip: "idle", clipTime: 0.05 }
  },
  animationEvents: [
    { controllerId: "anim", type: "hitbox.open", clip: "lightPunch", time: 0.04 }
  ]
};

const validation = validateGraph(graph, { context });
const result = validation.length === 0 ? new VisualGraphExecutor(context).execute(graph, context) : undefined;
const sideEffectKinds = result?.sideEffects.map((effect) => effect.kind) ?? [];
const issues = [
  ...validation,
  ...(!sideEffectKinds.includes("runtime.translate") ? ["Missing runtime.translate side effect."] : []),
  ...(!sideEffectKinds.includes("animation.crossFade") ? ["Missing animation.crossFade side effect."] : []),
  ...(!sideEffectKinds.includes("combat.openHitbox") ? ["Missing combat.openHitbox side effect."] : []),
  ...(!sideEffectKinds.includes("evidence.captureSnapshot") ? ["Missing evidence.captureSnapshot side effect."] : [])
];

const report = {
  ok: issues.length === 0,
  status: issues.length === 0 ? "pass" : "blocked",
  schema: "aura3d105-visual-scripting-package-smoke",
  generatedAt: new Date().toISOString(),
  nodeKinds: result?.nodeKinds ?? [],
  sideEffectKinds,
  executionOrder: result?.executionOrder ?? [],
  issues
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

