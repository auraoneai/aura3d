// Visible effects pass (batch C): the default (engine-default flags) look of
// the legacy boot. Every node here is a public engine builder whose runtime
// path is on under the default `post` / `vfx` / `lighting` flags; with those
// flags off the pass falls back to the pre-pass fog so the flags-off arm keeps
// its old look (and never pays the CPU volumetric-light fallback).
//
// Look brief (space): hard warm sun from upper-left, graphite void with a cool
// rim, the planet as the lit subject. Families: sun key + cascaded shadows and
// contact shadows, volumetric in-scatter / god rays, ambient orbital dust and
// ring sparks, studio IBL reflections on the stations, grade + vignette.
import { effects, environments, instances, lights, material, primitives } from "@aura3d/engine";
import { resolveQrFlags } from "@aura3d/engine/contracts";

const flags = resolveQrFlags({
  url: location.href,
  env: { VITE_A3D_QR: (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_A3D_QR }
});

export const effectsPassOn = flags.on("A3D_QR_POST");
const vfxOn = flags.on("A3D_QR_VFX");

// Deterministic starfield (mulberry32, fixed seed): one instanced draw of
// small emissive spheres in the backdrop plane behind the defence ring.
function starTransforms(count: number, seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const scale = 0.03 + next() * 0.05;
    return {
      position: [-21 + next() * 42, -11.5 + next() * 23, -13 + next() * 5] as const,
      scale: [scale, scale, scale] as const
    };
  });
}

const STAR_TRANSFORMS = starTransforms(150, 4107);
const STAR_COLORS = STAR_TRANSFORMS.map((_, index) =>
  index % 5 === 0 ? "#fde68a" : index % 3 === 0 ? "#a5f3fc" : "#e2e8f0"
);

export function orbitalEffectsPass() {
  if (!effectsPassOn) return [effects.fog({ density: 0.024, color: "#0d1726" })];
  return [
    // Sun key: the strongest directional drives the shadow cascades and the
    // S4 god-ray direction. Warm, from the upper left so the terminator falls
    // across the planet face the camera sees.
    lights.directional({
      name: "orbital sun key",
      position: [-5.5, 3.6, 4.2],
      target: [0, 0, 0],
      color: "#ffe2b8",
      intensity: 5.0,
      shadow: { cascades: "auto", maxDistance: 24 }
    }),
    // Studio IBL for reflections on the metallic stations and planet lacquer;
    // background stays the authored void.
    environments.preset("studio", { intensity: 0.7, specularIntensity: 1.25, background: false }),
    // Authored deep-space backdrop: a dark indigo void wall far behind the
    // defence ring, soft nebula discs, a sun-lit distant moon, and a fixed
    // starfield. All set dressing at z <= -8, well behind gameplay (z ~ 0),
    // so the planet and intercept lanes stay the brightest read.
    primitives.box({
      name: "deep space backdrop wall",
      material: material.emissive({ color: "#070a1c", emissive: "#17245e", emissiveIntensity: 0.45 })
    }).position(0, 0, -16).scale([90, 50, 0.5]),
    primitives.sphere({
      name: "violet nebula disc west",
      material: material.emissive({ color: "#150a2e", emissive: "#4c2a85", emissiveIntensity: 0.5, opacity: 0.5 })
    }).position(-7.5, 2.8, -11).scale([7.5, 4.6, 0.4]),
    primitives.sphere({
      name: "teal nebula disc east",
      material: material.emissive({ color: "#06222b", emissive: "#134e5e", emissiveIntensity: 0.55, opacity: 0.5 })
    }).position(8.2, -2.4, -10).scale([6.8, 4.2, 0.4]),
    primitives.sphere({
      name: "magenta nebula disc north",
      material: material.emissive({ color: "#220a1e", emissive: "#5e2450", emissiveIntensity: 0.45, opacity: 0.45 })
    }).position(3.4, 5.6, -12).scale([6.2, 3.6, 0.4]),
    primitives.sphere({
      name: "indigo nebula disc south",
      material: material.emissive({ color: "#0a1030", emissive: "#1d3a8a", emissiveIntensity: 0.5, opacity: 0.5 })
    }).position(-4.6, -5.4, -10.5).scale([7, 3.8, 0.4]),
    primitives.sphere({
      name: "distant grey moon",
      material: material.pbr({ color: "#9aa7b8", roughness: 0.85, metallic: 0.05 })
    }).position(-6.9, 3.6, -9).scale(1.05),
    instances.sphere({
      name: "backdrop starfield",
      transforms: STAR_TRANSFORMS,
      colors: STAR_COLORS,
      material: material.emissive({ color: "#dbeafe", emissive: "#e2e8f0", emissiveIntensity: 1.15 })
    }),
    effects.contactShadows({ length: 0.3, intensity: 0.8 }),
    // Depth-aware in-scatter: a cool haze that recedes the outer ring
    // and lets the sun throw rays past the planet limb.
    effects.volumetricFog({
      name: "orbital in-scatter",
      density: 0.055,
      color: "#33587e",
      intensity: 0.75,
      volumetricQuality: "balanced"
    }),
    effects.colorGrade({ exposure: 1.5, contrast: 1.02, saturation: 1.45 }),
    effects.vignette({ intensity: 0.22, smoothness: 1.6 }),
    effects.neonBloom({ intensity: 0.45, threshold: 0.62, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }),
    ...(vfxOn
      ? [
          // Debris belt: a wide spawn disc (fountain plume preset) in the
          // orbital plane, drifting slowly up through the defence ring.
          effects.particles({
            name: "orbital debris belt",
            emitter: "fountain",
            particleCount: 300,
            emissionRate: 70,
            radius: 5.5,
            height: 0.9,
            size: [0.06, 0.13],
            lifetime: [3.5, 4.5],
            color: "#9fd8ff",
            materialMode: "additive-glow",
            seed: 4101
          }).position(0, -0.25, 0),
          // Faint warm sparks scattering off the atmosphere on the sun side.
          effects.particles({
            name: "atmosphere sun-side sparks",
            emitter: "ambient",
            particleCount: 70,
            emissionRate: 20,
            size: [0.035, 0.08],
            lifetime: [2, 3.5],
            speed: 0.45,
            gravity: 0,
            color: "#ffd59a",
            materialMode: "additive-glow",
            seed: 4102
          }).position(-1.05, 0.75, 0.7)
        ]
      : [])
  ] as const;
}
