import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const shield = material.custom({
  glsl: {
    vertex: `out vec3 vWorld; out vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = mat3(modelMatrix) * normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vWorld; in vec3 vNormal; out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(n, v));
  float fres = pow(1.0 - ndv, 2.5);
  // scanlines scroll upward: phase = y*freq - t*speed
  float ph = fract(vWorld.y * 14.0 - clk * 0.8);
  float line = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.35, 0.55, ph));
  vec3 cyan = vec3(0.0, 0.9, 1.0);
  vec3 col = cyan * (0.12 + fres * 2.2 + line * 0.9);
  float a = clamp(0.08 + fres * 0.75 + line * 0.3, 0.0, 0.95);
  outColor = vec4(col, a);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

// Soft additive cyan glow on the floor under the shield.
const floorGlow = material.custom({
  glsl: {
    vertex: `out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vWorld; out vec4 outColor;
void main() {
  float r = length(vWorld.xz);
  float ring = exp(-pow((r - 1.05) * 5.0, 2.0));
  float core = exp(-r * r * 0.9);
  float pulse = 0.85 + 0.15 * sin(clk * 2.0);
  vec3 c = vec3(0.0, 0.8, 1.0) * (ring * 0.9 + core * 0.35) * pulse;
  outColor = vec4(c, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  blending: "additive",
  depthWrite: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#04070d" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.directional({ position: [3, 6, 4], target: [0, 0, 0], intensity: 1.8 }))
    .add(lights.point({ position: [0, 0.2, 0], intensity: 8, color: "#19d9ff", distance: 7 }))
    .add(effects.bloom({ intensity: 0.5, threshold: 0.7, radius: 0.5 }))
    .add(
      primitives.plane({
        name: "floor",
        size: [14, 1, 14],
        position: [0, -1.1, 0],
        material: material.pbr({ color: "#0b1018", metallic: 0.6, roughness: 0.25 })
      })
    )
    .add(
      primitives.plane({ name: "glow", size: [6, 1, 6], material: floorGlow })
        .position(0, -1.09, 0)
        .runtime({ id: "glow", mutable: true })
    )
    .add(
      primitives.box({
        name: "core",
        size: 0.7,
        material: material.pbr({ color: "#c9ccd2", metallic: 1, roughness: 0.2 })
      })
        .position(0, 0, 0)
        .runtime({ id: "core", mutable: true })
    )
    .add(
      primitives.sphere({ name: "shield", size: 2.2, material: shield })
        .position(0, 0, 0)
        .runtime({ id: "shield", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 0.6, 5.2], target: [0, -0.1, 0], fov: 40 }))
});

app.onFrame((f) => {
  app.nodes.require("shield").setUniform?.("clk", f.time);
  app.nodes.require("glow").setUniform?.("clk", f.time);
  app.nodes.require("core").setRotation(f.time * 0.7, f.time * 1.1, f.time * 0.4);
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
