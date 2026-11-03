export type InputReplayEventType =
  | "key"
  | "pointer-button"
  | "pointer-move"
  | "pointer-wheel"
  | "gamepad-axis"
  | "gamepad-button"
  | "action"
  | "frame";

export interface InputReplayEvent {
  readonly type: InputReplayEventType;
  readonly timestampMs: number;
  readonly frame: number;
  readonly code?: string;
  readonly down?: boolean;
  readonly button?: number;
  readonly x?: number;
  readonly y?: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly gamepadIndex?: number;
  readonly controlIndex?: number;
  readonly action?: string;
  readonly context?: string;
  readonly value?: number;
  readonly vector?: readonly [number, number];
  readonly deltaTimeMs?: number;
}

export interface InputRecordingMetadata {
  readonly version: "1.0.0";
  readonly source: "origin-master-input-recorder-playback-adapted";
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly durationMs: number;
  readonly frameCount: number;
  readonly eventCount: number;
  readonly evidence: {
    readonly oldCodebasePort: true;
    readonly recording: boolean;
    readonly playback: boolean;
    readonly seek: boolean;
    readonly looping: boolean;
  };
}

export interface InputRecording {
  readonly metadata: InputRecordingMetadata;
  readonly events: readonly InputReplayEvent[];
}

export interface InputPlaybackOptions {
  readonly speed?: number;
  readonly loop?: boolean;
}

export interface InputPlaybackSnapshot {
  readonly state: "stopped" | "playing" | "paused";
  readonly currentTimeMs: number;
  readonly emittedEvents: number;
  readonly loopCount: number;
  readonly recordingEventCount: number;
  readonly evidence: InputRecordingMetadata["evidence"];
}

const MAX_PLAYBACK_EVENTS_PER_UPDATE = 100_000;

export class InputRecorder {
  private readonly events: InputReplayEvent[] = [];
  private readonly maxEvents: number;
  private recording = false;
  private startTimeMs = 0;
  private lastTimestampMs = 0;
  private frame = 0;

  constructor(options: { readonly maxEvents?: number } = {}) {
    this.maxEvents = options.maxEvents ?? 4096;
  }

  start(startTimeMs = 0): void {
    this.events.length = 0;
    this.recording = true;
    this.startTimeMs = finite(startTimeMs, 0);
    this.lastTimestampMs = this.startTimeMs;
    this.frame = 0;
  }

  stop(endTimeMs = this.lastTimestampMs): InputRecording {
    this.recording = false;
    this.lastTimestampMs = Math.max(this.startTimeMs, finite(endTimeMs, this.lastTimestampMs));
    return this.recordingSnapshot();
  }

  recordFrame(deltaTimeMs: number, timestampMs = this.lastTimestampMs + deltaTimeMs): void {
    this.push({
      type: "frame",
      timestampMs: finite(timestampMs, this.lastTimestampMs),
      frame: this.frame,
      deltaTimeMs: Math.max(0, finite(deltaTimeMs, 0))
    });
    this.frame += 1;
  }

  recordKey(code: string, down: boolean, timestampMs = this.lastTimestampMs): void {
    this.push({ type: "key", timestampMs: finite(timestampMs, this.lastTimestampMs), frame: this.frame, code, down });
  }

  recordPointerButton(button: number, down: boolean, x: number, y: number, timestampMs = this.lastTimestampMs): void {
    this.push({ type: "pointer-button", timestampMs: finite(timestampMs, this.lastTimestampMs), frame: this.frame, button, down, x, y });
  }

  recordPointerMove(x: number, y: number, deltaX: number, deltaY: number, timestampMs = this.lastTimestampMs): void {
    this.push({ type: "pointer-move", timestampMs: finite(timestampMs, this.lastTimestampMs), frame: this.frame, x, y, deltaX, deltaY });
  }

  recordPointerWheel(deltaX: number, deltaY: number, timestampMs = this.lastTimestampMs): void {
    this.push({ type: "pointer-wheel", timestampMs: finite(timestampMs, this.lastTimestampMs), frame: this.frame, deltaX, deltaY });
  }

  recordGamepadAxis(gamepadIndex: number, controlIndex: number, value: number, timestampMs = this.lastTimestampMs): void {
    this.push({ type: "gamepad-axis", timestampMs: finite(timestampMs, this.lastTimestampMs), frame: this.frame, gamepadIndex, controlIndex, value });
  }

  recordGamepadButton(gamepadIndex: number, controlIndex: number, down: boolean, value: number, timestampMs = this.lastTimestampMs): void {
    this.push({ type: "gamepad-button", timestampMs: finite(timestampMs, this.lastTimestampMs), frame: this.frame, gamepadIndex, controlIndex, down, value });
  }

  recordAction(context: string, action: string, value: number, vector?: readonly [number, number], timestampMs = this.lastTimestampMs): void {
    this.push({ type: "action", timestampMs: finite(timestampMs, this.lastTimestampMs), frame: this.frame, context, action, value, vector });
  }

  recordingSnapshot(): InputRecording {
    const endTimeMs = Math.max(this.lastTimestampMs, this.events.at(-1)?.timestampMs ?? this.startTimeMs);
    return Object.freeze({
      metadata: Object.freeze({
        version: "1.0.0" as const,
        source: "origin-master-input-recorder-playback-adapted" as const,
        startTimeMs: this.startTimeMs,
        endTimeMs,
        durationMs: Math.max(0, endTimeMs - this.startTimeMs),
        frameCount: this.frame,
        eventCount: this.events.length,
        evidence: replayEvidence()
      }),
      events: Object.freeze([...this.events])
    });
  }

