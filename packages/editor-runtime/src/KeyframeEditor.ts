import type { Command } from "./Command";
import { CommandHistory } from "./CommandHistory";
import type { TimelineClip } from "./TimelineModel";

export type TimelineKeyframeValue = number | string | boolean;
export type TimelineKeyframeInterpolation = "hold" | "linear" | "bezier";

export interface TimelineBezierHandle {
  readonly time: number;
  readonly value: number;
}

export interface TimelineKeyframe {
  readonly id: string;
  readonly propertyPath: string;
  readonly time: number;
  readonly value: TimelineKeyframeValue;
  readonly interpolation: TimelineKeyframeInterpolation;
  readonly inHandle?: TimelineBezierHandle;
  readonly outHandle?: TimelineBezierHandle;
}

export interface CreateTimelineKeyframeOptions {
  readonly id?: string;
  readonly propertyPath: string;
  readonly time: number;
  readonly value: TimelineKeyframeValue;
  readonly interpolation?: TimelineKeyframeInterpolation;
  readonly inHandle?: TimelineBezierHandle;
  readonly outHandle?: TimelineBezierHandle;
}

export interface PasteTimelineKeyframesOptions {
  readonly timeOffset?: number;
  readonly idPrefix?: string;
  readonly propertyPath?: string;
}

const KEYFRAME_PROPERTY = "auraKeyframes";

export function readTimelineKeyframes(clip: TimelineClip): readonly TimelineKeyframe[] {
  const encoded = clip.properties[KEYFRAME_PROPERTY];
  if (typeof encoded !== "string" || encoded.trim().length === 0) return [];
  const parsed = JSON.parse(encoded) as TimelineKeyframe[];
  if (!Array.isArray(parsed)) {
    throw new Error(`Timeline clip keyframes must decode to an array: ${clip.id}`);
  }
  return parsed.map(normalizeKeyframe).sort(compareKeyframes);
}

export function encodeTimelineKeyframes(keyframes: readonly TimelineKeyframe[]): string {
  return JSON.stringify([...keyframes].map(normalizeKeyframe).sort(compareKeyframes));
}

export function timelineKeyframesByProperty(clip: TimelineClip, propertyPath: string): readonly TimelineKeyframe[] {
  return readTimelineKeyframes(clip).filter((keyframe) => keyframe.propertyPath === propertyPath);
}

export class KeyframeEditor {
  constructor(private readonly history = new CommandHistory()) {}

  get commandHistory(): CommandHistory {
    return this.history;
  }

  keyframes(clip: TimelineClip, propertyPath?: string): readonly TimelineKeyframe[] {
    const keyframes = readTimelineKeyframes(clip);
    return propertyPath ? keyframes.filter((keyframe) => keyframe.propertyPath === propertyPath) : keyframes;
  }

  async addKeyframe(clip: TimelineClip, options: CreateTimelineKeyframeOptions): Promise<TimelineKeyframe> {
    const keyframe = normalizeKeyframe({
      id: options.id ?? stableKeyframeId(options.propertyPath, options.time),
      propertyPath: options.propertyPath,
      time: options.time,
      value: options.value,
      interpolation: options.interpolation ?? "linear",
      inHandle: options.inHandle,
      outHandle: options.outHandle
    });
    const next = [...readTimelineKeyframes(clip).filter((candidate) => candidate.id !== keyframe.id), keyframe];
    await this.applyKeyframes(clip, next, `Add keyframe ${keyframe.id}`);
    return keyframe;
  }

  async deleteKeyframes(clip: TimelineClip, ids: readonly string[]): Promise<void> {
    const remove = new Set(ids);
    await this.applyKeyframes(clip, readTimelineKeyframes(clip).filter((keyframe) => !remove.has(keyframe.id)), `Delete ${ids.length} keyframes`);
  }

  async moveKeyframes(clip: TimelineClip, ids: readonly string[], deltaTime: number): Promise<readonly TimelineKeyframe[]> {
    assertFinite(deltaTime, "Keyframe deltaTime");
    const move = new Set(ids);
    const next = readTimelineKeyframes(clip).map((keyframe) => move.has(keyframe.id)
      ? normalizeKeyframe({ ...keyframe, time: Math.max(0, keyframe.time + deltaTime) })
      : keyframe);
    await this.applyKeyframes(clip, next, `Move ${ids.length} keyframes`);
    return next.filter((keyframe) => move.has(keyframe.id));
  }

