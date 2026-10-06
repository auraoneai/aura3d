// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraTimelineSpec } from "./types.js";

export const timeline = {
  loop: (options: Omit<AuraTimelineSpec, "mode"> = {}): AuraTimelineSpec => ({
    mode: "loop",
    seconds: options.seconds ?? options.duration ?? 8,
    startTime: options.startTime ?? 0,
    duration: options.duration ?? options.seconds ?? 8,
    loop: true,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime
  }),
  once: (options: Omit<AuraTimelineSpec, "mode"> = {}): AuraTimelineSpec => ({
    mode: "once",
    seconds: options.seconds ?? options.duration ?? 4,
    startTime: options.startTime ?? 0,
    duration: options.duration ?? options.seconds ?? 4,
    loop: false,
    easing: options.easing ?? "easeInOut",
    captureTime: options.captureTime
  })
} as const;
