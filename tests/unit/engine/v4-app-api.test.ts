import { describe, expect, it } from "vitest";
import { G3D_APP_WORKFLOW_PRESETS, createG3DApp, resolveG3DAppQualityPreset } from "@galileo3d/apps";
import type { RenderDeviceDiagnostics } from "@galileo3d/rendering";

describe("V4 public app API", () => {
  it("exposes stable workflow presets and quality presets", () => {
    expect(G3D_APP_WORKFLOW_PRESETS).toEqual([
      "asset-viewer",
      "product-configurator",
      "material-studio",
      "scene-showcase",
      "interactive-scene"
    ]);
    expect(resolveG3DAppQualityPreset("draft")).toMatchObject({ preset: "draft", targetFormat: "rgba8", antialias: false });
    expect(resolveG3DAppQualityPreset("balanced")).toMatchObject({ preset: "balanced", targetFormat: "rgba16f", antialias: true });
    expect(resolveG3DAppQualityPreset("production", { width: 1920, height: 1080 })).toMatchObject({ preset: "production", width: 1920, height: 1080, targetFormat: "rgba16f" });
  });

  it("creates an app, renders workflow presets, and reports diagnostics", async () => {
    const renders: string[] = [];
    const renderDiagnostics: RenderDeviceDiagnostics = {
      drawCalls: 3,
      buffers: 1,
      shaders: 1,
      textures: 1,
      textureBytes: 512,
      lastError: null,
      contextLost: false
    };
    const app = await createG3DApp({
      quality: "production",
      width: 1024,
      height: 768,
      canvas: {} as HTMLCanvasElement,
      rendererFactory: async () => ({
        render(source) {
          renders.push(source.cameraPolicy ?? "none");
          return renderDiagnostics;
        },
        dispose() {
          renders.push("disposed");
        }
      })
    });

    const workflow = await app.renderWorkflow("scene-showcase", { preset: "gallery" });
    expect(workflow.kind).toBe("scene-showcase");
    expect(renders).toContain("auto-frame");
    expect(app.diagnostics()).toMatchObject({
      appState: "ready",
      quality: { preset: "production", width: 1024, height: 768 },
      workflowRuns: 1,
      lastWorkflow: "scene-showcase",
      lastRender: { drawCalls: 3 }
    });
    await app.dispose();
    expect(app.diagnostics().appState).toBe("disposed");
    expect(renders).toContain("disposed");
  });
});
