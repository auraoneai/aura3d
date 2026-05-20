export interface GPUTextureDescriptorV6 { readonly label: string; readonly width: number; readonly height: number; readonly format: string; readonly mipLevels?: number; }
export class GPUTexture { constructor(readonly descriptor: GPUTextureDescriptorV6) {} }
