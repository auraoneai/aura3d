# Aura3D Editor And Visual Scripting API

Status: 1.0.5 release guidance draft.

This page documents the safe authoring-tool pattern for Aura3D editor-runtime
and visual scripting work. It is scoped to browser authoring, timeline runtime
bridges, visual graph commands, deterministic execution, typed asset evidence,
and release proof.

Use this page with:

- `docs/api/animation-runtime-events.md`
- `docs/api/game-runtime.md`
- `docs/api/assets.md`
- `docs/concepts/editor-runtime.md`
- `docs/editor/browser-first-workflow.md`
- `docs/project/aura3d-105-release-gates.md`

## Current Boundary

Aura3D currently exposes reusable packages:

- `@aura3d/editor-runtime` for selection, command history, inspector models,
  hierarchy, gizmos, prefab registry, project serialization, timeline models,
  timeline runtime bridges, play-mode bridges, diagnostics, and static export
  helpers.
- `@aura3d/scripting` for behavior systems and visual graph serialization,
  validation, deterministic execution, contextual node evaluation, and
  side-effect commands.
- `@aura3d/engine` for the browser runtime that actually mounts a scene, owns
  runtime nodes, runs `app.onFrame(...)`, steps deterministically through
  `app.step(dt)`, and collects evidence.

Aura3D 1.0.5 must prove the bridge between these layers. A visual graph or
editor project is not release-ready until it has browser evidence showing that
the authored data mutates the mounted Aura app.

Current visual graph execution can produce deterministic side effects. It still
does not mean Aura3D has Unity Visual Scripting parity, Unreal Blueprint parity,
async latent graph parity, editor-authored visual scripting parity, or a live
`app.installGraph(...)` bridge unless those claims are backed by evidence.

## Imports

Agent-authored routes still use `@aura3d/engine` for the live app.

```ts
import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";
```

Authoring tools and tests can use the public editor and scripting packages.

```ts
import {
  TimelineModel,
  collectEditorProjectEvidence,
  createTimelineRuntimeBridge,
  serializeEditorProject
} from "@aura3d/editor-runtime";
import {
  VisualGraphExecutor,
  createVisualNode,
  listVisualNodeDefinitions,
  serializeGraph,
  validateGraph
} from "@aura3d/scripting";
```

Do not import private package internals, renderer internals, `three`, or raw
asset URLs. Editor project documents should carry typed asset metadata and
source/license evidence.

## Editor Project Documents

Editor project documents should store typed asset provenance, timelines, visual
graphs, runtime bindings, and evidence state. They should not be used to smuggle
unsafe model ids into public examples.

```ts
const project = {
  schema: "a3d-editor-project",
  version: 1,
  name: "aura-clash-animation-pass",
  nodes: [
    { id: "player", kind: "model", runtimeId: "player", assetName: "fighter" }
  ],
  assets: [
    {
      id: "fighter",
      name: "fighter",
      uri: "public/aura-assets/fighter.glb",
      type: "glb",
      source: "Quaternius Universal Base Characters",
      license: "CC0-1.0",
      clips: ["Idle", "Run", "LightPunch"],
      morphTargets: ["Mouth_AA", "Mouth_EE", "Mouth_OH"]
    }
  ],
  timelines: [],
  visualGraphs: [],
  evidence: {
    serializedBy: "editor-runtime",
    roundTripReady: false,
    browserWorkflowReady: false
  }
} as const;

const json = serializeEditorProject(project);
const evidence = collectEditorProjectEvidence(project);

console.log(json.length, evidence.evidence.sourceLicenseAssetEvidence);
```

Release docs and examples should count source/license-bearing asset entries.
String-only asset references are allowed only for legacy or importer-specific
documents and should not be used as 1.0.5 release proof.

## Timeline Runtime Bridge

Use `TimelineModel` for authored timeline data and
`createTimelineRuntimeBridge(...)` to apply animation and signal tracks to
runtime targets in deterministic tests. Bridge targets should call public
runtime node and animation controller methods.

