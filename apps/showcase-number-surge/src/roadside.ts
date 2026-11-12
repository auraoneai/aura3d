/**
 * Number Surge procedural roadside dressing (presentation only): S-curved cyber-palms lining the elevated highway,
 * monumental bevelled numeral-7 arches on the grid floor, chamfered casino dice with 21 recessed pips tumbling
 * beside the road, lathe-turned highway milepost beacons, overhead lattice-truss math-gate gantries with translucent
 * physical energy screens, and off-lane rotary-saw / hydraulic-crusher hazard rigs.
 *
 * Every roadside piece stays clear of the gameplay lanes (`|x| >= 4.95`, road half-width `3.7`) and scrolls with the
 * road at 1x on a fixed cycle, growing in at the far end and out past the camera: pure presentation, zero gameplay RNG.
 */
import {
  instances,
  type AuraApp,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraTransformSpec,
  type scene
} from "@aura3d/engine";
import {
  SURGE_MATERIALS,
  buildCyberPalmCrownSpec,
  buildCyberPalmTrunkSpec,
  buildFloatingDieBodySpec,
  buildFloatingDiePipsSpec,
  buildHighwayGantryScreensNode,
  buildHighwayMathGantryFrameNode,
  buildMilepostBeaconBodySpec,
  buildMilepostBeaconLensSpec,
  buildNumeralSevenBodySpec,
  buildNumeralSevenPlinthSpec,
  buildRoadsideHazardRigNode,
  buildRotarySawBladeNode
} from "./art/proceduralModels";
import { SCENERY } from "./scenery";

type Scene = ReturnType<typeof scene>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
export type RoadsideKind = "nsNeonPalm" | "nsPinkPalm" | "nsNumeralSeven" | "nsFloatingDice";

export const ROADSIDE_KINDS: readonly RoadsideKind[] = [
  "nsNeonPalm",
  "nsPinkPalm",
  "nsNumeralSeven",
  "nsFloatingDice"
] as const;

export interface RoadsidePiece {
  readonly id: string;
  readonly kind: RoadsideKind;
  readonly side: -1 | 1;
  readonly x: number;
  /** Base height: fitted models are grounded on their lowest point. */
  readonly y: number;
  readonly z0: number;
  readonly height: number;
  readonly yaw: number;
  readonly color: string;
  readonly tint: readonly { color: string; colorMode: "multiply"; roughness: number; metallic: number; emissive: string; emissiveIntensity: number }[];
}

export const ROADSIDE_SPAN = 180;
const NEAR = 10;
const FAR = NEAR - ROADSIDE_SPAN;

const BASE_HEIGHT: Record<RoadsideKind, number> = {
  nsNeonPalm: 15,
  nsPinkPalm: 15,
  nsNumeralSeven: 18,
  nsFloatingDice: 1.6
};

const neon = (color: string, emissive: string, emissiveIntensity: number) =>
  [{ color, colorMode: "multiply" as const, roughness: 0.16, metallic: 0.14, emissive, emissiveIntensity }];
const CYAN_PALM = neon("#a8f6ff", "#3ef2ff", 0.34);
const PINK_PALM = neon("#ffb8f0", "#ff4fd8", 0.36);
const SEVEN_LACQUER = neon("#ffffff", "#c878ff", 0.42);
const DICE_LACQUER = neon("#f4f7ff", "#4a2890", 0.24);

const palm = (i: number, kind: "nsNeonPalm" | "nsPinkPalm", side: -1 | 1): RoadsidePiece => ({
  id: `roadside-palm-${i}`,
  kind,
  side,
  x: 10.5 + ((i * 3) % 4) * 0.6,
  y: SCENERY.floorY,
  z0: i * 30,
  height: 15 + ((i * 5) % 3) * 0.8,
  yaw: i * 1.7,
  color: "#ffffff",
  tint: kind === "nsNeonPalm" ? CYAN_PALM : PINK_PALM
});

/** Six palms (one every 30 m, alternating sides), two numeral sevens, three dice — batched into procedural GPU-instanced draws. */
export const ROADSIDE: readonly RoadsidePiece[] = [
  palm(0, "nsNeonPalm", -1), palm(1, "nsPinkPalm", 1), palm(2, "nsPinkPalm", -1),
  palm(3, "nsNeonPalm", 1), palm(4, "nsNeonPalm", -1), palm(5, "nsPinkPalm", 1),
  { id: "roadside-seven-0", kind: "nsNumeralSeven", side: -1, x: 20, y: SCENERY.floorY, z0: 45, height: 18, yaw: 0.42, color: "#ffc4f2", tint: SEVEN_LACQUER },
  { id: "roadside-seven-1", kind: "nsNumeralSeven", side: 1, x: 20, y: SCENERY.floorY, z0: 135, height: 18, yaw: -0.42, color: "#bff8ff", tint: SEVEN_LACQUER },
  { id: "roadside-dice-0", kind: "nsFloatingDice", side: 1, x: 7.8, y: 8.2, z0: 18, height: 1.6, yaw: 0.3, color: "#eaf6ff", tint: DICE_LACQUER },
  { id: "roadside-dice-1", kind: "nsFloatingDice", side: -1, x: 8.2, y: 9.0, z0: 78, height: 1.6, yaw: 2.1, color: "#ffd8f4", tint: DICE_LACQUER },
  { id: "roadside-dice-2", kind: "nsFloatingDice", side: 1, x: 8.6, y: 8.6, z0: 138, height: 1.6, yaw: 4.0, color: "#fff1b8", tint: DICE_LACQUER }
];

