// apps/showcase-orbital-defense/src/v2/scene/lighting.ts — rig + environment (T2.2).
// §6.9.4: one sun key (5800K, the ONLY shadow caster) angled onto the
// station/ring plane, K1 deep-space starfield stand-in = faint cool IBL
// (nightCinematic, R-14-13 — no .hdr starfield fixture exists yet), the
// authored star shell in world.ts carries the visible Milky Way. Zero
// ambient/point fills — the night side stays dark except city lights.
import { environments, lights } from "@aura3d/engine";

/** 5800K sun key, sole shadow caster, matched to the star shell's bright side. */
export function orbitalLights(): unknown[] {
  return [
    lights.directional({
      name: "orbital sun key",
      color: "#fff3e0",
      intensity: 2.9,
      position: [7.5, 4.2, -5.5],
      shadow: true
    })
  ];
}

/** Deep-space IBL stand-in: faint cool ambient chain, no visible background. */
export function orbitalEnvironment(): unknown {
  return environments.nightCinematic({ name: "orbital deep-space ibl", intensity: 0.5 });
}
