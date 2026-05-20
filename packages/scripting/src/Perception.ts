export type PerceptionPoint = readonly [number, number];

export interface PerceptionTarget {
  readonly id: string;
  readonly position: PerceptionPoint;
  readonly priority?: number;
}

export interface PerceptionSensorOptions {
  readonly position: PerceptionPoint;
  readonly forward?: PerceptionPoint;
  readonly range?: number;
  readonly fovRadians?: number;
  readonly peripheralRadians?: number;
  readonly minConfidence?: number;
  readonly memoryDecayPerSecond?: number;
  readonly forgetBelowConfidence?: number;
}

export interface PerceptionHit {
  readonly id: string;
  readonly position: PerceptionPoint;
  readonly distance: number;
  readonly angleRadians: number;
  readonly confidence: number;
  readonly peripheral: boolean;
  readonly justEntered: boolean;
}

export interface PerceptionMemory {
  readonly id: string;
  readonly lastKnownPosition: PerceptionPoint;
  readonly confidence: number;
  readonly lastSeenSeconds: number;
  readonly seenCount: number;
}

export interface PerceptionSnapshot {
  readonly visible: readonly PerceptionHit[];
  readonly memories: readonly PerceptionMemory[];
  readonly closestVisible?: PerceptionHit;
  readonly strongestMemory?: PerceptionMemory;
  readonly enteredIds: readonly string[];
  readonly forgottenIds: readonly string[];
}

export class PerceptionSensor {
  private position: PerceptionPoint;
  private forward: PerceptionPoint;
  private readonly range: number;
  private readonly fovRadians: number;
  private readonly peripheralRadians: number;
  private readonly minConfidence: number;
  private readonly memoryDecayPerSecond: number;
  private readonly forgetBelowConfidence: number;
  private readonly memories = new Map<string, PerceptionMemory>();
  private readonly visibleLastTick = new Set<string>();
  private elapsedSeconds = 0;

  constructor(options: PerceptionSensorOptions) {
    this.position = options.position;
    this.forward = normalize(options.forward ?? [1, 0]);
    this.range = options.range ?? 3;
    this.fovRadians = options.fovRadians ?? Math.PI / 2;
    this.peripheralRadians = options.peripheralRadians ?? Math.PI;
    this.minConfidence = options.minConfidence ?? 0.05;
    this.memoryDecayPerSecond = options.memoryDecayPerSecond ?? 0.25;
    this.forgetBelowConfidence = options.forgetBelowConfidence ?? 0.05;
    if (this.range <= 0 || this.fovRadians <= 0 || this.peripheralRadians < this.fovRadians) {
      throw new RangeError("PerceptionSensor requires positive range/fov and peripheralRadians >= fovRadians.");
    }
  }

  updateTransform(position: PerceptionPoint, forward: PerceptionPoint = this.forward): void {
    this.position = position;
    this.forward = normalize(forward);
  }

  scan(targets: readonly PerceptionTarget[], deltaSeconds: number): PerceptionSnapshot {
    this.elapsedSeconds += Math.max(0, deltaSeconds);
    const previousVisible = new Set(this.visibleLastTick);
    this.visibleLastTick.clear();
    const visible: PerceptionHit[] = [];
    const forgottenIds: string[] = [];

    for (const [id, memory] of [...this.memories]) {
      const decayed = Math.max(0, memory.confidence - this.memoryDecayPerSecond * Math.max(0, deltaSeconds));
      if (decayed < this.forgetBelowConfidence) {
        this.memories.delete(id);
        forgottenIds.push(id);
      } else {
        this.memories.set(id, { ...memory, confidence: round3(decayed) });
      }
    }

    for (const target of targets) {
      const hit = this.evaluateTarget(target, previousVisible.has(target.id));
      if (!hit || hit.confidence < this.minConfidence) continue;
      visible.push(hit);
      this.visibleLastTick.add(target.id);
      const previous = this.memories.get(target.id);
      this.memories.set(target.id, {
        id: target.id,
        lastKnownPosition: [round3(target.position[0]), round3(target.position[1])],
        confidence: hit.confidence,
        lastSeenSeconds: round3(this.elapsedSeconds),
        seenCount: (previous?.seenCount ?? 0) + 1
      });
    }

    visible.sort((left, right) => right.confidence - left.confidence || left.distance - right.distance || left.id.localeCompare(right.id));
    const memories = [...this.memories.values()].sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id));
    return {
      visible,
      memories,
      closestVisible: [...visible].sort((left, right) => left.distance - right.distance)[0],
      strongestMemory: memories[0],
      enteredIds: visible.filter((hit) => hit.justEntered).map((hit) => hit.id),
      forgottenIds
    };
  }

  private evaluateTarget(target: PerceptionTarget, wasVisible: boolean): PerceptionHit | undefined {
    const offset: PerceptionPoint = [target.position[0] - this.position[0], target.position[1] - this.position[1]];
    const distance = length(offset);
    if (distance > this.range || distance === 0) return undefined;
    const direction = normalize(offset);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(this.forward, direction))));
    if (angle > this.peripheralRadians / 2) return undefined;
    const peripheral = angle > this.fovRadians / 2;
    const distanceConfidence = 1 - distance / this.range;
    const angleConfidence = peripheral
      ? 0.35 * (1 - (angle - this.fovRadians / 2) / Math.max(0.001, (this.peripheralRadians - this.fovRadians) / 2))
      : 1 - angle / Math.max(0.001, this.fovRadians / 2) * 0.4;
    const priority = target.priority ?? 1;
    return {
      id: target.id,
      position: [round3(target.position[0]), round3(target.position[1])],
      distance: round3(distance),
      angleRadians: round3(angle),
      confidence: round3(Math.max(0, Math.min(1, distanceConfidence * angleConfidence * priority))),
      peripheral,
      justEntered: !wasVisible
    };
  }
}

function normalize(value: PerceptionPoint): PerceptionPoint {
  const magnitude = length(value);
  return magnitude === 0 ? [1, 0] : [value[0] / magnitude, value[1] / magnitude];
}

function length(value: PerceptionPoint): number {
  return Math.hypot(value[0], value[1]);
}

function dot(left: PerceptionPoint, right: PerceptionPoint): number {
  return left[0] * right[0] + left[1] * right[1];
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}
