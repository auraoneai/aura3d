/**
 * Number Surge procedural roadside dressing (presentation only): sleek low-profile track side-curbs
 * (`height = 0.22 <= 0.35` for a 100% unobstructed sightline to gates and skyline), S-curved neon
 * cyber-palms outboard in the avenue, monumental violet-lacquer numeral-7 arches, and tumbling dice.
 *
 * Every roadside piece stays far clear of the gameplay lanes and camera foreground, scrolling with the
 * road at 1x on a fixed cycle: pure presentation, zero gameplay RNG, zero per-frame mesh/material creation.
 */
import {
  instances,
  type AuraApp,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraTransformSpec,
  type scene
} from "@aura3d/engine";
import { scrollFrameZ } from "../../../examples/shared/runner-kit/index";
import {
  SURGE_MATERIALS,
  buildCyberPalmCrownSpec,
  buildCyberPalmTrunkSpec,
  buildFloatingDieBodySpec,
  buildFloatingDiePipsSpec,
  buildNumeralSevenBodySpec,
  buildNumeralSevenPlinthSpec,
  buildSleekTrackCurbGlowSpec,
  buildSleekTrackCurbSpec
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
const NEAR = -6;
const FAR = NEAR - ROADSIDE_SPAN;

const BASE_HEIGHT: Record<RoadsideKind, number> = {
  nsNeonPalm: 15,
  nsPinkPalm: 15,
  nsNumeralSeven: 18,
  nsFloatingDice: 1.6
};

const neon = (color: string, emissive: string, emissiveIntensity: number) =>
  [{ color, colorMode: "multiply" as const, roughness: 0.16, metallic: 0.14, emissive, emissiveIntensity }];
const CYAN_PALM = neon("#a8f6ff", "#3ef2ff", 0.42);
const PINK_PALM = neon("#ffb8f0", "#ff4fd8", 0.44);
const SEVEN_LACQUER = neon("#ffffff", "#c878ff", 0.46);
const DICE_LACQUER = neon("#eaf0ff", "#5c34b8", 0.28);

const palm = (i: number, kind: "nsNeonPalm" | "nsPinkPalm", side: -1 | 1): RoadsidePiece => ({
  id: `roadside-palm-${i}`,
  kind,
  side,
  x: 20 + ((i * 3) % 4) * 1.5,
  y: SCENERY.floorY,
  z0: i * 30,
  height: 14.6 + ((i * 5) % 3) * 0.6,
  yaw: i * 1.7,
  color: "#ffffff",
  tint: kind === "nsNeonPalm" ? CYAN_PALM : PINK_PALM
});

/** Six palms, two numeral sevens, three dice — pushed well outboard and batched into GPU-instanced draws. */
export const ROADSIDE: readonly RoadsidePiece[] = [
  palm(0, "nsNeonPalm", -1), palm(1, "nsPinkPalm", 1), palm(2, "nsPinkPalm", -1),
  palm(3, "nsNeonPalm", 1), palm(4, "nsNeonPalm", -1), palm(5, "nsPinkPalm", 1),
  { id: "roadside-seven-0", kind: "nsNumeralSeven", side: -1, x: 30, y: SCENERY.floorY, z0: 45, height: 18, yaw: 0.42, color: "#ffc4f2", tint: SEVEN_LACQUER },
  { id: "roadside-seven-1", kind: "nsNumeralSeven", side: 1, x: 30, y: SCENERY.floorY, z0: 135, height: 18, yaw: -0.42, color: "#bff8ff", tint: SEVEN_LACQUER },
  { id: "roadside-dice-0", kind: "nsFloatingDice", side: 1, x: 18.5, y: 5.4, z0: 18, height: 1.6, yaw: 0.3, color: "#eaf6ff", tint: DICE_LACQUER },
  { id: "roadside-dice-1", kind: "nsFloatingDice", side: -1, x: 19.8, y: 6.2, z0: 78, height: 1.6, yaw: 2.1, color: "#ffd8f4", tint: DICE_LACQUER },
  { id: "roadside-dice-2", kind: "nsFloatingDice", side: 1, x: 21.2, y: 5.8, z0: 138, height: 1.6, yaw: 4.0, color: "#fff1b8", tint: DICE_LACQUER }
];

const CURB_SPACING = 4.0;
const CURB_AHEAD = 104;
const CURB_BEHIND = 12;
const CURB_COUNT = Math.ceil((CURB_AHEAD + CURB_BEHIND) / CURB_SPACING) + 2;

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function cycleZ(z0: number, travelled: number): { readonly z: number; readonly scale: number } {
  const z = ((((z0 + travelled) % ROADSIDE_SPAN) + ROADSIDE_SPAN) % ROADSIDE_SPAN) + FAR;
  const fade = smooth((z - FAR) / 32) * smooth((NEAR - z) / 16);
  return { z, scale: Math.max(0.001, fade) };
}

/** Pose at road speed: z cycles through [FAR, NEAR), grows in at the far end and fades well ahead of the camera. */
export function roadsidePose(p: RoadsidePiece, travelled: number, time: number) {
  const { z, scale } = cycleZ(p.z0, travelled);
  const dice = p.kind === "nsFloatingDice";
  const y = dice ? p.y + Math.sin(time * 0.9 + p.z0) * 0.45 : p.y;
  const yaw = dice ? p.yaw + time * 0.35 : p.yaw;
  const roll = dice ? Math.sin(time * 0.5 + p.z0) * 0.35 : 0;
  return { x: p.side * p.x, y, z, yaw, roll, scale };
}

function writeTransformFor(
  out: { position: [number, number, number]; rotation: [number, number, number]; scale: number },
  p: RoadsidePiece,
  travelled: number,
  time: number
): void {
  const pose = roadsidePose(p, travelled, time);
  out.position[0] = pose.x;
  out.position[1] = pose.y;
  out.position[2] = pose.z;
  out.rotation[0] = 0;
  out.rotation[1] = pose.yaw;
  out.rotation[2] = pose.roll;
  out.scale = Math.max(0.001, pose.scale * (p.height / BASE_HEIGHT[p.kind]));
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
        primaryMat: SURGE_MATERIALS.sevenVioletLacquer,
        accentSpec: buildNumeralSevenPlinthSpec(),
        accentMat: SURGE_MATERIALS.instancedObsidianBatch
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

interface MutableTransform extends AuraTransformSpec {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

const allocTransform = (): MutableTransform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: 1
});

export function addRoadside(builder: Scene): { bind(node: (id: string) => NodeHandle): { update(travelled: number, time: number): void } } {
  const groups = ROADSIDE_KINDS.map((kind) => {
    const id = `roadside-${kind}`;
    const accentId = `roadside-${kind}-accent`;
    const members = ROADSIDE.filter((p) => p.kind === kind);
    const colors = members.map((p) => p.color);
    const accentColors = members.map(() => "#ffffff");
    const scratch = members.map((p) => {
      const t = allocTransform();
      writeTransformFor(t, p, 0, 0);
      return t;
    });
    const { primarySpec, primaryMat, accentSpec, accentMat } = kindSpecs(kind);

    builder.add(
      instances
        .custom(primarySpec, {
          name: id,
          material: primaryMat,
          transforms: scratch,
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
          transforms: scratch,
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
      scratch
    };
  });

  // Sleek low-profile chamfered track side-curbs (height = 0.22 <= 0.35 m) + neon light-pipe rails,
  // batched into 2 GPU-instanced draws with zero tall side-wall slabs or foreground sightline blockers.
  const initK0 = Math.floor(-CURB_AHEAD / CURB_SPACING);
  const curbTransforms: MutableTransform[] = Array.from({ length: CURB_COUNT }, (_, i) => ({
    position: [0, 0, (initK0 + i) * CURB_SPACING],
    rotation: [0, 0, 0],
    scale: 1
  }));
  const curbGlowColors = Array.from({ length: CURB_COUNT }, (_, i) =>
    ((initK0 + i) & 1) === 0 ? "#3ef2ff" : "#ff4fd8"
  );

  builder.add(
    instances
      .custom(buildSleekTrackCurbSpec(), {
        name: "roadside-curbs",
        material: SURGE_MATERIALS.curbObsidianMetal,
        transforms: curbTransforms,
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "roadside-curbs" })
  );
  builder.add(
    instances
      .custom(buildSleekTrackCurbGlowSpec(), {
        name: "roadside-curb-glow",
        material: SURGE_MATERIALS.neonCyanPractical,
        transforms: curbTransforms,
        colors: curbGlowColors,
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "roadside-curb-glow" })
  );

  return {
    bind(node) {
      const boundGroups = groups.map((g) => ({
        ...g,
        primaryNode: node(g.id),
        accentNode: node(g.accentId)
      }));
      const curbsNode = node("roadside-curbs");
      const curbGlowNode = node("roadside-curb-glow");
      let lastCurbK0 = initK0;
      let curbAnchor = 0;

      return {
        update(travelled, time) {
          for (const g of boundGroups) {
            for (let i = 0; i < g.members.length; i++) {
              writeTransformFor(g.scratch[i]!, g.members[i]!, travelled, time);
            }
            g.primaryNode.setInstances(g.scratch, g.colors);
            g.accentNode.setInstances(g.scratch, g.accentColors);
          }

          const scroll = -travelled;
          const k0 = Math.floor((scroll - CURB_AHEAD) / CURB_SPACING);
          if (k0 !== lastCurbK0) {
            lastCurbK0 = k0;
            curbAnchor = scroll;
            for (let i = 0; i < CURB_COUNT; i++) {
              const k = k0 + i;
              curbTransforms[i]!.position[2] = scrollFrameZ(k * CURB_SPACING, curbAnchor);
              curbGlowColors[i] = (k & 1) === 0 ? "#3ef2ff" : "#ff4fd8";
            }
            curbsNode.setInstances(curbTransforms);
            curbGlowNode.setInstances(curbTransforms, curbGlowColors);
          }
          const curbFrameZ = curbAnchor - scroll;
          curbsNode.setPosition(0, 0, curbFrameZ);
          curbGlowNode.setPosition(0, 0, curbFrameZ);
        }
      };
    }
  };
}
