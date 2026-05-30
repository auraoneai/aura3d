import {
  createAuraApp,
  scene,
  prefabs,
  effects,
  lights,
  camera,
  timeline,
} from "@aura3d/engine";

// Neon Tunnel Flythrough
// ----------------------
// Procedurally generated tube geometry built from emissive ring segments via
// the `prefabs.neonTunnel` helper. The rings march down the -Z axis (centred
// around y ~= 0.4), so we fly a dolly camera straight down the tunnel axis to
// read as a continuous flythrough. Fog gives depth falloff toward the far end
// and bloom makes the emissive segments glow.

const RINGS = 26; // long tube so fog falloff is visible at the far end

const flythrough = scene()
  .background("#03040c")
  // Procedural tube: emissive top/bottom/left/right segments per ring.
  .addMany(prefabs.neonTunnel({ rings: RINGS }))
  // Depth falloff so distant rings dissolve into haze.
  .add(effects.fog({ density: 0.26, color: "#2a1d4a" }))
  // Glow on the neon segments.
  .add(effects.bloom({ intensity: 0.95, color: "#ff42c8" }))
  // Practical lights riding through the tube add volume and colour bleed.
  .add(lights.ambient({ intensity: 0.18, color: "#5b6cff" }))
  .add(lights.point({ position: [0, 0.4, 0.5], color: "#22d3ee", intensity: 2.4 }))
  .add(lights.point({ position: [0, 0.4, -4.5], color: "#ff42c8", intensity: 2.6 }))
  // Camera glides from the tunnel mouth deep into the tube, always aimed down
  // the axis so the receding rings fill the frame.
  .camera(
    camera.dolly({
      from: [0, 0.45, 2.6],
      to: [0, 0.45, -6.2],
      target: [0, 0.45, -16],
      fov: 78,
      seconds: 9,
    }),
  )
  // Loop the flythrough so runtime evidence captures the camera animation.
  .timeline(timeline.loop({ seconds: 9 }));

createAuraApp("#app", {
  scene: flythrough,
  diagnostics: false,
});
