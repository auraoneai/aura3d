import { camera, createAuraApp, effects, geometry, lights, material, scene, sky } from "@aura3d/engine";
import {
  catmullRomCurve, composeGeometry, createFbm2D, createFbm3D, heightfieldGeometry, latheGeometry, parametricSurface, path2d, seededRandom, sweepGeometry,
  type ProceduralColor, type ProceduralGeometry, type ProceduralVec3
} from "@aura3d/engine/procedural";

// Hero scene: a medieval hay cart on a rutted road, built ONLY from the procedural helpers (no GLB, no texture).
//   sweepGeometry          planks, rails, stakes, axle, shafts and trunks (a square profile along a 2-point path is a box)
//   latheGeometry + path2d wheel rim, hub and tyre, barrels, bands
//   parametricSurface      noise-displaced sacks and tree canopies
//   heightfieldGeometry    the road with wheel ruts, coloured by distance from the track
//   composeGeometry        every group is one draw call with a vertex colour per part
const wood = (shade: number): ProceduralColor => [0.46 * shade, 0.31 * shade, 0.18 * shade, 1];
const iron: ProceduralColor = [0.16, 0.16, 0.18, 1];

const box = (sx: number, sy: number, sz: number): ProceduralGeometry =>
  sweepGeometry({ path: [[-sx / 2, 0, 0], [sx / 2, 0, 0]], steps: 1, radius: 1, profile: [[-sy / 2, -sz / 2], [sy / 2, -sz / 2], [sy / 2, sz / 2], [-sy / 2, sz / 2]] });
const rod = (a: ProceduralVec3, b: ProceduralVec3, r0: number, r1 = r0, steps = 8): ProceduralGeometry =>
  sweepGeometry({ path: [a, b], steps, radius: (t) => r0 + (r1 - r0) * t, radialSegments: 12 });

// Wheel, axis along local y: tyre, felloe ring, ten square spokes, hub with a flared nave.
const R = 0.82;
const wheel = (() => {
  const tyreProfile = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return [R + 0.085 + 0.03 * Math.cos(a), 0.12 * Math.sin(a)] as const; });
  const felloe = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return [R - 0.01 + 0.075 * Math.cos(a), 0.085 * Math.sin(a)] as const; });
  return composeGeometry([
    { geometry: latheGeometry({ profile: [...tyreProfile, tyreProfile[0]!], segments: 56 }), color: iron },
    { geometry: latheGeometry({ profile: [...felloe, felloe[0]!], segments: 56 }), color: wood(1.05) },
    { geometry: latheGeometry({ profile: path2d().moveTo(0, -0.22).lineTo(0.1, -0.22).lineTo(0.15, -0.12).lineTo(0.17, 0.0).lineTo(0.15, 0.12).lineTo(0.1, 0.22).lineTo(0, 0.22).points(), segments: 24, creaseAngle: 0.5 }), color: wood(0.8) },
    ...Array.from({ length: 10 }, (_, i) => ({
      geometry: sweepGeometry({ path: [[0.12, 0, 0], [R - 0.02, 0, 0]], steps: 1, radius: 1, profile: [[-0.045, -0.035], [0.045, -0.035], [0.045, 0.035], [-0.045, 0.035]] }),
      rotation: [0, (i / 10) * Math.PI * 2, 0] as ProceduralVec3, color: wood(0.95)
    }))
  ]);
})();

