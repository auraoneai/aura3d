import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene, texture } from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

const RADIUS = 0.8;
const SPACING = 2.05;

// ---------------------------------------------------------------- floor with a cove (seamless floor-to-backdrop curve)
function buildCove() {
  const halfWidth = 30;
  const frontZ = 18;
  const coveStartZ = -3.5;
  const coveRadius = 3.2;
  const wallTop = 16;
  const arcSteps = 24;

  // profile points: [z, y, normalZ, normalY]
  const profile: Array<[number, number, number, number]> = [];
  profile.push([frontZ, 0, 0, 1]);
  profile.push([coveStartZ, 0, 0, 1]);
  for (let i = 1; i <= arcSteps; i += 1) {
    const t = (i / arcSteps) * (Math.PI / 2);
    profile.push([coveStartZ - coveRadius * Math.sin(t), coveRadius * (1 - Math.cos(t)), Math.sin(t), Math.cos(t)]);
  }
  profile.push([coveStartZ - coveRadius, wallTop, 1, 0]);

  const positions = new Float32Array(profile.length * 2 * 3);
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array(profile.length * 2 * 2);
  const indices: number[] = [];
  let acc = 0;
  profile.forEach((p, i) => {
    if (i > 0) acc += Math.hypot(p[0] - profile[i - 1]![0], p[1] - profile[i - 1]![1]);
    for (let j = 0; j < 2; j += 1) {
      const k = i * 2 + j;
      positions[k * 3] = j === 0 ? -halfWidth : halfWidth;
      positions[k * 3 + 1] = p[1];
      positions[k * 3 + 2] = p[0];
      normals[k * 3] = 0;
      normals[k * 3 + 1] = p[3];
      normals[k * 3 + 2] = p[2];
      uvs[k * 2] = j;
      uvs[k * 2 + 1] = acc / 40;
    }
    if (i < profile.length - 1) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  });
  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    bounds: { min: [-halfWidth, 0, coveStartZ - coveRadius], max: [halfWidth, wallTop, frontZ] }
  });
}

// ---------------------------------------------------------------- procedural woven velvet/wool base colour
function buildWeave() {
  const size = 128;
  const cell = 8; // thread width in texels
  const data = new Uint8Array(size * size * 4);
  let seed = 4242;
  const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const warpOnTop = (cx + cy) % 2 === 0; // plain weave: threads alternate over/under
      const u = ((x % cell) + 0.5) / cell;
      const v = ((y % cell) + 0.5) / cell;
      // each thread is a rounded cylinder: bright in the middle, dark at the sides and where it dips under
      const across = warpOnTop ? u : v;
      const along = warpOnTop ? v : u;
      const round = Math.sin(across * Math.PI);
      const dip = 0.55 + 0.45 * Math.sin(along * Math.PI);
      const shade = (0.45 + 0.55 * round) * (warpOnTop ? dip : dip * 0.9);
      const fuzz = 0.86 + rand() * 0.28;
      const s = Math.min(1.25, shade * fuzz);
      const i = (y * size + x) * 4;
      data[i] = Math.min(255, Math.round(150 * s));
      data[i + 1] = Math.min(255, Math.round(22 * s));
      data[i + 2] = Math.min(255, Math.round(36 * s));
      data[i + 3] = 255;
    }
  }
  const tex = texture.data({ width: size, height: size, data, format: "rgba8", colorSpace: "srgb" });
  tex.wrapS = "repeat";
  tex.wrapT = "repeat";
  tex.repeat = [8, 4];
  tex.generateMipmaps = true;
  tex.minFilter = "linear-mipmap-linear";
  tex.magFilter = "linear";
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- materials
const glass = material.clearGlass({
  color: "#d4f1ff",
  opacity: 0.28,
  transmission: 1,
  thickness: 1.6,
  ior: 1.5,
  roughness: 0.02,
  clearcoat: 1,
  clearcoatRoughness: 0.01,
  specularIntensity: 1,
  attenuationColor: "#b9e6f5",
  attenuationDistance: 3,
  envMapIntensity: 2.6
});

