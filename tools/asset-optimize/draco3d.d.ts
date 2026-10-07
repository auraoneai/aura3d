declare module "draco3d" {
  /** draco3d's UMD exports have no bundled types; gltf-transform only needs the encoder/decoder module objects. */
  export function createEncoderModule(): Promise<unknown>;
  export function createDecoderModule(): Promise<unknown>;
}
