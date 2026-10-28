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
    // threejs-parity (docs/workflows/threejs-parity-gaps.md §5.0): a parity
    // node kind / material / API whose lane has not landed yet fails closed.
    | "parity-not-implemented"
    // SH-02 (L1): `material.custom(spec)` / `handle.setUniform` contract
    // violations — malformed spec, WGSL-only input, reserved uniform names,
    // invalid uniform values, unsupported render-state combinations.
    | "invalid-material-spec"
    // `primitives.box/sphere/plane/cylinder/capsule/torus` given a `params`
    // key the kind does not use (it would otherwise be silently ignored).
    | "invalid-primitive-params"
    // `defineModelAssets`: bad sha256, unusable URL, or unknown model id (would otherwise draw nothing in production).
    | "invalid-model-assets"
    // `scene({ ... })` given options it does not understand (a silent empty scene before).
    | "invalid-scene-options"
    // A custom shader (material.custom / material.node / shaderPass) failed to compile, link or has no WGSL twin; thrown only in strict mode (otherwise recorded in diagnostics().shaderFailures).
    | "custom-shader-compile-failed"
    // L7/SC-01: `cameras.array` / `cameras.stereo` option violations (viewport rects, eye separation, focus, fov).
    | "invalid-camera-spec"
    // AD-15 (P2): `lights.lensFlare` option violations (element size/distance, occlusion, edgeFade, intensity).
    | "invalid-lens-flare"
    // SH-04 (L1-12): `compute.*` / `app.compute` is WebGPU-only (WGSL). Every
    // call without a bound WebGPU device fails with this code, never a silent no-op.
    | "compute-requires-webgpu"
    // SH-04: malformed pipeline/buffer/dispatch input (GLSL instead of WGSL,
    // workgroup/limit violations, missing or mismatched bindings, disposed handles).
    | "invalid-compute-spec"
    // SH-01 (L1-11): TSL-subset graph violations (`tsl.*`, `material.node`).
    | "invalid-tsl-graph"
    | "tsl-type-mismatch"
    | "tsl-unsupported-node"
    | "tsl-unsupported-output"
    | "tsl-statement-outside-fn"
    | "tsl-requires-glsl-backend"
    // CCR-03-8 (additive): PRD-03 §7.1 — v2 post-bridge field rejection.
    | "POST_FIELD_UNSUPPORTED"
    // Beat-three.js WP-S.1 (decision 5): a builder was given an option it does
    // not read. Raised instead of dropping the option; the message names the valid keys.
    | "OPTION_IGNORED"
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
