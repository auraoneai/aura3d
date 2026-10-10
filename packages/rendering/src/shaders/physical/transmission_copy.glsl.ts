/**
 * a3d_prd04_transmission_copy — fullscreen blit used by the T0-18(c)
 * GPU-side transmission-target copy in `forward/Transmission.ts`.
 *
 * Lives under `shaders/physical/` because the arch-gate `glsl-location`
 * (PRD-15 §6.12) only permits `#version` template strings inside
 * chunk/post/output locations; `forward/` is not one.
 *
 * The device requires `marker` to appear verbatim in both GLSL stages.
 */
export const TRANSMISSION_COPY_VERTEX = /* glsl */ `#version 300 es
// a3d_prd04_transmission_copy
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const TRANSMISSION_COPY_FRAGMENT = /* glsl */ `#version 300 es
// a3d_prd04_transmission_copy
precision highp float;
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = texture(u_source, v_uv);
}
`;

export const TRANSMISSION_COPY_MARKER = "a3d_prd04_transmission_copy";
