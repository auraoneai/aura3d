export interface GPUCapabilities { readonly backend: 'webgl2' | 'webgpu'; readonly maxTextureSize: number; readonly supportsFloatTextures: boolean; readonly supportsInstancing: boolean; readonly supportsMRT: boolean; }
export const WEBGL2_BASELINE_CAPABILITIES: GPUCapabilities = { backend: 'webgl2', maxTextureSize: 4096, supportsFloatTextures: true, supportsInstancing: true, supportsMRT: true };
