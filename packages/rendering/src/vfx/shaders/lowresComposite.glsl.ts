// PRD-07 P6-T4 — §6.2 optional half-resolution particle composite. Upsamples the
// lowRes particle RT into the scene color target: depth-aware bilateral when
// scene depth is bound (edge-preserving at geometry silhouettes), plain bilinear
// otherwise.

export interface LowResCompositeDefines {
  /** Depth-aware bilateral upsample (scene depth available); else bilinear. */
  readonly bilateral: boolean;
}

export const LOWRES_COMPOSITE_SHADER_MARKER = "a3d_prd07_lowres_composite";

export function lowResCompositeVertexSource(): string {
  return `#version 300 es
// ${LOWRES_COMPOSITE_SHADER_MARKER}
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;
}

export function lowResCompositeFragmentSource(defines: LowResCompositeDefines): string {
  const bilateral = `  vec2 base = (floor(v_uv * u_lowSize - 0.5) + 0.5) * u_lowTexel;
  vec2 f = fract(v_uv * u_lowSize - 0.5);
  float d0 = linearizeDepth(texture(u_sceneDepth, v_uv).x);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 tap = base + vec2(float(i), float(j)) * u_lowTexel;
      float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      float di = linearizeDepth(texture(u_sceneDepth, tap).x);
      w *= exp(-abs(d0 - di) * u_bilateralSharpness);
      sum += texture(u_lowRes, tap) * w;
      wsum += w;
    }
  }
  fragColor = wsum > 1e-5 ? sum / wsum : texture(u_lowRes, v_uv);`;
  const bilinear = `  fragColor = texture(u_lowRes, v_uv);`;
  return `#version 300 es
// ${LOWRES_COMPOSITE_SHADER_MARKER}
${defines.bilateral ? "#define BILATERAL 1\n" : ""}precision highp float;
in vec2 v_uv;
uniform sampler2D u_lowRes;
#ifdef BILATERAL
uniform sampler2D u_sceneDepth;
uniform vec4 u_depthLinearize; // near, far, orthographic, unused
uniform vec2 u_lowTexel;       // 1 / low-res target size
uniform vec2 u_lowSize;        // low-res target size
uniform float u_bilateralSharpness;
#endif
out vec4 fragColor;
#ifdef BILATERAL
float linearizeDepth(float d) {
  float z = d * 2.0 - 1.0;
  return u_depthLinearize.z > 0.5
    ? mix(u_depthLinearize.x, u_depthLinearize.y, d)
    : (2.0 * u_depthLinearize.x * u_depthLinearize.y) / (u_depthLinearize.y + u_depthLinearize.x - z * (u_depthLinearize.y - u_depthLinearize.x));
}
#endif
void main() {
${defines.bilateral ? bilateral : bilinear}
}
`;
}

export function lowResCompositeProgramKey(defines: LowResCompositeDefines): string {
  return `prd07.lowresComposite.${defines.bilateral ? "bilateral" : "bilinear"}`;
}
