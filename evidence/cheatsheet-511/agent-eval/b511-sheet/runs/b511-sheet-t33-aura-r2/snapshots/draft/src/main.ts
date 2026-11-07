import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const hologram = material.custom({
  glsl: {
    vertex: `out vec3 vWorld; out vec3 vNormal;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vWorld; in vec3 vNormal; out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 2.5);
  // scanlines scroll toward +y as clk grows
  float s = sin((vWorld.y * 22.0 - clk * 2.2));
  float lines = smoothstep(0.1, 0.9, 0.5 + 0.5 * s);
  float band = fract(vWorld.y * 0.35 - clk * 0.12);
  float sweep = smoothstep(0.9, 1.0, band) * 0.6;
  vec3 cyan = vec3(0.0, 0.9, 1.0);
  vec3 col = cyan * (0.12 + 0.55 * lines + 1.6 * fres + sweep);
  float alpha = clamp(0.08 + 0.22 * lines + 0.7 * fres + sweep * 0.3, 0.0, 0.92);
  outColor = vec4(col, alpha);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "front",
  blending: "normal",
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#04070d" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.directional({ position: [4, 6, 4], target: [0, 1, 0], intensity: 2.5 }))
    .add(lights.point({ position: [0, 0.6, 0], intensity: 14, color: "#18d8ff", distance: 7 }))
    .add(effects.bloom({ intensity: 0.5, threshold: 0.7, radius: 0.5 }))
    .add(
      primitives.plane({
        name: "floor",
        size: [24, 1, 24],
        material: material.pbr({ color: "#0b1118", metallic: 0.8, roughness: 0.18 })
      })
    )
    .add(
      primitives
        .box({
          name: "core",
          size: 0.7,
          material: material.pbr({ color: "#d5dae0", metallic: 1, roughness: 0.2 })
        })
        .position(0, 1.2, 0)
        .runtime({ id: "core", mutable: true })
    )
    .add(
      primitives
        .sphere({ name: "shield", size: 2.2, material: hologram, castShadow: false })
        .position(0, 1.2, 0)
        .runtime({ id: "shield", mutable: true })
    )
    .camera(camera.perspective({ position: [0, 1.9, 5.4], target: [0, 1.15, 0], fov: 40 }))
});

app.onFrame((f) => {
  app.nodes.require("shield").setUniform?.("clk", f.time);
  app.nodes.require("core").setRotation(f.time * 0.7, f.time * 1.1, f.time * 0.4);
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
