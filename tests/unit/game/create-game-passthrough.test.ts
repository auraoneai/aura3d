import { describe, expect, it } from "vitest";
import { normalizeSceneSnapshot, scene, StubTimeController } from "../../../packages/engine/src";
import { assertGameWorkerRequest, createGameImplWithGameApp, type GameImplementationBindings, type Prd09CreateGameOptions } from "../../../packages/game/src/createGameCore";
import { labAppOptions, parseLabFlags } from "../../../apps/showcase-port-shared/lab-flags";

const bindings = { normalizeSceneSnapshot, StubTimeController } as unknown as GameImplementationBindings;
const STOP = new Error("factory reached");

/** Runs createGame up to the app factory and returns the options the factory received. */
function factoryOptions(extra: Record<string, unknown>): Record<string, unknown> {
  let seen: Record<string, unknown> | undefined;
  try {
    createGameImplWithGameApp(
      ((_target: unknown, options: Record<string, unknown>) => { seen = options; throw STOP; }) as never,
      bindings,
      { id: "passthrough", target: null, scene: () => scene(), ...extra } as unknown as Prd09CreateGameOptions<string, string>
    );
  } catch (error) {
    if (error !== STOP) throw error;
  }
  return seen!;
}

describe("createGame renderer / output / worker passthrough", () => {
  it("forwards renderer and output to the app options", () => {
    const options = factoryOptions({ renderer: { backend: "auto", allowFallback: true }, output: { outputColorSpace: "display-p3" } });
    expect(options.renderer).toEqual({ backend: "auto", allowFallback: true });
    expect(options.output).toEqual({ outputColorSpace: "display-p3" });
  });

  it("accepts a main-thread worker request without forwarding it to the app", () => {
    const options = factoryOptions({ worker: { fallback: "main-thread" } });
    expect("worker" in options).toBe(false);
  });

  it("forwards a worker request that carries createWorker (K2) and rejects one that cannot run", () => {
    const createWorker = () => ({}) as Worker;
    expect(factoryOptions({ worker: { createWorker, fallback: "main-thread" } }).worker).toEqual({ createWorker, fallback: "main-thread" });
    expect(() => assertGameWorkerRequest({ fallback: "error" })).toThrowError(expect.objectContaining({ name: "AuraWorkerError", code: "worker-unsupported" }));
    expect(() => assertGameWorkerRequest(undefined)).not.toThrow();
  });

  it("accepts the shared lab-flag fragment spread into createGame options (types and runtime)", () => {
    const lab = labAppOptions(parseLabFlags("?backend=webgpu&worker=1&gamut=p3"));
    const typed: Partial<Prd09CreateGameOptions<string, string>> = { ...lab };
    expect(typed.worker).toEqual({ fallback: "main-thread" });
    const options = factoryOptions({ ...lab });
    expect(options.renderer).toEqual({ backend: "webgpu", allowFallback: true });
    expect(options.output).toEqual({ outputColorSpace: "display-p3" });
    expect("worker" in options).toBe(false);
  });
});

describe("lab-flags worker fragment", () => {
  it("carries createWorker when the game supplies it, so it spreads into createAuraApp", () => {
    const createWorker = () => ({}) as Worker;
    const flags = parseLabFlags("?worker=1");
    expect(labAppOptions(flags, createWorker).worker).toEqual({ fallback: "main-thread", createWorker });
    expect(labAppOptions(parseLabFlags(""), createWorker)).toEqual({});
    expect(labAppOptions(flags).worker).toEqual({ fallback: "main-thread" });
  });
});