// Cart body.
const planks = Array.from({ length: 9 }, (_, i) => ({ geometry: box(3.4, 0.06, 0.185), position: [0, 1.2, -0.8 + i * 0.2] as ProceduralVec3, color: wood(0.85 + ((i * 37) % 7) * 0.03) }));
const rails = [-1, 1].flatMap((side) => [
  { geometry: box(3.4, 0.1, 0.08), position: [0, 1.36, side * 0.92] as ProceduralVec3, color: wood(0.9) },
  { geometry: box(3.4, 0.1, 0.08), position: [0, 1.78, side * 0.92] as ProceduralVec3, color: wood(0.95) },
  ...Array.from({ length: 8 }, (_, i) => ({ geometry: box(0.08, 0.62, 0.08), position: [-1.5 + i * (3 / 7), 1.55, side * 0.92] as ProceduralVec3, color: wood(0.88) }))
]);
const endBoards = [-1, 1].flatMap((end) => [0.22, 0.4].map((dy, k) => ({ geometry: box(0.07, 0.15, 1.82), position: [end * 1.7, 1.32 + dy * 1.2 + k * 0.02, 0] as ProceduralVec3, color: wood(0.82) })));
const frame = [-0.55, 0.55].map((z) => ({ geometry: box(3.8, 0.13, 0.12), position: [0.1, 1.08, z] as ProceduralVec3, color: wood(0.7) }));
const shafts = [-0.62, 0.62].map((z) => ({ geometry: rod([0.4, 1.02, z], [4.6, 0.82, z * 0.78], 0.06, 0.042, 40), color: wood(0.78) }));
const yokeBar = { geometry: rod([3.7, 0.86, -0.5], [3.7, 0.86, 0.5], 0.04), color: wood(0.7) };
const seat = [{ geometry: box(0.5, 0.07, 1.5), position: [1.1, 1.95, 0] as ProceduralVec3, color: wood(1) }, { geometry: box(0.08, 0.45, 1.5), position: [0.88, 2.12, 0] as ProceduralVec3, color: wood(0.9) },
  { geometry: box(0.09, 0.6, 0.09), position: [1.1, 1.62, -0.7] as ProceduralVec3, color: wood(0.8) }, { geometry: box(0.09, 0.6, 0.09), position: [1.1, 1.62, 0.7] as ProceduralVec3, color: wood(0.8) }];
const axle = { geometry: rod([0, 0.86, -1.4], [0, 0.86, 1.4], 0.07), color: iron };
const cartWood = composeGeometry([...planks, ...rails, ...endBoards, ...frame, ...shafts, yokeBar, ...seat, axle]);

// Cargo: barrels with iron hoops, hay-stuffed sacks (seeded noise blobs).
const barrel = (() => {
  const body = path2d().moveTo(0, 0).lineTo(0.32, 0).quadTo(0.5, 0.45, 0.32, 0.9).lineTo(0, 0.9).points({ curveSegments: 14 });
  const hoop = (y: number, r: number) => ({ geometry: latheGeometry({ profile: [[r, 0], [r + 0.025, 0.012], [r + 0.025, 0.05], [r, 0.062]], segments: 40 }), position: [0, y, 0] as ProceduralVec3, color: iron });
  return composeGeometry([{ geometry: latheGeometry({ profile: body, segments: 40, creaseAngle: 0.5 }), color: wood(1.1) }, hoop(0.1, 0.36), hoop(0.38, 0.46), hoop(0.62, 0.45), hoop(0.8, 0.37)]);
})();
const rnd = seededRandom(17);
const sacks = composeGeometry(Array.from({ length: 4 }, (_, i) => {
  const noise = createFbm3D(40 + i, { octaves: 3, frequency: 1.3 });
  const spec = parametricSurface({
    uSegments: 28, vSegments: 20, wrapU: true,
    fn: (u, v) => {
      const th = u * Math.PI * 2, ph = v * Math.PI;
      const d: ProceduralVec3 = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
      const r = 1 + 0.18 * noise(d[0], d[1], d[2]);
      return [d[0] * r * 0.5, d[1] * r * 0.38, d[2] * r * 0.34];
    }
  });
  return { geometry: spec, position: [-0.55 + (i % 2) * 0.1, 1.5 + Math.floor(i / 2) * 0.55, -0.45 + (i % 2) * 0.95] as ProceduralVec3, rotation: [0, rnd() * 0.8, 0] as ProceduralVec3, color: [0.74 - i * 0.03, 0.66 - i * 0.03, 0.46, 1] as ProceduralColor };
}));

// Road with ruts: height from fbm minus two grooves along x; colour from distance to the track, noise-broken at the edges.
const dirt = createFbm2D(5, { octaves: 5, frequency: 0.2 });
const heightAt = (x: number, z: number): number => {
  const rutDepth = [-1.18, 1.18].reduce((acc, rz) => acc + 0.07 * Math.exp(-(((z - rz) / 0.22) ** 2)), 0);
  return dirt(x * 0.5, z * 0.5) * 0.08 + dirt(x * 0.08, z * 0.08) * 0.35 * Math.min(1, Math.abs(z) / 6) - rutDepth;
};
const road = heightfieldGeometry({
  heightAt, size: [70, 50], segments: [200, 140],
  colorAt: (x, z, h) => {
    const edge = Math.abs(z) + dirt(x * 0.3, z * 0.3) * 1.4;
    if (edge < 2.1) return [0.47 + h * 0.2, 0.37 + h * 0.2, 0.26 + h * 0.15, 1];       // packed dirt
    if (edge < 3.2) return [0.34, 0.37, 0.18, 1];                                    // worn verge
    return [0.2 + dirt(x, z) * 0.03, 0.36 + dirt(x, z) * 0.05, 0.14, 1];             // grass
  }
});

