export interface WebGPUTextureDescriptor { readonly label: string; readonly backend?: 'webgpu'; readonly detail?: string; }
export class WebGPUTexture { readonly backend = 'webgpu' as const; constructor(readonly descriptor: WebGPUTextureDescriptor) {} }
