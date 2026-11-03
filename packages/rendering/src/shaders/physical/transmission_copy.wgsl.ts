/** Native counterpart of the opaque-scene fullscreen copy. */
export const TRANSMISSION_COPY_WGSL_VERTEX = /* wgsl */ `
// a3d_prd04_transmission_copy
/* @aura3d-bindings */
struct CopyVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};
@vertex fn vs_main(@builtin(vertex_index) index: u32) -> CopyVertexOutput {
  let p = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  var out: CopyVertexOutput;
  out.position = vec4f(p * 2.0 - vec2f(1.0), 0.0, 1.0);
  // WebGPU texture coordinates start at the upper edge of the attachment.
  out.uv = vec2f(p.x, 1.0 - p.y);
  return out;
}
`;

export const TRANSMISSION_COPY_WGSL_FRAGMENT = /* wgsl */ `
// a3d_prd04_transmission_copy
/* @aura3d-bindings */
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSampleLevel(u_sourceTexture, u_sourceSampler, uv, 0.0);
}
`;
