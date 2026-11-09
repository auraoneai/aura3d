/**
 * 5.4: `app.effects` on a worker app.
 *
 * A main-thread app's `app.effects` (C-20 prd07) spawns bursts, looping specs, trails and decals on the app's
 * ProductionEffectSystem. A worker app had no `effects` member, so games that guard with `app.effects?.trail(...)`
 * drew no trails, bursts or scuffs under `?worker=1`. The host member below records each call as an allowlisted
 * app op with a numeric token; the render worker replays it on the worker's own effects extension (installed with
 * its PRD-07 atmosphere, see workerAtmosphere.ts) and keeps token -> live handle. Handle methods (stop,
 * setPosition, clear, translate) name the token.
 *
 * Host-side reads are estimates: a handle is `alive` until it is stopped or cleared, a trail reports length and
 * pointCount 0, and `liveCount` counts the handles still alive. Looping specs, trails, registered presets and the
 * runtime mode are replayed after a worker remount; one-shot bursts and decals are not.
 */
import type { AuraAppEffects, AuraEffectInstanceHandle, AuraTrailHandle } from "../../contracts/effects.js";
import type { AuraVec3 } from "../nodes/types.js";
import type { AuraWorkerAppCall } from "./workerPatch.js";

type Queue = (call: AuraWorkerAppCall, args: readonly unknown[]) => void;
type Presets = AuraAppEffects["presets"];

/** Trail / attach targets cross as a node id or `{ node, socket }` (a node handle is named by its id). */
function sendableTarget(target: unknown): string | { node: string; socket?: string } {
  if (typeof target === "string") return target;
  const value = target as { id?: unknown; node?: unknown; socket?: unknown } | null;
  if (value && typeof value.node === "string") return typeof value.socket === "string" ? { node: value.node, socket: value.socket } : { node: value.node };
  if (value && typeof value.id === "string") return value.id;
  throw new TypeError("app.effects target must be a runtime node id, a node handle or { node, socket }.");
}

const optional = (value: unknown): unknown[] => (value === undefined ? [] : [value]);

/** Host-side `app.effects` of a worker app. `presets` reads the built-in table lazily (it is only needed on read). */
export function createWorkerHostEffects(queue: Queue, builtIns: () => Map<string, unknown>): AuraAppEffects {
  let nextToken = 0;
  let runtime: "on" | "off" = "on";
  const alive = new Set<number>();
  const registered = new Map<string, unknown>();
  const handle = (token: number): AuraEffectInstanceHandle => ({
    id: `worker-fx-${token}`,
    get alive() { return alive.has(token); },
    stop(o) { if (alive.delete(token)) queue("effects.handle", [token, "stop", ...optional(o)]); },
    setPosition(p) { if (alive.has(token)) queue("effects.handle", [token, "setPosition", [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]]); },
    setDirection(n) { if (alive.has(token)) queue("effects.handle", [token, "setDirection", [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0]]); }
  });
  const start = (call: AuraWorkerAppCall, args: readonly unknown[]): number => {
    const token = ++nextToken;
    queue(call, [token, ...args]);
    if (runtime === "on") alive.add(token);
    return token;
  };
  const position = (p: AuraVec3): [number, number, number] => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
  return {
    get runtime() { return runtime; },
    set runtime(mode: "on" | "off") {
      runtime = mode === "off" ? "off" : "on";
      if (runtime === "off") alive.clear();
      queue("effects.setRuntime", [runtime]);
    },
    burst(kind, at, options) { return handle(start("effects.burst", [kind, position(at), ...optional(options)])); },
    spawn(effect, at, options) {
      const where = Array.isArray(at) ? position(at as AuraVec3) : sendableTarget(at);
      return handle(start("effects.spawn", [effect, where, ...optional(options)]));
    },
    trail(target, options): AuraTrailHandle {
      const token = start("effects.trail", [sendableTarget(target), options]);
      const base = handle(token);
      return {
        get id() { return base.id; },
        get alive() { return base.alive; },
        stop: base.stop,
        setPosition: base.setPosition,
        length: 0,
        pointCount: 0,
        clear() { if (alive.has(token)) queue("effects.handle", [token, "clear"]); },
        translate(dx, dy, dz) { if (alive.has(token)) queue("effects.handle", [token, "translate", dx, dy, dz]); }
      };
    },
    decal(at, options) {
      const where = { position: position(at.position), normal: position(at.normal), ...(at.target === undefined ? {} : { target: at.target }) };
      return handle(start("effects.decal", [where, options]));
    },
    get presets(): Presets {
      const out: Record<string, unknown> = {};
      for (const [kind, spec] of builtIns()) out[kind] = spec;
      for (const [kind, spec] of registered) out[kind] = spec;
      return out as unknown as Presets;
    },
    registerPreset(kind, spec) {
      registered.set(kind, spec);
      queue("effects.registerPreset", [kind, spec]);
    },
    get liveCount() { return alive.size; },
    clear() {
      alive.clear();
      queue("effects.clear", []);
    }
  };
}

