// Self-contained `assets validate-animation` validator: checks that a character's required
// locomotion/action clips are present in its available clip set (from --clips or the asset
// manifest's animationClips metadata). No external dep so the CLI boundary stays standalone.

export interface AnimationAssetValidationOptions {
  /** Clip names available on the asset (e.g. from GLB animationClips metadata). */
  readonly availableClips: readonly string[];
  /** action -> clip name mapping the project intends to use. */
  readonly clipMap: Readonly<Record<string, string>>;
  /** Required action keys; defaults to a locomotion set. */
  readonly requiredActions?: readonly string[];
  /** Require the asset to declare at least one clip at all (proxy for "rigged/animated"). */
  readonly requireRig?: boolean;
  /**
   * T4.6 (PRD-06) — geometry + clip-duration inspection for hero profiles,
   * filled by the lane's GLB reader (`commands/prd06/validateHero.ts`). Hero
   * profile checks run only when this is present.
   */
  readonly inspection?: AnimationAssetInspection;
  /**
   * T4.6 — a named hero profile (`hero-character` floor; `template-hero` §6.9
   * bar). Profiles add geometry/texture/duration checks and emit reason codes;
   * they never suppress the clip-map messages above.
   */
  readonly profile?: AnimationAssetHeroProfile;
}

/** T4.6 — geometry/texture/duration facts the hero profiles evaluate. */
export interface AnimationAssetInspection {
  readonly triangleCount: number;
  readonly skinCount: number;
  /** Max joints across skins (glTF `skins[].joints.length`). */
  readonly jointCount: number;
  readonly clips: readonly { readonly name: string; readonly duration: number }[];
  readonly hasBaseColorTexture: boolean;
}

export type AnimationAssetHeroProfile = "hero-character" | "template-hero";

export const HERO_NOT_A_CHARACTER = "HERO_NOT_A_CHARACTER";
export const HERO_NO_SKIN = "HERO_NO_SKIN";
export const HERO_TOO_FEW_JOINTS = "HERO_TOO_FEW_JOINTS";
export const HERO_MISSING_CLIP = "HERO_MISSING_CLIP";
export const HERO_CLIP_TOO_SHORT = "HERO_CLIP_TOO_SHORT";
export const HERO_UNTEXTURED = "HERO_UNTEXTURED";

/** §6.9 clip set for `template-hero`; `hero-character` needs the locomotion subset. */
export const HERO_CHARACTER_ACTIONS = ["idle", "walk", "run", "jump-start", "jump-loop", "land"] as const;
export const TEMPLATE_HERO_ACTIONS = [
  ...HERO_CHARACTER_ACTIONS,
  "sprint", "turn-l", "turn-r", "interact", "hit-react", "attack"
] as const;

export interface AnimationAssetHeroProfileDefinition {
  readonly profile: AnimationAssetHeroProfile;
  readonly minTriangles: number;
  readonly minJoints: number;
  readonly requiredActions: readonly string[];
  readonly minClipDuration: number;
}

export const ANIMATION_ASSET_HERO_PROFILES: Record<AnimationAssetHeroProfile, AnimationAssetHeroProfileDefinition> = {
  "hero-character": {
    profile: "hero-character",
    minTriangles: 2_000,
    minJoints: 30,
    requiredActions: HERO_CHARACTER_ACTIONS,
    minClipDuration: 0.2
  },
  "template-hero": {
    profile: "template-hero",
    minTriangles: 15_000,
    minJoints: 50,
    requiredActions: TEMPLATE_HERO_ACTIONS,
    minClipDuration: 0.2
  }
};

export interface AnimationAssetValidationReport {
  readonly ok: boolean;
  readonly messages: readonly string[];
  readonly failures: readonly string[];
  readonly missingActions: readonly string[];
  readonly missingClips: readonly string[];
  /** T4.6 — reason codes for the hero profiles (`[]` on the legacy path). */
  readonly reasonCodes: readonly string[];
}

export const DEFAULT_ANIMATION_ACTIONS = ["idle", "walk", "run"] as const;

