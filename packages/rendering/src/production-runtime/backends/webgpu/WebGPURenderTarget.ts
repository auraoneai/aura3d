export interface WebGPURenderTargetDescriptor { readonly label: string; readonly backend?: 'webgpu'; readonly detail?: string; }
export class WebGPURenderTarget { readonly backend = 'webgpu' as const; constructor(readonly descriptor: WebGPURenderTargetDescriptor) {} }
