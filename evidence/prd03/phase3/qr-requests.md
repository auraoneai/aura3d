# Lane 03 Phase 3 — qr-request / ccr tracking

Requests lane 03 cannot satisfy inside its own ownership boundary
(CONTRACTS.md §4). Phase 0/1 rows live in `../phase0/qr-requests.md` and
`../phase1/qr-requests.md`.

## CCRs exercised (declared in CONTRACTS.md Appendix B)

| # | Touch | What | Status |
|---|---|---|---|
| CCR-03-9 | `packages/rendering/src/Renderer.ts` (owner 01) | Additive `RendererPostProcessOptions.cameraFrame?: FrameCamera | null` + `toFrameCamera(resolvedCamera, vp, position)` binding at both submit sites. Additive optional field, ignored flag-off. Row F-03-18. | LANDED (this PR) |
| — | `packages/rendering/src/cinematic/*.ts` (owner 07) | PRD-03 §6.9 mandates lane 03 move the CPU kernels to `reference/`; the old `cinematic/{BloomPass,VignettePass,FilmGrainPass,DepthHazePass}` paths keep `@deprecated` re-export shims (no logic). Row F-03-21; QR-03-8 is the lane-07 notice. | LANDED (this PR) |

## Open qr-requests

| ID | Target lane | Ask | Impact | Status |
|---|---|---|---|---|
| QR-03-8 | 07 | `cinematic/{BloomPass,VignettePass,FilmGrainPass,DepthHazePass}` moved to `packages/rendering/src/reference/` per PRD-03 §6.9 with `@deprecated` shims left at the old paths (PRD-mandated; also Q-07-1 reserves `VolumetricFog.ts` deletion for lane 07). Lane 07 to adopt/drop the shims when it owns the cinematic surface again. | Cross-lane file move declared in F-03-21; consumers keep compiling via shims. | filed |
| QR-03-9 | 15 | `AuraEffectType` union needs `"vignette" | "film-grain" | "chromatic-aberration"` and `AuraEffectNode` needs `smoothness`, `roundness`, `size`, `luminanceResponse` fields (`nodes/types.ts`). Until it lands the factories produce `as unknown as AuraEffectNode` payloads with a local `PostV3EffectOptions` widening. | New effect factories typed; remove the casts when the union lands. | filed |
| QR-03-10 | 15 | `AuraRuntimeError` code union needs `"POST_DUPLICATE_STAGE"` (`compiler/errors.ts`). Two AO effect nodes throw it from `postBridge.createRootPostPipeline`; until the union lands it is a plain `Error` whose message carries the code. | Typed error surface for the duplicate-stage contract. | filed |
| QR-03-11 | 11 | `TextureFormat` (`contracts/device.ts` / `RenderDevice.ts`) needs `R32F`, `RG32F`, `R8`, `RG16F` (and `resolveRenderTargetFormat` cases) — Phase-3 spec formats: S1 linear depth `R32F`, min/max half `RG32F`, AO `R8`, camera velocity `RG16F`. Until it lands the stages use `rgba32f` (≥ spec precision; `.r`/`.rg` channels) and `rgba8`. | Exact-precision targets + bandwidth; substitutes are functionally correct. | filed |

## Notes

- `AO_INDIRECT_FRACTION_PENDING` appears in `diagnostics().post.skipped` whenever
  flag-on AO is authored: the C-02 `generateProgram` is still the PR-0a stub
  repo-wide, so the `fragment:end` hook never lands in a compiled program. The
  marker clears itself once lane 01's generator is real.
- `POSTPROCESS_PASS_NOT_GPU` is a dev-throw / prod-skip contract (F-03-19): in
  production builds the pass is skipped and `POSTPROCESS_PASS_NOT_GPU:<name>`
  records into `post.skipped`; `cpu-deterministic` is the explicit reference
  opt-out.
- `warmPostV2Modules()` exists because the sync `executePostprocess` route
  cannot `await import()` — the first flag-on frame fires the dynamic import,
  later frames run the real stages (same as the async route).
