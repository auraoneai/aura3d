/**
 * WGSL companion of Aura's `a3d_prd04_alpha_a2c` chunk
 * (shaders/physical/alpha_a2c.glsl.ts), kept operation-for-operation equal to
 * it. glTF 2.0 `alphaMode: "MASK"` renders a fragment opaque when
 * alpha >= alphaCutoff and discards it otherwise (glTF 2.0 specification,
 * 3.9.4 "Alpha Coverage"). With multisample alpha-to-coverage the hard step
 * is replaced by a linear ramp one screen-space alpha derivative wide,
 * centred on the cutoff, so the coverage mask antialiases the edge.
 */
const wgsl = /* wgsl */ `
fn a3dPrd04AlphaTest(alpha: f32, cutoff: f32) {
  if (alpha < cutoff) {
    discard;
  }
}

fn a3dPrd04AlphaToCoverage(alpha: ptr<function, f32>, cutoff: f32) {
  let width = max(fwidth(*alpha), 1e-6);
  *alpha = clamp((*alpha - cutoff) / width + 0.5, 0.0, 1.0);
  if (*alpha <= 0.0) {
    discard;
  }
}
`;

export const A3D_PRD04_ALPHA_A2C_WGSL = wgsl;
export default wgsl;
