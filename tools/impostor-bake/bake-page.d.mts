/**
 * Types for bake-page.mjs (the remote-runner WebGL2 bake driver).
 */
export interface BakePageResult {
  readonly atlasHash: string;
  readonly boundingSphere: { readonly center: readonly [number, number, number]; readonly radius: number };
}
export declare function bakeImpostorPage(args: {
  readonly plan: {
    readonly tiles: readonly { readonly view: number; readonly dir: readonly [number, number, number]; readonly tileX: number; readonly tileY: number }[];
    readonly views: number;
    readonly tileSize: number;
    readonly atlasSize?: number;
    readonly albedoOut: string;
    readonly normalDepthOut: string;
  };
  readonly source: string;
}): Promise<BakePageResult>;
