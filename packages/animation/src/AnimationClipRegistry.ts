import {
  normalizeClipEvents,
  type AnimationClipEvent
} from "./AnimationClipEvents.js";

export type AnimationClipId = string;

export type AnimationTrackTarget =
  | "translation"
  | "rotation"
  | "scale"
  | "morph"
  | "material"
  | "visibility"
  | (string & {});

export interface AnimationKeyframe<TValue = unknown> {
  readonly time: number;
  readonly value: TValue;
  readonly easing?: string;
}

export interface AnimationTrack<TValue = unknown> {
  readonly id?: string;
  readonly target: string;
  readonly property?: AnimationTrackTarget;
  readonly keyframes?: readonly AnimationKeyframe<TValue>[];
  readonly metadata?: Record<string, unknown>;
}

export interface AnimationClipSampleContext<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> {
  readonly clip: RegisteredAnimationClip<TClipId, TEvent>;
  readonly time: number;
  readonly normalizedTime: number;
  readonly playbackState?: unknown;
}

export type AnimationClipSampler<
  TPose = unknown,
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> = (context: AnimationClipSampleContext<TClipId, TEvent>) => TPose;

export interface AnimationClipDefinition<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent,
  TPose = unknown
> {
  readonly id: TClipId;
  readonly name?: string;
  readonly duration: number;
  readonly frameRate?: number;
  readonly loop?: boolean;
  readonly tags?: readonly string[];
  readonly tracks?: readonly AnimationTrack[];
  readonly events?: readonly TEvent[];
  readonly sample?: AnimationClipSampler<TPose, TClipId, TEvent>;
  readonly source?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RegisteredAnimationClip<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent,
  TPose = unknown
> extends AnimationClipDefinition<TClipId, TEvent, TPose> {
  readonly duration: number;
  readonly loop: boolean;
  readonly tags: readonly string[];
  readonly tracks: readonly AnimationTrack[];
  readonly events: readonly TEvent[];
  readonly registryIndex: number;
}

export interface AnimationClipRegistryOptions {
  readonly replace?: boolean;
}

export type AnimationClipRegistryDiagnosticSeverity = "info" | "warning" | "error";

export interface AnimationClipRegistryDiagnostic<TClipId extends string = string> {
  readonly severity: AnimationClipRegistryDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly clipId?: TClipId;
}

export interface CartoonClipMapReadinessOptions<TClipId extends string = string> {
  readonly requiredActions?: readonly string[] | undefined;
  readonly clipMap: Readonly<Record<string, TClipId | readonly TClipId[] | undefined>>;
  readonly aliases?: Readonly<Record<string, string>> | undefined;
  readonly segmentedFallbackDeclared?: boolean | undefined;
}

export interface CartoonClipMapReadiness<TClipId extends string = string> {
  readonly ok: boolean;
  readonly segmentedFallbackDeclared: boolean;
  readonly requiredActions: readonly string[];
  readonly missingActions: readonly string[];
  readonly missingClipIds: readonly TClipId[];
  readonly aliasActions: readonly string[];
  readonly diagnostics: readonly AnimationClipRegistryDiagnostic<TClipId>[];
}

export interface AnimationClipManifest<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent,
  TPose = unknown
> {
  readonly clips: readonly AnimationClipDefinition<TClipId, TEvent, TPose>[];
}

export class AnimationClipRegistry<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent,
  TPose = unknown
> {
  private readonly clips = new Map<TClipId, RegisteredAnimationClip<TClipId, TEvent, TPose>>();
  private nextRegistryIndex = 0;

  constructor(
    clips: readonly AnimationClipDefinition<TClipId, TEvent, TPose>[] = [],
    options: AnimationClipRegistryOptions = {}
  ) {
    this.registerMany(clips, options);
  }

  static fromManifest<
    TClipId extends string = string,
    TEvent extends AnimationClipEvent = AnimationClipEvent,
    TPose = unknown
  >(
    manifest: AnimationClipManifest<TClipId, TEvent, TPose>,
    options: AnimationClipRegistryOptions = {}
  ): AnimationClipRegistry<TClipId, TEvent, TPose> {
    return new AnimationClipRegistry(manifest.clips, options);
  }

  register(
    definition: AnimationClipDefinition<TClipId, TEvent, TPose>,
    options: AnimationClipRegistryOptions = {}
  ): RegisteredAnimationClip<TClipId, TEvent, TPose> {
    validateClipDefinition(definition);

    if (!options.replace && this.clips.has(definition.id)) {
      throw new Error(`Animation clip "${definition.id}" is already registered.`);
    }

    const registered: RegisteredAnimationClip<TClipId, TEvent, TPose> = {
      ...definition,
      duration: sanitizeDuration(definition.duration),
      loop: definition.loop ?? true,
      tags: [...(definition.tags ?? [])],
      tracks: [...(definition.tracks ?? [])],
      events: normalizeClipEvents(definition.events),
      registryIndex: this.nextRegistryIndex
    };

    this.nextRegistryIndex += 1;
    this.clips.set(registered.id, registered);
    return registered;
  }

  registerMany(
    definitions: readonly AnimationClipDefinition<TClipId, TEvent, TPose>[],
    options: AnimationClipRegistryOptions = {}
  ): readonly RegisteredAnimationClip<TClipId, TEvent, TPose>[] {
    return definitions.map((definition) => this.register(definition, options));
  }

  get(id: TClipId): RegisteredAnimationClip<TClipId, TEvent, TPose> | undefined {
    return this.clips.get(id);
  }

  require(id: TClipId): RegisteredAnimationClip<TClipId, TEvent, TPose> {
    const clip = this.get(id);
    if (!clip) {
      throw new Error(`Animation clip "${id}" is not registered.`);
    }

    return clip;
  }

  has(id: TClipId): boolean {
    return this.clips.has(id);
  }

  remove(id: TClipId): boolean {
    return this.clips.delete(id);
  }

  clear(): void {
    this.clips.clear();
  }

  ids(): readonly TClipId[] {
    return [...this.clips.keys()];
  }

  list(): readonly RegisteredAnimationClip<TClipId, TEvent, TPose>[] {
    return [...this.clips.values()].sort((a, b) => a.registryIndex - b.registryIndex);
  }

  findByTag(tag: string): readonly RegisteredAnimationClip<TClipId, TEvent, TPose>[] {
    return this.list().filter((clip) => clip.tags.includes(tag));
  }

  toManifest(): AnimationClipManifest<TClipId, TEvent, TPose> {
    return {
      clips: this.list()
    };
  }

  diagnose(): readonly AnimationClipRegistryDiagnostic<TClipId>[] {
    const diagnostics: AnimationClipRegistryDiagnostic<TClipId>[] = [];

    if (this.clips.size === 0) {
      diagnostics.push({
        severity: "warning",
        code: "ANIMATION_REGISTRY_EMPTY",
        message: "No animation clips are registered."
      });
      return diagnostics;
    }

    for (const clip of this.list()) {
      if (clip.duration <= 0) {
        diagnostics.push({
          severity: "error",
          code: "ANIMATION_CLIP_DURATION_INVALID",
          message: `Animation clip "${clip.id}" must have a positive duration.`,
          clipId: clip.id
        });
      }

      if (clip.frameRate !== undefined && (!Number.isFinite(clip.frameRate) || clip.frameRate <= 0)) {
        diagnostics.push({
          severity: "warning",
          code: "ANIMATION_CLIP_FRAME_RATE_INVALID",
          message: `Animation clip "${clip.id}" has an invalid frame rate.`,
          clipId: clip.id
        });
      }

      if (clip.tracks.length === 0 && !clip.sample) {
        diagnostics.push({
          severity: "info",
          code: "ANIMATION_CLIP_NO_SAMPLE_SOURCE",
          message: `Animation clip "${clip.id}" has no tracks or sampler. capturePose() will return an empty pose for it.`,
          clipId: clip.id
        });
      }

      for (const event of clip.events) {
        if (!Number.isFinite(event.time) || event.time < 0 || event.time > clip.duration) {
          diagnostics.push({
            severity: "warning",
            code: "ANIMATION_CLIP_EVENT_TIME_OUT_OF_RANGE",
            message: `Animation event "${event.name}" is outside the duration of clip "${clip.id}".`,
            clipId: clip.id
          });
        }
      }
    }

    return diagnostics;
  }
}

export function createAnimationClipRegistry<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent,
  TPose = unknown
>(
  clips: readonly AnimationClipDefinition<TClipId, TEvent, TPose>[] = [],
  options: AnimationClipRegistryOptions = {}
): AnimationClipRegistry<TClipId, TEvent, TPose> {
  return new AnimationClipRegistry(clips, options);
}

export function validateCartoonClipMap<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent,
  TPose = unknown
>(
  registry: AnimationClipRegistry<TClipId, TEvent, TPose>,
  options: CartoonClipMapReadinessOptions<TClipId>
): CartoonClipMapReadiness<TClipId> {
  const requiredActions = options.requiredActions ?? ["speak", "listen", "gesture", "walk", "action"];
  const missingActions: string[] = [];
  const missingClipIds: TClipId[] = [];
  const aliasActions: string[] = [];
  const diagnostics: AnimationClipRegistryDiagnostic<TClipId>[] = [];

  for (const action of requiredActions) {
    const mapped = options.clipMap[action] ?? options.clipMap[options.aliases?.[action] ?? ""];
    if (options.aliases?.[action]) aliasActions.push(action);
    const clipIds = Array.isArray(mapped) ? mapped : mapped ? [mapped] : [];
    if (clipIds.length === 0) {
      missingActions.push(action);
      diagnostics.push({
        severity: options.segmentedFallbackDeclared ? "warning" : "error",
        code: "CARTOON_CLIP_ACTION_MISSING",
        message: `Cartoon action "${action}" is missing a clip map entry.`
      });
      continue;
    }
    for (const clipId of clipIds) {
      if (!registry.has(clipId)) {
        missingClipIds.push(clipId);
        diagnostics.push({
          severity: options.segmentedFallbackDeclared ? "warning" : "error",
          code: "CARTOON_CLIP_ID_MISSING",
          message: `Cartoon action "${action}" references missing clip "${clipId}".`,
          clipId
        });
      }
    }
  }

  return {
    ok: options.segmentedFallbackDeclared ? missingActions.length === 0 : diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    segmentedFallbackDeclared: options.segmentedFallbackDeclared === true,
    requiredActions,
    missingActions,
    missingClipIds,
    aliasActions,
    diagnostics
  };
}

function validateClipDefinition(definition: AnimationClipDefinition): void {
  if (!definition.id) {
    throw new Error("Animation clips must have a stable id.");
  }

  if (!Number.isFinite(definition.duration) || definition.duration < 0) {
    throw new Error(`Animation clip "${definition.id}" has an invalid duration.`);
  }
}

function sanitizeDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration < 0) return 0;
  return duration;
}
