// Visible effects pass (batch C): the default (engine-default flags) look of
// the legacy boot. Public engine builders only, each on a runtime path that
// the default `post` / `vfx` / `lighting` flags enable; flags-off keeps the
// pre-pass particle haze (and never pays the CPU volumetric-light pass).
//
// Look brief (underwater): teal water column, sun shafts from the surface,
// marine snow drifting through the searchlight, warm wreck practicals as the
// focal accents. Families: shadowed surface key + contact shadows,
// volumetric water in-scatter (god rays) with height falloff, sun-shaft light
// cones, marine snow + vent bubbles, night IBL on the hull, grade + vignette.
import { effects, environments, instances, lights, material, primitives } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
});

export const effectsPassOn = flags.on("A3D_QR_POST");
const vfxOn = flags.on("A3D_QR_VFX");

// Deterministic bioluminescent seabed field (mulberry32, fixed seed): one
// instanced draw of small emissive motes scattered over the abyss shelf.
function biolumeTransforms(count: number, seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const scale = 0.07 + next() * 0.1;
    return {
      position: [-40 + next() * 80, -16.55 + next() * 0.5, -42 + next() * 68] as const,
      scale: [scale, scale, scale] as const
    };
  });
}

const BIOLUME_TRANSFORMS = biolumeTransforms(140, 7407);
const BIOLUME_COLORS = BIOLUME_TRANSFORMS.map((_, index) =>
  index % 4 === 0 ? "#c4b5fd" : index % 3 === 0 ? "#fcd34d" : "#67e8f9"
);

const SHAFTS = [
  // In front of the default follow camera (sub at 0,-6,0; camera at about
  // 6.4,3.2,-15.4 looking +z and down towards -2,-9,-5).
  { position: [-5, 3, 2] as const, angle: 0.24, intensity: 0.45 },
  { position: [2.5, 3, 7] as const, angle: 0.3, intensity: 0.5 },
  { position: [-1, 3, -3] as const, angle: 0.2, intensity: 0.38 }
];

export function deepRecoveryEffectsPass() {
  if (!effectsPassOn) {
    return [effects.fog({ name: "deep recovery suspended-particle haze", color: "#0a2e3a", density: 0.02, intensity: 0.42 })];
  }
  return [
    // Surface sun key (strongest directional): owns the shadow cascades on
    // the sea floor and wreck, and the god-ray direction.
    lights.directional({
      name: "surface sun shadow key",
      position: [12, 30, 8],
      target: [0, -10, -6],
      color: "#a8e6df",
      intensity: 1.0,
      shadow: { cascades: "auto", maxDistance: 60 }
    }),
    effects.contactShadows({ length: 0.4, intensity: 0.8 }),
    // The pre-pass suspended-particle exp2 haze stays, recoloured to the
    // indigo twilight-zone water the effects-pass background uses: it is
    // what keeps the far basin dark so the lit subject carries the frame.
    effects.fog({ name: "deep recovery suspended-particle haze", color: "#141d42", density: 0.017, intensity: 0.42 }),
    environments.preset("night", { intensity: 0.4, specularIntensity: 1.2, background: false }),
    // Water column: denser with depth below the surface reference, forward
    // in-scatter towards the sun.
    effects.volumetricFog({
      name: "deep recovery water column",
      density: 0.012,
      color: "#1a2a5c",
      intensity: 0.36,
      volumetricQuality: "balanced",
      heightFalloff: 0.06,
      heightReference: 0
    }),
    // Authored abyss depth: a broad indigo silt shelf extending the trench
    // floor to the horizon in every follow-camera shot, soft bioluminescent
    // glow pools on it, and a fixed instanced biolume field. All dressing
    // sits below the gameplay floor (y ~ -16), so the submarine, wreck
    // practicals, and sonar returns stay the brightest read.
    primitives.sphere({
      name: "abyss backdrop shelf",
      material: material.pbr({
        name: "abyss indigo silt",
        color: "#1b2450",
        emissive: "#111a44",
        emissiveIntensity: 0.5,
        roughness: 0.97,
        metallic: 0.02
      })
    }).position(0, -17.6, -8).scale([95, 1.4, 75]),
    primitives.sphere({
      name: "biolume glow pool teal west",
      material: material.emissive({ color: "#062b33", emissive: "#155e63", emissiveIntensity: 0.55, opacity: 0.34 })
    }).position(-16, -16.85, -18).scale([13, 0.3, 9]),
    primitives.sphere({
      name: "biolume glow pool violet east",
      material: material.emissive({ color: "#160b33", emissive: "#3b2a7a", emissiveIntensity: 0.55, opacity: 0.34 })
    }).position(15, -16.85, -24).scale([11, 0.3, 8]),
    primitives.sphere({
      name: "biolume glow pool indigo north",
      material: material.emissive({ color: "#0a1033", emissive: "#1d3a8a", emissiveIntensity: 0.5, opacity: 0.32 })
    }).position(-4, -16.85, 10).scale([14, 0.3, 9]),
    primitives.sphere({
      name: "biolume glow pool teal far",
      material: material.emissive({ color: "#062b33", emissive: "#0f766e", emissiveIntensity: 0.5, opacity: 0.3 })
    }).position(20, -16.85, 14).scale([10, 0.3, 7]),
    instances.sphere({
      name: "bioluminescent seabed field",
      transforms: BIOLUME_TRANSFORMS,
      colors: BIOLUME_COLORS,
      material: material.emissive({ color: "#0b2b33", emissive: "#67e8f9", emissiveIntensity: 1.1 })
    }),
    effects.vignette({ intensity: 0.22, smoothness: 1.8 }),
    ...(vfxOn
      ? [
          ...SHAFTS.map((shaft, index) =>
            effects.lightCone({
              name: `surface sun shaft ${index + 1}`,
              position: shaft.position,
              direction: [-0.18, -1, -0.1],
              length: 24,
              coneAngle: shaft.angle,
              softness: 0.75,
              color: "#9ff3e6",
              intensity: shaft.intensity
            })
          ),
          // Marine snow: flakes scattered outward from the basin centre, then
          // drag-damped and sinking slowly through the water column.
          effects.particles({
            name: "marine snow",
            emitter: "ambient",
            particleCount: 230,
            emissionRate: 55,
            speed: 2.6,
            drag: 0.55,
            gravity: -0.25,
            size: [0.06, 0.14],
            lifetime: [4, 6],
            color: "#bfe9e2",
            materialMode: "soft-alpha",
            seed: 7402
          }).position(-1, -5, -6),
          // Bubble column off the chapel wreck vents (fountain plume preset).
          effects.particles({
            name: "wreck vent bubbles",
            emitter: "fountain",
            particleCount: 90,
            emissionRate: 24,
            radius: 0.5,
            height: 6,
            size: [0.08, 0.18],
            lifetime: [3, 5],
            color: "#d6fbff",
            materialMode: "soft-alpha",
            seed: 7401
          }).position(-2, -14, -9)
        ]
      : [])
  ];
}
