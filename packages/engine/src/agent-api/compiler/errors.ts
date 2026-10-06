// Verbatim move of AuraRuntimeError from app/errors.ts — compiler may not
// import app/ (layering gate), and compiler modules throw this type directly.

export class AuraRuntimeError extends Error {
  readonly code:
    | "missing-canvas"
    | "missing-asset"
    | "failed-glb-load"
    | "unsupported-texture"
    | "backend-fallback"
    | "unknown-node-kind"
    // T4.1 (PRD-15): strict degrade() throws the C-36 degradation codes,
    // including "renderer-mount-failed" from the T4.2 mount path.
    | import("../../contracts/compiler.js").AuraDegradationCode;

  constructor(code: AuraRuntimeError["code"], message: string, options?: { readonly cause?: unknown }) {
    super(message);
    this.name = "AuraRuntimeError";
    this.code = code;
    if (options && "cause" in options) this.cause = options.cause;
  }
}

/**
 * T4.5 (PRD-15): thrown under A3D_QR_STRICT when a caller passes an API the
 * quality rebuild removed, pointing at the replacement surface.
 */
export class AuraMigrationError extends Error {
  readonly removedApi: string;
  readonly replacement: string;
  readonly prd: number;
  readonly code = "removed-api";

  constructor(args: { readonly removedApi: string; readonly replacement: string; readonly prd: number }) {
    super(`Aura3D API "${args.removedApi}" was removed by PRD-${args.prd}. Use "${args.replacement}" instead.`);
    this.name = "AuraMigrationError";
    this.removedApi = args.removedApi;
    this.replacement = args.replacement;
    this.prd = args.prd;
  }
}
