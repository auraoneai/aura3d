export interface GPUTextureDescriptorProduction { readonly label: string; readonly width: number; readonly height: number; readonly format: string; readonly mipLevels?: number; }
export class GPUTexture { constructor(readonly descriptor: GPUTextureDescriptorProduction) {} }
