import {
  bindOrbitPointer,
  camera,
  createAuraApp,
  createOrbitRig,
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

const canvas = document.getElementById("app") as HTMLCanvasElement;

const cube = primitives
  .box({
    name: "pbr cube",
    material: material.pbr({ color: "#c8a46a", metallic: 0.9, roughness: 0.38 })
  })
  .scale([1.4, 1.4, 1.4])
  .position(0, 0, 0)
  .animate({ clip: "turntable", speed: 1.2 });

const world = scene({ background: "#2b2b2b" })
  .add(cube)
  .add(environments.studio({ intensity: 1.0 }))
  .add(lights.ambient({ intensity: 0.25 }))
  .add(lights.directional({ name: "key", position: [4, 5, 4], target: [0, 0, 0], intensity: 2.6 }))
  .add(lights.directional({ name: "fill", position: [-4, 2, 3], target: [0, 0, 0], intensity: 0.9, color: "#9db8ff" }))
  .add(lights.directional({ name: "rim", position: [-2, 3, -5], target: [0, 0, 0], intensity: 1.2 }))
  .camera(camera.orbit({ distance: 5.5, target: [0, 0, 0], fov: 40 }));

const app = createAuraApp(canvas, {
  scene: world,
  pixelRatio: 1,
  resize: false
});

// Pointer-drag orbit rig around the cube; the cube keeps spinning independently.
const rig = createOrbitRig({
  target: [0, 0, 0],
  distance: 5.5,
  yaw: 35,
  pitch: 22,
  pitchLimits: [-80, 80],
  fov: 40,
  halflife: 0.06
});
app.camera?.use(rig);
bindOrbitPointer(canvas, rig);
canvas.style.touchAction = "none";
canvas.style.cursor = "grab";

let readyFlagged = false;
app.onFrame(() => {
  if (!readyFlagged) {
    readyFlagged = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});
