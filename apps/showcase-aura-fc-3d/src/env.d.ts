import "@aura3d/engine";

declare module "@aura3d/engine" {
  interface AuraTextureDataOptions {
    readonly wrapS?: string;
    readonly wrapT?: string;
    readonly minFilter?: string;
    readonly magFilter?: string;
  }
}
