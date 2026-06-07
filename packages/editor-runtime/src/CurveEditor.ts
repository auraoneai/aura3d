import { CommandHistory } from "./CommandHistory";
import { KeyframeEditor, readTimelineKeyframes, type TimelineBezierHandle, type TimelineKeyframe, type TimelineKeyframeValue } from "./KeyframeEditor";
import type { TimelineClip } from "./TimelineModel";

export interface TimelineCurvePoint {
  readonly time: number;
  readonly value: number;
}

export interface TimelineCurveSample {
  readonly propertyPath: string;
  readonly time: number;
  readonly value: TimelineKeyframeValue | undefined;
  readonly segmentStartId?: string;
  readonly segmentEndId?: string;
}

export interface TimelineCurveEvidence {
  readonly propertyPath: string;
  readonly keyframeCount: number;
  readonly bezierSegmentCount: number;
  readonly sampledPointCount: number;
  readonly evidence: {
    readonly deterministicSampling: true;
    readonly bezierHandles: boolean;
    readonly holdInterpolation: boolean;
  };
}

export class CurveEditor {
  private readonly keyframes: KeyframeEditor;

  constructor(history = new CommandHistory()) {
    this.keyframes = new KeyframeEditor(history);
  }

  get commandHistory(): CommandHistory {
    return this.keyframes.commandHistory;
  }

  sample(clip: TimelineClip, propertyPath: string, time: number): TimelineCurveSample {
    assertFinite(time, "Curve sample time");
    const keyframes = propertyKeyframes(clip, propertyPath);
    if (keyframes.length === 0) {
      return { propertyPath, time, value: undefined };
    }
    if (time <= keyframes[0].time) {
      return { propertyPath, time, value: keyframes[0].value, segmentStartId: keyframes[0].id };
    }
    const last = keyframes[keyframes.length - 1];
    if (time >= last.time) {
      return { propertyPath, time, value: last.value, segmentStartId: last.id };
    }
    const endIndex = keyframes.findIndex((keyframe) => keyframe.time >= time);
    const start = keyframes[endIndex - 1];
    const end = keyframes[endIndex];
    if (!start || !end) {
      return { propertyPath, time, value: last.value, segmentStartId: last.id };
    }
    return {
      propertyPath,
      time,
      value: sampleSegment(start, end, time),
      segmentStartId: start.id,
      segmentEndId: end.id
    };
  }

  samplePoints(clip: TimelineClip, propertyPath: string, startTime: number, endTime: number, steps: number): readonly TimelineCurvePoint[] {
    assertFinite(startTime, "Curve startTime");
    assertFinite(endTime, "Curve endTime");
    if (endTime < startTime) throw new RangeError("Curve endTime must be greater than or equal to startTime.");
    if (!Number.isInteger(steps) || steps < 1) throw new RangeError("Curve sample steps must be a positive integer.");
    const points: TimelineCurvePoint[] = [];
    for (let index = 0; index <= steps; index += 1) {
      const time = startTime + (endTime - startTime) * (index / steps);
      const value = this.sample(clip, propertyPath, time).value;
      if (typeof value === "number") {
        points.push({ time: Number(time.toFixed(4)), value: Number(value.toFixed(4)) });
      }
    }
    return points;
  }

  async setBezierHandles(
    clip: TimelineClip,
    keyframeId: string,
    handles: { readonly inHandle?: TimelineBezierHandle; readonly outHandle?: TimelineBezierHandle }
  ): Promise<TimelineKeyframe> {
    const keyframes = readTimelineKeyframes(clip);
    const target = keyframes.find((keyframe) => keyframe.id === keyframeId);
    if (!target) throw new Error(`Timeline keyframe does not exist: ${keyframeId}`);
    const updated: TimelineKeyframe = {
      ...target,
      interpolation: "bezier",
      inHandle: handles.inHandle,
      outHandle: handles.outHandle
    };
    await this.keyframes.replaceKeyframes(
      clip,
      keyframes.map((keyframe) => keyframe.id === keyframeId ? updated : keyframe),
      `Set bezier handles ${keyframeId}`
    );
    return updated;
  }

  evidence(clip: TimelineClip, propertyPath: string, sampleCount = 8): TimelineCurveEvidence {
    const keyframes = propertyKeyframes(clip, propertyPath);
    const startTime = keyframes[0]?.time ?? 0;
    const endTime = keyframes[keyframes.length - 1]?.time ?? startTime;
    return {
      propertyPath,
      keyframeCount: keyframes.length,
      bezierSegmentCount: keyframes.filter((keyframe) => keyframe.interpolation === "bezier").length,
      sampledPointCount: this.samplePoints(clip, propertyPath, startTime, endTime, Math.max(1, sampleCount)).length,
      evidence: {
        deterministicSampling: true,
        bezierHandles: keyframes.some((keyframe) => keyframe.inHandle || keyframe.outHandle),
        holdInterpolation: keyframes.some((keyframe) => keyframe.interpolation === "hold")
      }
    };
  }
}

function propertyKeyframes(clip: TimelineClip, propertyPath: string): readonly TimelineKeyframe[] {
  return readTimelineKeyframes(clip).filter((keyframe) => keyframe.propertyPath === propertyPath);
}

function sampleSegment(start: TimelineKeyframe, end: TimelineKeyframe, time: number): TimelineKeyframeValue {
  if (start.interpolation === "hold" || typeof start.value !== "number" || typeof end.value !== "number") {
    return start.value;
  }
  const duration = end.time - start.time;
  const t = duration <= 0 ? 1 : clamp((time - start.time) / duration, 0, 1);
  if (start.interpolation !== "bezier") {
    return Number((start.value + (end.value - start.value) * t).toFixed(4));
  }
  const p0 = start.value;
  const p1 = start.value + (start.outHandle?.value ?? 0);
  const p2 = end.value + (end.inHandle?.value ?? 0);
  const p3 = end.value;
  const inv = 1 - t;
  return Number((inv * inv * inv * p0 + 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t * p3).toFixed(4));
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