// Trees and a fence for depth.
const treeSet = composeGeometry([[-9, -9.5, 1.3], [-14, -6.5, 1.0], [8, -11, 1.4], [14, -8, 1.1]].flatMap(([x, z, s], i) => {
  const noise = createFbm3D(70 + i, { octaves: 3, frequency: 1.1 });
  const blob = (ox: number, oy: number, oz: number, k: number) => ({
    geometry: parametricSurface({ uSegments: 28, vSegments: 20, wrapU: true, fn: (u, v) => {
      const th = u * Math.PI * 2, ph = v * Math.PI;
      const d: ProceduralVec3 = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
      const r = 1 + 0.28 * noise(d[0] + ox, d[1] + oy, d[2] + oz);
      return [d[0] * r, d[1] * r * 0.85, d[2] * r];
    } }),
    position: [x! + ox * s!, 4.6 * s! + oy * s!, z! + oz * s!] as ProceduralVec3, scale: 1.6 * s! * k, color: [0.14 + k * 0.03, 0.34 + k * 0.04, 0.12, 1] as ProceduralColor
  });
  return [
    { geometry: sweepGeometry({ path: catmullRomCurve([[0, 0, 0], [0.15, 2, 0.1], [-0.1, 3.8, 0.05], [0.05, 5, 0]]), steps: 24, radius: (t) => 0.42 * (1 - t * 0.65), radialSegments: 10 }), position: [x!, -0.1, z!] as ProceduralVec3, scale: s!, color: wood(0.62) },
    blob(0, 0, 0, 1), blob(1.0, -0.4, 0.5, 0.75), blob(-0.9, -0.3, -0.4, 0.8), blob(0.2, 0.9, -0.6, 0.65)
  ];
}));
const fence = composeGeometry([
  ...Array.from({ length: 18 }, (_, i) => ({ geometry: rod([0, 0, 0], [0, 1.15, 0], 0.07, 0.06, 4), position: [-17 + i * 2, 0, -5.4] as ProceduralVec3, color: wood(0.7) })),
  ...[0.45, 0.85].map((y) => ({ geometry: box(34, 0.09, 0.05), position: [0, y, -5.4] as ProceduralVec3, color: wood(0.78) }))
]);

const white = (rough: number, metallic = 0) => material.pbr({ color: "#ffffff", roughness: rough, metallic });
const app = createAuraApp("#app", {
  scene: scene({ background: "#bcd6ee" })
    .add(sky.preetham({ sun: { elevationDeg: 24, azimuthDeg: 140, intensity: 1 } }))
    .add(lights.hemisphere({ skyColor: "#d6e6ff", groundColor: "#5a5a3a", intensity: 0.55 }))
    .add(lights.directional({ name: "sun", position: [14, 16, 12], target: [0, 1, 0], intensity: 3.0, color: "#fff0d4", shadow: true }))
    .add(geometry.custom(road, { name: "road", material: white(0.97) }))
    .add(geometry.custom(cartWood, { name: "cart", material: white(0.82) }))
    .add(geometry.custom(wheel, { name: "wheel-front-near", material: white(0.6, 0.15) }).position(0, 0.86, 1.2).rotate(Math.PI / 2, 0, 0))
    .add(geometry.custom(wheel, { name: "wheel-front-far", material: white(0.6, 0.15) }).position(0, 0.86, -1.2).rotate(Math.PI / 2, 0, 0))
    .add(geometry.custom(barrel, { name: "barrel-a", material: white(0.7, 0.1) }).position(1.0, 1.23, 0.4))
    .add(geometry.custom(barrel, { name: "barrel-b", material: white(0.7, 0.1) }).position(-1.2, 1.23, 0.1).rotate(0, 0.9, 0))
    .add(geometry.custom(sacks, { name: "sacks", material: white(0.95) }))
    .add(geometry.custom(treeSet, { name: "trees", material: white(0.92) }))
    .add(geometry.custom(fence, { name: "fence", material: white(0.9) }))
    .add(effects.fog({ color: "#c9dcee", density: 0.006 }))
    .camera(camera.perspective({ position: [-7.5, 3.6, 8.4], target: [0.8, 1.35, 0], fov: 38, near: 0.3, far: 400 }))
});
void app.ready();