```ts
const timeline = new TimelineModel({
  id: "fighter-intro",
  name: "Fighter Intro",
  duration: 2,
  loopMode: "none",
  tracks: [
    {
      id: "player-animation",
      name: "Player Animation",
      type: "animation",
      clips: [
        {
          id: "idle",
          name: "Idle",
          clipName: "Idle",
          startTime: 0,
          duration: 0.8,
          properties: { targetId: "player" }
        },
        {
          id: "punch",
          name: "Light Punch",
          clipName: "LightPunch",
          startTime: 0.8,
          duration: 0.42,
          easeInDuration: 0.08,
          properties: { targetId: "player" }
        }
      ]
    },
    {
      id: "player-events",
      name: "Player Events",
      type: "signal",
      clips: [
        {
          id: "hitbox-open",
          name: "hitbox.open",
          startTime: 0.9,
          duration: 0.01,
          properties: { targetId: "player", event: "hitbox.open" }
        }
      ]
    }
  ]
});

const bridge = createTimelineRuntimeBridge({
  timeline,
  targets: [
    {
      id: "player",
      applyTimelineAnimation(application) {
        animation.crossFade(application.clipName, 0.08, {
          restart: application.localTime === 0,
          layer: application.trackName.includes("Animation") ? "base" : undefined
        });
      },
      applyTimelineSignal(signal) {
        if (signal.event === "hitbox.open") {
          combat.attack("player", "player-light");
        }
      },
      snapshot() {
        return app.nodes.require("player").snapshot();
      }
    }
  ],
  bindings: [{ trackId: "player-animation", targetId: "player", assetId: "fighter" }]
});

const bridgeProof = bridge.applyAt(0.92, { replaySignals: true });
```

Browser editor evidence must prove the same timeline can be edited, saved,
reloaded, scrubbed, played, and rendered. A source-only bridge snapshot is not a
browser editor workflow claim.

## Visual Node Catalog

The current visual scripting catalog includes these release-relevant categories:

- Runtime: `onStart`, `onFrame`, `getNode`, `setPosition`, `translate`,
  `rotate`, `setVisible`, `setMaterial`.
- Input: `pressed`, `held`, `released`, `axis`, `buffered`, `combo`.
- Animation: `playClip`, `restartClip`, `crossFade`, `setLayerWeight`,
  `onAnimationEvent`, `setMorphTarget`, `setMorphTargets`, `getClipTime`.
- Physics: `setVelocity`, `jump`, `dash`, `onCollisionEnter`,
  `onCollisionExit`, `raycast`, `overlap`.
- Combat: `openHitbox`, `closeHitbox`, `setHurtbox`, `onHit`,
  `applyDamage`, `applyKnockback`.
- Camera: `follow`, `frameTargets`, `shake`, `cutTo`.
- Evidence: `captureSnapshot`, `markProof`, `assertState`.

Agents can inspect the catalog instead of hard-coding it:

```ts
const animationNodes = listVisualNodeDefinitions()
  .filter((node) => node.category === "animation")
  .map((node) => node.kind);

console.log(animationNodes);
```

## Deterministic Visual Graph Execution

Visual graph execution reads a deterministic context and emits side effects.
Application code must apply those side effects to Aura3D runtime systems until a
live engine bridge is implemented and evidenced.

