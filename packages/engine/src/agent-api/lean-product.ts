import {
  collectRenderItems,
  LeanProductRenderer,
  type RenderItem
} from "@aura3d/rendering/lean-runtime";
import {
  loadProductionGLTFRenderPipeline,
  type ProductionGLTFRenderPipeline
} from "@aura3d/assets/gltf-runtime";
import {
  createAuraAppWithRenderer,
  createAuraLeanModelMatrix,
  type AuraLeanApp,
  type AuraLeanAppTarget,
  type AuraLeanCreateAppOptions,
  type AuraLeanModelRuntime,
  type AuraLeanModelSpec,
  type AuraLeanSceneSnapshot
} from "./lean-base.js";
import { multiplyMat4, type Mat4 } from "@aura3d/scene/math";

export * from "./lean-base.js";

export function createAuraApp(canvas: AuraLeanAppTarget, options: AuraLeanCreateAppOptions): AuraLeanApp {
  const pipelines: Array<{ readonly node: AuraLeanModelSpec; readonly pipeline: ProductionGLTFRenderPipeline }> = [];
  const modelRuntime: AuraLeanModelRuntime = {
    async initialize(target, snapshot) {
      const nodes = snapshot.nodes.filter((node): node is AuraLeanModelSpec => node.kind === "model");
      target.dataset.aura3dModelStage = nodes.length === 0 ? "no-models" : "loading-models";
      for (const node of nodes) {
        target.dataset.aura3dModelStage = `loading:${node.asset.id}`;
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
        target.dataset.aura3dModelStage = `loaded:${node.asset.id}`;
      }
      target.dataset.aura3dModelStage = "ready";
    },
    renderItems(): readonly RenderItem[] {
      return pipelines.filter(({ node }) => node.visible !== false).flatMap(({ node, pipeline }) => {
        const placement = createAuraLeanModelMatrix(node.position, node.scale);
        return collectRenderItems(pipeline.source).map((renderItem) => {
          const {
            normalMatrix: _sourceNormalMatrix,
            modelViewProjectionMatrix: _sourceModelViewProjectionMatrix,
            ...item
          } = renderItem;
          return {
            ...item,
            modelMatrix: renderItem.modelMatrix
              ? multiplyMat4(Array.from(placement) as Mat4, Array.from(renderItem.modelMatrix) as Mat4)
              : placement,
            includeInAutoFrame: false
          };
        });
      });
    },
    dispose() {
      for (const entry of pipelines) entry.pipeline.dispose();
      pipelines.length = 0;
    }
  };
  return createAuraAppWithRenderer(canvas, {
    ...options,
    modelRuntime,
    rendererFactory: LeanProductRenderer
  });
}
