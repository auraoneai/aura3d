// Provider-bound scene-kit namespace. A caller supplies its own games factory.

import type { AuraAssetRef, AuraEffectNode, AuraEnvironmentNode, AuraInteractionNode, AuraLabelNode, AuraLightNode, AuraSceneKit, AuraSceneKitCustomizeOptions, AuraSceneKitDiagnostics, AuraSceneKitId, AuraSceneNode } from "./types.js";
import { buildSceneKitWithGames, createSceneKitPerformanceDiagnostics, type SceneKitGames } from "../sceneKitDiagnosticsCore.js";
import { scene } from "./scene.js";
import { timeline } from "./timeline.js";
import { prd02EnvironmentBuilders } from "./environments.js";
import { lazyNamespace } from "../lazyNamespace.js";
import { resolveQrFlags } from "../../contracts/flags.js";

/** Bind all kit builds, including customization, to one entry's games factory. */
export function createSceneKitsWithGames(games: SceneKitGames) {
  return lazyNamespace(() => ({
    physicsPlayground: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKitWithGames(games, "physicsPlayground", options),
    particleFountain: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKitWithGames(games, "particleFountain", options),
    solarSystem: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKitWithGames(games, "solarSystem", options),
    neonTunnel: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKitWithGames(games, "neonTunnel", options),
    dataViz: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKitWithGames(games, "dataViz", options),
    miniGolf: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKitWithGames(games, "miniGolf", options),
    materialLab: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKitWithGames(games, "materialLab", options),
    cityBlock: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKitWithGames(games, "cityBlock", options),
    humanoidWalk: (options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit => makeSceneKitWithGames(games, "humanoidWalk", options),
    productViewer: (asset: AuraAssetRef<"model">, options: Omit<AuraSceneKitCustomizeOptions, "asset"> = {}): AuraSceneKit => makeSceneKitWithGames(games, "productViewer", { ...options, asset })
  } as const));
}

/** PRD-02 (R7): under `A3D_QR_LIGHTING`, kits switch from ambient + unshadowed
 *  directional to `environments.preset("studio")` + `lights.directional({ shadow: true })`.
 *  Flags resolve ambiently (options → url → env) because kit construction takes no
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

/** Build one kit using the games factory belonging to this entry. */
export function makeSceneKitWithGames(games: SceneKitGames, id: AuraSceneKitId, options: AuraSceneKitCustomizeOptions = {}): AuraSceneKit {
  const built = buildSceneKitWithGames(games, id, options);
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
    customize: (next) => makeSceneKitWithGames(games, id, { ...options, ...next })
  };
}
