export interface ProductionTextureLoaderResult { readonly uri: string; readonly colorSpace: 'srgb' | 'linear'; readonly byteLength?: number; }
export function createProductionTextureLoaderResult(uri: string, colorSpace: 'srgb' | 'linear' = 'srgb', byteLength?: number): ProductionTextureLoaderResult { return { uri, colorSpace, byteLength }; }
