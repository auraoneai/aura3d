export interface ThreeCompatRenderTargetDescriptor {
  readonly width: number;
  readonly height: number;
  readonly format: "rgba8" | "rgba16f" | "rgba32f";
  readonly depthTexture: boolean;
  readonly attachments: number;
}

export class ThreeCompatRenderTargetSystem {
  private descriptor: ThreeCompatRenderTargetDescriptor;

  constructor(descriptor: ThreeCompatRenderTargetDescriptor) {
    this.descriptor = descriptor;
  }

  get current(): ThreeCompatRenderTargetDescriptor {
    return this.descriptor;
  }

  resize(width: number, height: number): ThreeCompatRenderTargetDescriptor {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error("ThreeCompat render targets require positive integer dimensions.");
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
