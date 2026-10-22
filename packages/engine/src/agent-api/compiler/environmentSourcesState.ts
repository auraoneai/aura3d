/**
 * Lane-02 environment-source registration flag (writer:
 * `registerPrd02EnvironmentSources` in `compiler/environment.ts`).
 *
 * Kept in a leaf module — no agent-api imports — because `lanes/prd02.ts`
 * self-registers at module scope and a cyclic import order can run that
 * lane body while `compiler/environment.ts` is still mid-initialisation.
 * Holding the flag here keeps the registration idempotent in any
 * evaluation order; prd02 imports this leaf directly so it is always live
 * before the lane body runs.
 */
export const prd02SourcesState: { registered: boolean } = { registered: false };
