/**
 * Types for glb-mesh.mjs (Node GLB flattener for the impostor bake).
 */
export interface GlbMeshMaterial {
  readonly color: readonly [number, number, number, number];
  readonly alphaCutoff: number;
  readonly image: number | null;
}
export interface GlbMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly groups: readonly { readonly start: number; readonly count: number; readonly material: GlbMeshMaterial }[];
  readonly images: readonly { readonly mime: string; readonly base64: string }[];
  readonly bounds: {
    readonly center: [number, number, number];
    readonly radius: number;
    readonly min: [number, number, number];
    readonly max: [number, number, number];
  };
}
export declare function loadGlbMesh(path: string, opts?: { readonly materials?: readonly number[]; readonly nodes?: readonly string[] }): GlbMesh;
export declare function meshForPage(mesh: GlbMesh): {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
  readonly groups: GlbMesh["groups"];
  readonly images: GlbMesh["images"];
};
