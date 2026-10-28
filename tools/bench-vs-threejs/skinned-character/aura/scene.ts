import { camera, createAuraApp, defineModelAssets, lights, material, model, primitives, scene } from "@aura3d/engine";
import type { SceneHandle } from "../../shared/glue";
import { SHA256 } from "./assets.generated";

const RADIUS = 6, RUN_SPEED = 3.2;

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const assets = defineModelAssets({ soldier: { url: "/model.glb", sha256: SHA256.soldier, animations: ["Idle", "Run"] } }, { license: "three.js examples, Soldier.glb" });
  const app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    output: { toneMapping: "aces" },
    scene: scene()
      .background("#9db4c8")
      .camera(camera.perspective({ fov: 50, near: 0.1, far: 100, position: [0, 3, -6], target: [0, 1.2, 0] }))
      .add(lights.hemisphere({ skyColor: "#dce8f2", groundColor: "#4d6358", intensity: 1.3 }))
      .add(lights.directional({ color: "#fff4e0", intensity: 2.2, position: [6, 12, 4], shadow: true }))
      .add(primitives.plane({ name: "ground", size: [60, 1, 60], material: material.pbr({ color: "#6f8a5a", roughness: 1 }) }))
      .add(model(assets.refs.soldier, { name: "hero", targetHeight: 1.8, castShadow: true }).runtime({ id: "hero" }))
  });
  await app.ready();
  const hero = app.nodes.require("hero");
  hero.play("Idle", { loop: true });

  let time = 0, angle = 0, running = false;
  let eye: [number, number, number] = [0, 3, -6];
  return {
    frame(dt) {
      time += dt;
      const wantRun = Math.floor(time / 3) % 2 === 1;
      if (wantRun !== running) {
        running = wantRun;
        hero.play(running ? "Run" : "Idle", { loop: true, crossFade: 0.25 });
      }
      if (running) angle += (RUN_SPEED / RADIUS) * dt;
      const x = Math.cos(angle) * RADIUS, z = Math.sin(angle) * RADIUS;
      hero.setPosition(x, 0, z).setRotation(0, -angle, 0);

      const k = 1 - Math.exp(-4 * dt);
      const goal = [Math.sin(-angle) * -5 + x, 3, Math.cos(-angle) * -5 + z];
      eye = [eye[0] + (goal[0]! - eye[0]) * k, eye[1] + (goal[1]! - eye[1]) * k, eye[2] + (goal[2]! - eye[2]) * k];
      app.camera?.setPose({ position: eye, target: [x, 1.2, z], fov: 50 });
      app.step(dt);
    },
    state: () => ({ running, angle: Number(angle.toFixed(4)), clips: hero.importedAssetEvidence()?.clips ?? [] })
  };
}
