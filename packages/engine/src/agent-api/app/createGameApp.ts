// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraApp, AuraAppTarget, AuraCreateGameAppOptions } from "../index.js";
import { createGameAppRuntime, type GameAppRuntime } from "../GameAppRuntime.js";
import { createAuraApp } from "./createAuraApp.js";

export function createGameApp(target: AuraAppTarget, options: AuraCreateGameAppOptions): GameAppRuntime<AuraApp> {
  const { input, loop, runtimeEvidence, ...appOptions } = options;
  const app = createAuraApp(target, { ...appOptions, autoStart: false });
  return createGameAppRuntime(app, {
    autoStart: options.autoStart,
    loop,
    input,
    evidence: runtimeEvidence
  });
}