/**
 * Worker side: applies `effects.*` app ops to the live worker effects (one per mounted renderer) and replays the
 * persistent state (runtime mode, registered presets, looping specs and trails) on a new mount.
 */
export interface WorkerEffectsReplayer {
  apply(call: AuraWorkerAppCall, args: readonly unknown[]): void;
  attach(effects: AuraAppEffects): () => void;
}

export function createWorkerEffectsReplayer(): WorkerEffectsReplayer {
  type Live = { readonly effects: AuraAppEffects; readonly handles: Map<number, AuraEffectInstanceHandle> };
  const live = new Set<Live>();
  let runtime: "on" | "off" | undefined;
  const presets = new Map<string, unknown>();
  // Looping effects that outlive a frame: the call that started them, replayed on a new mount until stopped.
  const persistent = new Map<number, { readonly call: AuraWorkerAppCall; readonly args: readonly unknown[] }>();
  const start = (target: Live, call: AuraWorkerAppCall, args: readonly unknown[]): void => {
    const [token, ...rest] = args as [number, ...unknown[]];
    const fx = target.effects as unknown as Record<string, (...values: unknown[]) => AuraEffectInstanceHandle>;
    const method = call.slice("effects.".length);
    target.handles.set(token, fx[method]!.call(target.effects, ...rest));
  };
  const applyTo = (target: Live, call: AuraWorkerAppCall, args: readonly unknown[]): void => {
    switch (call) {
      case "effects.setRuntime": target.effects.runtime = args[0] === "off" ? "off" : "on"; return;
      case "effects.registerPreset": target.effects.registerPreset(args[0] as string, args[1] as Parameters<AuraAppEffects["registerPreset"]>[1]); return;
      case "effects.clear": target.effects.clear(); target.handles.clear(); return;
      case "effects.handle": {
        const [token, method, ...rest] = args as [number, string, ...unknown[]];
        const instance = target.handles.get(token) as unknown as Record<string, ((...values: unknown[]) => void) | undefined> | undefined;
        if (!instance) return; // a one-shot that the worker already retired, or an effect started before this mount
        if (method === "stop") target.handles.delete(token);
        instance[method]?.(...rest);
        return;
      }
      default: start(target, call, args);
    }
  };
  return {
    apply(call, args) {
      if (!call.startsWith("effects.")) throw new Error(`app.${call}() is not an effects call.`);
      if (call === "effects.handle" || call === "effects.burst" || call === "effects.spawn" || call === "effects.trail" || call === "effects.decal") {
        if (typeof args[0] !== "number" || !Number.isInteger(args[0])) throw new Error(`app.${call}() needs an effect token.`);
      }
      if (call === "effects.setRuntime") {
        runtime = args[0] === "off" ? "off" : "on";
        if (runtime === "off") persistent.clear();
      } else if (call === "effects.registerPreset") {
        if (typeof args[0] !== "string") throw new Error("app.effects.registerPreset() needs a preset name.");
        presets.set(args[0], args[1]);
      } else if (call === "effects.clear") {
        persistent.clear();
      } else if (call === "effects.handle") {
        if (args[1] === "stop") persistent.delete(args[0] as number);
      } else if (call === "effects.trail" || (call === "effects.spawn" && typeof args[1] === "object" && args[1] !== null)) {
        // A trail, or an authored spec object (looping until stopped); named presets are one-shot.
        persistent.set(args[0] as number, { call, args: [...args] });
      }
      let failure: unknown;
      for (const target of live) {
        try { applyTo(target, call, args); } catch (error) { failure ??= error; }
      }
      if (failure !== undefined) throw failure;
    },
    attach(effects) {
      const target: Live = { effects, handles: new Map() };
      if (runtime !== undefined) applyTo(target, "effects.setRuntime", [runtime]);
      for (const [kind, spec] of presets) applyTo(target, "effects.registerPreset", [kind, spec]);
      for (const { call, args } of persistent.values()) applyTo(target, call, args);
      live.add(target);
      return () => { live.delete(target); };
    }
  };
}
