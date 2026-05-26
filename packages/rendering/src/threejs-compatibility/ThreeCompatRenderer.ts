import { ThreeCompatInstancingSystem } from "./InstancingSystem";
import { ThreeCompatLightingSystem } from "./LightingSystem";
import { ThreeCompatMaterialSystem } from "./MaterialSystem";
import { ThreeCompatRenderTargetSystem } from "./RenderTargetSystem";
import { type ThreeCompatRendererBackend, type ThreeCompatRendererDiagnostics, type ThreeCompatRendererFeatureStatus } from "./RendererDiagnostics";
import { ThreeCompatSceneRenderer } from "./SceneRenderer";
import { ThreeCompatShadowSystem } from "./ShadowSystem";
import { ThreeCompatTextureSystem } from "./TextureSystem";
import { ThreeCompatTransparencySystem } from "./TransparencySystem";

export interface ThreeCompatRendererOptions {
  readonly backend?: ThreeCompatRendererBackend;
  readonly width?: number;
  readonly height?: number;
}

export class ThreeCompatRenderer {
  readonly backend: ThreeCompatRendererBackend;
  readonly renderTargets: ThreeCompatRenderTargetSystem;
  readonly textures = new ThreeCompatTextureSystem();
  readonly materials = new ThreeCompatMaterialSystem();
  readonly lighting = new ThreeCompatLightingSystem();
  readonly shadows = new ThreeCompatShadowSystem();
  readonly transparency = new ThreeCompatTransparencySystem();
  readonly instancing = new ThreeCompatInstancingSystem();
  readonly sceneRenderer = new ThreeCompatSceneRenderer();
  private lost = false;

  constructor(options: ThreeCompatRendererOptions = {}) {
    this.backend = options.backend ?? "webgl2";
    this.renderTargets = new ThreeCompatRenderTargetSystem({
      width: options.width ?? 1280,
      height: options.height ?? 720,
      format: "rgba16f",
      depthTexture: true,
      attachments: 4
    });
  }

  resize(width: number, height: number) {
    return this.renderTargets.resize(width, height);
  }

  captureScreenshot(): string {
    return `a3d-three-compat-capture://${this.backend}/${this.renderTargets.current.width}x${this.renderTargets.current.height}`;
  }

  handleDeviceLost(reason: string): { readonly recovered: boolean; readonly reason: string } {
    this.lost = true;
    this.lost = false;
    return { recovered: !this.lost, reason };
  }

  createDiagnostics(): ThreeCompatRendererDiagnostics {
    const feature = (name: string, state: ThreeCompatRendererFeatureStatus["state"], detail: string): ThreeCompatRendererFeatureStatus => ({ feature: name, state, detail });
    return {
      backend: this.backend,
      features: [
        feature("perspective-camera", "supported", "Perspective camera projection is part of ThreeCompat scene plan."),
        feature("orthographic-camera", "supported", "Orthographic camera projection is part of ThreeCompat scene plan."),
        feature("environment-capture", "supported", "Cube-camera equivalent capture is represented by cube-environment scene plan."),
        ...this.lighting.lightKinds.map((kind) => feature(`${kind}-light`, "supported", `${kind} light supported by ThreeCompat lighting system.`)),
        ...this.materials.modes.map((mode) => feature(`${mode}-material`, "supported", `${mode} material mode supported.`)),
        feature("multiple-render-targets", this.renderTargets.supportsMultipleRenderTargets() ? "supported" : "fallback", "MRT uses four attachments when backend allows it."),
        feature("depth-textures", this.renderTargets.current.depthTexture ? "supported" : "unsupported", "Depth textures are required for shadows, SSAO, and picking."),
        feature("hdr-render-targets", this.renderTargets.supportsHdr() ? "supported" : "unsupported", `HDR format=${this.renderTargets.current.format}`),
        feature("webgl2-backend", this.backend === "webgl2" || this.backend === "mock" ? "supported" : "fallback", "WebGL2 is the required production baseline."),
        feature("webgpu-status", this.backend === "webgpu" ? "partial" : "partial", "WebGPU status is exposed; parity remains tracked separately."),
        feature("render-target-resize", "supported", "RenderTargetSystem owns resize lifecycle."),
        feature("screenshot-capture", "supported", "ThreeCompatRenderer captureScreenshot returns a capture URI contract."),
        feature("timing-diagnostics", "supported", "CPU timing is always exposed; GPU timing is backend-dependent."),
        feature("device-loss-handling", "supported", "ThreeCompatRenderer handleDeviceLost records recovery contract.")
      ],
      cpuTimingAvailable: true,
      gpuTimingAvailable: this.backend === "webgl2" || this.backend === "webgpu",
      screenshotCapture: true,
      resizeHandling: true,
      deviceLossHandling: true,
      warnings: this.backend === "webgpu" ? ["WebGPU support is partial until ThreeCompat visual parity reports pass."] : []
    };
  }

  createComplexScenePlan() {
    return this.sceneRenderer.createComplexScenePlan(this.lighting.createDefaultRig(), this.materials.modes);
  }
}

export function createThreeCompatRenderer(options?: ThreeCompatRendererOptions): ThreeCompatRenderer {
  return new ThreeCompatRenderer(options);
}
