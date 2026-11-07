import { camera, createAuraApp, effects, geometry, lights, material, primitives, scene, sky } from "@aura3d/engine";
import {
  catmullRomCurve, composeGeometry, createFbm2D, createFbm3D, heightfieldGeometry, latheGeometry, parametricSurface, path2d, seededRandom, sweepGeometry,
  type ProceduralVec3
} from "@aura3d/engine/procedural";

// Hero scene: a lighthouse on a rocky island, built ONLY from the procedural helpers (no GLB, no texture, no asset admission).
//   heightfieldGeometry + createFbm2D  island slab, coloured by height and slope
//   latheGeometry + path2d             tower bands, gallery, lantern, roof, finial, beam
//   sweepGeometry + catmullRomCurve    railing ring, posts, stair path, mooring rope
//   parametricSurface + createFbm3D    seeded rocks
//   composeGeometry                    one draw call per material with a vertex colour per part
const SIZE = 44;
const fbm = createFbm2D(9, { octaves: 5, frequency: 0.07 });
const crag = createFbm2D(2, { octaves: 3, frequency: 0.12 });
const groundAt = (x: number, z: number): number => {
  const r = Math.hypot(x - 1.5, z + 0.5) / (SIZE * 0.5);
  const dome = Math.max(0, 1 - r * r * 1.9) ** 1.4;
  return dome * 6.2 + fbm(x, z) * 1.5 + Math.max(0, crag(x, z)) * 1.1 * dome - 2.2;
};
const island = heightfieldGeometry({
  heightAt: groundAt, size: SIZE, segments: 176, base: -7,
  colorAt: (_x, _z, h, slope) => {
    if (h < 0.35) return [0.63, 0.57, 0.42, 1];
    if (slope > 0.22) return [0.34 + h * 0.01, 0.31, 0.29, 1];
    if (h < 3.4) return [0.2 + h * 0.01, 0.34 + h * 0.01, 0.14, 1];
    return [0.42, 0.4, 0.36, 1];
  }
});

const baseY = groundAt(0, 0) - 0.2;
const TOWER_H = 12.5;
const radiusAt = (y: number): number => 2.25 - 0.85 * (y / TOWER_H);

// Tower: alternating red/white bands, each one a lathe frustum, composed into a single geometry.
const bands = Array.from({ length: 5 }, (_, i) => {
  const y0 = (i / 5) * TOWER_H, y1 = ((i + 1) / 5) * TOWER_H;
  return {
    geometry: latheGeometry({ profile: [[0, y0], [radiusAt(y0), y0], [radiusAt(y1), y1], [0, y1]], segments: 56, creaseAngle: 0.5 }),
    color: (i % 2 === 0 ? [0.92, 0.9, 0.86, 1] : [0.72, 0.13, 0.11, 1]) as [number, number, number, number]
  };
});
const tower = composeGeometry(bands.map((b) => ({ geometry: b.geometry, position: [0, baseY, 0] as ProceduralVec3, color: b.color })));
const plinth = latheGeometry({ profile: path2d().moveTo(0, 0).lineTo(2.9, 0).quadTo(3.05, 0.45, 2.55, 0.8).lineTo(2.3, 0.8).lineTo(0, 0.8).points({ curveSegments: 8 }), segments: 56 });

const topY = baseY + TOWER_H;
const gallery = composeGeometry([
  { geometry: latheGeometry({ profile: [[0, 0], [2.0, 0], [2.0, 0.12], [2.55, 0.26], [2.55, 0.42], [0, 0.42]], segments: 56, creaseAngle: 0.5 }), position: [0, topY, 0], color: [0.2, 0.21, 0.24, 1] },
  { geometry: sweepGeometry({ path: catmullRomCurve([[2.4, 0, 0], [0, 0, 2.4], [-2.4, 0, 0], [0, 0, -2.4]], { closed: true }), steps: 72, radius: 0.045, radialSegments: 8 }), position: [0, topY + 1.35, 0], color: [0.15, 0.16, 0.18, 1] },
  { geometry: sweepGeometry({ path: catmullRomCurve([[2.4, 0, 0], [0, 0, 2.4], [-2.4, 0, 0], [0, 0, -2.4]], { closed: true }), steps: 72, radius: 0.035, radialSegments: 8 }), position: [0, topY + 0.85, 0], color: [0.15, 0.16, 0.18, 1] },
  ...Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2;
    return {
      geometry: sweepGeometry({ path: [[0, 0, 0], [0, 1.0, 0]], steps: 1, radius: 0.04, profile: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }),
      position: [Math.cos(a) * 2.4, topY + 0.42, Math.sin(a) * 2.4] as ProceduralVec3, color: [0.15, 0.16, 0.18, 1] as [number, number, number, number]
    };
  })
]);

