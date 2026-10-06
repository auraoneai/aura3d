// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraSceneKitBudgetDefaults, AuraSceneKitId } from "../index.js";
import { cityBlock } from "../nodes/prefabs/cityBlock.js";

export const sceneKitPerformanceBudgets: Record<AuraSceneKitId, AuraSceneKitBudgetDefaults> = {
  physicsPlayground: { maxDrawCalls: 140, estimatedDrawCalls: 72, maxGzipBytes: 24_000, estimatedGzipBytes: 12_500, targetP50Fps: 55, evidence: "batched cube/contact/debug families keep the physics playground under the benchmark draw-call budget" },
  particleFountain: { maxDrawCalls: 48, estimatedDrawCalls: 14, maxGzipBytes: 14_000, estimatedGzipBytes: 7_200, targetP50Fps: 55, evidence: "particle billboard layers collapse thousands of particles into a small draw-call set" },
  solarSystem: { maxDrawCalls: 96, estimatedDrawCalls: 58, maxGzipBytes: 18_000, estimatedGzipBytes: 9_200, targetP50Fps: 55, evidence: "planet, orbit, star, dust, and label families are grouped for whole-system rendering" },
  neonTunnel: { maxDrawCalls: 120, estimatedDrawCalls: 86, maxGzipBytes: 18_000, estimatedGzipBytes: 10_400, targetP50Fps: 50, evidence: "receding tunnel rings, rails, streaks, and glow layers are bounded for flythrough capture" },
  dataViz: { maxDrawCalls: 96, estimatedDrawCalls: 62, maxGzipBytes: 18_000, estimatedGzipBytes: 8_600, targetP50Fps: 55, evidence: "bar, axis, tick, legend, and label geometry use repeated families instead of one-off scene systems" },
  miniGolf: { maxDrawCalls: 90, estimatedDrawCalls: 48, maxGzipBytes: 16_000, estimatedGzipBytes: 8_200, targetP50Fps: 55, evidence: "course, aim, score, cup, and obstacle cues stay within a bounded mini-game budget" },
  materialLab: { maxDrawCalls: 70, estimatedDrawCalls: 40, maxGzipBytes: 14_000, estimatedGzipBytes: 7_400, targetP50Fps: 55, evidence: "five material stations reuse swatch, label, reflection, and contact-shadow families" },
  cityBlock: { maxDrawCalls: 140, estimatedDrawCalls: 92, maxGzipBytes: 24_000, estimatedGzipBytes: 14_500, targetP50Fps: 50, evidence: "city windows, props, road markings, lights, and labels are instanced or impostored by family" },
  humanoidWalk: { maxDrawCalls: 64, estimatedDrawCalls: 24, maxGzipBytes: 80_000, estimatedGzipBytes: 42_000, targetP50Fps: 55, evidence: "connected low-poly procedural humanoid with clean no-joint default staging for the humanoid benchmark prompt" },
  productViewer: { maxDrawCalls: 70, estimatedDrawCalls: 34, maxGzipBytes: 20_000, estimatedGzipBytes: 10_200, targetP50Fps: 55, evidence: "typed product model, stage, softboxes, and contact shadow avoid inspection clutter by default" }
} as const;
