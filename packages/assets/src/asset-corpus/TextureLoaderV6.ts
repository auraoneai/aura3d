export interface TextureLoaderV6Result { readonly uri: string; readonly colorSpace: 'srgb' | 'linear'; readonly byteLength?: number; }
export function createTextureLoaderV6Result(uri: string, colorSpace: 'srgb' | 'linear' = 'srgb', byteLength?: number): TextureLoaderV6Result { return { uri, colorSpace, byteLength }; }
