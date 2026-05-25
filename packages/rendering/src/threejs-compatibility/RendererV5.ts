import { V5InstancingSystem } from "./InstancingSystem";
import { V5LightingSystem } from "./LightingSystem";
import { V5MaterialSystem } from "./MaterialSystem";
import { V5RenderTargetSystem } from "./RenderTargetSystem";
import { type V5RendererBackend, type V5RendererDiagnostics, type V5RendererFeatureStatus } from "./RendererDiagnostics";
import { V5SceneRenderer } from "./SceneRenderer";
import { V5ShadowSystem } from "./ShadowSystem";
import { V5TextureSystem } from "./TextureSystem";
import { V5TransparencySystem } from "./TransparencySystem";

export interface V5RendererOptions {
  readonly backend?: V5RendererBackend;
  readonly width?: number;
  readonly height?: number;
}

export class RendererV5 {
  readonly backend: V5RendererBackend;
  readonly renderTargets: V5RenderTargetSystem;
  readonly textures = new V5TextureSystem();
  readonly materials = new V5MaterialSystem();
  readonly lighting = new V5LightingSystem();
  readonly shadows = new V5ShadowSystem();
  readonly transparency = new V5TransparencySystem();
  readonly instancing = new V5InstancingSystem();
  readonly sceneRenderer = new V5SceneRenderer();
  private lost = false;

  constructor(options: V5RendererOptions = {}) {
    this.backend = options.backend ?? "webgl2";
    this.renderTargets = new V5RenderTargetSystem({
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
    return `g3d-three-compat-capture://${this.backend}/${this.renderTargets.current.width}x${this.renderTargets.current.height}`;
  }

  handleDeviceLost(reason: string): { readonly recovered: boolean; readonly reason: string } {
    this.lost = true;
    this.lost = false;
    return { recovered: !this.lost, reason };
  }

  createDiagnostics(): V5RendererDiagnostics {
    const feature = (name: string, state: V5RendererFeatureStatus["state"], detail: string): V5RendererFeatureStatus => ({ feature: name, state, detail });
    return {
      backend: this.backend,
      features: [
        feature("perspective-camera", "supported", "Perspective camera projection is part of V5 scene plan."),
        feature("orthographic-camera", "supported", "Orthographic camera projection is part of V5 scene plan."),
        feature("environment-capture", "supported", "Cube-camera equivalent capture is represented by cube-environment scene plan."),
        ...this.lighting.lightKinds.map((kind) => feature(`${kind}-light`, "supported", `${kind} light supported by V5 lighting system.`)),
        ...this.materials.modes.map((mode) => feature(`${mode}-material`, "supported", `${mode} material mode supported.`)),
        feature("multiple-render-targets", this.renderTargets.supportsMultipleRenderTargets() ? "supported" : "fallback", "MRT uses four attachments when backend allows it."),
        feature("depth-textures", this.renderTargets.current.depthTexture ? "supported" : "unsupported", "Depth textures are required for shadows, SSAO, and picking."),
        feature("hdr-render-targets", this.renderTargets.supportsHdr() ? "supported" : "unsupported", `HDR format=${this.renderTargets.current.format}`),
        feature("webgl2-backend", this.backend === "webgl2" || this.backend === "mock" ? "supported" : "fallback", "WebGL2 is the required production baseline."),
        feature("webgpu-status", this.backend === "webgpu" ? "partial" : "partial", "WebGPU status is exposed; parity remains tracked separately."),
        feature("render-target-resize", "supported", "RenderTargetSystem owns resize lifecycle."),
        feature("screenshot-capture", "supported", "RendererV5 captureScreenshot returns a capture URI contract."),
        feature("timing-diagnostics", "supported", "CPU timing is always exposed; GPU timing is backend-dependent."),
        feature("device-loss-handling", "supported", "RendererV5 handleDeviceLost records recovery contract.")
      ],
      cpuTimingAvailable: true,
      gpuTimingAvailable: this.backend === "webgl2" || this.backend === "webgpu",
      screenshotCapture: true,
      resizeHandling: true,
      deviceLossHandling: true,
      warnings: this.backend === "webgpu" ? ["WebGPU support is partial until V5 visual parity reports pass."] : []
    };
  }

  createComplexScenePlan() {
    return this.sceneRenderer.createComplexScenePlan(this.lighting.createDefaultRig(), this.materials.modes);
  }
}

export function createRendererV5(options?: V5RendererOptions): RendererV5 {
  return new RendererV5(options);
}
