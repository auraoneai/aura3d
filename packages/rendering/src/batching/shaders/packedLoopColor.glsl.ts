/**
 * Staged packed-loop fragment contract. Each logical member is still submitted
 * separately: its actual model/normal/cull state comes from the ordinary
 * forward path, and this uniform carries only its copied color. No draw-data
 * texture, gl_DrawID or deferred multi-draw submission is implied.
 *
 * The feature is intentionally not registered here. A renderer may select it
 * only after the member packet, packed geometry lifetime and depth/coverage
 * consumers have all been established.
 */
export const PACKED_LOOP_COLOR_FEATURE = "a3d.packedLoopColor";
export const PACKED_LOOP_COLOR_DEFINE = "A3D_PACKED_LOOP_COLOR";
export const PACKED_LOOP_COLOR_UNIFORM = "u_a3dPackedLoopColor";

export const PACKED_LOOP_COLOR_FRAGMENT_PARS_GLSL = /* glsl */ `
#ifdef A3D_PACKED_LOOP_COLOR
uniform vec4 u_a3dPackedLoopColor;
#endif
`;

/** Match the existing per-member batch color operation, including alpha. */
export const PACKED_LOOP_COLOR_FRAGMENT_MATERIAL_GLSL = /* glsl */ `
#ifdef A3D_PACKED_LOOP_COLOR
  a3dBaseColor *= u_a3dPackedLoopColor;
  #ifdef A3D_LIT
    material.baseColor *= u_a3dPackedLoopColor.rgb;
    material.diffuseContribution *= u_a3dPackedLoopColor.rgb;
    material.specularColorBlended *= u_a3dPackedLoopColor.rgb;
  #endif
#endif
`;
