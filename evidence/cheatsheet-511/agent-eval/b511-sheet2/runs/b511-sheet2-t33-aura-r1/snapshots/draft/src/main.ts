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

const shield = material.custom({
  glsl: {
    vertex: `out vec3 vWorldPos;
out vec3 vWorldNormal;
out vec3 vLocal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = mat3(modelMatrix) * normal;
  vLocal = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vWorldPos;
in vec3 vWorldNormal;
in vec3 vLocal;
out vec4 outColor;
uniform float clk;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);
  float fres = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0);
  // scanlines in world height, scrolling upward over time
  float y = vWorldPos.y * 14.0 - clk * 3.0;
  float line = smoothstep(0.35, 0.65, abs(fract(y) - 0.5) * 2.0);
  float scan = 1.0 - line;
  float slow = 0.5 + 0.5 * sin(vWorldPos.y * 3.0 - clk * 1.5);
  vec3 cyan = vec3(0.1, 0.9, 1.0);
  vec3 col = cyan * (0.10 + fres * 1.6 + scan * (0.28 + 0.2 * slow));
  float alpha = clamp(0.06 + fres * 0.8 + scan * 0.22, 0.0, 0.95);
  outColor = vec4(col * alpha, alpha);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "front"
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#04060c" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.directional({ position: [3, 6, 4], target: [0, 1, 0], intensity: 2.2, color: "#cfefff" }))
    .add(lights.point({ position: [0, 1.2, 0], intensity: 6, distance: 8, decay: 2, color: "#19d9ff" }))
    .add(
      primitives.plane({
        name: "floor",
        size: [14, 1, 14],
        material: material.pbr({ color: "#0b1018", roughness: 0.18, metallic: 0.7 })
      })
    )
    .add(
      primitives
        .box({
          name: "core",
          size: 0.55,
          material: material.pbr({ color: "#c9d3dd", metallic: 1, roughness: 0.22 })
        })
        .position(0, 1.1, 0)
        .runtime({ id: "core", mutable: true })
    )
    .add(
      primitives
        .sphere({ name: "shield", size: 2, material: shield })
        .position(0, 1.1, 0)
        .runtime({ id: "shield", mutable: true })
    )
    .add(effects.bloom({ intensity: 0.6, threshold: 0.7, radius: 0.6 }))
    .camera(camera.perspective({ position: [0, 1.6, 5], target: [0, 1.0, 0], fov: 42 }))
});

app.onFrame((f) => {
  app.nodes.require("shield").setUniform?.("clk", f.time);
  app.nodes.require("core").setRotation(f.time * 0.7, f.time * 1.1, f.time * 0.4);
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
