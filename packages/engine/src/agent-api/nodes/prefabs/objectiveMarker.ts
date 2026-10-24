import type { AuraColor, AuraSceneNode, AuraVec3 } from "../types.js";
import { material } from "../material.js";
import { primitives } from "../primitives.js";

export interface AuraObjectiveMarkerOptions {
  /** Prefix of the runtime ids (`<id>-ring`, `-rim`, `-halo`, `-beam`, `-arrow`). Default `objective`. */
  readonly id?: string;
  /** Ring diameter in world units. Every other dimension scales from it. Default 4. */
  readonly diameter?: number;
  /** Light-column height as a multiple of the diameter. Default 5.45 (the beacon proportion the Silt & Signal port tuned). */
  readonly beamHeight?: number;
  readonly color?: AuraColor;
  readonly rimColor?: AuraColor;
  readonly haloColor?: AuraColor;
  readonly bodyColor?: AuraColor;
  /** Add a bobbing arrow above the ring. Default false. */
  readonly arrow?: boolean;
  /** Where the parts start; hidden markers sit here. Default far below the world. */
  readonly hiddenPosition?: AuraVec3;
}

export type AuraObjectiveMarkerPart = "ring" | "rim" | "halo" | "beam" | "arrow";

export interface AuraObjectiveMarkerPose {
  readonly position: AuraVec3;
  readonly scale: AuraVec3;
}

export type AuraObjectiveMarkerPoses = Readonly<Partial<Record<AuraObjectiveMarkerPart, AuraObjectiveMarkerPose>>>;

const HIDDEN: AuraVec3 = [0, -400, 0];
const BEAM_HEIGHT = 360 / 66;

export const objectiveMarkerId = (id: string, part: AuraObjectiveMarkerPart): string => `${id}-${part}`;

/** Ring, rim, expanding halo, light column and optional arrow, all solid emissive meshes so they survive every backend. */
export function objectiveMarker(options: AuraObjectiveMarkerOptions = {}): readonly AuraSceneNode[] {
  const id = options.id ?? "objective";
  const d = options.diameter ?? 4;
  const hidden = options.hiddenPosition ?? HIDDEN;
  const beamH = d * (options.beamHeight ?? BEAM_HEIGHT);
  const rimColor = options.rimColor ?? options.color ?? "#19e6ff";
  const nodes: AuraSceneNode[] = [
    primitives.torus({
      name: objectiveMarkerId(id, "ring"),
      position: [hidden[0], hidden[1], hidden[2]],
      size: [d, d, d],
      params: { tube: 0.085 },
      material: material.emissive({ color: options.bodyColor ?? "#021015", emissiveIntensity: 0.1 })
    }).runtime({ id: objectiveMarkerId(id, "ring") }).toJSON(),
    primitives.torus({
      name: objectiveMarkerId(id, "rim"),
      position: [hidden[0], hidden[1], hidden[2]],
      size: [d * (76 / 66), d * (76 / 66), d * (76 / 66)],
      params: { tube: 0.022 },
      material: material.emissive({ color: rimColor, emissiveIntensity: 3.4 })
    }).runtime({ id: objectiveMarkerId(id, "rim") }).toJSON(),
    primitives.torus({
      name: objectiveMarkerId(id, "halo"),
      position: [hidden[0], hidden[1], hidden[2]],
      size: [d, d, d],
      params: { tube: 0.018 },
      material: material.emissive({ color: options.haloColor ?? "#7df3ff", emissiveIntensity: 2.6 })
    }).runtime({ id: objectiveMarkerId(id, "halo") }).toJSON(),
    primitives.cylinder({
      name: objectiveMarkerId(id, "beam"),
      position: [hidden[0], hidden[1], hidden[2]],
      size: [d * (5.5 / 66), beamH, d * (5.5 / 66)],
      material: material.emissive({ color: rimColor, emissiveIntensity: 2.2 })
    }).runtime({ id: objectiveMarkerId(id, "beam") }).toJSON()
  ];
  if (options.arrow) {
    nodes.push(
      primitives.cone({
        name: objectiveMarkerId(id, "arrow"),
        position: [hidden[0], hidden[1], hidden[2]],
        rotation: [Math.PI, 0, 0],
        size: [d * 0.18, d * 0.3, d * 0.18],
        material: material.emissive({ color: rimColor, emissiveIntensity: 3 })
      }).runtime({ id: objectiveMarkerId(id, "arrow") }).toJSON()
    );
  }
  return nodes;
}

/**
 * Pure per-frame pose for the parts of an `objectiveMarker`. Pass `null` for no active objective: every part goes to
 * `hiddenPosition`. The ring pulses (+-3.5%), the halo ripples outward once every 1.25 s, the beam sits 170/360 of its height above the target (base just below the ring).
 */
export function objectiveMarkerPoses(
  target: AuraVec3 | null,
  time: number,
  options: Pick<AuraObjectiveMarkerOptions, "diameter" | "beamHeight" | "arrow" | "hiddenPosition"> = {}
): AuraObjectiveMarkerPoses {
  const d = options.diameter ?? 4;
  const hidden = options.hiddenPosition ?? HIDDEN;
  const one: AuraVec3 = [1, 1, 1];
  const hide = (): AuraObjectiveMarkerPose => ({ position: hidden, scale: one });
  if (!target) {
    return { ring: hide(), rim: hide(), halo: hide(), beam: hide(), ...(options.arrow ? { arrow: hide() } : {}) };
  }
  const [x, y, z] = target;
  const pulse = 1 + 0.035 * Math.sin(time * 5);
  const ripple = 1 + ((time * 0.8) % 1) * 0.5;
  const beamH = d * (options.beamHeight ?? BEAM_HEIGHT);
  return {
    ring: { position: [x, y, z], scale: [pulse, pulse, pulse] },
    rim: { position: [x, y, z], scale: [pulse, pulse, pulse] },
    halo: { position: [x, y, z], scale: [ripple, ripple, ripple] },
    beam: { position: [x, y + beamH * (170 / 360), z], scale: one },
    ...(options.arrow ? { arrow: { position: [x, y + d * 0.8 + 0.12 * d * Math.sin(time * 3), z] as AuraVec3, scale: one } } : {})
  };
}
