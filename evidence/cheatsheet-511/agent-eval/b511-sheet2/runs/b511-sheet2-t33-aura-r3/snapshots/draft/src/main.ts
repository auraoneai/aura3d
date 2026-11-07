import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const CENTER_Y = 1.2;

const shield = material.custom({
  glsl: {
    vertex: `out vec3 vWorldPos; out vec3 vWorldNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vWorldPos; in vec3 vWorldNormal; out vec4 outColor;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float facing = abs(dot(n, v));
  float fres = pow(1.0 - facing, 2.5);
  // scanlines scroll upward: pattern is a function of (y - speed * t)
  float phase = fract(vWorldPos.y * 14.0 - clk * 0.6);
  float line = smoothstep(0.0, 0.15, phase) * (1.0 - smoothstep(0.35, 0.55, phase));
  float sweep = 0.5 + 0.5 * sin(vWorldPos.y * 3.0 - clk * 1.5);
  vec3 cyan = vec3(0.0, 0.9, 1.0);
  vec3 col = cyan * (0.15 + fres * 2.2 + line * 0.9 + sweep * 0.1);
  float alpha = clamp(0.08 + fres * 0.75 + line * 0.3, 0.0, 0.92);
  outColor = vec4(col, alpha);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

const floorGlow = material.custom({
  glsl: {
    vertex: `out vec3 vWorldPos;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vWorldPos; out vec4 outColor;
void main() {
  float d = length(vWorldPos.xz);
  float halo = exp(-d * d * 0.9);
  float ring = exp(-pow((d - 1.05) * 5.0, 2.0)) * 0.6;
  float rings = 0.5 + 0.5 * sin(d * 18.0 - clk * 2.0);
  float a = (halo * 0.35 + ring * 0.5) * (0.85 + 0.15 * rings);
  outColor = vec4(vec3(0.0, 0.85, 1.0) * a, a);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#03060c" })
    .add(environments.neutral({ intensity: 0.25, background: false }))
    .add(lights.directional({ position: [3, 5, 4], target: [0, 1, 0], intensity: 2.5 }))
    .add(lights.point({ position: [0, CENTER_Y, 0], intensity: 6, color: "#33e6ff" }))
    .add(
      primitives.plane({
        name: "floor",
        size: [14, 1, 14],
        material: material.pbr({ color: "#0b1018", roughness: 0.3, metalness: 0.6 })
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
          size: 0.55,
          material: material.pbr({ color: "#c8d0da", roughness: 0.2, metalness: 1 })
        })
        .position(0, CENTER_Y, 0)
        .runtime({ id: "core", mutable: true })
    )
    .add(
      primitives
        .sphere({ name: "shield", size: 2, material: shield })
        .position(0, CENTER_Y, 0)
        .runtime({ id: "shield", mutable: true })
    )
    .add(effects.bloom({ intensity: 0.6, threshold: 0.7, radius: 0.5 }))
    .camera(camera.perspective({ position: [0, 1.9, 5.2], target: [0, CENTER_Y - 0.1, 0], fov: 40 }))
});

let first = true;
app.onFrame((f) => {
  app.nodes.require("shield").setUniform?.("clk", f.time);
  app.nodes.require("floorGlow").setUniform?.("clk", f.time);
  app.nodes.require("core").setRotation(f.time * 0.6, f.time * 1.1, f.time * 0.4);
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
