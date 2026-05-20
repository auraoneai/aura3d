import { TextureCompat } from "../textures";

export class WebGLRenderTargetCompat {
  readonly type: string = "WebGLRenderTarget";
  readonly texture = new TextureCompat();
  depthTexture: TextureCompat | null = new TextureCompat();

  constructor(public width: number, public height: number, public samples = 0) {}

  setSize(width: number, height: number): void {
    if (width <= 0 || height <= 0) throw new Error("Render target size must be positive.");
    this.width = width;
    this.height = height;
  }
}

export class WebGLMultipleRenderTargetsCompat extends WebGLRenderTargetCompat {
  override readonly type = "WebGLMultipleRenderTargets";
  readonly textures: TextureCompat[];

  constructor(width: number, height: number, count: number) {
    super(width, height);
    this.textures = Array.from({ length: count }, () => new TextureCompat());
  }
}
