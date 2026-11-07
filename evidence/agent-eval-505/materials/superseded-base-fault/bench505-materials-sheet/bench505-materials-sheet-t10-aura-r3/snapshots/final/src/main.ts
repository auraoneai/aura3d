import { camera, createAuraApp, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
  }
}

const KEY_Y = 7;
const KEY_Z = 7;
const keyXAt = (t: number): number => 4.5 * Math.sin(t * 0.45);

window.__TASK_STATE__ = { spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }], keyLightX: keyXAt(0) };

// Seamless studio cove: wall (top to bottom), quarter-circle curve, then flat floor towards the camera.
// Profile order runs with increasing z on the floor so triangle winding faces up/forward.
const COVE_R = 5;
const COVE_Z = -6;
const profile: { y: number; z: number; ny: number; nz: number }[] = [];
profile.push({ y: 14, z: COVE_Z - COVE_R, ny: 0, nz: 1 });
const ARC = 16;
for (let i = 0; i <= ARC; i += 1) {
  const th = (Math.PI / 2) * (1 - i / ARC);
  profile.push({ y: COVE_R - COVE_R * Math.cos(th), z: COVE_Z - COVE_R * Math.sin(th), ny: Math.cos(th), nz: Math.sin(th) });
}
profile.push({ y: 0, z: 18, ny: 1, nz: 0 });
const XS = [-40, 40];
const coverPos = new Float32Array(profile.length * 2 * 3);
const coverNor = new Float32Array(profile.length * 2 * 3);
const coverIdx: number[] = [];
for (let j = 0; j < profile.length; j += 1) {
  for (let i = 0; i < 2; i += 1) {
    const v = j * 2 + i, p = profile[j]!;
    coverPos.set([XS[i]!, p.y, p.z], v * 3);
    coverNor.set([0, p.ny, p.nz], v * 3);
    if (i === 0 && j < profile.length - 1) coverIdx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
  }
}
const cove = geometry.custom(
  geometry.define({ positions: coverPos, normals: coverNor, indices: coverIdx, bounds: { min: [-40, 0, -11], max: [40, 14, 18] } }),
  { name: "cove", material: material.pbr({ color: "#d3d5d9", roughness: 0.75 }) }
);

// Fabric: dark red velvet with a woven thread pattern, fuzzy sheen and rim light. Fully rough, no specular mirror term.
const fabric = material.custom({
  glsl: {
    vertex: `out vec3 vW; out vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vW; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 Ng = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float u = atan(Ng.z, Ng.x) / 6.2831853 + 0.5;
  float v = asin(clamp(Ng.y, -1.0, 1.0)) / 3.1415927 + 0.5;
  vec2 g = vec2(u * 260.0, v * 130.0);
  vec2 cell = floor(g);
  float over = mod(cell.x + cell.y, 2.0);
  float hx = 0.5 + 0.5 * sin(g.x * 6.2831853);
  float hy = 0.5 + 0.5 * sin(g.y * 6.2831853);
  float h = mix(hx, hy, over);
  float fuzz = hash(floor(g * 3.0) + cell) - 0.5;
  vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), Ng) + vec3(0.0001));
  vec3 B = cross(Ng, T);
  float bu = cos(g.x * 6.2831853) * (1.0 - over);
  float bv = cos(g.y * 6.2831853) * over;
  vec3 N = normalize(Ng + (T * bu + B * bv) * 0.28 + (T + B) * fuzz * 0.10);
  vec3 albedo = vec3(0.34, 0.025, 0.045) * (0.62 + 0.55 * h) * (1.0 + fuzz * 0.25);
  float nv = clamp(dot(N, V), 0.0, 1.0);
  vec3 Lk = normalize(vec3(clk, ${KEY_Y.toFixed(1)}, ${KEY_Z.toFixed(1)}) - vW);
  vec3 Lf = normalize(vec3(-6.0, 3.0, 5.0) - vW);
  vec3 Lr = normalize(vec3(0.0, 5.0, -7.0) - vW);
  float dk = max(dot(N, Lk) * 0.85 + 0.15, 0.0);
  float df = max(dot(N, Lf) * 0.8 + 0.2, 0.0);
  float dr = max(dot(N, Lr), 0.0);
  float fresnel = pow(1.0 - nv, 2.6);
  vec3 sheenCol = vec3(0.95, 0.22, 0.28);
  vec3 col = albedo * (vec3(1.0, 0.95, 0.88) * dk * 1.5 + vec3(0.75, 0.82, 1.0) * df * 0.45 + 0.10);
  col += sheenCol * fresnel * (0.20 + 0.65 * dk) * (0.7 + 0.5 * h);
  col += vec3(1.0, 0.55, 0.6) * fresnel * dr * 0.7;
  col *= mix(0.45, 1.0, smoothstep(0.0, 0.7, vW.y));
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

const POS_X = 2.7;
const sc = scene({ background: "#cfd1d5" })
  .camera(camera.perspective({ position: [2.4, 3.6, 10.5], target: [0, 0.9, 0], fov: 34, near: 0.5, far: 80 }))
  .add(environments.studio({ intensity: 1.2, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#b9bcc2", intensity: 0.35 }))
  .add(lights.directional({ name: "key", position: [keyXAt(0), KEY_Y, KEY_Z], target: [0, 0.8, 0], intensity: 3.2, color: "#fff2e2", shadow: true }).runtime({ id: "key", mutable: true }))
  .add(lights.directional({ name: "fill", position: [-6, 3, 5], target: [0, 0.8, 0], intensity: 0.8, color: "#d6e2ff" }))
  .add(lights.directional({ name: "rim", position: [0, 5, -7], target: [0, 1, 0], intensity: 2.2, color: "#ffffff" }))
  .add(cove);

// Soft contact-shadow discs stacked under each sphere (the key light also casts real shadows).
let scn = sc;
[-POS_X, 0, POS_X].forEach((x, i) => {
  [2.9, 2.3, 1.8, 1.35].forEach((d, k) => {
    scn = scn.add(
      primitives.cylinder({
        name: `contact-${i}-${k}`,
        size: [d, 0.004, d],
        material: material.pbr({ color: "#000000", roughness: 1, opacity: 0.1, transparent: true }),
        castShadow: false
      }).position(x, 0.006 + k * 0.004, 0.1)
    );
  });
});

scn = scn
  .add(
    primitives.sphere({
      name: "glass",
      size: 2,
      material: material.physical({ color: "#eaf6ff", metallic: 0, roughness: 0.02, transmission: 1, ior: 1.5, thickness: 1.2, opacity: 0.4, transparent: true })
    }).position(-POS_X, 1, 0)
  )
  .add(
    primitives.sphere({
      name: "metal",
      size: 2,
      material: material.brushedMetal({ color: "#c9ced6", metallic: 1, roughness: 0.38, anisotropy: 0.85 })
    }).position(0, 1, 0)
  )
  .add(primitives.sphere({ name: "fabric", size: 2, material: fabric }).position(POS_X, 1, 0).runtime({ id: "fabric", mutable: true }));

const app = createAuraApp("#app", { scene: scn });
let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const x = keyXAt(t);
  app.nodes.require("key").setPosition(x, KEY_Y, KEY_Z);
  app.nodes.require("fabric").setUniform?.("clk", x);
  window.__TASK_STATE__ = { spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }], keyLightX: x };
});
await app.ready();
window.__EVAL_READY__ = true;