```ts
const graph = {
  nodes: [
    createVisualNode("pressed", "pressed-light", { action: "light" }),
    createVisualNode("branch", "light-branch"),
    createVisualNode("crossFade", "play-punch", {
      controllerId: "player-animation",
      clip: "LightPunch",
      duration: 0.06,
      restart: true,
      layer: "upper-body"
    }),
    createVisualNode("markProof", "proof", {
      proofId: "visual-graph-attack"
    })
  ],
  edges: [
    {
      fromNode: "pressed-light",
      fromPort: "out",
      toNode: "light-branch",
      toPort: "condition"
    },
    {
      fromNode: "light-branch",
      fromPort: "true",
      toNode: "play-punch",
      toPort: "in"
    },
    {
      fromNode: "play-punch",
      fromPort: "out",
      toNode: "proof",
      toPort: "in"
    }
  ]
};

const errors = validateGraph(graph, {
  context: {
    input: { pressed: { light: true } },
    animationControllers: [
      {
        id: "player-animation",
        nodeId: "player",
        currentClip: "Idle",
        clips: ["Idle", "Run", "LightPunch"]
      }
    ]
  },
  strictReferences: true
});

if (errors.length > 0) {
  throw new Error(errors.join("\n"));
}

const result = new VisualGraphExecutor().execute(graph, {
  frame: 12,
  time: 0.2,
  dt: 1 / 60,
  input: { pressed: { light: true } },
  animationControllers: [
    {
      id: "player-animation",
      nodeId: "player",
      currentClip: "Idle",
      clips: ["Idle", "Run", "LightPunch"]
    }
  ]
});

console.log(result.sideEffects, result.blockedClaims);
```

The graph above is evidence that the graph validates and emits deterministic
commands. It is not evidence that a browser scene changed until the side effects
are applied to `AnimationController`, `game.combatWorld(...)`, runtime nodes,
camera, effects, HUD, and evidence capture in a mounted Aura app.

## Applying Visual Graph Side Effects

A release route can keep the bridge explicit while the live engine integration
is still being built.

```ts
function applyVisualGraphSideEffects(result: ReturnType<VisualGraphExecutor["execute"]>) {
  for (const effect of result.sideEffects) {
    if (effect.kind === "animation.crossFade") {
      const payload = effect.payload as {
        controllerId: string;
        clip: string;
        duration: number;
        restart?: boolean;
        layer?: string;
      };

      if (payload.controllerId === "player-animation") {
        animation.crossFade(payload.clip, payload.duration, {
          restart: payload.restart,
          layer: payload.layer
        });
      }
    }

    if (effect.kind === "runtime.translate") {
      const payload = effect.payload as {
        nodeId: string;
        delta: readonly [number, number, number];
      };
      app.nodes.require(payload.nodeId).translate(payload.delta[0], payload.delta[1], payload.delta[2]);
    }
  }
}
```

Keep the side-effect adapter small and testable. 1.0.5 should replace repeated
route-local adapters with a documented public bridge only after browser evidence
proves it.

## Editor And Visual Scripting Evidence

Editor evidence should write reports under:

- `tests/reports/editor-tools/unit.json`
- `tests/reports/editor-tools/browser.json`
- `tests/reports/editor-tools/evidence.json`
- `tests/reports/editor-tools/package-smoke.json`

Visual scripting evidence should write reports under:

- `tests/reports/visual-scripting/unit.json`
- `tests/reports/visual-scripting/browser.json`
- `tests/reports/visual-scripting/evidence.json`
- `tests/reports/visual-scripting/package-smoke.json`

Minimum editor proof ids:

- `editor-select-runtime-node`
- `editor-edit-transform`
- `editor-assign-typed-asset`
- `editor-timeline-scrub-animation`
- `editor-animation-event-marker`
- `editor-play-mode-runtime-replay`
- `editor-project-round-trip`

Minimum visual scripting proof ids:

- `visual-graph-runtime-node-translate`
- `visual-graph-input-to-animation`
- `visual-graph-animation-event-hitbox`
- `visual-graph-morph-target-viseme`
- `visual-graph-camera-command`
- `visual-graph-deterministic-app-step`

Do not mark editor or visual scripting tasks complete from package unit tests
alone. The release proof must include browser workflow screenshots, JSON
evidence, deterministic `app.step(dt)` snapshots, typed asset/source/license
evidence, and package smoke reports from a consumer project.
