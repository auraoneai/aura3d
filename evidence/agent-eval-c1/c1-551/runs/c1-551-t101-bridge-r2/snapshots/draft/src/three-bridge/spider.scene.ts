// Native Aura3D source for the bridged "spider" asset (edit freely; regeneration keeps this file).
import { camera, createAuraApp, looks, material, primitives, scene, type AuraSceneBuilder } from "@aura3d/engine";
import { spiderModel } from "./spider.bridge";

export function createSpiderScene(): AuraSceneBuilder {
  return scene()
    .add(looks.preset("product-studio", { exposureEv: -0.8 }))
    .add(
      primitives.plane({
        name: "floor",
        size: [14, 1, 14],
        material: material.pbr({ color: "#cfd2d8", roughness: 0.9 }),
        receiveShadow: true
      })
    )
    .add(spiderModel().runtime({ id: "spider" }).animate({ clip: "spider_walk", loop: true }))
    .camera(camera.perspective({ position: [3.7, 2.9, 4.6], target: [0, 0.55, 0], fov: 38 }));
}

export function mountSpider(selector = "#app") {
  return createAuraApp(selector, { scene: createSpiderScene(), ...looks.appOptions("product-studio") });
}
