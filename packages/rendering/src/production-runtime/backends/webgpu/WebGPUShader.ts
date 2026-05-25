export interface WebGPUShaderDescriptor { readonly label: string; readonly backend?: 'webgpu'; readonly detail?: string; }
export class WebGPUShader { readonly backend = 'webgpu' as const; constructor(readonly descriptor: WebGPUShaderDescriptor) {} }
