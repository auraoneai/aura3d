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
}

export interface AnimationAssetValidationReport {
  readonly ok: boolean;
  readonly messages: readonly string[];
  readonly failures: readonly string[];
  readonly missingActions: readonly string[];
  readonly missingClips: readonly string[];
}

export const DEFAULT_ANIMATION_ACTIONS = ["idle", "walk", "run"] as const;

export function validateAnimationAssets(options: AnimationAssetValidationOptions): AnimationAssetValidationReport {
  const requiredActions = options.requiredActions ?? DEFAULT_ANIMATION_ACTIONS;
  const available = new Set(options.availableClips);
  const failures: string[] = [];
  const messages: string[] = [];
  const missingActions: string[] = [];
  const missingClips: string[] = [];

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

  return {
    ok: failures.length === 0,
    messages,
    failures,
    missingActions,
    missingClips
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
