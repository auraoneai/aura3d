import { defineModelAssets } from "@aura3d/engine";

/**
 * Meshy-generated vehicles (own text prompts, generated 2026-10-23, admitted in an isolated project). The GLBs are baked to the
 * Apex convention (long axis along z, front toward -z, wheels on y = 0) by tools/apex/bake-vehicle.mjs; `model(..., { scaleMode: "fit" })`
 * sizes them to the vehicle length. `?models=0` falls back to the original showcase models.
 */
export const meshyVehicles = defineModelAssets(
  {
    hero: { url: new URL("./assets/meshy/hero.glb", import.meta.url).pathname, sha256: "d86f2746079c5d6ea11cb8e0e0041ccdb166357cd31c011b99718076b79dec8d", sizeBytes: 2645584 },
    sedan: { url: new URL("./assets/meshy/sedan.glb", import.meta.url).pathname, sha256: "6e96dc59ee771164e29f57e030f94b1461194143f5b9c73bef0ff131a430fd62", sizeBytes: 2359704 },
    suv: { url: new URL("./assets/meshy/suv.glb", import.meta.url).pathname, sha256: "99855b844f5fc73a05c45fa42527f16ad07db8ca3eaa92eb893875dbe239cc5d", sizeBytes: 1008688 },
    hatch: { url: new URL("./assets/meshy/hatch.glb", import.meta.url).pathname, sha256: "0d6ed5307d216019f633f006f6e6fff339de985399d49c773297639deb6cffa0", sizeBytes: 1558908 },
    taxi: { url: new URL("./assets/meshy/taxi.glb", import.meta.url).pathname, sha256: "d0e95e1c4ac4dfb0d1dc67dfcca03ce3176f7a2130883045fa1c41fa35d90260", sizeBytes: 1090496 },
    van: { url: new URL("./assets/meshy/van.glb", import.meta.url).pathname, sha256: "05aeb65e187acbed37604348a59bf89583bdfe0815fcc2368a486612745631dc", sizeBytes: 1155420 },
    pickup: { url: new URL("./assets/meshy/pickup.glb", import.meta.url).pathname, sha256: "c33b3af72c515e1be133376d47180ffc4dec5a4443769bbc2d1f75f0cf368be7", sizeBytes: 1160380 },
    bus: { url: new URL("./assets/meshy/bus.glb", import.meta.url).pathname, sha256: "653f6cae47df0d0b3ca1a60137b0850c79c8a12af32a929733043ae7d5bca0e0", sizeBytes: 1846224 },
    boxtruck: { url: new URL("./assets/meshy/boxtruck.glb", import.meta.url).pathname, sha256: "2be8a5e2f9abb3efe5ada516509502b6f7daad292b5c315eb99c4e53c5b62ee4", sizeBytes: 2571884 },
    carrier: { url: new URL("./assets/meshy/carrier.glb", import.meta.url).pathname, sha256: "f664565ab13cc8f397b2b26355aa2229bb9423e67d91ee205eeec1283e1019c0", sizeBytes: 1266708 }
  },
  { license: "Meshy generated asset (AuraOne account plan terms at generation time), own text prompts, 2026-10-23" }
);
