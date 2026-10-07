/**
 * §7.6 tween engine — a bounded pool (≤ 64 active) advanced each frame on two
 * time channels: `tick(rawDt, scaledDt)` where scaled dt already carries
 * hit-stop/slow-mo/pause (session.scaledDt). `unscaled` tweens advance on raw
 * dt so UI keeps moving while the session is paused/frozen.
 */
import { Easing } from "@aura3d/math";
import { ease as EASE_MAP, type EaseName } from "../util/ease.js";

export interface TweenOptions {
  readonly duration: number; // seconds
  readonly ease?: EaseName | ((t: number) => number) | { readonly spring: { readonly stiffness: number; readonly damping: number } };
  readonly delay?: number;
  readonly unscaled?: boolean;
  readonly onComplete?: () => void;
}

export interface TweenableNode {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setScale(scale: number | readonly [number, number, number]): unknown;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number | readonly [number, number, number];
}

export interface TweenHandle {
  readonly done: Promise<void>;
  cancel(): void;
  finish(): void;
}

export const TWEEN_POOL_CAPACITY = 64;

export type TweenEase = NonNullable<TweenOptions["ease"]>;
type EaseInput = TweenEase;

interface Channel {
  readonly target: object;
  apply(v: readonly number[]): void;
}

interface Slot {
  active: boolean;
  unscaled: boolean;
  delayRemaining: number;
  elapsed: number;
  duration: number;
  easeFn: (t: number) => number;
  channels: { channel: Channel; from: number[]; to: number[] }[];
  resolve: () => void;
  onComplete?: () => void;
}

export interface TweenEngine {
  readonly activeCount: number;
  tween<T extends object>(target: T | TweenableNode, to: Partial<Record<string, number | readonly number[]>>, options: TweenOptions): TweenHandle;
  /** Advance the pool. `scaledDt` defaults to `rawDt` (no session). */
  tick(rawDt: number, scaledDt?: number): void;
  cancelAll(): void;
}

export function createTweenEngine(): TweenEngine {
  const slots: Slot[] = Array.from({ length: TWEEN_POOL_CAPACITY }, () => ({ active: false } as Slot));

  function complete(slot: Slot, canceled: boolean): void {
    slot.active = false;
    const { resolve, onComplete } = slot;
    slot.channels = [];
    if (!canceled) onComplete?.();
    resolve();
  }

  function applyProgress(slot: Slot, t: number): void {
    const e = slot.easeFn(t);
    for (const { channel, from, to } of slot.channels) {
      channel.apply(from.map((f, i) => f + (to[i] - f) * e));
    }
  }

  return {
    get activeCount() {
      return slots.reduce((n, s) => n + (s.active ? 1 : 0), 0);
    },

    tween(target, to, options) {
      if (!(options.duration >= 0) || !Number.isFinite(options.duration)) {
        throw new RangeError("TweenOptions.duration must be a finite number >= 0.");
      }
      const slot = slots.find((s) => !s.active);
      if (!slot) {
        console.warn("[game/tween] pool exhausted (64); tween dropped");
        return { done: Promise.resolve(), cancel() {}, finish() {} };
      }
      const channels = buildChannels(target, to);
      let resolve!: () => void;
      const done = new Promise<void>((r) => (resolve = r));
      Object.assign(slot, {
        active: true,
        unscaled: options.unscaled === true,
        delayRemaining: options.delay ?? 0,
        elapsed: 0,
        duration: options.duration,
        easeFn: resolveEase(options.ease),
        channels,
        resolve,
        onComplete: options.onComplete
      });
      return {
        done,
        cancel() {
          if (slot.active) complete(slot, true);
        },
        finish() {
          if (!slot.active) return;
          applyProgress(slot, 1);
          complete(slot, false);
        }
      };
    },

    tick(rawDt, scaledDt = rawDt) {
      for (const slot of slots) {
        if (!slot.active) continue;
        const dt = slot.unscaled ? rawDt : scaledDt;
        if (dt <= 0) continue;
        if (slot.delayRemaining > 0) {
          slot.delayRemaining -= dt;
          if (slot.delayRemaining > 0) continue;
          // Delay crossed this frame: only the overshoot counts as elapsed.
          slot.elapsed = -slot.delayRemaining;
          slot.delayRemaining = 0;
        } else {
          slot.elapsed += dt;
        }
        const t = slot.duration === 0 ? 1 : Math.min(slot.elapsed / slot.duration, 1);
        applyProgress(slot, t);
        if (t >= 1 - 1e-9) complete(slot, false);
      }
    },

    cancelAll() {
      for (const slot of slots) if (slot.active) complete(slot, true);
    }
  };
}

