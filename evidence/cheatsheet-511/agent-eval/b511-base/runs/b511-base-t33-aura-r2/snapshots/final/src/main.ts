import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

// Hologram shield: custom GLSL sphere (cyan fresnel rim, upward-scrolling scanlines, translucent),
// a rotating metallic cube inside, and a dark glossy floor that picks up the cyan glow.
const CENTER_Y = 1.8;

const shield = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vWorld;
out vec3 vNormalW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vWorld;
in vec3 vNormalW;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(cameraPosition - vWorld);
  float facing = abs(dot(n, v));
  float fresnel = pow(1.0 - clamp(facing, 0.0, 1.0), 2.5);

  // Scanlines in world height; subtracting time moves the pattern upward.
  float phase = fract(vWorld.y * 12.0 - uTime * 0.8);
  float line = smoothstep(0.0, 0.12, phase) * (1.0 - smoothstep(0.35, 0.5, phase));
  // A slower, wider bright band sweeping upward.
  float sweep = pow(max(0.0, 1.0 - abs(fract(vWorld.y * 0.35 - uTime * 0.15) - 0.5) * 6.0), 2.0);

  vec3 cyan = vec3(0.1, 0.9, 1.0);
  vec3 deep = vec3(0.0, 0.25, 0.4);
  vec3 col = mix(deep, cyan, clamp(fresnel + line * 0.5, 0.0, 1.0));
  col += cyan * (fresnel * 0.9 + line * 0.35 + sweep * 0.25);

  float alpha = 0.10 + fresnel * 0.65 + line * 0.22 + sweep * 0.1;
  outColor = vec4(col, clamp(alpha, 0.0, 0.92));
}`
  },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "normal",
  fog: false
});

const stage = scene({ background: "#03050a" })
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.directional({ name: "key", position: [3, 6, 4], target: [0, CENTER_Y, 0], intensity: 1.6, color: "#cfe9ff" }))
  .add(lights.point({ name: "glow", position: [0, 0.9, 0], intensity: 7, color: "#27d8ff", distance: 9, decay: 2, shadow: false }))
  .add(primitives.plane({
    name: "floor",
    size: [30, 1, 30],
    material: material.pbr({ color: "#0b121a", metallic: 0.55, roughness: 0.22 })
  }))
  .add(primitives.roundedBox({
    name: "cube",
    size: 0.7,
    material: material.pbr({ color: "#d5dae2", metallic: 1, roughness: 0.22 })
  }).position(0, CENTER_Y, 0).runtime({ id: "cube", mutable: true }))
  .add(primitives.sphere({ name: "shield", size: 3, material: shield, castShadow: false, receiveShadow: false }).position(0, CENTER_Y, 0))
  .add(effects.bloom({ intensity: 0.7, threshold: 0.6, radius: 0.55 }))
  .camera(camera.perspective({ position: [0, 2.3, 7.2], target: [0, 1.5, 0], fov: 40, near: 0.1, far: 80 }));

const app = createAuraApp("#app", { scene: stage });
const start = performance.now();
app.onFrame(() => {
  const t = (performance.now() - start) / 1000;
  app.nodes.require("cube").setRotation(t * 0.6, t * 0.9, t * 0.3);
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  });
});
