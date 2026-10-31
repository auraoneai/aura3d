/**
 * IRON CROWN 4.6.2 venue look (GU47 blind-panel fix pass, PRD D11 no-regression).
 *
 * A blind panel of three judges preferred the 4.6.2 frames over the GU47 look on the Colosseum, the Crown Arena, the
 * Airstrip and (by the lane's own reading) the Monastery. Those venues default to their 4.6.2 look: the 4.6.2 biome look
 * preset with its own accent, exposure and fog scale, the 4.6.2 floor deck, rim, key/fill spots, light cones, vignette
 * and bloom, and no far backdrop, venue LUT, follow-spot, back rims, weather or flares. The two venues the panel judged
 * better (Neo-Tokyo, the Dock) keep the GU47 look. `?look=original` forces the 4.6.2 look on every venue and
 * `?look=gu47` the GU47 look; the combat, camera and HUD are identical on both paths.
 */
import { material, primitives, type AuraSceneNode } from "@aura3d/engine";
import type { StageId, StagePalette } from "./stages";

export type VenueLookMode = "gu47" | "original";

export interface OriginalLook {
  readonly lookId: "night-city" | "golden-hour" | "outdoor-day" | "overcast" | "alpine-snow" | "arena-fight";
  readonly overrides: { readonly accent: string; readonly exposureEv: number; readonly fogDensityScale: number };
}

/** The 4.6.2 look of every venue (stages.ts at v4.6.2, `makeStage` look id and overrides). */
export const ORIGINAL_LOOKS: Readonly<Record<StageId, OriginalLook>> = {
  "neo-tokyo-rooftop": { lookId: "night-city", overrides: { accent: "#ff5cbe", exposureEv: 0.05, fogDensityScale: 0.9 } },
  "bangkok-dock": { lookId: "golden-hour", overrides: { accent: "#ffab4d", exposureEv: 0.1, fogDensityScale: 0.55 } },
  "colosseum-ruins": { lookId: "outdoor-day", overrides: { accent: "#e8c98a", exposureEv: 0.14, fogDensityScale: 0.4 } },
  "desert-airbase": { lookId: "overcast", overrides: { accent: "#ffb03c", exposureEv: 0.02, fogDensityScale: 0.5 } },
  "himalayan-monastery": { lookId: "alpine-snow", overrides: { accent: "#7dd7ff", exposureEv: 0.1, fogDensityScale: 0.75 } },
  "crown-arena": { lookId: "arena-fight", overrides: { accent: "#ffd76a", exposureEv: 0.08, fogDensityScale: 0.7 } }
};

/** Per-venue default after the blind panel (2026-10-31): only the venues judged better keep the GU47 look. */
export const VENUE_LOOK_DEFAULT: Readonly<Record<StageId, VenueLookMode>> = {
  "neo-tokyo-rooftop": "gu47",
  "bangkok-dock": "gu47",
  "colosseum-ruins": "original",
  "desert-airbase": "original",
  "himalayan-monastery": "original",
  "crown-arena": "original"
};

/** The venue's look: `?look=original` / `?look=gu47` win over the per-venue default. */
export function venueLookMode(id: StageId, params?: Pick<URLSearchParams, "get">): VenueLookMode {
  const forced = params?.get("look");
  if (forced === "original" || forced === "gu47") return forced;
  return VENUE_LOOK_DEFAULT[id];
}

/** The 4.6.2 vignette (one value on every venue). */
export const ORIGINAL_VIGNETTE = 0.16;

