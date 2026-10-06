// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraScreenshot } from "../nodes/types.js";
import { AuraRuntimeError } from "./errors.js";
import { createAuraApp } from "./createAuraApp.js";

export function captureAuraScreenshot(target?: HTMLCanvasElement): AuraScreenshot {
  if (!target) {
    return {
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,",
      width: 0,
      height: 0
    };
  }
  if (typeof target.toDataURL !== "function") {
    throw new AuraRuntimeError(
      "missing-canvas",
      "Aura3D screenshot failed because the target is not a canvas. Suggested fix: pass the app returned by createAuraApp or its canvas."
    );
  }
  return {
    mimeType: "image/png",
    dataUrl: target.toDataURL("image/png"),
    width: target.width,
    height: target.height
  };
}
