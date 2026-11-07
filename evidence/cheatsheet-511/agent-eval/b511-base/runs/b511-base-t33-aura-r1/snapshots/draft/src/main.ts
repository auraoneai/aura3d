import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const CENTER_Y = 1.25;

// Hologram shell: cyan fresnel rim, upward-scrolling scanlines, translucent body.
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
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 2.6);

  // Horizontal bands in world height; subtracting time moves them upward.
  float band = fract(vWorldPos.y * 14.0 - uClock * 0.45);
  float line = smoothstep(0.0, 0.12, band) * (1.0 - smoothstep(0.35, 0.55, band));
  // Slower, wider sweep bar travelling up as well.
  float sweep = pow(max(0.0, 1.0 - abs(fract(vWorldPos.y * 0.35 - uClock * 0.12) - 0.5) * 6.0), 2.0);

  vec3 cyan = vec3(0.1, 0.9, 1.0);
  vec3 body = vec3(0.02, 0.18, 0.26);
  vec3 col = body + cyan * (fresnel * 1.6 + line * 0.5 + sweep * 0.35);
  float alpha = clamp(0.07 + fresnel * 0.75 + line * 0.22 + sweep * 0.12, 0.0, 0.95);
  outColor = vec4(col, alpha);
}`
  },
  uniforms: { uClock: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "front",
  castShadow: false,
  receiveShadow: false
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#03060b" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.directional({ name: "key", position: [3, 5, 4], target: [0, CENTER_Y, 0], intensity: 1.6, color: "#d8f6ff" }))
    .add(lights.directional({ name: "rim", position: [-4, 2.5, -3], target: [0, CENTER_Y, 0], intensity: 1.2, color: "#4fd8ff" }))
    .add(lights.point({ name: "glow", position: [0, CENTER_Y, 0], intensity: 10, color: "#22d3ee", distance: 9, decay: 2, shadow: false }))
    .add(
      primitives.plane({
        name: "floor",
        size: [24, 1, 24],
        material: material.pbr({ color: "#0b1118", metallic: 0.85, roughness: 0.22 }),
        castShadow: false
      }).position(0, 0, 0)
    )
    .add(
      primitives.box({
        name: "core-cube",
        size: 0.62,
        material: material.metal({ color: "#c9d2dc", metallic: 1, roughness: 0.25 })
      })
        .position(0, CENTER_Y, 0)
        .runtime({ id: "cube", mutable: true })
    )
    .add(
      primitives.sphere({ name: "shield", size: 2.1, material: hologram })
        .position(0, CENTER_Y, 0)
        .runtime({ id: "shield", mutable: true })
    )
    .add(effects.bloom({ intensity: 0.7, threshold: 0.55, radius: 0.6 }))
    .camera(camera.perspective({ position: [0, 1.9, 5.6], target: [0, 1.1, 0], fov: 40, near: 0.1, far: 80 }))
});

let clock = 0;
let readyFlagged = false;
let appReady = false;

app.onFrame((frame) => {
  clock += frame.dt;
  app.nodes.require("shield").setUniform?.("uClock", clock);
  app.nodes.require("cube").setRotation(clock * 0.7, clock * 1.1, clock * 0.3);
  if (appReady && !readyFlagged) {
    readyFlagged = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

await app.ready();
appReady = true;