const MILEPOST_COUNT = 12;
const GANTRY_Z0 = [32, 122] as const;
const HAZARD_SPECS = [
  { index: 0, side: -1 as const, x: -6.4, z0: 66, rotY: Math.PI },
  { index: 1, side: 1 as const, x: 6.4, z0: 156, rotY: 0 }
] as const;

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function cycleZ(z0: number, travelled: number): { readonly z: number; readonly scale: number } {
  const z = ((((z0 + travelled) % ROADSIDE_SPAN) + ROADSIDE_SPAN) % ROADSIDE_SPAN) + FAR;
  const fade = smooth((z - FAR) / 30) * smooth((NEAR - z) / 8);
  return { z, scale: Math.max(0.001, fade) };
}

/** Pose at road speed: z cycles through [FAR, NEAR), grows in over the far 30 m and out over the last 8 m. */
export function roadsidePose(p: RoadsidePiece, travelled: number, time: number) {
  const { z, scale } = cycleZ(p.z0, travelled);
  const dice = p.kind === "nsFloatingDice";
  const y = dice ? p.y + Math.sin(time * 0.9 + p.z0) * 0.45 : p.y;
  const yaw = dice ? p.yaw + time * 0.35 : p.yaw;
  const roll = dice ? Math.sin(time * 0.5 + p.z0) * 0.35 : 0;
  return { x: p.side * p.x, y, z, yaw, roll, scale };
}

function transformFor(p: RoadsidePiece, travelled: number, time: number): AuraTransformSpec {
  const pose = roadsidePose(p, travelled, time);
  const s = Math.max(0.001, pose.scale * (p.height / BASE_HEIGHT[p.kind]));
  return {
    position: [pose.x, pose.y, pose.z],
    rotation: [0, pose.yaw, pose.roll],
    scale: s
  };
}

function kindSpecs(kind: RoadsideKind): {
  readonly primarySpec: AuraCustomGeometrySpec;
  readonly primaryMat: AuraMaterialSpec;
  readonly accentSpec: AuraCustomGeometrySpec;
  readonly accentMat: AuraMaterialSpec;
} {
  switch (kind) {
    case "nsNeonPalm":
      return {
        primarySpec: buildCyberPalmCrownSpec(1),
        primaryMat: SURGE_MATERIALS.palmCanopyPbr,
        accentSpec: buildCyberPalmTrunkSpec(),
        accentMat: SURGE_MATERIALS.instancedObsidianBatch
      };
    case "nsPinkPalm":
      return {
        primarySpec: buildCyberPalmCrownSpec(2),
        primaryMat: SURGE_MATERIALS.pinkPalmCanopyPbr,
        accentSpec: buildCyberPalmTrunkSpec(),
        accentMat: SURGE_MATERIALS.instancedObsidianBatch
      };
    case "nsNumeralSeven":
      return {
        primarySpec: buildNumeralSevenBodySpec(),
        primaryMat: SURGE_MATERIALS.ivoryLacquerBatch,
        accentSpec: buildNumeralSevenPlinthSpec(),
        accentMat: SURGE_MATERIALS.instancedAlloyBatch
      };
    case "nsFloatingDice":
      return {
        primarySpec: buildFloatingDieBodySpec(),
        primaryMat: SURGE_MATERIALS.ivoryLacquerBatch,
        accentSpec: buildFloatingDiePipsSpec(),
        accentMat: SURGE_MATERIALS.instancedObsidianBatch
      };
  }
}

function milepostTransform(index: number, travelled: number): AuraTransformSpec {
  const side = index % 2 === 0 ? -1 : 1;
  const z0 = (index / MILEPOST_COUNT) * ROADSIDE_SPAN;
  const { z, scale } = cycleZ(z0, travelled);
  return {
    position: [side * 4.95, 0, z],
    rotation: [0, side < 0 ? 0.25 : -0.25, 0],
    scale
  };
}

