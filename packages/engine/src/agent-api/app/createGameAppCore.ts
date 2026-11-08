// Provider-injected game-app implementation shared by both entry families.
import type { AuraApp, AuraAppTarget, AuraCreateGameAppOptions } from "../nodes/types.js";
import { createGameAppRuntime, type GameAppRuntime } from "../GameAppRuntime.js";
import type { PhysicsWorldAccess } from "../physics/PhysicsWorldAccess.js";
import { createAuraAppWithPhysicsWorldAccess } from "./createAuraAppCore.js";
import { AuraWorkerError } from "./workerRuntime.js";

/**
 * K2: a game app may render in a worker. Its loop stays on the main thread:
 * `app.step(dt)` runs the frame callbacks (game logic, physics-free state)
 * synchronously and sends node changes to the worker, which presents on its
 * own clock. A worker option without `createWorker` that asks for
 * `fallback: "main-thread"` (the shared lab fragment) runs on the main thread.
 */
function gameWorkerOption(worker: unknown): AuraCreateGameAppOptions["worker"] | undefined {
  if (worker === undefined) return undefined;
  if (worker && typeof worker === "object") {
    const candidate = worker as { createWorker?: unknown; fallback?: unknown };
    if (typeof candidate.createWorker === "function") return worker as AuraCreateGameAppOptions["worker"];
    if (candidate.fallback === "main-thread") return undefined;
  }
  throw new AuraWorkerError(
    "createGameApp worker rendering needs worker.createWorker (a dedicated render worker), or worker: { fallback: \"main-thread\" } to run the game on the main thread.",
    "worker-unsupported"
  );
}

/** @internal Bind the game app and its lifetime to the caller's physics access. */
export function createGameAppWithPhysicsWorldAccess(
  physicsAccess: PhysicsWorldAccess,
  target: AuraAppTarget,
  options: AuraCreateGameAppOptions
): GameAppRuntime<AuraApp> {
  // Validate before any worker or canvas is acquired.
  gameWorkerOption(options.worker);
  const { input, loop, runtimeEvidence, worker: _worker, ...appOptions } = options;
  // A getter or proxy can change the option while the rest object is copied.
  // Forward the exact snapshot that was validated last.
  const worker = gameWorkerOption(_worker);
  const app = createAuraAppWithPhysicsWorldAccess(physicsAccess, target, { ...appOptions, ...(worker ? { worker } : {}), autoStart: false });
  return createGameAppRuntime(app, {
    autoStart: options.autoStart,
    loop,
    input,
    evidence: runtimeEvidence,
    qualityRebuild: options.qualityRebuild
  });
}
