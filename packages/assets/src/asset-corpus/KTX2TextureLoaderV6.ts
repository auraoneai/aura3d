export interface KTX2TextureLoaderV6Result { readonly uri: string; readonly transcodedFormat: string; readonly mipLevels: number; }
export function createKTX2TextureLoaderV6Result(uri: string, transcodedFormat = 'rgba8unorm', mipLevels = 1): KTX2TextureLoaderV6Result { return { uri, transcodedFormat, mipLevels }; }
