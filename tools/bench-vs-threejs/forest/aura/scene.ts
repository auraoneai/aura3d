import { camera, createAuraApp, createCountedRng, effects, instances, lights, material, primitives, scene } from "@aura3d/engine";
import type { SceneHandle } from "../../shared/glue";

type V3 = [number, number, number];

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const rng = createCountedRng(7);
  const TREES = 8000, ROCKS = 2000;
  const trunks: { position: V3; rotation: V3; scale: number }[] = [];
  const canopies: typeof trunks = [];
  const canopyColors: string[] = [];
  const rocks: typeof trunks = [];
  const rockColors: string[] = [];
  for (let i = 0; i < TREES; i++) {
    const x = (rng.next() - 0.5) * 160, z = (rng.next() - 0.5) * 160, s = 0.7 + rng.next() * 0.9, yaw = rng.next() * Math.PI * 2;
    trunks.push({ position: [x, 0.6 * s, z], rotation: [0, yaw, 0], scale: s });
    canopies.push({ position: [x, 2.1 * s, z], rotation: [0, yaw, 0], scale: s });
    canopyColors.push(`hsl(${Math.round(97 + rng.next() * 29)} 45% ${Math.round(20 + rng.next() * 12)}%)`);
  }
  for (let i = 0; i < ROCKS; i++) {
    const s = 0.3 + rng.next() * 0.8;
    rocks.push({ position: [(rng.next() - 0.5) * 160, 0.25 * s, (rng.next() - 0.5) * 160], rotation: [0, rng.next() * Math.PI * 2, 0], scale: s });
    rockColors.push(`hsl(29 5% ${Math.round(30 + rng.next() * 20)}%)`);
  }

  const app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    output: { toneMapping: "aces" },
    scene: scene()
      .background("#aab8c4")
      .camera(camera.perspective({ fov: 50, near: 0.1, far: 400, position: [0, 9, 34], target: [0, 3, 0] }))
      .add(lights.hemisphere({ skyColor: "#dce8f2", groundColor: "#4d6358", intensity: 1.1 }))
      .add(lights.directional({ color: "#fff4e0", intensity: 2.4, position: [30, 50, 20], shadow: true }))
      .add(effects.fog({ color: "#aab8c4", density: 0.012 }))
      .add(primitives.plane({ name: "ground", size: [400, 1, 400], material: material.pbr({ color: "#566b4a", roughness: 1 }) }))
      .add(instances.cylinder({ name: "trunks", size: [0.36, 1.2, 0.36], transforms: trunks, castShadow: true, material: material.pbr({ color: "#6b4a32", roughness: 0.95 }) }))
      .add(instances.cone({ name: "canopies", size: [1.8, 2.2, 1.8], transforms: canopies, colors: canopyColors, castShadow: true, material: material.pbr({ color: "#ffffff", roughness: 0.85 }) }))
      .add(instances.sphere({ name: "rocks", size: [1, 1, 1], transforms: rocks, colors: rockColors, castShadow: true, material: material.pbr({ color: "#ffffff", roughness: 0.9 }) }))
  });
  await app.ready();

  let t = 0;
  return {
    frame(dt) {
      t += dt;
      app.camera?.setPose({ position: [Math.sin(t * 0.15) * 12, 9, 34], target: [0, 3, 0], fov: 50 });
      app.step(dt);
    }
  };
}