// Lantern room: glass drum, mullions, copper roof, finial.
const glass = latheGeometry({ profile: [[0, 0], [1.25, 0], [1.25, 1.9], [0, 1.9]], segments: 40, creaseAngle: 0.5 });
const roofAndFinial = composeGeometry([
  { geometry: latheGeometry({ profile: path2d().moveTo(0, 0).lineTo(1.75, 0).lineTo(1.65, 0.15).quadTo(1.0, 0.7, 0.12, 1.7).lineTo(0, 1.75).points({ curveSegments: 12 }), segments: 40, creaseAngle: 0.6 }), position: [0, topY + 2.45, 0], color: [0.2, 0.46, 0.4, 1] },
  { geometry: latheGeometry({ profile: path2d().moveTo(0, 0).arc(0, 0.16, 0.16, -Math.PI / 2, Math.PI / 2).points({ curveSegments: 8 }), segments: 16 }), position: [0, topY + 4.2, 0], color: [0.85, 0.7, 0.3, 1] },
  { geometry: latheGeometry({ profile: [[0, 0], [1.3, 0], [1.3, 0.12], [0, 0.12]], segments: 40 }), position: [0, topY + 0.42, 0], color: [0.2, 0.21, 0.24, 1] },
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return {
      geometry: sweepGeometry({ path: [[0, 0, 0], [0, 2.05, 0]], steps: 1, radius: 0.045, profile: [[-1, -1], [1, -1], [1, 1], [-1, 1]] }),
      position: [Math.cos(a) * 1.27, topY + 0.42, Math.sin(a) * 1.27] as ProceduralVec3, color: [0.2, 0.21, 0.24, 1] as [number, number, number, number]
    };
  })
]);
const beam = latheGeometry({ profile: [[0, 0], [0.9, 0], [7.5, 34], [0, 34]].map(([r, y]) => [r!, y!] as const), segments: 32 });

// Door, windows and a stair path winding up from the shore.
const door = composeGeometry([
  { geometry: sweepGeometry({ path: [[0, 0, 0], [0, 1.9, 0]], steps: 1, radius: 0.55, profile: [[-1, -0.3], [1, -0.3], [1, 0.3], [-1, 0.3]] }), color: [0.3, 0.19, 0.11, 1] },
  { geometry: sweepGeometry({ path: [[0, 0, 0], [0, 0.18, 0]], steps: 1, radius: 0.72, profile: [[-1, -0.6], [1, -0.6], [1, 0.6], [-1, 0.6]] }), position: [0, 1.9, 0], color: [0.55, 0.55, 0.55, 1] }
]);
const windows = composeGeometry([[2.8, 0.6], [5.8, 2.4], [8.6, 4.2]].map(([y, a]) => ({
  geometry: sweepGeometry({ path: [[0, 0, 0], [0, 0.8, 0]], steps: 1, radius: 0.22, profile: [[-0.7, -0.5], [0.7, -0.5], [0.7, 0.5], [-0.7, 0.5]] }),
  position: [Math.sin(a!) * (radiusAt(y!) - 0.04), baseY + y!, Math.cos(a!) * (radiusAt(y!) - 0.04)] as ProceduralVec3,
  rotation: [0, a!, 0] as ProceduralVec3, color: [0.08, 0.1, 0.14, 1] as [number, number, number, number]
})));
const stairPoints: ProceduralVec3[] = [[-13, -0.1, 7], [-9, 0.5, 6], [-5.5, 1.5, 4.5], [-2.8, groundAt(-1.4, 3.2) + 0.1, 3.4], [0, groundAt(0, 2.8) + 0.05, 2.7]];
const stairs = sweepGeometry({ path: catmullRomCurve(stairPoints.map(([x, , z]) => [x, groundAt(x, z) + 0.12, z] as const)), steps: 90, radius: 0.55, profile: [[-1, -0.12], [1, -0.12], [1, 0.12], [-1, 0.12]], radialSegments: 4 });

