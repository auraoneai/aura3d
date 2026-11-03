/**
 * WGSL companion of Aura's `a3d_prd04_unlit` chunk
 * (shaders/physical/unlit.glsl.ts). KHR_materials_unlit returns the authored
 * base color and opacity without lighting.
 */
const wgsl = /* wgsl */ `
fn a3dPrd04UnlitColor(baseColor: vec4f) -> vec4f {
  return baseColor;
}
`;

export const A3D_PRD04_UNLIT_WGSL = wgsl;
export default wgsl;
