import { camera, createAuraApp, defineModelAssets, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __EVAL__?: { clip: () => string };
  }
}

const assets = defineModelAssets(
  { soldier: { url: "/assets/soldier.glb", sha256: "dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b", animations: ["Idle", "Run", "TPose", "Walk"], license: "fixture" } },
  { queryParam: null }
);

const app = createAuraApp("#app", {
  scene: scene({ background: "#2a2e36" })
    .add(lights.hemisphere({ skyColor: "#cfd8ea", groundColor: "#4a4640", intensity: 0.9 }))
    .add(lights.directional({ position: [3, 6, 4], target: [0, 0.9, 0], intensity: 2.4, shadow: true }))
    .camera(camera.perspective({ position: [0, 1.25, 4.6], target: [0, 0.9, 0], fov: 40 }))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: "#7b7f86", roughness: 0.9 }), castShadow: false }).scale([12, 1, 12]))
    .add(assets.node("soldier", { name: "soldier-model", targetHeight: 1.8 }).animate({ clip: "Idle", loop: true }).runtime({ id: "soldier" }))
});

let current = "Idle";
window.__EVAL__ = { clip: () => current };

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR" && current !== "Run") {
    current = "Run";
    app.nodes.require("soldier").play("Run", { loop: true, crossFade: 0.4 });
  } else if (event.code === "KeyI" && current !== "Idle") {
    current = "Idle";
    app.nodes.require("soldier").play("Idle", { loop: true, crossFade: 0.4 });
  }
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
