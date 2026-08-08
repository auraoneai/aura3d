import { collectRenderItems, type RenderItem } from "@aura3d/rendering/lean-runtime";
import {
  loadProductionGLTFRenderPipeline,
  type ProductionGLTFRenderPipeline
} from "@aura3d/assets/gltf-runtime";
import {
  createAuraApp as createLeanApp,
  type AuraLeanApp,
  type AuraLeanAppTarget,
  type AuraLeanCreateAppOptions,
  type AuraLeanModelRuntime,
  type AuraLeanModelSpec,
  type AuraLeanSceneSnapshot
} from "./lean.js";

export * from "./lean.js";

export function createAuraApp(canvas: AuraLeanAppTarget, options: AuraLeanCreateAppOptions): AuraLeanApp {
  const pipelines: Array<{ readonly node: AuraLeanModelSpec; readonly pipeline: ProductionGLTFRenderPipeline }> = [];
  const modelRuntime: AuraLeanModelRuntime = {
    async initialize(target, snapshot) {
      const nodes = snapshot.nodes.filter((node): node is AuraLeanModelSpec => node.kind === "model");
      for (const node of nodes) {
        pipelines.push({
          node,
          pipeline: await loadProductionGLTFRenderPipeline({
            url: node.asset.url,
            assetId: node.asset.id,
            assetName: node.name ?? node.asset.id,
            width: target.width,
            height: target.height
          })
        });
      }
    },
    renderItems(): readonly RenderItem[] {
      return pipelines.flatMap(({ pipeline }) => collectRenderItems(pipeline.source));
    },
    dispose() {
      for (const entry of pipelines) entry.pipeline.dispose();
      pipelines.length = 0;
    }
  };
  return createLeanApp(canvas, { ...options, modelRuntime });
}
