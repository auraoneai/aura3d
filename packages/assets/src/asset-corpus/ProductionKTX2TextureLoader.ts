export interface ProductionKTX2TextureLoaderResult { readonly uri: string; readonly transcodedFormat: string; readonly mipLevels: number; }
export function createProductionKTX2TextureLoaderResult(uri: string, transcodedFormat = 'rgba8unorm', mipLevels = 1): ProductionKTX2TextureLoaderResult { return { uri, transcodedFormat, mipLevels }; }