export function addRoadside(builder: Scene): { bind(node: (id: string) => NodeHandle): { update(travelled: number, time: number): void } } {
  const groups = ROADSIDE_KINDS.map((kind) => {
    const id = `roadside-${kind}`;
    const accentId = `roadside-${kind}-accent`;
    const members = ROADSIDE.filter((p) => p.kind === kind);
    const colors = members.map((p) => p.color);
    const accentColors = members.map(() => "#ffffff");
    const initial = members.map((p) => transformFor(p, 0, 0));
    const { primarySpec, primaryMat, accentSpec, accentMat } = kindSpecs(kind);

    builder.add(
      instances
        .custom(primarySpec, {
          name: id,
          material: primaryMat,
          transforms: initial,
          colors,
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id })
    );
    builder.add(
      instances
        .custom(accentSpec, {
          name: accentId,
          material: accentMat,
          transforms: initial,
          colors: accentColors,
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id: accentId })
    );

    return {
      id,
      accentId,
      members,
      colors,
      accentColors,
      scratch: new Array<AuraTransformSpec>(members.length)
    };
  });

  // Lathe-turned highway milepost beacons outside road shoulders (|x| = 4.95).
  const milepostColors = Array.from({ length: MILEPOST_COUNT }, (_, i) =>
    i % 3 === 0 ? "#3ef2ff" : i % 3 === 1 ? "#ff4fd8" : "#ffd84d"
  );
  const initialMileposts = Array.from({ length: MILEPOST_COUNT }, (_, i) => milepostTransform(i, 0));
  builder.add(
    instances
      .custom(buildMilepostBeaconBodySpec(), {
        name: "roadside-mileposts",
        material: SURGE_MATERIALS.instancedAlloyBatch,
        transforms: initialMileposts,
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "roadside-mileposts" })
  );
  builder.add(
    instances
      .custom(buildMilepostBeaconLensSpec(), {
        name: "roadside-milepost-lenses",
        material: SURGE_MATERIALS.palmCanopyPbr,
        transforms: initialMileposts,
        colors: milepostColors,
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "roadside-milepost-lenses" })
  );

  // Full-span overhead lattice-truss math-gate gantries + physical energy screens.
  for (let i = 0; i < GANTRY_Z0.length; i += 1) {
    builder.add(buildHighwayMathGantryFrameNode(`roadside-gantry-${i}`));
    builder.add(buildHighwayGantryScreensNode(`roadside-gantry-screens-${i}`));
  }

  // Off-lane rotary-saw + hydraulic crusher + barrier hazard rigs (|x| >= 6.4).
  for (const h of HAZARD_SPECS) {
    builder.add(buildRoadsideHazardRigNode(`roadside-hazard-rig-${h.index}`));
    builder.add(buildRotarySawBladeNode(`roadside-hazard-saw-${h.index}`));
  }

  const milepostScratch = new Array<AuraTransformSpec>(MILEPOST_COUNT);

  return {
    bind(node) {
      for (const g of groups) {
        node(g.id);
        node(g.accentId);
      }
      node("roadside-mileposts");
      node("roadside-milepost-lenses");
      for (let i = 0; i < GANTRY_Z0.length; i += 1) {
        node(`roadside-gantry-${i}`);
        node(`roadside-gantry-screens-${i}`);
      }
      for (const h of HAZARD_SPECS) {
        node(`roadside-hazard-rig-${h.index}`);
        node(`roadside-hazard-saw-${h.index}`);
      }

      return {
        update(travelled, time) {
          for (const g of groups) {
            for (let i = 0; i < g.members.length; i++) {
              g.scratch[i] = transformFor(g.members[i]!, travelled, time);
            }
            node(g.id).setInstances(g.scratch, g.colors);
            node(g.accentId).setInstances(g.scratch, g.accentColors);
          }

          for (let i = 0; i < MILEPOST_COUNT; i += 1) {
            milepostScratch[i] = milepostTransform(i, travelled);
          }
          node("roadside-mileposts").setInstances(milepostScratch);
          node("roadside-milepost-lenses").setInstances(milepostScratch, milepostColors);

          for (let i = 0; i < GANTRY_Z0.length; i += 1) {
            const { z, scale } = cycleZ(GANTRY_Z0[i]!, travelled);
            const visible = scale > 0.02;
            node(`roadside-gantry-${i}`).setVisible(visible).setPosition(0, 0, z).setScale(scale);
            node(`roadside-gantry-screens-${i}`).setVisible(visible).setPosition(0, 0, z).setScale(scale);
          }

          for (const h of HAZARD_SPECS) {
            const { z, scale } = cycleZ(h.z0, travelled);
            const visible = scale > 0.02;
            node(`roadside-hazard-rig-${h.index}`)
              .setVisible(visible)
              .setPosition(h.x, 0, z)
              .setRotation(0, h.rotY, 0)
              .setScale(scale);
            node(`roadside-hazard-saw-${h.index}`)
              .setVisible(visible)
              .setPosition(h.x - h.side * 0.32 * scale, (2.15 + 0.25 * Math.sin(time * 2.8 + h.index)) * scale, z)
              .setRotation(0, Math.PI * 0.5, time * 4.6 * h.side)
              .setScale(scale);
          }
        }
      };
    }
  };
}