// Seeded rocks: a displaced sphere per rock, ring around the base and scattered on the shore.
const rocks = (() => {
  const rnd = seededRandom(31);
  return composeGeometry(Array.from({ length: 22 }, (_, i) => {
    const noise = createFbm3D(100 + i, { octaves: 3, frequency: 1.6 });
    const spec = parametricSurface({
      uSegments: 24, vSegments: 16, wrapU: true,
      fn: (u, v) => {
        const th = u * Math.PI * 2, ph = v * Math.PI;
        const d: ProceduralVec3 = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
        const r = 1 + 0.32 * noise(d[0], d[1], d[2]);
        return [d[0] * r, d[1] * r * 0.7, d[2] * r];
      }
    });
    const ring = i < 10;
    const a = rnd() * Math.PI * 2, dist = ring ? 3.4 + rnd() * 1.6 : 7 + rnd() * 10;
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist, s = (ring ? 0.5 : 0.7) + rnd() * 0.9;
    const tone = 0.34 + rnd() * 0.16;
    return { geometry: spec, position: [x, groundAt(x, z) + s * 0.15, z] as ProceduralVec3, scale: s, rotation: [0, rnd() * 6, 0] as ProceduralVec3, color: [tone, tone * 0.97, tone * 0.92, 1] as [number, number, number, number] };
  }));
})();

const white = (rough: number, metal = 0) => material.pbr({ color: "#ffffff", roughness: rough, metallic: metal });
const app = createAuraApp("#app", {
  scene: scene({ background: "#f1b27a" })
    .add(sky.preetham({ sun: { elevationDeg: 7, azimuthDeg: 250, intensity: 1 } }))
    .add(lights.hemisphere({ skyColor: "#ffd2a8", groundColor: "#3a4a52", intensity: 0.55 }))
    .add(lights.directional({ name: "sun", position: [-40, 11, -18], target: [0, 4, 0], intensity: 3.4, color: "#ffc27d", shadow: true }))
    .add(lights.point({ name: "lamp", position: [0, topY + 1.2, 0], intensity: 12, distance: 22, decay: 1.6, color: "#ffe2a0" }))
    .add(geometry.custom(island, { name: "island", material: white(0.95) }))
    .add(primitives.plane({ name: "sea", size: [320, 1, 320], material: material.pbr({ color: "#2a6d8f", roughness: 0.08, metallic: 0.1, opacity: 0.86 }), castShadow: false }).position(0, 0.1, 0))
    .add(geometry.custom(plinth, { name: "plinth", material: material.pbr({ color: "#6f6a62", roughness: 0.9 }) }).position(0, baseY - 0.3, 0))
    .add(geometry.custom(tower, { name: "tower", material: white(0.6) }))
    .add(geometry.custom(gallery, { name: "gallery", material: white(0.45, 0.6) }))
    .add(geometry.custom(glass, { name: "lantern-glass", material: material.pbr({ color: "#ffe9b0", roughness: 0.1, opacity: 0.55, emissive: "#ffcf6a", emissiveIntensity: 2.2 }), castShadow: false }).position(0, topY + 0.54, 0))
    .add(geometry.custom(roofAndFinial, { name: "roof", material: white(0.4, 0.5) }))
    .add(geometry.custom(door, { name: "door", material: white(0.7) }).position(0, baseY + 0.1, radiusAt(0) - 0.12))
    .add(geometry.custom(windows, { name: "windows", material: white(0.3) }))
    .add(geometry.custom(stairs, { name: "stairs", material: material.pbr({ color: "#7a6f60", roughness: 0.95 }) }))
    .add(geometry.custom(rocks, { name: "rocks", material: white(0.95) }))
    .add(geometry.custom(beam, { name: "beam", material: material.pbr({ color: "#fff1c8", roughness: 1, opacity: 0.08, emissive: "#ffe09a", emissiveIntensity: 0.8 }), castShadow: false }).position(0, topY + 1.5, 0).rotate(0, 0, -1.5))
    .add(effects.fog({ color: "#f0b98f", density: 0.0035 }))
    .add(effects.bloom({ intensity: 0.7, threshold: 0.75, radius: 0.5 }))
    .camera(camera.perspective({ position: [-24, 8.5, 26], target: [0, topY * 0.5 + 0.5, 0], fov: 42, near: 0.5, far: 600 }))
});
await app.ready();