const steel = material.brushedMetal({
  color: "#d5d9de",
  metallic: 1,
  metalness: 1,
  roughness: 0.34,
  anisotropy: 0.9,
  anisotropyRotation: Math.PI / 2,
  envMapIntensity: 1.8
});

const velvet = material.fabric({
  color: "#ffffff",
  texture: buildWeave(),
  roughness: 1,
  metallic: 0,
  metalness: 0,
  envMapIntensity: 0.15,
  sheen: 1,
  sheenColor: "#ff7b8c",
  sheenRoughness: 0.45,
  normal: material.proceduralTexture("fabric-normal", { scale: 60, strength: 0.7, contrast: 0.8 }),
  rim: { color: "#ff4a5e", power: 2.6, intensity: 0.55 }
});

const floorMaterial = material.pbr({
  color: "#d9dadd",
  roughness: 0.62,
  metallic: 0,
  metalness: 0,
  envMapIntensity: 0.6,
  doubleSided: true
});

// ---------------------------------------------------------------- scene
const KEY_Y = 6.5;
const KEY_Z = 5.5;
const KEY_AMPLITUDE = 3.6;
const keyXAt = (seconds: number): number => KEY_AMPLITUDE * Math.sin(seconds * 0.45);

window.__TASK_STATE__ = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: keyXAt(0)
};

const app = createAuraApp("#app", {
  scene: scene({ background: "#cfd1d5" })
    .add(environments.neutral({ intensity: 1.1, background: false }))
    .add(
      lights.directional({
        name: "key",
        position: [keyXAt(0), KEY_Y, KEY_Z],
        target: [0, 0.6, 0],
        intensity: 3.2,
        color: "#fff3e4",
        shadow: { filter: "pcss", softness: 1, lightSize: 3, mapSize: 2048, intensity: 0.8, bias: 0.0005, normalBias: 0.02 }
      }).runtime({ id: "key", mutable: true })
    )
    .add(lights.directional({ name: "fill", position: [-6, 3, 4], target: [0, 0.8, 0], intensity: 0.9, color: "#d6e2ff" }))
    .add(lights.directional({ name: "rim", position: [1.5, 4.5, -7], target: [0, 1, 0], intensity: 2.0, color: "#ffffff" }))
    .add(geometry.custom(buildCove(), { name: "cove", material: floorMaterial, castShadow: false, receiveShadow: true }))
    .add(
      primitives.sphere({
        name: "sphere-glass",
        size: RADIUS * 2,
        params: { widthSegments: 96, heightSegments: 64 },
        material: glass
      }).position(-SPACING, RADIUS, 0)
    )
    .add(
      primitives.sphere({
        name: "sphere-metal",
        size: RADIUS * 2,
        params: { widthSegments: 96, heightSegments: 64 },
        material: steel
      }).position(0, RADIUS, 0)
    )
    .add(
      primitives.sphere({
        name: "sphere-fabric",
        size: RADIUS * 2,
        params: { widthSegments: 96, heightSegments: 64 },
        material: velvet
      }).position(SPACING, RADIUS, 0)
    )
    .add(effects.contactShadows({ length: 0.5, thickness: 0.4, steps: 16, intensity: 0.8 }))
    .camera(camera.perspective({ position: [1.6, 3.0, 8.6], target: [0, 0.75, 0], fov: 32, near: 0.1, far: 120 }))
});

let clock = 0;
let readyFlagged = false;
app.onFrame((frame) => {
  clock += frame.dt;
  const x = keyXAt(clock);
  app.nodes.require("key").setPosition(x, KEY_Y, KEY_Z);
  window.__TASK_STATE__.keyLightX = x;
  if (!readyFlagged) {
    readyFlagged = true;
    window.__EVAL_READY__ = true;
  }
});
await app.ready();