export function validateAnimationAssets(options: AnimationAssetValidationOptions): AnimationAssetValidationReport {
  const requiredActions = options.requiredActions ?? DEFAULT_ANIMATION_ACTIONS;
  const available = new Set(options.availableClips);
  const failures: string[] = [];
  const messages: string[] = [];
  const missingActions: string[] = [];
  const missingClips: string[] = [];
  const reasonCodes = new Set<string>();

  if (options.requireRig && available.size === 0) {
    failures.push("asset declares no animation clips (expected a rigged/animated character).");
  }

  for (const action of requiredActions) {
    const clip = options.clipMap[action];
    if (!clip || clip.trim().length === 0) {
      missingActions.push(action);
      failures.push(`required action "${action}" has no clip mapped.`);
      continue;
    }
    if (!available.has(clip)) {
      missingClips.push(clip);
      failures.push(`action "${action}" maps to clip "${clip}", which is not present in the asset's clips.`);
      continue;
    }
    messages.push(`action "${action}" -> "${clip}" OK`);
  }

  const profile = options.profile !== undefined ? ANIMATION_ASSET_HERO_PROFILES[options.profile] : undefined;
  const inspection = options.inspection;
  if (profile !== undefined && inspection !== undefined) {
    // Geometry + texture bar — every code is reported, not just the first.
    if (inspection.triangleCount < profile.minTriangles) {
      reasonCodes.add(HERO_NOT_A_CHARACTER);
      failures.push(
        `${profile.profile}: ${inspection.triangleCount} triangles < ${profile.minTriangles} (${HERO_NOT_A_CHARACTER}).`
      );
    }
    if (inspection.skinCount < 1) {
      reasonCodes.add(HERO_NO_SKIN);
      failures.push(`${profile.profile}: no skinned mesh (${HERO_NO_SKIN}).`);
    }
    if (inspection.jointCount < profile.minJoints) {
      reasonCodes.add(HERO_TOO_FEW_JOINTS);
      failures.push(
        `${profile.profile}: ${inspection.jointCount} joints < ${profile.minJoints} (${HERO_TOO_FEW_JOINTS}).`
      );
    }
    // Clip coverage against the profile's action set — unmapped actions and
    // absent clips both land under HERO_MISSING_CLIP (the union, deduped).
    const durations = new Map(inspection.clips.map((clip) => [clip.name, clip.duration]));
    let missingClip = false;
    for (const action of profile.requiredActions) {
      const clip = options.clipMap[action];
      if (clip === undefined || clip.trim().length === 0 || !durations.has(clip)) {
        missingClip = true;
        if (!missingActions.includes(action)) missingActions.push(action);
        if (clip !== undefined && clip.trim().length > 0 && !missingClips.includes(clip)) missingClips.push(clip);
      }
    }
    if (missingClip) {
      reasonCodes.add(HERO_MISSING_CLIP);
      failures.push(`${profile.profile}: required action(s) unmapped or clip absent (${HERO_MISSING_CLIP}).`);
    }
    for (const action of profile.requiredActions) {
      const clip = options.clipMap[action];
      if (clip === undefined) continue;
      const duration = durations.get(clip);
      if (duration !== undefined && duration < profile.minClipDuration) {
        reasonCodes.add(HERO_CLIP_TOO_SHORT);
        failures.push(
          `${profile.profile}: clip "${clip}" is ${duration.toFixed(3)} s < ${profile.minClipDuration} s (${HERO_CLIP_TOO_SHORT}).`
        );
      }
    }
    if (!inspection.hasBaseColorTexture) {
      reasonCodes.add(HERO_UNTEXTURED);
      failures.push(`${profile.profile}: no baseColor texture (${HERO_UNTEXTURED}).`);
    }
  }

  return {
    ok: failures.length === 0,
    messages,
    failures,
    missingActions,
    missingClips,
    reasonCodes: [...reasonCodes]
  };
}

/** Parse a `--map idle=Idle_Loop,walk=Walk_Loop` style flag into a clip map. */
export function parseAnimationClipMap(raw: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const [action, clip] = pair.split("=");
    if (action && clip) map[action.trim()] = clip.trim();
  }
  return map;
}
