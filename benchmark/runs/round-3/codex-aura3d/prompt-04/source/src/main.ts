import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  prefabs,
  primitives,
  scene,
  timeline
} from "@aura3d/engine";

document.documentElement.style.margin = "0";
document.documentElement.style.width = "100%";
document.documentElement.style.height = "100%";
document.body.style.margin = "0";
document.body.style.width = "100%";
document.body.style.height = "100%";
document.body.style.overflow = "hidden";
document.body.style.background = "#01020a";

const appRoot = document.querySelector<HTMLElement>("#app");
if (appRoot) {
  appRoot.style.width = "100vw";
  appRoot.style.height = "100vh";
}

const tubeNodes = [];
const palette = ["#20e7ff", "#ff3bd5", "#ffe86b", "#7c5cff"];
const ringCount = 24;
const segmentCount = 14;

for (let ring = 0; ring < ringCount; ring += 1) {
  const z = 1.15 - ring * 0.38;
  const radius = 1.14 + ring * 0.012;
  const color = palette[ring % palette.length];

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const angle = (segment / segmentCount) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = 0.42 + Math.sin(angle) * radius;
    const isLit = segment % 3 !== 1;
    const stripLength = (Math.PI * 2 * radius) / segmentCount * 0.62;

    tubeNodes.push(
      primitives
        .box({
          name: isLit
            ? `emissive curved tunnel rib ${ring + 1}-${segment + 1}`
            : `dark tube wall rib ${ring + 1}-${segment + 1}`,
          material: isLit
            ? material.emissive({
                color,
                emissive: color,
                roughness: 0.12
              })
            : material.pbr({
                color: "#07101b",
                roughness: 0.68,
                metallic: 0.2
              })
        })
        .position(x, y, z)
        .rotate(0, 0, angle + Math.PI / 2)
        .scale([stripLength, isLit ? 0.035 : 0.022, 0.048])
        .animate(isLit ? { clip: "pulse", speed: 0.42 + ring * 0.01 } : {})
        .toJSON()
    );
  }
}

for (let lane = 0; lane < 8; lane += 1) {
  const angle = (lane / 8) * Math.PI * 2 + Math.PI / 8;
  const x = Math.cos(angle) * 1.23;
  const y = 0.42 + Math.sin(angle) * 1.23;

  tubeNodes.push(
    primitives
      .box({
        name: `longitudinal tunnel wall guide ${lane + 1}`,
        material: material.pbr({
          color: lane % 2 === 0 ? "#0a1b2a" : "#120b20",
          roughness: 0.74,
          metallic: 0.18
        })
      })
      .position(x, y, -3.25)
      .rotate(0, 0, angle + Math.PI / 2)
      .scale([0.045, 0.035, 8.9])
      .toJSON()
  );
}

for (let veil = 0; veil < 4; veil += 1) {
  tubeNodes.push(
    primitives
      .sphere({
        name: `blue fog depth volume ${veil + 1}`,
        material: material.glass({
          color: "#5d76b8",
          roughness: 0.9,
          opacity: 0.035 + veil * 0.012,
          transmission: 0.18
        })
      })
      .position(0, 0.42, -1.7 - veil * 1.35)
      .scale([1.15 + veil * 0.18, 0.72 + veil * 0.12, 0.2])
      .toJSON()
  );
}

const tunnelScene = scene()
  .background("#01020a")
  .addMany(prefabs.neonTunnel({ rings: 20 }))
  .addMany(tubeNodes)
  .add(
    primitives
      .sphere({
        name: "far vanishing glow core",
        material: material.emissive({
          color: "#78f7ff",
          emissive: "#78f7ff"
        })
      })
      .position(0, 0.42, -7.95)
      .scale([0.18, 0.18, 0.18])
      .animate({ clip: "pulse", speed: 0.34 })
  )
  .add(lights.ambient({ intensity: 0.08, color: "#9fb7ff" }))
  .add(
    lights.point({
      name: "cyan tunnel bounce",
      position: [-0.85, 0.95, 0.75],
      color: "#21dfff",
      intensity: 1.45
    })
  )
  .add(
    lights.point({
      name: "magenta tunnel bounce",
      position: [0.95, -0.15, -1.15],
      color: "#ff3bd5",
      intensity: 1.15
    })
  )
  .add(effects.fog({ density: 0.27, color: "#26375f" }))
  .add(effects.bloom({ intensity: 0.9, color: "#43e8ff" }))
  .camera(
    camera.dolly({
      from: [0.04, 0.42, 2.28],
      to: [0.0, 0.42, -3.72],
      target: [0, 0.42, -8.2],
      seconds: 7.5,
      fov: 63
    })
  )
  .timeline(timeline.loop({ seconds: 7.5 }));

createAuraApp("#app", {
  scene: tunnelScene,
  diagnostics: false,
  pixelRatio: Math.min(window.devicePixelRatio, 2)
});
