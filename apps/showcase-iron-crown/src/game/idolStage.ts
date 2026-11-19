import { game, group, instances, material, model, primitives, type AuraSceneNode } from "@aura3d/engine";
import { idolModelAsset } from "./idolFighters";

/**
 * Idol wow pass: venue set pieces as Idol image-to-3D GLBs (faces +Z toward the camera, grounded at y = 0, sized to the
 * procedural piece it replaces). Same node name, position and yaw as the procedural build, so grounding rules, tests and
 * camera framing keep working. Returns undefined when the model is not admitted or `?icstage=procedural`, and the
 * caller keeps the procedural set piece.
 */
export function idolSetPiece(
  name: string,
  key: string,
  pos: readonly [number, number, number],
  rotY = 0,
  scale = 1,
  /** Extra yaw on the model inside the piece, for Idol models generated turned away from +Z. */
  modelYaw = 0
): AuraSceneNode | undefined {
  if (typeof location !== "undefined" && new URLSearchParams(location.search).get("icstage") === "procedural") return undefined;
  const asset = idolModelAsset(key);
  if (!asset) return undefined;
  const inner = model(asset, { name: `${name} idol`, scaleMode: "world", castShadow: true, receiveShadow: true });
  if (scale !== 1) inner.scale(scale);
  if (modelYaw !== 0) inner.rotate(0, modelYaw, 0);
  return group(name, [inner as unknown as AuraSceneNode])
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0)
    .toJSON() as AuraSceneNode;
}

/** All pieces, or undefined when any is missing (so a multi-node procedural build is swapped as a whole). */
export function idolSetPieces(pieces: readonly (AuraSceneNode | undefined)[]): AuraSceneNode[] | undefined {
  return pieces.every((p): p is AuraSceneNode => p !== undefined) ? [...pieces] : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Moving parts (Idol MOVING-PARTS pass). Idol returns one rigid mesh, so anything that turns or sways is its own node:
// the radar antenna turns on its own Idol model, the HVAC fans spin as procedural blades on top of the Idol housing,
// the dock cranes slew, and the pines and battle standards bend in the wind (instance wind deform).
// ---------------------------------------------------------------------------------------------------------------

const STEEL = material.pbr({ color: "#4b4f55", roughness: 0.45, metallic: 0.85 });

export type IdolStageMotionKind = "spin" | "slew";
export interface IdolStageMotion {
  readonly id: string;
  readonly kind: IdolStageMotionKind;
  /** spin: rad/s about local Y. slew: amplitude (rad) of a slow back-and-forth about Y. */
  readonly rate: number;
  /** Yaw the node rests at (slew swings around it). */
  readonly baseYaw: number;
  readonly phase: number;
}

/** Every animated set-piece node the stages mount (ids are unique across venues). */
export const IDOL_STAGE_MOTION: IdolStageMotion[] = [];

function disabled(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).get("icstage") === "procedural";
}

/** Rotation (Euler Y) of a moving part at time t (seconds). Pure, for tests and the frame loop. */
export function idolStageMotionYaw(m: IdolStageMotion, t: number): number {
  return m.kind === "spin" ? m.baseYaw + m.rate * t : m.baseYaw + m.rate * Math.sin(t * 0.28 + m.phase);
}

/** Drive every mounted moving part this frame (missing nodes, i.e. other venues, are skipped). */
export function stepIdolStageMotion(t: number, get: (id: string) => { setRotation(x: number, y: number, z: number): unknown } | undefined): number {
  let moved = 0;
  for (const m of IDOL_STAGE_MOTION) {
    const node = get(m.id);
    if (!node) continue;
    node.setRotation(0, idolStageMotionYaw(m, t), 0);
    moved += 1;
  }
  return moved;
}

function register(m: IdolStageMotion): string {
  if (!IDOL_STAGE_MOTION.some((x) => x.id === m.id)) IDOL_STAGE_MOTION.push(m);
  return m.id;
}

const OLIVE = material.pbr({ color: "#4d5236", roughness: 0.7, metallic: 0.35 });
const PANEL = material.pbr({ color: "#2c2f2a", roughness: 0.55, metallic: 0.6 });

/** Procedural search-radar antenna: mast, yoke and a slatted reflector panel (the Idol antenna roll was unusable). */
function radarAntennaParts(name: string): AuraSceneNode[] {
  const parts: AuraSceneNode[] = [
    primitives.cylinder({ name: `${name} mast`, size: [0.12, 0.42, 0.12], position: [0, 0.21, 0], material: OLIVE, castShadow: true, receiveShadow: true }) as unknown as AuraSceneNode,
    primitives.box({ name: `${name} yoke`, size: [0.5, 0.08, 0.14], position: [0, 0.44, 0], material: OLIVE, castShadow: true, receiveShadow: true }) as unknown as AuraSceneNode,
    primitives.box({ name: `${name} reflector`, size: [1.6, 0.62, 0.06], position: [0, 0.8, 0.05], rotation: [-0.22, 0, 0], material: PANEL, castShadow: true, receiveShadow: true }) as unknown as AuraSceneNode
  ];
  for (let k = 0; k < 6; k += 1) {
    parts.push(primitives.box({ name: `${name} slat ${k}`, size: [1.64, 0.035, 0.05], position: [0, 0.55 + k * 0.1, 0.11 - k * 0.022], rotation: [-0.22, 0, 0], material: OLIVE, castShadow: false, receiveShadow: true }) as unknown as AuraSceneNode);
  }
  return parts;
}

