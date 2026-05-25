export interface V5RenderTargetDescriptor {
  readonly width: number;
  readonly height: number;
  readonly format: "rgba8" | "rgba16f" | "rgba32f";
  readonly depthTexture: boolean;
  readonly attachments: number;
}

export class V5RenderTargetSystem {
  private descriptor: V5RenderTargetDescriptor;

  constructor(descriptor: V5RenderTargetDescriptor) {
    this.descriptor = descriptor;
  }

  get current(): V5RenderTargetDescriptor {
    return this.descriptor;
  }

  resize(width: number, height: number): V5RenderTargetDescriptor {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error("V5 render targets require positive integer dimensions.");
    }
    this.descriptor = { ...this.descriptor, width, height };
    return this.descriptor;
  }

  supportsMultipleRenderTargets(): boolean {
    return this.descriptor.attachments >= 2;
  }

  supportsHdr(): boolean {
    return this.descriptor.format === "rgba16f" || this.descriptor.format === "rgba32f";
  }
}
