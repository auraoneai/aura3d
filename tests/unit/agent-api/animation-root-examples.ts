// Compiled examples for docs/api/animation-root.md. Typechecked by `pnpm typecheck`
// (tests/unit/**), so a rename in the root API breaks the docs here rather than in a reader's
// editor. tests/unit/agent-api/animation-root-examples.test.ts keeps each region below in
// sync with the markdown.
import { camera, createAuraApp, defineModelAssets, lights, model, primitives, scene } from "../../../packages/engine/src/agent-api/index";
import type { AuraActorAnimationApi, AuraApp, AuraRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/index";

type Actor = AuraRuntimeNodeHandle & { readonly animation: AuraActorAnimationApi };

declare const canvas: HTMLCanvasElement;
declare const soldierSha256: string;
declare const robotSha256: string;

const assets = defineModelAssets({
  soldier: { url: "/models/soldier.glb", sha256: soldierSha256, animations: ["Idle", "Run", "Walk"] },
  robot: { url: "/models/robot.glb", sha256: robotSha256, animations: ["Idle"] }
}).refs;

async function mount(): Promise<AuraApp> {
  const app = createAuraApp(canvas, {
    scene: scene()
      .camera(camera.perspective({ position: [0, 1.4, 5], target: [0, 1, 0] }))
      .add(lights.studio())
      .add(model(assets.soldier, { name: "hero", targetHeight: 1.8 }).runtime({ id: "hero" }))
      .add(model(assets.robot, { name: "bot", targetHeight: 1.8 }).runtime({ id: "bot" }))
      .add(primitives.sphere({ name: "reach target", size: 0.1 }).runtime({ id: "reach" }))
  });
  await app.ready();
  return app;
}

// region layers
export async function layers(): Promise<void> {
  const app = await mount();
  const hero = app.nodes.require("hero") as Actor;
  hero.play("Idle", { loop: true });
  // Run drives only the upper body; the legs keep playing Idle underneath.
  hero.animation.playLayer("upper", "Run", { weight: 1, mask: { humanoid: "upper-body" } });
  // Later: fade the layer out over a quarter second.
  hero.animation.stopLayer("upper", 0.25);
}
// endregion

// region root-motion
export async function rootMotion(): Promise<void> {
  const app = await mount();
  const hero = app.nodes.require("hero") as Actor;
  // "apply" moves the node by the clip's authored travel and pins the hips; "extract-only"
  // leaves the node where it is and only reports the travel.
  hero.play("Run", { loop: true, rootMotion: { mode: "apply", bone: "mixamorig:Hips", axes: ["x", "z"] } });
}
// endregion

// region retargeting
export async function retargeting(): Promise<readonly string[]> {
  const app = await mount();
  const hero = app.nodes.require("hero") as Actor;
  const bot = app.nodes.require("bot") as Actor;
  await app.ready();
  hero.play("Idle", { loop: true });
  bot.play("Idle", { loop: true });
  // Bake the hero's clips onto the bot's skeleton (bone names are inferred for both rigs).
  const baked = await bot.animation.addClipsFrom(hero);
  bot.play("Run", { loop: true });
  return baked;
}
// endregion

// region two-bone-ik
export async function twoBoneIk(): Promise<() => void> {
  const app = await mount();
  const hero = app.nodes.require("hero") as Actor;
  hero.play("Idle", { loop: true });
  app.nodes.require("reach").setPosition(0.3, 1.5, 0.6);
  // The right hand follows the "reach" node until the returned disposer runs.
  return hero.animation.ik.add({
    kind: "two-bone",
    root: "mixamorig:RightArm",
    mid: "mixamorig:RightForeArm",
    tip: "mixamorig:RightHand",
    target: "reach",
    pole: "auto"
  });
}
// endregion
