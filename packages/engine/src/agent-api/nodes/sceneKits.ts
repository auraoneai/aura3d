// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef, AuraEffectNode, AuraInteractionNode, AuraLabelNode, AuraLightNode, AuraSceneKit, AuraSceneKitCustomizeOptions, AuraSceneKitDiagnostics, AuraSceneKitId } from "./types.js";
import { buildSceneKit, createSceneKitPerformanceDiagnostics } from "../sceneKitDiagnostics.js";
import { effects } from "./effects.composite.js";
import { interactions } from "./interactions.js";
import { scene } from "./scene.js";
import { timeline } from "./timeline.js";
import { ui } from "./ui.js";
import { camera } from "./camera.js";
import { lights } from "./lights.js";
import { prd02EnvironmentBuilders } from "./environments.js";
import { cityBlock } from "./prefabs/cityBlock.js";
import { humanoidWalk } from "../humanoid-walk-runtime.js";
import { particleFountain } from "../particle-fountain-runtime.js";
import { productViewer } from "../product-viewer-runtime.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import type { AuraEnvironmentNode, AuraSceneNode } from "./types.js";


export const sceneKits = lazyNamespace(() => ({
  physicsPlayground: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("physicsPlayground", options),
  particleFountain: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("particleFountain", options),
  solarSystem: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("solarSystem", options),
  neonTunnel: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("neonTunnel", options),
  dataViz: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("dataViz", options),
  miniGolf: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("miniGolf", options),
  materialLab: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("materialLab", options),
  cityBlock: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("cityBlock", options),
  humanoidWalk: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKit("humanoidWalk", options),
  productViewer: (asset: AuraAssetRef<"model">, options: Omit<AuraSceneKitCustomizeOptions, "asset"> = {}): AuraSceneKit => makeSceneKit("productViewer", { ...options, asset })
} as const));

/** PRD-02 (R7): under `A3D_QR_LIGHTING`, kits switch from ambient + unshadowed
 *  directional to `environments.preset("studio")` + `lights.directional({ shadow: true })`.
 *  Flags resolve ambiently (options → url → env) because `makeSceneKit` takes no
 *  compile context; explicit kit env nodes are left alone. */
export function prd02KitLighting(nodes: readonly AuraSceneNode[], flagsOn?: boolean): readonly AuraSceneNode[] {
  const on = flagsOn ?? resolveQrFlags({ url: typeof location === "undefined" ? undefined : location.href, env: typeof process === "undefined" ? undefined : process.env }).on("A3D_QR_LIGHTING");
  if (!on) return nodes;
  const out: AuraSceneNode[] = [];
  for (const node of nodes) {
    if (node.kind === "light" && node.light === "ambient") continue;
    if (node.kind === "light" && node.light === "directional" && node.shadow === undefined) {
      out.push({ ...node, shadow: true });
      continue;
    }
    out.push(node);
  }
  if (!out.some((node) => node.kind === "environment")) {
    out.push(prd02EnvironmentBuilders.preset("studio", { name: "kit studio environment" }).toJSON() as AuraEnvironmentNode);
  }
  return out;
}

export function makeSceneKit(id: AuraSceneKitId, options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit {
  const built = buildSceneKit(id, options);
  const kitNodes = prd02KitLighting(built.nodes);
  const lightNodes = built.nodes.filter((node): node is AuraLightNode => node.kind === "light");
  const effectNodes = built.nodes.filter((node): node is AuraEffectNode => node.kind === "effect");
  const interactionNodes = built.nodes.filter((node): node is AuraInteractionNode => node.kind === "interaction");
  const uiNodes = built.nodes.filter((node): node is AuraLabelNode => node.kind === "label" && node.label === "hud");
  const performanceDiagnostics = createSceneKitPerformanceDiagnostics(id, built.nodes);
  const diagnostics: AuraSceneKitDiagnostics = {
    kind: "aura-scene-kit-diagnostics",
    id,
    nodeCount: built.nodes.length,
    lightCount: lightNodes.length,
    effectCount: effectNodes.length,
    interactionCount: interactionNodes.length,
    uiCount: uiNodes.length,
    cameraMode: built.camera.mode,
    structuralScore: built.structuralScore,
    problems: built.problems ?? [],
    performance: performanceDiagnostics
  };
  const makeScene = () => scene().background(built.background).addMany(kitNodes).camera(built.camera).timeline(timeline.loop({ seconds: id === "solarSystem" ? 18 : 8 }));
  return {
    kind: "aura-scene-kit",
    id,
    nodes: kitNodes,
    camera: built.camera,
    lights: lightNodes,
    effects: effectNodes,
    interactions: interactionNodes,
    ui: uiNodes,
    diagnostics,
    evidence: built.evidence,
    acceptanceEvidence: built.evidence,
    scene: makeScene,
    toAppOptions: () => ({ scene: makeScene(), diagnostics: false }),
    customize: (next) => makeSceneKit(id, { ...options, ...next })
  };
}
