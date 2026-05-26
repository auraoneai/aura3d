import { AnimationClip } from "@aura3d/animation";

export interface AdditiveLayerControls {
  readonly playing: boolean;
  readonly speed: number;
  readonly orbitYaw: number;
  readonly baseClip: string;
  readonly additiveClip: string;
  readonly maskName: string;
  readonly layerWeight: number;
}

export interface AdditiveMask {
  readonly name: string;
  readonly prefixes: readonly string[];
}

export interface AdditiveLayerController {
  readonly baseClips: readonly string[];
  readonly additiveClips: readonly string[];
  readonly masks: readonly AdditiveMask[];
  resolve(controls: AdditiveLayerControls): AdditiveLayerSelection;
}

export interface AdditiveLayerSelection {
  readonly baseClipName: string;
  readonly additiveClipName: string;
  readonly maskedClipName: string;
  readonly maskName: string;
  readonly maskedTrackCount: number;
  readonly sampleCount: number;
}

const MASKS: readonly AdditiveMask[] = [
  { name: "upper body", prefixes: ["Head", "Neck", "Spine", "Chest", "Shoulder", "UpperArm", "LowerArm", "Middle", "Thumb", "Index"] },
  { name: "right arm", prefixes: ["Shoulder.R", "UpperArm.R", "LowerArm.R", "Middle.R", "Thumb.R", "Thumb2.R", "Index.R"] },
  { name: "expression", prefixes: ["Head"] }
];

export function createAdditiveLayerController(clips: readonly AnimationClip[]): AdditiveLayerController {
  const baseClips = preferredNames(clips, [/^Walking$/i, /^Running$/i, /^Idle$/i], /walk|run|idle/i);
  const additiveClips = preferredNames(clips, [/^Wave$/i, /^Punch$/i, /^ThumbsUp$/i, /^Yes$/i], /wave|punch|thumb|yes|no/i);
  const generated = new Map<string, AnimationClip>();

  for (const additive of additiveClips) {
    const clip = requireClip(clips, additive);
    for (const mask of MASKS) {
      const masked = createMaskedClip(clip, mask);
      generated.set(masked.name, masked);
    }
  }

  return {
    baseClips,
    additiveClips,
    masks: MASKS,
    resolve: (controls) => {
      const baseClipName = baseClips.includes(controls.baseClip) ? controls.baseClip : baseClips[0]!;
      const additiveClipName = additiveClips.includes(controls.additiveClip) ? controls.additiveClip : additiveClips[0]!;
      const mask = MASKS.find((item) => item.name === controls.maskName) ?? MASKS[0]!;
      const generatedName = maskedClipName(additiveClipName, mask.name);
      const masked = generated.get(generatedName);
      if (!masked) {
        throw new Error(`Missing additive mask clip ${generatedName}.`);
      }
      return {
        baseClipName,
        additiveClipName,
        maskedClipName: masked.name,
        maskName: mask.name,
        maskedTrackCount: masked.tracks.length,
        sampleCount: controls.layerWeight > 0 ? 2 : 1
      };
    }
  };
}

export function createMaskedAdditiveClips(clips: readonly AnimationClip[]): readonly AnimationClip[] {
  const additiveClips = preferredNames(clips, [/^Wave$/i, /^Punch$/i, /^ThumbsUp$/i, /^Yes$/i], /wave|punch|thumb|yes|no/i)
    .map((name) => requireClip(clips, name));
  return additiveClips.flatMap((clip) => MASKS.map((mask) => createMaskedClip(clip, mask)));
}

function createMaskedClip(clip: AnimationClip, mask: AdditiveMask): AnimationClip {
  const tracks = clip.tracks.filter((track) => captures(track.target, mask.prefixes));
  return new AnimationClip({
    name: maskedClipName(clip.name, mask.name),
    duration: clip.duration,
    tracks: tracks.length > 0 ? tracks : clip.tracks.slice(0, 1)
  });
}

function captures(target: string, prefixes: readonly string[]): boolean {
  const propertySuffixes = [".translation", ".rotation", ".scale", ".weights"] as const;
  const nodeName = propertySuffixes.reduce(
    (name, suffix) => name.endsWith(suffix) ? name.slice(0, -suffix.length) : name,
    target
  );
  return prefixes.some((prefix) => nodeName === prefix || nodeName.startsWith(prefix));
}

function maskedClipName(clipName: string, maskName: string): string {
  return `${clipName} [${maskName}]`;
}

function preferredNames(clips: readonly AnimationClip[], exact: readonly RegExp[], fallback: RegExp): readonly string[] {
  const names: string[] = [];
  for (const pattern of exact) {
    const found = clips.find((clip) => pattern.test(clip.name));
    if (found && !names.includes(found.name)) names.push(found.name);
  }
  for (const clip of clips) {
    if (fallback.test(clip.name) && !names.includes(clip.name)) names.push(clip.name);
  }
  if (names.length === 0 && clips[0]) names.push(clips[0].name);
  return names;
}

function requireClip(clips: readonly AnimationClip[], name: string): AnimationClip {
  const clip = clips.find((item) => item.name === name);
  if (!clip) {
    throw new Error(`Animation clip ${name} was not found.`);
  }
  return clip;
}