function resolveEase(e: EaseInput | undefined): (t: number) => number {
  if (e === undefined) return EASE_MAP.quadOut;
  if (typeof e === "function") return e;
  if (typeof e === "object" && "spring" in e) return Easing.spring(e.spring.stiffness, e.spring.damping);
  return EASE_MAP[e];
}

function isTweenableNode(t: object): t is TweenableNode {
  return typeof (t as TweenableNode).setPosition === "function" && Array.isArray((t as TweenableNode).position);
}

const NODE_PATHS: Record<string, { get(n: TweenableNode): readonly number[]; set(n: TweenableNode, v: readonly number[]): void }> = {
  position: {
    get: (n) => n.position,
    set: (n, v) => n.setPosition(v[0], v[1], v[2])
  },
  rotation: {
    get: (n) => n.rotation,
    set: (n, v) => n.setRotation(v[0], v[1], v[2])
  },
  scale: {
    get: (n) => {
      const s = n.scale;
      return typeof s === "number" ? [s, s, s] : [s[0], s[1], s[2]];
    },
    set: (n, v) => n.setScale([v[0], v[1], v[2]])
  }
};

function buildChannels(target: object | TweenableNode, to: Partial<Record<string, number | readonly number[]>>): { channel: Channel; from: number[]; to: number[] }[] {
  const channels: { channel: Channel; from: number[]; to: number[] }[] = [];
  const node = isTweenableNode(target) ? target : undefined;
  for (const [path, rawTo] of Object.entries(to)) {
    if (rawTo === undefined) continue;
    const toArr = typeof rawTo === "number" ? [rawTo] : [...rawTo];
    const nodePath = node ? NODE_PATHS[path] : undefined;
    if (node && nodePath) {
      const path_ = nodePath;
      channels.push({
        channel: { target, apply: (v) => path_.set(node, v) },
        from: [...path_.get(node)],
        to: toArr
      });
      continue;
    }
    const { field, index } = splitPath(path);
    const obj = target as Record<string, unknown>;
    const cur = obj[field];
    if (typeof cur === "number") {
      if (toArr.length !== 1) throw new RangeError(`tween field "${path}" expects a scalar target`);
      const rec = obj as Record<string, number>;
      channels.push({
        channel: { target, apply: (v) => (rec[field] = v[0]) },
        from: [cur],
        to: toArr
      });
    } else if (Array.isArray(cur) && cur.every((x) => typeof x === "number")) {
      const arr = cur as number[];
      if (index !== undefined && (index < 0 || index >= arr.length)) {
        throw new RangeError(`tween path "${path}" index out of range`);
      }
      const idx = index;
      channels.push({
        channel: {
          target,
          apply: (v) => {
            if (idx === undefined) for (let i = 0; i < v.length && i < arr.length; i++) arr[i] = v[i];
            else arr[idx] = v[0];
          }
        },
        from: idx === undefined ? [...arr] : [arr[idx]],
        to: toArr
      });
    } else {
      throw new RangeError(`tween target field "${path}" is not numeric`);
    }
  }
  return channels;
}

function splitPath(path: string): { field: string; index?: number } {
  const m = /^([A-Za-z_$][\w$]*)(?:\.(\d+)|\[(\d+)\])?$/.exec(path);
  if (!m) throw new RangeError(`tween path "${path}" is not a numeric field path`);
  const idx = m[2] ?? m[3];
  return { field: m[1], index: idx === undefined ? undefined : Number(idx) };
}
