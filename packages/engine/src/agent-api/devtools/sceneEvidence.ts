// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraModelNode, AuraPrimitiveNode, AuraGroupNode, AuraLabelNode, AuraInteractionNode, AuraSceneSnapshot, AuraSceneEvidence } from "../nodes/types.js";
import { AuraSceneBuilder, scene } from "../nodes/scene.js";
import { animation } from "../nodes/animation.js";
import { camera } from "../nodes/camera.js";
import { collectGameRuntimeEvidence as collectGameRuntimeEvidenceV105 } from "../GameEvidence";
import { createAssetProvenance } from "./diagnostics.js";
import { createRendererDiagnosticReport } from "./rendererDiagnostics.js";
import { flattenSceneSnapshot } from "../index.js";
import { group } from "../nodes/groups.js";
import { interactions } from "../nodes/interactions.js";
import { labels } from "../nodes/labels.js";
import { model } from "../nodes/model.js";
import { normalizeSceneSnapshot } from "../compiler/observations.js";
import { performance, createPerformanceEvidence } from "./performanceEvidence.js";
import { physics } from "../nodes/physics.js";
import { primitive } from "../nodes/primitives.js";

export function collectAuraSceneEvidence(sceneValue: AuraSceneBuilder | AuraSceneSnapshot): AuraSceneEvidence {
  const snapshot = flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue));
  const physicsNodes = snapshot.nodes.filter((node): node is AuraModelNode | AuraPrimitiveNode =>
    (node.kind === "model" || node.kind === "primitive") && Boolean(node.physics)
  );
  const interactionNodes = snapshot.nodes.filter((node): node is AuraInteractionNode => node.kind === "interaction");
  const labelNodes = snapshot.nodes.filter((node): node is AuraLabelNode => node.kind === "label");
  const animatedNodes = snapshot.nodes.filter((node): node is AuraModelNode | AuraPrimitiveNode | AuraGroupNode =>
    (node.kind === "model" || node.kind === "primitive" || node.kind === "group") && Boolean(node.animation)
  );
  const clips = Array.from(new Set(animatedNodes.map((node) => node.animation?.clip).filter((clip): clip is string => Boolean(clip)))).sort();
  const assetProvenance = snapshot.nodes
    .filter((node): node is AuraModelNode => node.kind === "model")
    .map((node) => createAssetProvenance(node.asset));
  const runtimeNodeIds = snapshot.nodes
    .map((node) => "runtime" in node ? node.runtime?.id : undefined)
    .filter((id): id is string => Boolean(id));
  const expectsGameRuntime = runtimeNodeIds.length > 0 || interactionNodes.some((node) => node.mode === "keyboard" || node.mode === "drag-vector" || node.mode === "click-impulse");

  return {
    physics: {
      worldAttached: Boolean(snapshot.physics),
      bodies: snapshot.physics?.bodies ?? physicsNodes.length,
      colliders: snapshot.physics?.colliders ?? physicsNodes.length,
      contacts: snapshot.physics?.contacts ?? 0,
      steps: snapshot.physics?.steps ?? 0,
      resets: snapshot.physics?.resets ?? 0,
      nodesWithPhysics: physicsNodes.length,
      sensors: physicsNodes.filter((node) => node.physics?.sensor === true).length
    },
    interactions: {
      modes: Array.from(new Set(interactionNodes.map((node) => node.mode))).sort() as AuraInteractionNode["mode"][],
      orbitEnabled: interactionNodes.some((node) => node.mode === "orbit"),
      hoverTargets: interactionNodes.filter((node) => node.mode === "hover" && node.target).map((node) => node.target!),
      dragTargets: interactionNodes.filter((node) => node.mode === "drag-vector" && node.target).map((node) => node.target!),
      impulseTargets: interactionNodes.filter((node) => node.mode === "click-impulse" && node.target).map((node) => node.target!)
    },
    camera: {
      mode: snapshot.camera.mode,
      orbitEnabled: snapshot.camera.mode === "orbit" || interactionNodes.some((node) => node.mode === "orbit"),
      followTarget: snapshot.camera.targetNode,
      captureTime: snapshot.camera.captureTime
    },
    animation: {
      animatedNodes: animatedNodes.length,
      turntableEnabled: clips.includes("turntable"),
      walkEnabled: clips.includes("walk"),
      clips
    },
    labels: {
      count: labelNodes.length,
      kinds: Array.from(new Set(labelNodes.map((node) => node.label))).sort() as AuraLabelNode["label"][],
      occlusionAware: labelNodes.filter((node) => node.occlusionAware === true).length,
      collisionAvoidance: labelNodes.filter((node) => node.collisionAvoidance === true).length
    },
    performance: createPerformanceEvidence(snapshot),
    gameRuntime: collectGameRuntimeEvidenceV105(
      {
        runtime: {
          frame: 0,
          time: 0,
          paused: true
        },
        nodes: {
          ids: () => runtimeNodeIds
        }
      },
      {
        animation: {
          controllers: animatedNodes.length,
          activeClips: clips,
          eventCount: 0
        },
        assets: {
          typedAssets: assetProvenance.filter((asset) => asset.source === "typed-aura-assets-manifest").length,
          missingAssets: []
        },
        source: {
          mode: "scene-source",
          expectsGame: expectsGameRuntime,
          label: "collectAuraSceneEvidence"
        }
      }
    ),
    rendering: createRendererDiagnosticReport(snapshot),
    assets: assetProvenance
  };
}
