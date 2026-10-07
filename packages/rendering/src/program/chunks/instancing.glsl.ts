/**
 * `instancing` chunk (PRD-01 §8.5) — attribute-matrix instancing.
 * Order is `world · instance · geometry` per C-07: `size ⊙ fit` folds into
 * `u_geometryMatrix` and never scales instance translation.
 */

export const INSTANCING_VERTEX_PARS_GLSL = /* glsl */ `
#ifdef USE_INSTANCING
layout(location = 8) in vec4 a_instanceMatrix0;
layout(location = 9) in vec4 a_instanceMatrix1;
layout(location = 10) in vec4 a_instanceMatrix2;
layout(location = 11) in vec4 a_instanceMatrix3;
#ifdef USE_INSTANCING_COLOR
layout(location = 12) in vec4 a_instanceColor;
#endif
#endif
`;

export const INSTANCING_VERTEX_BODY_GLSL = /* glsl */ `
  mat4 instanceMatrix = mat4(1.0);
#ifdef USE_INSTANCING
  instanceMatrix = mat4(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
#endif
  vec4 a3dLocal = u_geometryMatrix * vec4(transformed, 1.0);
  vec4 a3dWorld = u_modelMatrix * instanceMatrix * a3dLocal;
`;
