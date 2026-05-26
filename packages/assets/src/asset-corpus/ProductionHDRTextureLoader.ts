export interface ProductionHDRTextureLoaderResult { readonly uri: string; readonly width: number; readonly height: number; readonly format: 'rgbe-hdr'; }
export function createProductionHDRTextureLoaderResult(uri: string, width = 1024, height = 512): ProductionHDRTextureLoaderResult { return { uri, width, height, format: 'rgbe-hdr' }; }
