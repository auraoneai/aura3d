// Provider-injected game-app implementation shared by both entry families.
import type { AuraApp, AuraAppTarget, AuraCreateGameAppOptions } from "../nodes/types.js";
import { createGameAppRuntime, type GameAppRuntime } from "../GameAppRuntime.js";
import type { PhysicsWorldAccess } from "../physics/PhysicsWorldAccess.js";
import { createAuraAppWithPhysicsWorldAccess } from "./createAuraAppCore.js";
import { AuraWorkerError } from "./workerRuntime.js";

function assertMainThreadGame(worker: unknown): void {
  if (worker !== undefined) {
    throw new AuraWorkerError(
      "createGameApp does not support worker rendering because its game loop requires synchronous onFrame callbacks. Remove the worker option to run the game on the main thread, or use createAuraApp with worker and await app.stepAsync() for worker rendering.",
      "worker-unsupported"
    );
  }
}

/** @internal Bind the game app and its lifetime to the caller's physics access. */
export function createGameAppWithPhysicsWorldAccess(
  physicsAccess: PhysicsWorldAccess,
  target: AuraAppTarget,
  options: AuraCreateGameAppOptions
): GameAppRuntime<AuraApp> {
  // JavaScript callers can bypass the `worker?: never` type. Fail before any
  // worker or canvas is acquired, including when main-thread fallback is set.
  assertMainThreadGame(options.worker);
  const { input, loop, runtimeEvidence, ...appOptions } = options;
  // A getter or proxy can change the option while the rest object is copied.
  // Validate the exact snapshot that will be forwarded to createAuraApp.
  assertMainThreadGame(appOptions.worker);
  const app = createAuraAppWithPhysicsWorldAccess(physicsAccess, target, { ...appOptions, autoStart: false });
  return createGameAppRuntime(app, {
    autoStart: options.autoStart,
    loop,
    input,
    evidence: runtimeEvidence,
    qualityRebuild: options.qualityRebuild
  });
}