  toJSON(): string {
    return JSON.stringify(this.recordingSnapshot());
  }

  private push(event: InputReplayEvent): void {
    if (!this.recording) throw new Error("InputRecorder must be started before recording events.");
    if (this.events.length >= this.maxEvents) throw new Error(`InputRecorder exceeded maxEvents=${this.maxEvents}.`);
    this.lastTimestampMs = Math.max(this.lastTimestampMs, event.timestampMs);
    this.events.push(Object.freeze({ ...event, timestampMs: this.lastTimestampMs }));
  }
}

export class InputPlayback {
  private recording: InputRecording | undefined;
  private state: InputPlaybackSnapshot["state"] = "stopped";
  private currentTimeMs = 0;
  private eventIndex = 0;
  private emittedEvents = 0;
  private loopCount = 0;
  private speed: number;
  private loop: boolean;

  constructor(options: InputPlaybackOptions = {}) {
    this.speed = Math.max(0.01, finite(options.speed, 1));
    this.loop = options.loop ?? false;
  }

  load(recording: InputRecording): void {
    this.recording = normalizeRecording(recording);
    this.stop();
  }

  play(): void {
    if (!this.recording) throw new Error("InputPlayback requires a recording before play().");
    this.state = "playing";
  }

  pause(): void {
    if (this.state === "playing") this.state = "paused";
  }

  stop(): void {
    this.state = "stopped";
    this.currentTimeMs = 0;
    this.eventIndex = 0;
  }

  seek(timeMs: number): void {
    const recording = this.requireRecording();
    this.currentTimeMs = clamp(finite(timeMs, 0), 0, recording.metadata.durationMs);
    this.eventIndex = recording.events.findIndex((event) => event.timestampMs >= recording.metadata.startTimeMs + this.currentTimeMs);
    if (this.eventIndex < 0) this.eventIndex = recording.events.length;
  }

  update(deltaTimeMs: number): readonly InputReplayEvent[] {
    if (this.state !== "playing") return [];
    const recording = this.requireRecording();
    const nextTime = this.currentTimeMs + Math.max(0, finite(deltaTimeMs, 0)) * this.speed;
    if (!Number.isFinite(nextTime)) throw new RangeError("InputPlayback update exceeds the time limit.");
    const { startTimeMs, durationMs } = recording.metadata;
    const events = recording.events;
    const through = (time: number, index = 0): number => {
      while (index < events.length && (events[index]?.timestampMs ?? Infinity) <= startTimeMs + time) index += 1;
      return index;
    };
    const cycles = this.loop && durationMs > 0 ? Math.floor(nextTime / durationMs) : 0;
    const remainder = cycles > 0 ? nextTime % durationMs : nextTime;
    const endIndex = cycles > 0 ? through(durationMs) : 0;
    const partialIndex = cycles > 0 && remainder === 0 ? 0 : through(remainder, cycles > 0 ? 0 : this.eventIndex);
    const count = cycles > 0
      ? Math.max(0, endIndex - this.eventIndex) + (cycles - 1) * endIndex + partialIndex
      : partialIndex - this.eventIndex;
    if (!Number.isSafeInteger(cycles) || !Number.isSafeInteger(this.loopCount + cycles) ||
        !Number.isSafeInteger(count) || count > MAX_PLAYBACK_EVENTS_PER_UPDATE ||
        !Number.isSafeInteger(this.emittedEvents + count)) {
      throw new RangeError("InputPlayback update exceeds the replay event limit.");
    }

    const emitted: InputReplayEvent[] = [];
    if (cycles > 0) {
      for (let i = this.eventIndex; i < endIndex; i += 1) emitted.push(events[i]!);
      for (let cycle = 1; cycle < cycles && endIndex > 0; cycle += 1) {
        for (let i = 0; i < endIndex; i += 1) emitted.push(events[i]!);
      }
      for (let i = 0; i < partialIndex; i += 1) emitted.push(events[i]!);
      this.currentTimeMs = remainder;
      this.eventIndex = partialIndex;
      this.loopCount += cycles;
    } else {
      for (let i = this.eventIndex; i < partialIndex; i += 1) emitted.push(events[i]!);
      this.eventIndex = partialIndex;
      this.currentTimeMs = nextTime;
      if (this.currentTimeMs >= durationMs) {
        this.state = "stopped";
        this.currentTimeMs = durationMs;
      }
    }
    this.emittedEvents += emitted.length;
    return Object.freeze(emitted);
  }

  snapshot(): InputPlaybackSnapshot {
    return Object.freeze({
      state: this.state,
      currentTimeMs: Number(this.currentTimeMs.toFixed(3)),
      emittedEvents: this.emittedEvents,
      loopCount: this.loopCount,
      recordingEventCount: this.recording?.metadata.eventCount ?? 0,
      evidence: replayEvidence()
    });
  }

  private requireRecording(): InputRecording {
    if (!this.recording) throw new Error("InputPlayback has no loaded recording.");
    return this.recording;
  }
}

export function parseInputRecording(json: string): InputRecording {
  return normalizeRecording(JSON.parse(json) as InputRecording);
}

function normalizeRecording(recording: InputRecording): InputRecording {
  const events = [...recording.events].sort((left, right) => left.timestampMs - right.timestampMs || left.frame - right.frame);
  return Object.freeze({
    metadata: Object.freeze({
      ...recording.metadata,
      evidence: replayEvidence()
    }),
    events: Object.freeze(events.map((event) => Object.freeze({ ...event })))
  });
}

function replayEvidence(): InputRecordingMetadata["evidence"] {
  return {
    oldCodebasePort: true,
    recording: true,
    playback: true,
    seek: true,
    looping: true
  };
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
