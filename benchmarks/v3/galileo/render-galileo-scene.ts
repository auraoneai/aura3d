import { createAssetViewerWorkflow, createInteractiveSceneWorkflow } from "@galileo3d/workflows";
import { Geometry, PBRMaterial, Renderer, createLightingDefault, type RenderDeviceDiagnostics, type RenderItem } from "@galileo3d/rendering";
import { composeMat4 } from "@galileo3d/scene";
import type { V3ComparisonObject, V3ComparisonScene } from "../shared/scenes";

export interface GalileoComparisonResult {
  readonly engine: "g3d";
  readonly sceneId: string;
  readonly canvas: HTMLCanvasElement;
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly setupLines: number;
  readonly drawCalls: number;
  readonly itemCount: number;
  readonly gaps: readonly string[];
}

export async function renderGalileoComparisonScene(scene: V3ComparisonScene, options: { readonly origin: string; readonly setupLines: number }): Promise<GalileoComparisonResult> {
  const canvas = createComparisonCanvas(`${scene.id}-g3d`);
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: 900,
    height: 620,
    clearColor: [0.025, 0.028, 0.032, 1],
    preserveDrawingBuffer: true
  });
  let diagnostics: RenderDeviceDiagnostics;
  let itemCount = scene.objects.length;
  let gaps: readonly string[] = [];

  if (scene.id === "asset" && scene.assetUrl) {
    const workflow = await createAssetViewerWorkflow({
      url: `${options.origin}${scene.assetUrl}`,
      camera: "auto-frame",
      lighting: "studioProduct",
      shadows: true,
      postprocess: "product-default"
    });
    diagnostics = renderer.render(workflow.source, workflow.camera);
    itemCount = workflow.diagnostics.asset?.meshCount ?? 0;
    gaps = ["Uses G3D fixture loader coverage, not full arbitrary glTF ecosystem parity."];
    workflow.dispose();
  } else if (scene.id === "interactive") {
    const workflow = createInteractiveSceneWorkflow({ preset: "orbiting-products" });
    diagnostics = renderer.render(workflow.update(0.75), workflow.camera);
    itemCount = workflow.renderItems?.length ?? 0;
    gaps = ["Interactive comparison is a fixed timestamp capture, not a long-running input benchmark."];
    workflow.dispose();
  } else {
    const lighting = createLightingDefault(scene.id === "material" ? "interiorGallery" : "studioProduct");
    const renderItems = scene.objects.map(toGalileoRenderItem);
    diagnostics = renderer.render({
      renderItems,
      cameraPolicy: "auto-frame",
      cameraFrameOptions: { paddingRatio: 0.2, yawRadians: -0.44, pitchRadians: -0.14 },
      environmentLighting: lighting.environmentLighting,
      shadow: false,
      postprocess: { ...lighting.postprocess, targetFormat: "rgba8" }
    });
    gaps = ["Procedural comparison approximates product intent rather than matching a production catalog asset exactly."];
  }

  return {
    engine: "g3d",
    sceneId: scene.id,
    canvas,
    diagnostics,
    setupLines: options.setupLines,
    drawCalls: diagnostics.drawCalls,
    itemCount,
    gaps
  };
}

function toGalileoRenderItem(object: V3ComparisonObject): RenderItem {
  return {
    label: object.label,
    geometry: toGalileoGeometry(object),
    material: new PBRMaterial({
      name: `${object.label}-material`,
      baseColor: [object.color[0], object.color[1], object.color[2], 1],
      metallic: object.metallic,
      roughness: object.roughness
    }),
    modelMatrix: composeMat4(object.position, [0, 0, 0, 1], object.scale)
  };
}

function toGalileoGeometry(object: V3ComparisonObject) {
  if (object.geometry === "sphere") return Geometry.uvSphere(1, 48, 24, { textured: true });
  if (object.geometry === "cylinder") return Geometry.cylinder({ radius: 1, height: 1, textured: true });
  return Geometry.texturedCube(1);
}

function createComparisonCanvas(testId: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.dataset.testid = testId;
  canvas.width = 900;
  canvas.height = 620;
  canvas.style.width = "900px";
  canvas.style.height = "620px";
  return canvas;
}
