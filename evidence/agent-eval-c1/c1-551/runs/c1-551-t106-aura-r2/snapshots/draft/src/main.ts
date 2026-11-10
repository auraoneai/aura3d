import {
  camera,
  createAuraApp,
  environments,
  geometry,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

// ---- Seamless cyclorama: floor that curves up into the backdrop (one smooth mesh) ----
// Profile in (z, y): flat floor from z=+10 to z=-2, quarter-circle of radius R, then vertical wall.
function buildCyc() {
  const halfW = 14;
  const R = 3.2;
  const zFront = 10;
  const zArcStart = -2;
  const wallTop = 12;
  const profile: Array<[number, number]> = [];
  const flatSteps = 8;
  for (let i = 0; i <= flatSteps; i += 1) profile.push([zFront + (zArcStart - zFront) * (i / flatSteps), 0]);
  const arcSteps = 24;
  for (let i = 1; i <= arcSteps; i += 1) {
    const a = (i / arcSteps) * (Math.PI / 2);
    profile.push([zArcStart - Math.sin(a) * R, R - Math.cos(a) * R]);
  }
  const wallSteps = 4;
  for (let i = 1; i <= wallSteps; i += 1) profile.push([zArcStart - R, R + (wallTop - R) * (i / wallSteps)]);

  const xSteps = 12;
  const cols = xSteps + 1;
  const rows = profile.length;
  const positions = new Float32Array(rows * cols * 3);
  const indices: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = -halfW + (2 * halfW * i) / xSteps;
      const [z, y] = profile[j]!;
      positions.set([x, y, z], (j * cols + i) * 3);
      if (i < xSteps && j < rows - 1) {
        const v = j * cols + i;
        // Counter-clockwise seen from the studio side (+z, above).
        indices.push(v, v + cols, v + 1, v + 1, v + cols, v + cols + 1);
      }
    }
  }
  const normals = geometry.computeNormals({ positions, indices });
  return geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [-halfW, 0, zArcStart - R], max: [halfW, wallTop, zFront] }
  });
}

const cycMaterial = material.pbr({
  name: "cyc",
  color: "#c9ccd1",
  roughness: 0.95,
  metallic: 0,
  envMapIntensity: 0.5,
  doubleSided: true
});

const R_SPHERE = 0.85;
const SPACING = 2.4;
const KEY_Y = 6.2;
const KEY_Z = 5.5;

const glass = material.studioGlass({
  name: "glass",
  tint: "#dff2ff",
  roughness: 0.0,
  transmission: 1,
  thickness: 1.6,
  ior: 1.5,
  specularIntensity: 1,
  envMapIntensity: 2.2,
  attenuationColor: "#bfe6f2",
  attenuationDistance: 3
});

const metal = material.brushedMetal({
  name: "brushed steel",
  color: "#cfd4da",
  metallic: 1,
  roughness: 0.34,
  anisotropy: 0.9,
  envMapIntensity: 1.8
});

const fabric = material.fabric({
  name: "red velvet",
  color: "#6e0f1c",
  roughness: 1,
  metallic: 0,
  envMapIntensity: 0.12,
  sheen: 1,
  sheenRoughness: 0.5,
  sheenColor: "#e0566a",
  normal: material.proceduralTexture("fabric-normal", { scale: 60, strength: 0.9, contrast: 0.8 })
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#b9bcc2" })
    .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false }))
    // Key: large soft light, front-left and high; drifts side to side.
    .add(
      lights.directional({
        name: "key",
        position: [-3, KEY_Y, KEY_Z],
        target: [0, 0.5, 0],
        intensity: 3.2,
        color: "#fff3e4",
        shadow: true
      }).runtime({ id: "key", mutable: true })
    )
    .add(
      lights.softbox({
        name: "key-softbox",
        position: [-3, KEY_Y - 1, KEY_Z],
        target: [0, 0.5, 0],
        width: 5,
        height: 3.5,
        intensity: 6,
        color: "#fff3e4"
      }).runtime({ id: "keybox", mutable: true })
    )
    // Fill: dimmer, from the opposite side.
    .add(
      lights.softbox({
        name: "fill",
        position: [6, 3.2, 5],
        target: [0, 0.6, 0],
        width: 4,
        height: 3,
        intensity: 2.2,
        color: "#dfe9ff"
      })
    )
    // Rim: from behind and above.
    .add(
      lights.spot({
        name: "rim",
        position: [0.5, 4.2, -4.2],
        target: [0, 0.8, 0],
        angle: 0.9,
        penumbra: 0.8,
        intensity: 60,
        distance: 20,
        color: "#ffffff",
        shadow: false
      })
    )
    .add(geometry.custom(buildCyc(), { name: "cyc-floor", material: cycMaterial, receiveShadow: true }))
    .add(
      primitives
        .sphere({ name: "glass", size: R_SPHERE * 2, material: glass, castShadow: true })
        .position(-SPACING, R_SPHERE, 0)
        .runtime({ id: "glass" })
    )
    .add(
      primitives
        .sphere({ name: "metal", size: R_SPHERE * 2, material: metal, castShadow: true })
        .position(0, R_SPHERE, 0)
        .runtime({ id: "metal" })
    )
    .add(
      primitives
        .sphere({ name: "fabric", size: R_SPHERE * 2, material: fabric, castShadow: true })
        .position(SPACING, R_SPHERE, 0)
        .runtime({ id: "fabric" })
    )
    .camera(camera.perspective({ position: [2.2, 2.6, 8.6], target: [0, 0.85, 0], fov: 36 })),
  pixelRatio: 1
});

const state = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: -3
};
window.__TASK_STATE__ = state;

let firstFrame = true;
app.onFrame((f) => {
  const x = Math.sin(f.time * 0.45) * 4.5;
  state.keyLightX = x;
  const pos: [number, number, number] = [x, KEY_Y, KEY_Z];
  app.nodes.require("key").setLight?.({ position: pos });
  app.nodes.require("keybox").setLight?.({ position: [x, KEY_Y - 1, KEY_Z] });
  window.__TASK_STATE__ = state;
  if (firstFrame) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
