export interface HDRTextureLoaderV6Result { readonly uri: string; readonly width: number; readonly height: number; readonly format: 'rgbe-hdr'; }
export function createHDRTextureLoaderV6Result(uri: string, width = 1024, height = 512): HDRTextureLoaderV6Result { return { uri, width, height, format: 'rgbe-hdr' }; }
