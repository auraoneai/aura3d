// Internal compiler frame-draw records (not exported from any public barrel).
// Moved out of contracts/compiler.ts on 2026-11-02: they carry live renderer
// objects owned by the compiled scene and are source internals under
// docs/api/stability-policy.md, so they stay off the in-repo "." view.

/** A frame-local volume draw; the compiled scene owns its renderer. */
export type RuntimeScalarVolumeDraw = import("@aura3d/rendering/volumetrics").ScalarVolumeDrawRecord;

/** A frame-local draw of a compiled splat cloud. The compiled scene owns the renderer. */
export interface RuntimeGaussianSplatDraw {
  readonly renderer: import("@aura3d/rendering").GaussianSplatRenderer;
  readonly modelMatrix: Float32Array;
  readonly colorSpace: "srgb_rec709_display" | "lin_rec709_display";
  /** World-space conservative cloud bounds for this asset instance. */
  readonly worldBounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  readonly layerMask: number;
  readonly frustumCulled: boolean;
  readonly renderOrder: number;
}
