export interface WebGPUCapabilitiesDescriptor { readonly label: string; readonly backend?: 'webgpu'; readonly detail?: string; }
export class WebGPUCapabilities { readonly backend = 'webgpu' as const; constructor(readonly descriptor: WebGPUCapabilitiesDescriptor) {} }