/** The 4.6.2 floor deck (palette colours, 38 draws), verbatim from stages.ts at v4.6.2. */
export function buildOriginalFloorDeck(id: StageId, palette: StagePalette): readonly AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [
    primitives
      .box({
        name: `${id}-obsidian-subfloor`,
        material: material.pbr({
          color: palette.floor,
          roughness: 0.4,
          metallic: 0.32
        })
      })
      .position(0, -0.14, 0)
      .scale([44, 0.2, 32])
      .toJSON()
  ];

  const plankZs = [-13.2, -11.0, -8.8, -6.6, -4.4, -2.2, 0.0, 2.2, 4.4, 6.6, 8.8, 11.0, 13.2];
  plankZs.forEach((z, idx) => {
    const even = idx % 2 === 0;
    nodes.push(
      primitives
        .box({
          name: `${id}-stone-plank-${idx}`,
          material: material.pbr({
            color: even ? palette.floor : palette.skyline,
            roughness: even ? 0.34 : 0.46,
            metallic: even ? 0.36 : 0.24,
            clearcoat: even ? 0.18 : 0.08,
            clearcoatRoughness: 0.42
          })
        })
        .position(0, -0.036, z)
        .scale([38, 0.055, 2.06])
        .toJSON()
    );
  });

  const trimZs = [-12.1, -9.9, -7.7, -5.5, -3.3, -1.32, 1.32, 3.3, 5.5, 7.7, 9.9, 12.1];
  trimZs.forEach((z, idx) => {
    const isCombatEdge = Math.abs(Math.abs(z) - 1.32) < 0.1;
    const trimColor = isCombatEdge ? palette.lane : palette.warning;
    nodes.push(
      primitives
        .box({
          name: `${id}-gold-trim-z-${idx}`,
          material: material.pbr({
            color: trimColor,
            emissive: trimColor,
            emissiveIntensity: isCombatEdge ? 0.42 : 0.18,
            roughness: 0.28,
            metallic: 0.65
          })
        })
        .position(0, -0.012, z)
        .scale([36, 0.022, isCombatEdge ? 0.09 : 0.055])
        .toJSON()
    );
  });

  for (const side of [-1, 1] as const) {
    nodes.push(
      primitives
        .box({
          name: `${id}-ring-border-x-${side > 0 ? "r" : "l"}`,
          material: material.pbr({
            color: palette.warning,
            emissive: palette.warning,
            emissiveIntensity: 0.25,
            roughness: 0.3,
            metallic: 0.62
          })
        })
        .position(side * 3.9, -0.01, 0)
        .scale([0.08, 0.024, 28])
        .toJSON()
    );
  }

  // Elliptical ring apron: two inlaid light lines frame the fight lane and
  // read as a real arena ring instead of an unmarked slab.
  const ringSegments = 56;
  const ringA: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  const ringB: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let i = 0; i < ringSegments; i += 1) {
    const a = (i / ringSegments) * Math.PI * 2;
    const tx = -Math.sin(a) * 4.35;
    const tz = Math.cos(a) * 2.95;
    const yaw = -Math.atan2(tz, tx);
    ringA.push({ position: [Math.cos(a) * 4.35, -0.003, Math.sin(a) * 2.95], rotation: [0, yaw, 0], scale: [0.46, 0.012, 0.06] });
    const tx2 = -Math.sin(a) * 3.5;
    const tz2 = Math.cos(a) * 2.3;
    ringB.push({ position: [Math.cos(a) * 3.5, -0.004, Math.sin(a) * 2.3], rotation: [0, -Math.atan2(tz2, tx2), 0], scale: [0.34, 0.01, 0.035] });
  }
  nodes.push(
    primitives
      .box({
        name: `${id}-stage-ring`,
        material: material.emissive({ color: palette.warning, emissive: palette.warning, emissiveIntensity: 0.62, roughness: 0.28, metalness: 0.5 }),
        instances: ringA,
        castShadow: false,
        receiveShadow: false
      })
      .toJSON(),
    primitives
      .box({
        name: `${id}-stage-ring-inner`,
        material: material.emissive({ color: palette.lane, emissive: palette.lane, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.45 }),
        instances: ringB,
        castShadow: false,
        receiveShadow: false
      })
      .toJSON()
  );

  // Floor medallion + 12-spoke crown star centred in the apron.
  const star: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    star.push({
      position: [0, -0.002, 0.95],
      rotation: [0, -a, 0],
      scale: [i % 3 === 0 ? 1.5 : 1.05, 0.011, i % 3 === 0 ? 0.07 : 0.042]
    });
  }
  nodes.push(
    primitives
      .cylinder({
        name: `${id}-stage-medallion`,
        material: material.pbr({ color: palette.skyline, roughness: 0.32, metallic: 0.42, clearcoat: 0.24, clearcoatRoughness: 0.3 }),
        castShadow: false,
        receiveShadow: true
      })
      .position(0, -0.006, 0.95)
      .scale([3.1, 0.014, 2.15])
      .toJSON(),
    primitives
      .cylinder({
        name: `${id}-stage-medallion-hub`,
        material: material.emissive({ color: palette.warning, emissive: palette.warning, emissiveIntensity: 0.36, roughness: 0.25, metalness: 0.55 }),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, 0.001, 0.95)
      .scale([0.62, 0.012, 0.62])
      .toJSON(),
    primitives
      .box({
        name: `${id}-stage-star`,
        material: material.emissive({ color: palette.warning, emissive: palette.warning, emissiveIntensity: 0.22, roughness: 0.3, metalness: 0.5 }),
        instances: star,
        castShadow: false,
        receiveShadow: false
      })
      .toJSON()
  );

  // Low apron lip across the near edge of the ring and two approach rails
  // carry the eye into the bottom third of the frame.
  nodes.push(
    primitives
      .box({
        name: `${id}-ring-lip-front`,
        material: material.pbr({ color: palette.skyline, roughness: 0.3, metallic: 0.55, clearcoat: 0.2 })
      })
      .position(0, 0.028, 3.28)
      .scale([13.4, 0.075, 0.2])
      .toJSON(),
    primitives
      .box({
        name: `${id}-ring-lip-back`,
        material: material.pbr({ color: palette.skyline, roughness: 0.32, metallic: 0.5 })
      })
      .position(0, 0.022, -2.9)
      .scale([12.2, 0.06, 0.18])
      .toJSON(),
    primitives
      .box({
        name: `${id}-ring-lip-glow`,
        material: material.emissive({ color: palette.lane, emissive: palette.lane, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.4 }),
        castShadow: false,
        receiveShadow: false
      })
      .position(0, 0.067, 3.28)
      .scale([13.4, 0.012, 0.06])
      .toJSON()
  );
  for (const side of [-1, 1] as const) {
    nodes.push(
      primitives
        .box({
          name: `${id}-approach-rail-${side > 0 ? "r" : "l"}`,
          material: material.emissive({ color: palette.lane, emissive: palette.lane, emissiveIntensity: 0.2, roughness: 0.32, metalness: 0.4 }),
          castShadow: false,
          receiveShadow: false
        })
        .position(side * 3.35, -0.002, 5.05)
        .scale([0.055, 0.012, 3.5])
        .toJSON()
    );
  }

  return nodes;
}
