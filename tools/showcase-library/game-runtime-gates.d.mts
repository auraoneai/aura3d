/**
 * Types for the WS-7 game-runtime gates.
 *
 * The gate runner is `.mjs` so it can be invoked directly as a CLI without a build step, which is
 * what makes `--against v1.5.2` usable by hand. That leaves it untyped for consumers, and
 * `check:release` typechecks tests under `noImplicitAny`, so a companion declaration is the
 * honest fix — the alternative is `any` at the call site, which would silently stop catching
 * shape changes in the report.
 */
export interface GameRuntimeGateCheck {
  readonly id: "penetration" | "motion-feel" | "telemetry-coherence" | "opaque-asset";
  readonly verdict: "pass" | "fail";
  /** Named causes. Empty on a pass; each entry identifies one specific defect. */
  readonly blockers: readonly string[];
  /** Raw values the verdict was derived from, so a failure is auditable. */
  readonly measured: Readonly<Record<string, unknown>>;
}

export interface GameRuntimeGateReport {
  readonly schema: "aura3d-game-runtime-gates/1.0";
  readonly generatedAt: string;
  /** The git revision measured, or `"working-tree"`. */
  readonly against: string;
  readonly pass: boolean;
  readonly checks: readonly GameRuntimeGateCheck[];
}

export interface RunGameRuntimeGatesOptions {
  /** Git revision to read sources from. Omit to measure the working tree. */
  readonly against?: string | undefined;
}

export function runGameRuntimeGates(options?: RunGameRuntimeGatesOptions): GameRuntimeGateReport;

/** Read a file from the working tree, or from a git revision when `against` is given. */
export function readSource(path: string, against?: string): string | undefined;
