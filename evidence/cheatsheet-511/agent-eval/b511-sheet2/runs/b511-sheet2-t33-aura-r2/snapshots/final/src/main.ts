import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const shield = material.custom({
  glsl: {
    vertex: `out vec3 vW; out vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vW; in vec3 vN; out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float rim = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0);
  // scanlines: pattern phase decreases with y - time, so lines travel upward
  float ph = fract(vW.y * 12.0 - clk * 0.5);
  float line = smoothstep(0.0, 0.12, ph) * (1.0 - smoothstep(0.12, 0.35, ph));
  float fine = 0.5 + 0.5 * sin(vW.y * 90.0 - clk * 6.0);
  vec3 cyan = vec3(0.1, 0.9, 1.0);
  vec3 col = cyan * (0.25 + rim * 1.6 + line * 0.9 + fine * 0.06);
  float a = 0.07 + rim * 0.75 + line * 0.28 + fine * 0.03;
  outColor = vec4(col, clamp(a, 0.0, 0.95));
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

const floorGlow = material.custom({
  glsl: {
    vertex: `out vec2 vUv;
void main() { vUv = uv; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }`,
    fragment: `in vec2 vUv; out vec4 outColor;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float g = exp(-d * d * 5.0);
  float ring = exp(-pow((d - 0.42) * 14.0, 2.0)) * 0.5;
  float k = (g * 0.5 + ring) * (1.0 - smoothstep(0.8, 1.0, d));
  outColor = vec4(vec3(0.1, 0.85, 1.0) * k, k);
}`
  },
  transparent: true,
  blending: "additive",
  depthWrite: false,
  side: "double"
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#04060c" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.directional({ position: [3, 5, 4], target: [0, 1, 0], intensity: 2.5 }))
    .add(lights.point({ position: [0, 0.5, 0], intensity: 6, color: "#22d3ee" }))
    .add(
      primitives.plane({
        name: "floor",
        size: [14, 1, 14],
        material: material.pbr({ color: "#0b1018", roughness: 0.3, metallic: 0.6 })
      })
    )
    .add(
      primitives
        .plane({ name: "floorGlow", size: [6, 1, 6], material: floorGlow })
        .position(0, 0.01, 0)
    )
    .add(
      primitives
        .box({
          name: "core",
          size: 0.7,
          material: material.pbr({ color: "#c8d0d8", metallic: 1, roughness: 0.22 })
        })
        .position(0, 1.3, 0)
        .runtime({ id: "core", mutable: true })
    )
    .add(
      primitives
        .sphere({ name: "shield", size: 2.4, material: shield })
        .position(0, 1.3, 0)
        .runtime({ id: "shield", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 1.9, 5.6], target: [0, 1.2, 0], fov: 40 }))
});

app.onFrame((f) => {
  app.nodes.require("shield").setUniform?.("clk", f.time);
  app.nodes.require("core").setRotation(f.time * 0.7, f.time * 1.1, f.time * 0.4);
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
