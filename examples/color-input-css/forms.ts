// One cube per CSS colour form, all the same orange-red family, plus an hsl() sky gradient and rgb() fog.
// Every cube must render its colour; none may fall back to near-black.
import { camera, createAuraApp, effects, lights, material, primitives, scene, sky } from "@aura3d/engine";

const forms: readonly string[] = [
  "#e63",
  "#e638",
  "#ee6633",
  "#ee6633cc",
  "rgb(238, 102, 51)",
  "rgb(238 102 51 / 90%)",
  "rgb(93% 40% 20%)",
  "hsl(16, 85%, 57%)",
  "hsla(16deg 85% 57% / 0.9)",
  "tomato",
  "0xee6633"
];

let stage = scene({ background: "hsl(220, 45%, 12%)" })
  .add(sky.gradient({ zenith: "hsl(220, 60%, 22%)", horizon: "lightsteelblue", ground: "rgb(40 36 48)" }))
  .add(effects.fog({ color: "rgb(150, 170, 200)", density: 0.02, affectsBackground: false }))
  .add(lights.hemisphere({ skyColor: "aliceblue", groundColor: "hsl(250, 20%, 22%)", intensity: 0.7 }))
  .add(lights.directional({ position: [4, 8, 6], target: [0, 0, 0], intensity: 2.4, color: "rgb(255 244 230)" }));

forms.forEach((form, index) => {
  const color = form.startsWith("0x") ? Number(form) : form;
  const x = (index - (forms.length - 1) / 2) * 1.1;
  stage = stage.add(primitives.box({ name: `form-${index}`, size: [0.9, 0.9, 0.9], material: material.pbr({ color: color as string, roughness: 0.5 }) }).position(x, 0, 0));
});
stage = stage
  .add(primitives.box({ name: "glass", size: [1.4, 1.4, 1.4], material: material.glass({ color: "honeydew" }) }).position(-2.5, 0, -2.5))
  .add(primitives.sphere({ name: "emissive", material: material.emissive({ color: "gold", emissive: "hsl(45, 100%, 50%)" }) }).position(2.5, 0.2, -2.5))
  .camera(camera.perspective({ position: [0, 3.2, 9.5], target: [0, 0, -0.6], fov: 50 }));

const app = createAuraApp("#app", { scene: stage, resize: false });
void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => { (window as { __TASK_READY__?: boolean }).__TASK_READY__ = true; }));
});
