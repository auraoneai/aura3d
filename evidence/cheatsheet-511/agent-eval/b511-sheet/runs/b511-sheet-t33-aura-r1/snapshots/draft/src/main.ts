import {
  camera,
  createAuraApp,
  effects,
  environments,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const SPHERE_Y = 1.15;

const hologram = material.custom({
  glsl: {
    vertex: `out vec3 vW; out vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vW; in vec3 vN; out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float facing = abs(dot(n, v));
  float fres = pow(1.0 - facing, 2.5);
  // scanlines: the phase grows with y and shrinks with time, so the bands travel upward
  float phase = vW.y * 38.0 - clk * 4.0;
  float scan = smoothstep(0.35, 0.9, 0.5 + 0.5 * sin(phase));
  float sweep = smoothstep(0.96, 1.0, sin(vW.y * 2.2 - clk * 1.1));
  vec3 cyan = vec3(0.0, 0.9, 1.0);
  vec3 col = cyan * (0.18 + 0.45 * scan + 2.2 * fres + 0.6 * sweep);
  float alpha = 0.10 + 0.14 * scan + 0.75 * fres + 0.15 * sweep;
  outColor = vec4(col, clamp(alpha, 0.0, 0.95));
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "front",
  blending: "normal"
});

// Soft cyan pool of light on the floor under the sphere (additive).
const floorGlow = material.custom({
  glsl: {
    vertex: `out vec3 vW;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vW; out vec4 outColor;
void main() {
  float d = length(vW.xz);
  float pool = exp(-d * d * 0.55);
  float ring = exp(-pow((d - 1.05) * 6.0, 2.0)) * 0.8;
  float g = (pool * 0.25 + ring) * (0.85 + 0.15 * sin(clk * 2.0));
  outColor = vec4(vec3(0.0, 0.85, 1.0) * g, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#03060c" })
    .add(environments.neutral({ intensity: 0.35, background: false }))
    .add(lights.directional({ position: [3, 6, 4], target: [0, 1, 0], intensity: 1.2, color: "#9fe8ff" }))
    .add(lights.point({ position: [0, SPHERE_Y, 0], intensity: 10, color: "#22e6ff", distance: 7 }))
    .add(effects.bloom({ intensity: 0.5, threshold: 0.8, radius: 0.5 }))
    .add(
      primitives.plane({
        name: "floor",
        size: [24, 1, 24],
        material: material.pbr({ color: "#0b121b", metallic: 0.6, roughness: 0.3 })
      })
    )
    .add(
      primitives
        .plane({ name: "floorGlow", size: [8, 1, 8], material: floorGlow })
        .position(0, 0.01, 0)
        .runtime({ id: "floorGlow", mutable: true })
    )
    .add(
      primitives
        .box({
          name: "core",
          size: 0.6,
          material: material.pbr({ color: "#c9ccd2", metallic: 1, roughness: 0.2 })
        })
        .position(0, SPHERE_Y, 0)
        .runtime({ id: "core", mutable: true })
    )
    .add(
      primitives
        .sphere({ name: "shield", size: 2.2, material: hologram })
        .position(0, SPHERE_Y, 0)
        .runtime({ id: "shield", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 1.9, 5.2], target: [0, SPHERE_Y - 0.05, 0], fov: 40 }))
});

app.onFrame((f) => {
  app.nodes.require("shield").setUniform?.("clk", f.time);
  app.nodes.require("floorGlow").setUniform?.("clk", f.time);
  app.nodes.require("core").setRotation(f.time * 0.7, f.time * 1.1, f.time * 0.3);
});

void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
});