/** Radar tower: Idol tower without antenna + a procedural antenna turning about Y on top (about 10 s per turn). */
export function idolRadarPiece(name: string, pos: readonly [number, number, number], rotY = 0): AuraSceneNode | undefined {
  if (disabled()) return undefined;
  const base = idolModelAsset("icAbRadarBase");
  if (!base) return idolSetPiece(name, "icAbRadar", pos, rotY);
  const top = (base.bounds as readonly number[] | undefined)?.[1] ?? 3.5;
  const id = register({ id: `${name}-antenna`, kind: "spin", rate: 0.62, baseYaw: 0, phase: 0 });
  return group(name, [
    model(base, { name: `${name} idol tower`, scaleMode: "world", castShadow: true, receiveShadow: true }) as unknown as AuraSceneNode,
    group(`${name} antenna`, radarAntennaParts(name))
      .position(0, top - 0.04, 0)
      .runtime(game.runtimeNode(id, { tags: ["set-piece", "moving-part"] })) as unknown as AuraSceneNode
  ])
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0)
    .toJSON() as AuraSceneNode;
}

/** Rooftop HVAC: Idol housing + a procedural three-blade fan spinning in the top grille ring. */
export function idolHvacPiece(name: string, pos: readonly [number, number, number], rotY = 0): AuraSceneNode | undefined {
  if (disabled()) return undefined;
  const asset = idolModelAsset("icNtHvac");
  if (!asset) return undefined;
  const top = (asset.bounds as readonly number[] | undefined)?.[1] ?? 1.34;
  const id = register({ id: `${name}-fan`, kind: "spin", rate: 9, baseYaw: 0, phase: 0 });
  const blades = [0, 1, 2].map((k) =>
    primitives.box({ name: `${name} fan blade ${k}`, size: [0.36, 0.012, 0.11], position: [Math.cos((k * 2 * Math.PI) / 3) * 0.19, 0, -Math.sin((k * 2 * Math.PI) / 3) * 0.19], rotation: [0.28, (k * 2 * Math.PI) / 3, 0], material: STEEL, castShadow: false, receiveShadow: false }) as unknown as AuraSceneNode
  );
  const hub = primitives.cylinder({ name: `${name} fan hub`, size: [0.09, 0.05, 0.09], material: STEEL, castShadow: false, receiveShadow: false }) as unknown as AuraSceneNode;
  return group(name, [
    model(asset, { name: `${name} idol`, scaleMode: "world", castShadow: true, receiveShadow: true }) as unknown as AuraSceneNode,
    group(`${name} fan`, [hub, ...blades]).position(0, top - 0.06, 0).runtime(game.runtimeNode(id, { tags: ["set-piece", "moving-part"] })) as unknown as AuraSceneNode
  ])
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0)
    .toJSON() as AuraSceneNode;
}

/** Dock crane that slowly slews its boom back and forth (about 22 s per swing). */
export function idolCranePiece(name: string, pos: readonly [number, number, number], rotY = 0, modelYaw = 0): AuraSceneNode | undefined {
  if (disabled()) return undefined;
  const asset = idolModelAsset("icDkCrane");
  if (!asset) return undefined;
  const id = register({ id: `${name}-slew`, kind: "slew", rate: 0.24, baseYaw: modelYaw, phase: name.endsWith("-r") ? Math.PI : 0 });
  return group(name, [
    group(`${name} slew`, [model(asset, { name: `${name} idol`, scaleMode: "world", castShadow: true, receiveShadow: true }) as unknown as AuraSceneNode])
      .rotate(0, modelYaw, 0)
      .runtime(game.runtimeNode(id, { tags: ["set-piece", "moving-part"] })) as unknown as AuraSceneNode
  ])
    .position(pos[0], pos[1], pos[2])
    .rotate(0, rotY, 0)
    .toJSON() as AuraSceneNode;
}

/** Trees and banners: one instanced Idol model with the engine's instance wind (bends by height, gusts). */
export function idolWindPiece(name: string, key: string, pos: readonly [number, number, number], rotY = 0, strength = 0.6): AuraSceneNode | undefined {
  if (disabled()) return undefined;
  const asset = idolModelAsset(key);
  if (!asset) return undefined;
  const height = (asset.bounds as readonly number[] | undefined)?.[1] ?? 3;
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return group(name, [
    instances.model(asset, {
      name: `${name} idol`,
      scaleMode: "world",
      castShadow: true,
      receiveShadow: true,
      // The wind (packed scatter) path draws its instances in world space and ignores the parent group's transform, so
      // every wind piece stacked at the arena centre (owner: a bonsai pine / battle standard in the middle of the fight).
      // The placement therefore lives on the instance itself; the group stays at the origin.
      transforms: [{ position: [pos[0], pos[1], pos[2]], rotation: [0, rotY, 0] }],
      ...(reduced ? {} : { wind: { strength, gustStrength: strength * 0.6, directionDeg: 80, assetHeight: height } })
    }) as unknown as AuraSceneNode
  ])
    .toJSON() as AuraSceneNode;
}
