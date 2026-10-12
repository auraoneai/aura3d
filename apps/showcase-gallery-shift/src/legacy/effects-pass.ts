// Visible effects pass (batch C): the default (engine-default flags) look of
// the legacy boot. Public engine builders only, each on a runtime path that
// the default `post` / `vfx` / `lighting` flags enable; flags-off keeps the
// pre-pass moon key and gallery haze (and never pays the CPU volumetric pass).
//
// Look brief (interior, night heist): moonlight through skylights onto
// polished marble, warm guard torches cutting the haze, cyan exit glow.
// Families: shadowed moon key + contact shadows, volumetric skylight haze
// (god rays), light cones from the guard spot, drifting dust, indoor IBL on
// the marble and display glass, grade + vignette.
import { effects, environments, lights } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
});

export const effectsPassOn = flags.on("A3D_QR_POST");
const vfxOn = flags.on("A3D_QR_VFX");

export function galleryEffectsPass(options: { readonly visualReviewCapture: boolean }) {
  const review = options.visualReviewCapture;
  if (!effectsPassOn) {
    return [
      effects.fog({ name: "gallery haze", density: 0.009, color: "#243b59", intensity: 0.18 }),
      lights.directional({ name: "museum moon key", position: [4.8, 8.6, 5.2], color: "#fff2dc", intensity: review ? 0.4 : 1.05 })
    ];
  }
  return [
    // Moon key through the skylights: cascaded shadows from walls, plinths
    // and actors across the marble.
    lights.directional({
      name: "museum moon key",
      position: [4.8, 8.6, 5.2],
      target: [0, 0, 0],
      color: "#f3ecff",
      intensity: review ? 0.6 : 1.7,
      shadow: { cascades: "auto", maxDistance: 40 }
    }),
    effects.contactShadows({ length: 0.3, intensity: 0.9 }),
    environments.preset("indoor", { intensity: 0.45, specularIntensity: 1.25, background: false }),
    // Cool skylight haze: recedes the far wings and carries god rays.
    effects.volumetricFog({
      name: "gallery skylight haze",
      density: 0.016,
      color: "#2b4566",
      intensity: 0.3,
      heightFalloff: 0.18,
      heightReference: 0
    }),
    effects.vignette({ intensity: 0.3, smoothness: 0.6 }),
    ...(vfxOn
      ? [
          // Torch beam of the rotunda guard spot, visible in the haze.
          effects.lightCone({
            name: "rotunda guard torch beam",
            position: [-8.5, 2.6, 4.5],
            direction: [0.72, -0.43, -0.55],
            length: 6,
            coneAngle: 0.42,
            softness: 0.55,
            color: "#ffd58a",
            intensity: 0.55
          }),
          // Skylight shaft over the central hall.
          effects.lightCone({
            name: "central skylight shaft",
            position: [0, 7.2, -0.6],
            direction: [-0.25, -1, -0.2],
            length: 7.5,
            coneAngle: 0.3,
            softness: 0.7,
            color: "#cfe0ff",
            intensity: 0.35
          }),
          // Dust rising through the skylight shaft (fountain plume preset:
          // a wide spawn disc on the hall floor).
          effects.particles({
            name: "gallery skylight dust",
            emitter: "fountain",
            particleCount: 220,
            emissionRate: 45,
            radius: 3,
            height: 2.6,
            size: [0.02, 0.05],
            lifetime: [4, 5.5],
            color: "#dfe8ff",
            materialMode: "soft-alpha",
            seed: 6301
          }).position(0, 0.1, -0.6)
        ]
      : [])
  ];
}
