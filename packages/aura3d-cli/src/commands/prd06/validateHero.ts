/**
 * T4.6 (PRD-06 §6.9, C-39) — `aura3d animation validate-hero <glb>
 * [--profile hero-character|template-hero]`: a lane-owned GLB reader that fills
 * `AnimationAssetInspection` (triangles, skins, joints, clips, baseColor) plus
 * a deterministic clip-map derivation for the profile's required actions.
 * Reuses {@link inspectAnimationClips} (T0.7) — nothing from CLI index.ts.
 */

import {
  validateAnimationAssets,
  ANIMATION_ASSET_HERO_PROFILES,
  type AnimationAssetHeroProfile,
  type AnimationAssetInspection,
  type AnimationAssetValidationReport
} from "../../animation-asset-validator.js";
import { inspectAnimationClips, readGlbDocument, type GltfAnimationDocument } from "./inspectAnimationClips.js";

const MODE_TRIANGLES = 4;

/** Geometry/texture facts a hero profile needs, straight from the GLB JSON. */
export function inspectHeroGeometry(json: GltfAnimationDocument): Pick<AnimationAssetInspection, "triangleCount" | "skinCount" | "jointCount" | "hasBaseColorTexture"> {
  const accessors = json.accessors ?? [];
  let triangles = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if ((primitive.mode ?? MODE_TRIANGLES) !== MODE_TRIANGLES) continue;
      const indexAccessor = primitive.indices === undefined ? undefined : accessors[primitive.indices];
      const positionAccessor = primitive.attributes?.POSITION === undefined ? undefined : accessors[primitive.attributes.POSITION];
      const count = indexAccessor?.count ?? positionAccessor?.count ?? 0;
      triangles += Math.floor(count / 3);
    }
  }
  const skins = json.skins ?? [];
  return {
    triangleCount: triangles,
    skinCount: skins.length,
    jointCount: skins.reduce((max, skin) => Math.max(max, skin.joints?.length ?? 0), 0),
    hasBaseColorTexture: (json.materials ?? []).some(
      (material) => material?.pbrMetallicRoughness?.baseColorTexture !== undefined
    )
  };
}

/**
 * Deterministic action→clip derivation for `validate-hero` when no `--map`
 * override is given: normalise names (lowercase, non-alphanumeric runs → "-"),
 * then match an action to the first clip whose normalised name contains the
 * action (via its alias list — e.g. "jump-start" matches "JumpStart" and
 * "Jump_Start"). Unmatched actions stay unmapped → HERO_MISSING_CLIP.
 */
const ACTION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "jump-start": ["jump-start", "jumpstart", "jump-up", "jumpbegin", "jump-begin"],
  "jump-loop": ["jump-loop", "jumploop", "airborne", "fall-loop", "fallloop", "jump-air", "in-air"],
  land: ["land", "landing"],
  "turn-l": ["turn-l", "turnl", "turn-left", "turnleft", "turn-90l", "turnl90", "turn-left-90"],
  "turn-r": ["turn-r", "turnr", "turn-right", "turnright", "turn-90r", "turnr90", "turn-right-90"],
  "hit-react": ["hit-react", "hitreact", "hit", "flinch", "impact"],
  interact: ["interact", "use", "pickup", "pick-up"],
  attack: ["attack", "punch", "kick", "slash", "swing"],
  idle: ["idle", "tpose", "t-pose", "stance"],
  walk: ["walk", "walkcycle", "walk-cycle"],
  run: ["run", "runcycle", "run-cycle", "jog"],
  sprint: ["sprint", "dash"]
};

function normalizeClipName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveHeroClipMap(
  clipNames: readonly string[],
  requiredActions: readonly string[]
): Record<string, string> {
  const normalized = clipNames.map((name) => ({ raw: name, norm: normalizeClipName(name) }));
  const map: Record<string, string> = {};
  for (const action of requiredActions) {
    const aliases = (ACTION_ALIASES[action] ?? [action]).map(normalizeClipName);
    const hit = normalized.find((clip) => aliases.some((alias) => clip.norm.includes(alias)));
    if (hit) map[action] = hit.raw;
  }
  return map;
}

/** Full GLB → validation report for `aura3d animation validate-hero`. */
export function validateHeroGlb(
  buffer: Uint8Array,
  options: { readonly profile?: AnimationAssetHeroProfile; readonly clipMap?: Readonly<Record<string, string>> } = {}
): AnimationAssetValidationReport {
  const { json, bin } = readGlbDocument(buffer);
  const profile = options.profile ?? "hero-character";
  const definition = ANIMATION_ASSET_HERO_PROFILES[profile];
  const clips = inspectAnimationClips(json, bin).map((clip) => ({ name: clip.name, duration: clip.duration }));
  const inspection: AnimationAssetInspection = {
    ...inspectHeroGeometry(json),
    clips
  };
  const clipMap = options.clipMap ?? deriveHeroClipMap(clips.map((c) => c.name), definition.requiredActions);
  return validateAnimationAssets({
    availableClips: clips.map((c) => c.name),
    clipMap,
    requiredActions: definition.requiredActions,
    profile,
    inspection
  });
}
