/**
 * GD-14: twin tail-lamp ribbons for the scrolling-world camera. Samples stay in sim world coordinates and are
 * transformed with the road each frame, rather than following the player node (which is fixed in view space).
 * Both ribbons share one instanced draw; no gameplay state is written.
 */
import type { AuraTransformSpec } from "@aura3d/engine";
import { TAIL_TRAIL } from "./vfx";
import { WGSL_CLIP, WGSL_INSTANCE_INPUTS, wgslStage } from "../../showcase-port-shared/wgsl-twins";

export const TAIL_TRAIL_ID = "player-tail-trails";
const SEGMENTS = 10;
export const TAIL_TRAIL_CAPACITY = SEGMENTS * 2;

/** A3/W6: the WGSL twin of the strip program for the WebGPU backend; WebGL2 keeps drawing the GLSL (same pixels as before). */
const TAIL_TRAIL_WGSL_VERTEX = wgslStage([WGSL_CLIP], /* wgsl */ `
struct TailTrailVarying {
  @builtin(position) position: vec4<f32>,
  @location(0) across: f32,
  @location(1) along: f32,
  @location(2) strength: f32,
};
@vertex fn vs_main(@location(0) a_position: vec3<f32>, ${WGSL_INSTANCE_INPUTS}) -> TailTrailVarying {
  var out: TailTrailVarying;
  let m = aura.u_modelMatrix * mat4x4<f32>(a_instanceMatrix0, a_instanceMatrix1, a_instanceMatrix2, a_instanceMatrix3);
  let center = (m * vec4<f32>(0.0, 0.0, 0.0, 1.0)).xyz;
  let axis = a3dMat3Mul(aura.u_modelMatrix, a_instanceMatrix2.xyz);
  let width = length(a_instanceMatrix0.xyz);
  out.strength = length(a_instanceMatrix1.xyz);
  var p = center + axis * a_position.z;
  var side = cross(axis, aura.u_cameraPosition - p);
  let sideLen = length(side);
  side = select(vec3<f32>(1.0, 0.0, 0.0), side / sideLen, sideLen > 1e-5);
  p = p + side * a_position.x * width;
  out.across = a_position.x * 2.0;
  out.along = a_position.z + 0.5;
  out.position = a3dRasterPosition(aura.u_projectionMatrix * aura.u_viewMatrix * vec4<f32>(p, 1.0));
  return out;
}`);

const TAIL_TRAIL_WGSL_FRAGMENT = wgslStage([], /* wgsl */ `
@fragment fn fs_main(@location(0) vAcross: f32, @location(1) vAlong: f32, @location(2) vStrength: f32) -> @location(0) vec4<f32> {
  let edge = max(0.0, 1.0 - vAcross * vAcross);
  let alpha = clamp(vStrength, 0.0, 1.0) * edge * edge * mix(0.8, 1.0, vAlong);
  return vec4<f32>(vec3<f32>(1.4, 0.035, 0.02), alpha);
}`);

/** Camera-facing additive strips; instance y-scale carries the fading strength. */
export function tailTrailMaterial() {
  return {
    glsl: {
      vertex: `
out float vAcross;
out float vAlong;
out float vStrength;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec3 center = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 axis = mat3(modelMatrix) * instanceMatrix[2].xyz;
  float width = length(instanceMatrix[0].xyz);
  vStrength = length(instanceMatrix[1].xyz);
  vec3 p = center + axis * position.z;
  vec3 side = cross(axis, cameraPosition - p);
  float sideLen = length(side);
  side = sideLen > 1e-5 ? side / sideLen : vec3(1.0, 0.0, 0.0);
  p += side * position.x * width;
  vAcross = position.x * 2.0;
  vAlong = position.z + 0.5;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,
      fragment: `
in float vAcross;
in float vAlong;
in float vStrength;
out vec4 outColor;
void main() {
  float edge = max(0.0, 1.0 - vAcross * vAcross);
  float alpha = clamp(vStrength, 0.0, 1.0) * edge * edge * mix(0.8, 1.0, vAlong);
  outColor = vec4(vec3(1.4, 0.035, 0.02), alpha);
}`
    },
    wgsl: { vertex: TAIL_TRAIL_WGSL_VERTEX, fragment: TAIL_TRAIL_WGSL_FRAGMENT },
    uniforms: {},
    transparent: true,
    depthWrite: false,
    blending: "additive" as const,
    side: "double" as const
  };
}

interface Sample { x: number; z: number; t: number }
interface TrailFrame {
  readonly x: number;
  readonly z: number;
  readonly time: number;
  readonly speed: number;
  readonly lampY: number;
  readonly spread: number;
  readonly enabled: boolean;
  readonly motionOk: boolean;
  readonly lowTier: boolean;
  readonly rx: (x: number) => number;
  readonly ry: (y: number) => number;
  readonly rz: (z: number) => number;
}

export function createTailTrails() {
  const samples: Sample[] = [];
  let lastSpread = 0;
  return {
    /** Returns the live strips in the same view frame as the street and tail lamps. */
    update(f: TrailFrame): AuraTransformSpec[] {
      const speedGain = Math.max(0, Math.min(1, (f.speed - TAIL_TRAIL.widthOverSpeed[0]) /
        (TAIL_TRAIL.widthOverSpeed[1] - TAIL_TRAIL.widthOverSpeed[0])));
      if (!f.enabled || !Number.isFinite(f.time) || !Number.isFinite(f.x) || !Number.isFinite(f.z) ||
          !Number.isFinite(f.speed) || !Number.isFinite(f.lampY) || !Number.isFinite(f.spread) || speedGain <= 0) {
        samples.length = 0;
        return [];
      }
      const last = samples[samples.length - 1];
      if (last && (f.time < last.t || Math.abs(f.z - last.z) > 30 || Math.abs(f.x - last.x) > 15 || Math.abs(f.spread - lastSpread) > 0.01)) samples.length = 0;
      lastSpread = f.spread;
      const life = TAIL_TRAIL.life * (f.motionOk ? 1 : 0.5) * (f.lowTier ? 0.5 : 1);
      while (samples.length && f.time - samples[0]!.t > life) samples.shift();
      const newest = samples[samples.length - 1];
      if (!newest || f.time - newest.t >= TAIL_TRAIL.life / SEGMENTS) {
        samples.push({ x: f.x, z: f.z, t: f.time });
        if (samples.length > SEGMENTS) samples.shift();
      }
      const transforms: AuraTransformSpec[] = [];
      let x = f.x, z = f.z, newerAge = 0;
      for (let i = samples.length - 1; i >= 0; i--) {
        const older = samples[i]!;
        const age = f.time - older.t;
        if (age > life) break;
        const dx = x - older.x, dz = z - older.z;
        const length = Math.hypot(dx, dz);
        if (length > 0.001) {
          const fade = Math.max(0, 1 - newerAge / life);
          const width = TAIL_TRAIL.width * speedGain * (0.2 + 0.8 * fade);
          const yaw = Math.atan2(dx, dz);
          for (const side of [-1, 1]) {
            transforms.push({
              position: [f.rx((x + older.x) / 2 + side * f.spread), f.ry(f.lampY), f.rz((z + older.z) / 2)],
              rotation: [0, yaw, 0],
              scale: [width, Math.max(0.001, speedGain * fade * fade), length]
            });
          }
        }
        x = older.x; z = older.z; newerAge = age;
      }
      return transforms;
    }
  };
}
