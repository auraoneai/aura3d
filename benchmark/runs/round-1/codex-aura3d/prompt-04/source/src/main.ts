import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  primitives,
  scene,
  timeline
} from "@aura3d/engine";

document.documentElement.style.margin = "0";
document.documentElement.style.height = "100%";
document.body.style.margin = "0";
document.body.style.height = "100%";
document.body.style.overflow = "hidden";

const appRoot = document.querySelector<HTMLElement>("#app");
if (appRoot) {
  appRoot.style.width = "100vw";
  appRoot.style.height = "100vh";
  appRoot.style.background = "#02030a";
}

const tunnelRadius = 2.25;
const ringCount = 34;
const sides = 12;
const segmentLength = 0.78;
const startZ = 4.6;
const panelArcWidth = 1.18;

const tunnelScene = scene()
  .background("#02030a")
  .camera(
    camera.dolly({
      from: [0.05, 0.02, 5.4],
      to: [0.22, -0.08, -11.6],
      target: [0.08, 0.0, -18.0],
      seconds: 9,
      fov: 68
    })
  )
  .timeline(timeline.loop({ seconds: 9 }));

for (let ring = 0; ring < ringCount; ring += 1) {
  const z = startZ - ring * segmentLength;
  const depthFade = 1 - ring / ringCount;

  for (let side = 0; side < sides; side += 1) {
    const angle = (side / sides) * Math.PI * 2;
    const x = Math.cos(angle) * tunnelRadius;
    const y = Math.sin(angle) * tunnelRadius;
    const isTrackLine = side % 3 === 0;
    const isGlowBand = (ring + side) % 7 === 0;

    tunnelScene.add(
      primitives
        .box({
          name: `faceted dark tube panel ${ring}-${side}`,
          material: material.emissive({
            color: isTrackLine ? "#102548" : "#081226",
            emissive: isTrackLine ? "#0a1b3a" : "#050c1a",
            roughness: 0.62,
            metallic: 0.18
          })
        })
        .position(x, y, z)
        .rotate(0, 0, angle - Math.PI / 2)
        .scale([panelArcWidth, 0.028, segmentLength * 1.03])
    );

    if (isGlowBand) {
      const hueColor =
        side % 4 === 0 ? "#45f6ff" : side % 4 === 1 ? "#ff3df2" : side % 4 === 2 ? "#fff34a" : "#7cff6b";

      tunnelScene.add(
        primitives
          .box({
            name: `emissive tunnel segment ${ring}-${side}`,
            material: material.emissive({
              color: hueColor,
              emissive: hueColor,
              roughness: 0.18,
              metallic: 0.08
            })
          })
          .position(x * 0.985, y * 0.985, z + segmentLength * 0.33)
          .rotate(0, 0, angle - Math.PI / 2)
          .scale([panelArcWidth * 0.86, 0.032, 0.06])
      );
    }
  }

  if (ring % 4 === 0) {
    const pulseColor = ring % 8 === 0 ? "#35e7ff" : "#ff3bd6";

    tunnelScene
      .add(
        primitives
          .box({
            name: `left vanishing rail ${ring}`,
            material: material.emissive({
              color: pulseColor,
              emissive: pulseColor,
              roughness: 0.2,
              metallic: 0.08
            })
          })
          .position(-1.6, -1.55, z)
          .rotate(0, 0, -0.77)
          .scale([0.95, 0.035, 0.08])
      )
      .add(
        primitives
          .box({
            name: `right vanishing rail ${ring}`,
            material: material.emissive({
              color: "#8f5cff",
              emissive: "#8f5cff",
              roughness: 0.22,
              metallic: 0.05
            })
          })
          .position(1.62, 1.48, z - 0.08)
          .rotate(0, 0, 2.36)
          .scale([0.82, 0.035, 0.08])
      )
      .add(
        primitives
          .sphere({
            name: `distant haze light ${ring}`,
            material: material.emissive({
              color: pulseColor,
              emissive: pulseColor,
              roughness: 0.1
            })
          })
          .position(0, 0, z - 0.25)
          .scale(Math.max(0.035, depthFade * 0.1))
      );
  }
}

tunnelScene
  .add(lights.ambient({ intensity: 0.04, color: "#7188ff" }))
  .add(lights.point({ name: "near cyan bloom source", position: [-1.9, 1.6, 2.8], color: "#41f7ff", intensity: 2.6 }))
  .add(lights.point({ name: "near magenta bloom source", position: [1.8, -1.5, 2.0], color: "#ff42e8", intensity: 2.35 }))
  .add(lights.point({ name: "deep tunnel glow", position: [0.2, 0.0, -9.8], color: "#72f7ff", intensity: 3.2 }))
  .add(effects.fog({ density: 0.16, color: "#091229" }))
  .add(effects.bloom({ intensity: 0.68, color: "#8af8ff" }));

createAuraApp("#app", {
  pixelRatio: 1.5,
  scene: tunnelScene
});
