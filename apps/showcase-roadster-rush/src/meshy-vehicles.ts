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

/**
 * Far level of detail of the traffic set (tools/make-far-lod.mjs: about a tenth of the triangles, 256 px textures). The
 * renderer draws traffic beyond 90 m with these, so drawing every simulated vehicle does not multiply the triangle count.
 */
export const meshyFarVehicles = defineModelAssets(
  {
    sedan: { url: new URL("./assets/meshy/lod/sedan.far.glb", import.meta.url).pathname, sha256: "22e9e9e8dbe0332431d276ac91d1e8259a2089cc861c0e57a994e87ec3cbbfa9", sizeBytes: 126184 },
    hatch: { url: new URL("./assets/meshy/lod/hatch.far.glb", import.meta.url).pathname, sha256: "6a88a45cd6a0719fb4919b04d11f4f0b0653bb510ab4436c497391c6d40c3ead", sizeBytes: 108460 },
    suv: { url: new URL("./assets/meshy/lod/suv.far.glb", import.meta.url).pathname, sha256: "5ee64aec8fe165b1cce09ec7e160d393897183a10c832ad30369dd16540653aa", sizeBytes: 83548 },
    taxi: { url: new URL("./assets/meshy/lod/taxi.far.glb", import.meta.url).pathname, sha256: "3aa3257c047f9fc0f79005b2168f51f2eb077128d8c335d2704031cadb4ca905", sizeBytes: 90492 },
    van: { url: new URL("./assets/meshy/lod/van.far.glb", import.meta.url).pathname, sha256: "3c5adfc6e8e3346ec251846c2a076ab2dea1ae1175e1cd1cdcc2f31dce8053e2", sizeBytes: 107212 },
    pickup: { url: new URL("./assets/meshy/lod/pickup.far.glb", import.meta.url).pathname, sha256: "3320f54780c7555e564b075f95d58a37212fce13b5fb20219f7976ebacd95a07", sizeBytes: 97888 },
    boxtruck: { url: new URL("./assets/meshy/lod/boxtruck.far.glb", import.meta.url).pathname, sha256: "bc29654f2aa44539e50196288425f100967bf47a1a270f65873eca0a5ac3af38", sizeBytes: 132712 },
    bus: { url: new URL("./assets/meshy/lod/bus.far.glb", import.meta.url).pathname, sha256: "e56652ce2d53150d9eef3b02c10cf8b40bb9a9c5049e6198a956d48c1d097860", sizeBytes: 114480 },
    carrier: { url: new URL("./assets/meshy/lod/carrier.far.glb", import.meta.url).pathname, sha256: "31ce1ebec280dda8c32d8717586ce64b2c7f37ac13994504a3ed946b4f131cda", sizeBytes: 90108 }
  },
  { license: "Meshy generated asset (AuraOne account plan terms at generation time), own text prompts, 2026-10-23; simplified far LOD 2026-10-29" }
);
