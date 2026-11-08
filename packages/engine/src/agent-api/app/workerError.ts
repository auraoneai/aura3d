import { sanitizeDiagnosticText } from "../sanitizeDiagnostics.js";

/**
 * The worker renderer's error. Its own module so workerPatch.ts (imported by workerRuntime.ts) can throw it
 * without a value-import cycle; workerRuntime.ts re-exports it, so the public import path is unchanged.
 */
export class AuraWorkerError extends Error {
  constructor(message: string, readonly code: string, readonly severity: "recoverable" | "terminal" = "terminal") {
    super(sanitizeDiagnosticText(message));
    this.name = "AuraWorkerError";
  }
}
