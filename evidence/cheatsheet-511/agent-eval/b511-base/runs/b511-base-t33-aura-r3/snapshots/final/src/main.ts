import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const CENTER_Y = 1.3;
const RADIUS = 1.2;

// Hologram shell: fresnel rim glow, upward-scrolling scanlines, translucent blend.
const hologram = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorldPos;
out vec3 vWorldNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = mat3(modelMatrix) * normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorldPos;
in vec3 vWorldNormal;
out vec4 outColor;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float ndv = abs(dot(n, v));
  float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 2.5);

  // Horizontal bands in world height; subtracting time moves them upward.
  float phase = (vWorldPos.y - uTime * 0.35) * 22.0;
  float line = smoothstep(0.35, 0.9, sin(phase) * 0.5 + 0.5);
  // A thicker, slower bright band sweeping upward.
  float sweep = pow(max(sin((vWorldPos.y - uTime * 0.6) * 3.0), 0.0), 8.0);

  vec3 cyan = vec3(0.0, 0.9, 1.0);
  vec3 body = vec3(0.0, 0.25, 0.35);
  vec3 col = body * (0.35 + 0.65 * line) + cyan * fresnel * 1.6 + cyan * sweep * 0.25;
  float alpha = 0.10 + 0.20 * line + 0.75 * fresnel + 0.12 * sweep;
  outColor = vec4(col, clamp(alpha, 0.0, 0.95));
}`
  },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "normal",
  fog: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#04070c" })
    .add(environments.neutral({ intensity: 0.35, background: false }))
    .add(lights.ambient({ intensity: 0.12, color: "#6fdfff" }))
    .add(lights.directional({ position: [3, 5, 4], target: [0, 1, 0], intensity: 1.2, color: "#cfefff" }))
    .add(lights.point({ position: [0, CENTER_Y, 0], intensity: 14, distance: 9, color: "#22e6ff" }))
    .add(
      primitives.plane({
        name: "floor",
        size: [30, 1, 30],
        material: material.pbr({ color: "#0b1118", metallic: 0.6, roughness: 0.22 })
      })
    )
    .add(
      primitives
        .box({
          name: "core",
          size: 0.7,
          material: material.pbr({ color: "#c9d2dc", metallic: 1, roughness: 0.25 })
        })
        .position(0, CENTER_Y, 0)
        .runtime({ id: "core", mutable: true })
    )
    .add(primitives.sphere({ name: "shield", size: RADIUS * 2, material: hologram }).position(0, CENTER_Y, 0))
    .camera(camera.perspective({ position: [0, 1.7, 5.6], target: [0, CENTER_Y - 0.1, 0], fov: 42, near: 0.1, far: 100 }))
});

const start = performance.now();
app.onFrame(() => {
  const t = (performance.now() - start) / 1000;
  app.nodes.require("core").setRotation(t * 0.7, t * 1.1, t * 0.4);
});

await app.ready();
window.__EVAL_READY__ = true;
