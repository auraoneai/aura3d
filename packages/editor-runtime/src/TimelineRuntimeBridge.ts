import { TimelineModel } from "./TimelineModel";
import type {
  TimelineActiveClipSnapshot,
  TimelineClipBlendMode,
  TimelineSignalEventSnapshot,
  TimelineSnapshot
} from "./TimelineModel";

export interface TimelineRuntimeBindingConfig {
  readonly trackId?: string;
  readonly trackName?: string;
  readonly targetId: string;
  readonly assetId?: string;
  readonly clipNameMap?: Record<string, string>;
}

export interface TimelineRuntimeAnimationApplication {
  readonly targetId: string;
  readonly trackId: string;
  readonly trackName: string;
  readonly clipId: string;
  readonly clipName: string;
  readonly assetId?: string;
  readonly localTime: number;
  readonly assetTime: number;
  readonly normalizedTime: number;
  readonly blendWeight: number;
  readonly blendMode: TimelineClipBlendMode;
  readonly playback: TimelineSnapshot["playback"];
  readonly properties: Record<string, string | number | boolean>;
}

export interface TimelineRuntimeSignalDispatch {
  readonly targetId?: string;
  readonly trackId: string;
  readonly trackName: string;
  readonly clipId: string;
  readonly clipName: string;
  readonly event: string;
  readonly time: number;
  readonly localTime: number;
  readonly properties: Record<string, string | number | boolean>;
}

export interface TimelineRuntimeTarget {
  readonly id: string;
  applyTimelineAnimation?(application: TimelineRuntimeAnimationApplication): void;
  applyTimelineSignal?(dispatch: TimelineRuntimeSignalDispatch): void;
  snapshot?(): unknown;
}

export interface TimelineRuntimeBridgeConfig {
  readonly timeline: TimelineModel;
  readonly targets: readonly TimelineRuntimeTarget[];
  readonly bindings?: readonly TimelineRuntimeBindingConfig[];
  readonly strictBindings?: boolean;
  readonly dispatchSignals?: boolean;
}

export interface TimelineRuntimeTargetSnapshot {
  readonly id: string;
  readonly appliedAnimationCount: number;
  readonly dispatchedSignalCount: number;
  readonly snapshot?: unknown;
}

export interface TimelineRuntimeBridgeSnapshot {
  readonly kind: "aura-editor-timeline-runtime-bridge";
  readonly timeline: TimelineSnapshot;
  readonly appliedAnimationCount: number;
  readonly dispatchedSignalCount: number;
  readonly warnings: readonly string[];
  readonly targets: readonly TimelineRuntimeTargetSnapshot[];
  readonly lastApplications: readonly TimelineRuntimeAnimationApplication[];
  readonly lastSignals: readonly TimelineRuntimeSignalDispatch[];
  readonly evidence: {
    readonly timelineToRuntimeBridge: true;
    readonly deterministicApplyAt: true;
    readonly animationClipBinding: boolean;
    readonly signalDispatch: boolean;
    readonly runtimeTargetSnapshots: boolean;
  };
}

interface TargetCounters {
  appliedAnimationCount: number;
  dispatchedSignalCount: number;
}

export class TimelineRuntimeBridge {
  private readonly timeline: TimelineModel;
  private readonly targets = new Map<string, TimelineRuntimeTarget>();
  private readonly counters = new Map<string, TargetCounters>();
  private readonly bindings: readonly TimelineRuntimeBindingConfig[];
  private readonly strictBindings: boolean;
  private readonly dispatchSignals: boolean;
  private readonly seenSignalKeys = new Set<string>();
  private lastTimelineTime = 0;
  private lastSnapshot: TimelineRuntimeBridgeSnapshot;

  constructor(config: TimelineRuntimeBridgeConfig) {
    this.timeline = config.timeline;
    this.bindings = config.bindings ?? [];
    this.strictBindings = config.strictBindings ?? false;
    this.dispatchSignals = config.dispatchSignals ?? true;
    for (const target of config.targets) {
      const id = target.id.trim();
      if (!id) throw new Error("Timeline runtime target id is required.");
      if (this.targets.has(id)) throw new Error(`Duplicate timeline runtime target id: ${id}`);
      this.targets.set(id, target);
      this.counters.set(id, { appliedAnimationCount: 0, dispatchedSignalCount: 0 });
    }
    this.lastSnapshot = this.createBridgeSnapshot(this.timeline.snapshot(), [], [], []);
  }

  step(deltaSeconds: number): TimelineRuntimeBridgeSnapshot {
    this.timeline.tick(deltaSeconds);
    return this.applyCurrent();
  }

  applyAt(time: number, options: { readonly replaySignals?: boolean } = {}): TimelineRuntimeBridgeSnapshot {
    this.timeline.seek(time);
    if (options.replaySignals) this.resetSignalCursor();
    return this.applyCurrent();
  }

  applyCurrent(): TimelineRuntimeBridgeSnapshot {
    const timelineSnapshot = this.timeline.snapshot();
    if (timelineSnapshot.time < this.lastTimelineTime) {
      this.resetSignalCursor();
    }
    this.lastTimelineTime = timelineSnapshot.time;

    const warnings: string[] = [];
    const applications = this.applyAnimations(timelineSnapshot, warnings);
    const signals = this.dispatchSignals ? this.applySignals(timelineSnapshot, warnings) : [];
    this.lastSnapshot = this.createBridgeSnapshot(timelineSnapshot, applications, signals, warnings);
    return this.lastSnapshot;
  }

  resetSignalCursor(): void {
    this.seenSignalKeys.clear();
  }

