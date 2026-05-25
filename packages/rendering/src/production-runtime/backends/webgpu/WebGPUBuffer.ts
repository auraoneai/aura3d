export interface WebGPUBufferDescriptor { readonly label: string; readonly backend?: 'webgpu'; readonly detail?: string; }
export class WebGPUBuffer { readonly backend = 'webgpu' as const; constructor(readonly descriptor: WebGPUBufferDescriptor) {} }
