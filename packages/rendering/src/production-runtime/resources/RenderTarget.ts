import type { GPUTexture } from './GPUTexture';
export interface RenderTargetDescriptor { readonly label: string; readonly color: GPUTexture; readonly depth?: GPUTexture; }
export class RenderTarget { constructor(readonly descriptor: RenderTargetDescriptor) {} }
