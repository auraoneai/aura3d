import { camera, createAuraApp, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";
import { createFbm3D, parametricSurface } from "@aura3d/engine/procedural";

// (u, v) -> point surfaces. Normals come from central differences, so any smooth function shades correctly,
// poles included. Seeded 3D noise displaces a unit sphere into rocks; the same seed always gives the same rock.
const sphereDir = (u: number, v: number) => {
  const th = u * Math.PI * 2, ph = v * Math.PI;
  return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)] as const;
};
const rock = (seed: number, rough: number, squash: number) => {
  const noise = createFbm3D(seed, { octaves: 4, frequency: 1.4, ridged: false });
  return parametricSurface({
    uSegments: 72, vSegments: 48, wrapU: true,
    fn: (u, v) => {
      const d = sphereDir(u, v);
      const r = 1 + rough * noise(d[0], d[1], d[2]);
      return [d[0] * r, d[1] * r * squash, d[2] * r];
    }
  });
};

const torus = parametricSurface({
  uSegments: 96, vSegments: 32, wrapU: true, wrapV: true,
  fn: (u, v) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const r = 0.35 + 0.1 * Math.sin(a * 6); // lobed tube
    return [(1.3 + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (1.3 + r * Math.cos(b)) * Math.sin(a)];
  }
});

const shell = parametricSurface({
  uSegments: 160, vSegments: 40, wrapV: true,
  fn: (u, v) => { // logarithmic spiral shell: a tube whose radius grows exponentially along a rising spiral (about 2.4 units across)
    const a = u * Math.PI * 4.5, b = v * Math.PI * 2, centre = 0.1 * Math.exp(0.15 * a), tube = centre * 0.42;
    const cy = 0.045 * a;
    return [centre * Math.cos(a) + tube * Math.cos(b) * Math.cos(a), cy + tube * Math.sin(b), centre * Math.sin(a) + tube * Math.cos(b) * Math.sin(a)];
  }
});

const stone = (color: string) => material.pbr({ color, roughness: 0.92 });
const app = createAuraApp("#app", {
  scene: scene({ background: "#16191f" })
    .add(environments.neutral({ intensity: 0.75, background: false }))
    .add(lights.directional({ name: "key", position: [5, 8, 6], target: [0, 1, 0], intensity: 2.6, color: "#ffeed8", shadow: true }))
    .add(lights.directional({ name: "rim", position: [-6, 4, -5], target: [0, 1, 0], intensity: 1.5, color: "#7fb4ff" }))
    .add(primitives.plane({ name: "floor", size: [30, 1, 14], material: material.pbr({ color: "#262932", roughness: 0.9 }) }))
    .add(geometry.custom(rock(3, 0.28, 0.8), { name: "rock-a", material: stone("#8a8579") }).position(-5.4, 0.95, 0).scale(1.1))
    .add(geometry.custom(rock(4, 0.35, 1.2), { name: "rock-b", material: stone("#6e7480") }).position(-2.6, 1.15, 0.4))
    .add(geometry.custom(torus, { name: "lobed-torus", material: material.pbr({ color: "#d85f8a", metallic: 0.3, roughness: 0.25 }) }).position(0.6, 1.7, 0).rotate(1.1, 0.3, 0))
    .add(geometry.custom(shell, { name: "shell", material: material.pbr({ color: "#f1dcc5", metallic: 0.1, roughness: 0.28 }) }).position(3.2, 0.5, 0.2))
    .add(geometry.custom(rock(8, 0.22, 1), { name: "rock-c", material: stone("#9a8b73") }).position(5.8, 0.9, -0.2))
    .camera(camera.perspective({ position: [0.4, 3.4, 11.5], target: [0.2, 1.2, 0], fov: 38 }))
});
void app.ready();
