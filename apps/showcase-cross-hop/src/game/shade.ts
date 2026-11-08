/** Cross Hop's sun-cast shadow decal under the movers (vivid and 4.6 looks), split out of core.ts with its WGSL twin. */
import { material } from "@aura3d/engine";
import { WGSL_CLIP, WGSL_INSTANCE_INPUTS, WGSL_MATH, wgslStage } from "../../../showcase-port-shared/wgsl-twins";

// A4 (5.0.3): not a designated shader-graph pilot, so this stays GLSL on WebGL2; A3/W6 adds a hand-written WGSL twin below
// so a requested WebGPU backend can draw it too.
const SHADE_VERTEX_GLSL = `out vec2 vShade;
void main() {
  // Unit plane in instance space: the decal shape follows the instance's own footprint.
  vShade = position.xz * 2.0;
  gl_Position = projectionMatrix * viewMatrix * (modelMatrix * instanceMatrix * vec4(position, 1.0));
}`;
const SHADE_FRAGMENT_GLSL = `in vec2 vShade;
out vec4 outColor;
void main() {
  vec2 q = abs(vShade);
  float r = pow(pow(q.x, 4.0) + pow(q.y, 4.0), 0.25);
  outColor = vec4(0.03, 0.04, 0.08, u_opacity * (1.0 - smoothstep(0.45, 1.0, r)));
}`;
/** A3/W6: WGSL twin of the shade decal for the WebGPU backend; WebGL2 keeps drawing the GLSL above (same pixels). */
export const SHADE_VERTEX_WGSL = wgslStage([WGSL_CLIP], /* wgsl */ `
struct ShadeVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) shade: vec2<f32>,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, ${WGSL_INSTANCE_INPUTS}) -> ShadeVarying {
  var out: ShadeVarying;
  out.shade = a_position.xz * 2.0;
  let instanceMatrix = mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * (aura.u_modelMatrix * instanceMatrix * vec4<f32>(a_position, 1.0)));
  return out;
}`);
export const SHADE_FRAGMENT_WGSL = wgslStage([WGSL_MATH], /* wgsl */ `
@fragment fn fs_main(@location(0) vShade: vec2<f32>) -> @location(0) vec4<f32> {
  let q = abs(vShade);
  let r = a3dPow(a3dPow(q.x, 4.0) + a3dPow(q.y, 4.0), 0.25);
  return vec4<f32>(0.03, 0.04, 0.08, aura.u_opacity * (1.0 - smoothstep(0.45, 1.0, r)));
}`);
/** Soft rounded-rectangle shadow decal (transparent, no depth write). */
export function shadeSpec(): Parameters<typeof material.custom>[0] {
  return {
    glsl: { vertex: SHADE_VERTEX_GLSL, fragment: SHADE_FRAGMENT_GLSL },
    wgsl: { vertex: SHADE_VERTEX_WGSL, fragment: SHADE_FRAGMENT_WGSL },
    uniforms: { u_opacity: { type: "f32", value: 0.42 } },
    transparent: true,
    depthWrite: false
  };
}

export function shadeMaterial() {
  return material.custom(shadeSpec());
}