  async scaleKeyframes(clip: TimelineClip, ids: readonly string[], pivotTime: number, scale: number): Promise<readonly TimelineKeyframe[]> {
    assertFinite(pivotTime, "Keyframe pivotTime");
    assertFinite(scale, "Keyframe scale");
    if (scale <= 0) throw new RangeError("Keyframe scale must be positive.");
    const scaleIds = new Set(ids);
    const next = readTimelineKeyframes(clip).map((keyframe) => scaleIds.has(keyframe.id)
      ? normalizeKeyframe({ ...keyframe, time: Math.max(0, pivotTime + (keyframe.time - pivotTime) * scale) })
      : keyframe);
    await this.applyKeyframes(clip, next, `Scale ${ids.length} keyframes`);
    return next.filter((keyframe) => scaleIds.has(keyframe.id));
  }

  copyKeyframes(clip: TimelineClip, ids: readonly string[]): readonly TimelineKeyframe[] {
    const copy = new Set(ids);
    return readTimelineKeyframes(clip).filter((keyframe) => copy.has(keyframe.id)).map((keyframe) => ({ ...keyframe }));
  }

  async pasteKeyframes(
    clip: TimelineClip,
    keyframes: readonly TimelineKeyframe[],
    options: PasteTimelineKeyframesOptions = {}
  ): Promise<readonly TimelineKeyframe[]> {
    const timeOffset = options.timeOffset ?? 0;
    assertFinite(timeOffset, "Paste keyframe timeOffset");
    const prefix = options.idPrefix ?? "pasted";
    const pasted = keyframes.map((keyframe, index) => normalizeKeyframe({
      ...keyframe,
      id: `${prefix}-${keyframe.id}-${index}`,
      propertyPath: options.propertyPath ?? keyframe.propertyPath,
      time: Math.max(0, keyframe.time + timeOffset)
    }));
    await this.applyKeyframes(clip, [...readTimelineKeyframes(clip), ...pasted], `Paste ${pasted.length} keyframes`);
    return pasted;
  }

  async replaceKeyframes(clip: TimelineClip, keyframes: readonly TimelineKeyframe[], label = "Replace keyframes"): Promise<void> {
    await this.applyKeyframes(clip, keyframes, label);
  }

  private async applyKeyframes(clip: TimelineClip, keyframes: readonly TimelineKeyframe[], name: string): Promise<void> {
    await this.history.execute(new SetClipKeyframesCommand(clip, keyframes, name));
  }
}

class SetClipKeyframesCommand implements Command {
  readonly name: string;
  private readonly before: readonly TimelineKeyframe[];
  private readonly after: readonly TimelineKeyframe[];

  constructor(private readonly clip: TimelineClip, keyframes: readonly TimelineKeyframe[], name: string) {
    this.name = name;
    this.before = readTimelineKeyframes(clip);
    this.after = [...keyframes].map(normalizeKeyframe).sort(compareKeyframes);
  }

  execute(): void {
    this.write(this.after);
  }

  undo(): void {
    this.write(this.before);
  }

  private write(keyframes: readonly TimelineKeyframe[]): void {
    if (keyframes.length === 0) {
      delete this.clip.properties[KEYFRAME_PROPERTY];
      return;
    }
    this.clip.properties[KEYFRAME_PROPERTY] = encodeTimelineKeyframes(keyframes);
  }
}

function normalizeKeyframe(keyframe: TimelineKeyframe): TimelineKeyframe {
  if (!keyframe.id.trim()) throw new Error("Timeline keyframe id is required.");
  if (!keyframe.propertyPath.trim()) throw new Error("Timeline keyframe propertyPath is required.");
  assertFinite(keyframe.time, "Timeline keyframe time");
  if (keyframe.time < 0) throw new RangeError("Timeline keyframe time must be non-negative.");
  validateKeyframeValue(keyframe.value);
  validateHandle(keyframe.inHandle, "inHandle");
  validateHandle(keyframe.outHandle, "outHandle");
  return {
    id: keyframe.id,
    propertyPath: keyframe.propertyPath,
    time: Number(keyframe.time.toFixed(4)),
    value: keyframe.value,
    interpolation: keyframe.interpolation,
    inHandle: keyframe.inHandle,
    outHandle: keyframe.outHandle
  };
}

function validateKeyframeValue(value: TimelineKeyframeValue): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Timeline keyframe numeric values must be finite.");
  }
}

function validateHandle(handle: TimelineBezierHandle | undefined, label: string): void {
  if (!handle) return;
  assertFinite(handle.time, `Timeline keyframe ${label}.time`);
  assertFinite(handle.value, `Timeline keyframe ${label}.value`);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function compareKeyframes(left: TimelineKeyframe, right: TimelineKeyframe): number {
  return left.time - right.time || left.propertyPath.localeCompare(right.propertyPath) || left.id.localeCompare(right.id);
}

function stableKeyframeId(propertyPath: string, time: number): string {
  return `key-${propertyPath.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "value"}-${Number(time.toFixed(4)).toString().replace(".", "-")}`;
}