  snapshot(): TimelineRuntimeBridgeSnapshot {
    return this.lastSnapshot;
  }

  private applyAnimations(snapshot: TimelineSnapshot, warnings: string[]): TimelineRuntimeAnimationApplication[] {
    const applications: TimelineRuntimeAnimationApplication[] = [];
    for (const clip of snapshot.activeClips) {
      if (clip.trackType !== "animation") continue;
      const binding = this.resolveBinding(clip);
      const targetId = clip.runtimeTargetId ?? binding?.targetId;
      if (!targetId) {
        this.warnOrThrow(`No runtime target binding for animation track ${clip.trackId}.`, warnings);
        continue;
      }
      const target = this.targets.get(targetId);
      if (!target) {
        this.warnOrThrow(`Runtime target is not registered for timeline binding: ${targetId}`, warnings);
        continue;
      }
      const clipName = binding?.clipNameMap?.[clip.assetClipName ?? clip.clipName] ?? binding?.clipNameMap?.[clip.clipName] ?? clip.assetClipName ?? clip.clipName;
      const application: TimelineRuntimeAnimationApplication = {
        targetId,
        trackId: clip.trackId,
        trackName: clip.trackName,
        clipId: clip.clipId,
        clipName,
        assetId: clip.assetId ?? binding?.assetId,
        localTime: clip.localTime,
        assetTime: clip.assetTime,
        normalizedTime: clip.normalizedTime,
        blendWeight: clip.blendWeight,
        blendMode: clip.blendMode,
        playback: snapshot.playback,
        properties: { ...clip.properties }
      };
      target.applyTimelineAnimation?.(application);
      this.counters.get(targetId)!.appliedAnimationCount += 1;
      applications.push(application);
    }
    return applications;
  }

  private applySignals(snapshot: TimelineSnapshot, warnings: string[]): TimelineRuntimeSignalDispatch[] {
    const signals: TimelineRuntimeSignalDispatch[] = [];
    for (const event of snapshot.signalEventDetails) {
      const key = `${event.trackId}:${event.clipId}:${event.event}`;
      if (this.seenSignalKeys.has(key)) continue;
      this.seenSignalKeys.add(key);
      const targetId = this.resolveSignalTargetId(event);
      const dispatch: TimelineRuntimeSignalDispatch = {
        targetId,
        trackId: event.trackId,
        trackName: event.trackName,
        clipId: event.clipId,
        clipName: event.clipName,
        event: event.event,
        time: event.time,
        localTime: event.localTime,
        properties: { ...event.properties }
      };
      if (targetId) {
        const target = this.targets.get(targetId);
        if (!target) {
          this.warnOrThrow(`Runtime target is not registered for timeline signal: ${targetId}`, warnings);
          signals.push(dispatch);
          continue;
        }
        target.applyTimelineSignal?.(dispatch);
        this.counters.get(targetId)!.dispatchedSignalCount += 1;
      }
      signals.push(dispatch);
    }
    return signals;
  }

  private resolveBinding(clip: TimelineActiveClipSnapshot): TimelineRuntimeBindingConfig | undefined {
    return this.bindings.find((binding) => {
      if (binding.trackId && binding.trackId === clip.trackId) return true;
      if (binding.trackName && binding.trackName === clip.trackName) return true;
      return false;
    });
  }

  private resolveSignalTargetId(event: TimelineSignalEventSnapshot): string | undefined {
    if (typeof event.properties.runtimeNodeId === "string" && event.properties.runtimeNodeId.trim().length > 0) return event.properties.runtimeNodeId;
    if (typeof event.properties.targetId === "string" && event.properties.targetId.trim().length > 0) return event.properties.targetId;
    const binding = this.bindings.find((candidate) => {
      if (candidate.trackId && candidate.trackId === event.trackId) return true;
      if (candidate.trackName && candidate.trackName === event.trackName) return true;
      return false;
    });
    return binding?.targetId;
  }

  private createBridgeSnapshot(
    timeline: TimelineSnapshot,
    applications: readonly TimelineRuntimeAnimationApplication[],
    signals: readonly TimelineRuntimeSignalDispatch[],
    warnings: readonly string[]
  ): TimelineRuntimeBridgeSnapshot {
    return {
      kind: "aura-editor-timeline-runtime-bridge",
      timeline,
      appliedAnimationCount: [...this.counters.values()].reduce((total, counter) => total + counter.appliedAnimationCount, 0),
      dispatchedSignalCount: [...this.counters.values()].reduce((total, counter) => total + counter.dispatchedSignalCount, 0),
      warnings,
      targets: [...this.targets.values()].map((target) => {
        const counter = this.counters.get(target.id)!;
        return {
          id: target.id,
          appliedAnimationCount: counter.appliedAnimationCount,
          dispatchedSignalCount: counter.dispatchedSignalCount,
          snapshot: target.snapshot?.()
        };
      }),
      lastApplications: applications,
      lastSignals: signals,
      evidence: {
        timelineToRuntimeBridge: true,
        deterministicApplyAt: true,
        animationClipBinding: applications.length > 0,
        signalDispatch: signals.length > 0,
        runtimeTargetSnapshots: [...this.targets.values()].some((target) => typeof target.snapshot === "function")
      }
    };
  }

  private warnOrThrow(message: string, warnings: string[]): void {
    if (this.strictBindings) throw new Error(message);
    warnings.push(message);
  }
}

export function createTimelineRuntimeBridge(config: TimelineRuntimeBridgeConfig): TimelineRuntimeBridge {
  return new TimelineRuntimeBridge(config);
}
