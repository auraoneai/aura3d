# Shader diagnostics: custom shader failures are loud and non-fatal

A `material.custom`, `material.node`, `effects.shaderPass` or `PortableShaderMaterial` program that fails to compile or link (or has no WGSL twin on WebGPU) no longer blanks the frame and no longer fails silently. The failing draw is handled, every other draw continues, and the failure is reported in four places.

## What you get

| Where | What |
| --- | --- |
| `console.error`, once per material | `[aura3d] CUSTOM_SHADER_COMPILE_FAILED: material "<name>" fragment line 23 (source line 4): 'dup' : redefinition`, followed by the offending line and 3 lines of context either side, and what happens to the draw |
| `app.diagnostics().shaderFailures` | structured records (below), present only when non-empty |
| `app.diagnostics().errors` | one summary line per failure, so `createAuraRouteHealthSnapshot` reports `status: "error"` and `check-deploy` fails |
| `?diag=1` panel (`@aura3d/debug` safety net) | `SHADER CUSTOM_SHADER_COMPILE_FAILED "<name>" fragment line 23 (source line 4): <message> >> <offending line>` |

## Codes

| Code | Meaning |
| --- | --- |
| `CUSTOM_SHADER_COMPILE_FAILED` | a stage did not compile; `stage` is `vertex` or `fragment` |
| `CUSTOM_SHADER_LINK_FAILED` | the stages compiled but the program did not link (for example a varying mismatch); `stage` is `link` |
| `CUSTOM_SHADER_WGSL_MISSING` | WebGPU only: the material has GLSL sources but no WGSL program, so it cannot draw |

## The record

```ts
const failure = app.diagnostics().shaderFailures?.[0];
// failure.code        "CUSTOM_SHADER_COMPILE_FAILED"
// failure.material    the material name
// failure.stage       "vertex" | "fragment" | "link"
// failure.log         the full driver info log
// failure.locations   [{ line, authoredLine?, message, window: [{ line, text, error }] }]
// failure.mode        "skip" | "magenta" | "throw"
// failure.count       times it was hit
```

`line` is the line in the assembled program (what the driver reports). `authoredLine` maps it back to your own GLSL when the failing line sits after the engine's preamble (exact when no `#include` expands before it, best effort otherwise). `window` is the offending line plus three lines either side from the assembled program, with `error: true` on the offending row.

## What happens to the failing draw

Default is `skip`: the item is not drawn, the failure is recorded, and the program is not recompiled every frame (a changed shader library or a hot reload retries it). Option `renderer.shaderFailures`:

```ts
createAuraApp(canvas, { scene, renderer: { shaderFailures: "magenta" } }); // "skip" | "magenta" | "throw"
```

- `skip` (default): skip the item, keep every other draw.
- `magenta`: draw the item with a flat magenta debug material so the broken object is visible. This is the default when the page URL carries `?diag=1`.
- `throw`: fail the frame with `AuraRuntimeError` (code `custom-shader-compile-failed`). This is also what strict mode does (`strict: true`, `A3D_QR_STRICT`, or `renderer.materialStrictness: "strict"`). The production renderer submits frames asynchronously, so there the error is recorded as the frame's error in `diagnostics().errors` (`AuraRuntimeError: CUSTOM_SHADER_COMPILE_FAILED: ...`, route health reports `error`) rather than rejecting `app.step()`; a synchronous renderer throws it to the caller.

The setting is process-wide (the last app created wins), and creating an app clears the failure list.

## WebGPU

A material without a WGSL program raises `WGSL_PROGRAM_MISSING` from the device; it is reported as `CUSTOM_SHADER_WGSL_MISSING` through the same path, with the same skip / magenta / throw handling.

## Lower-level API (`@aura3d/rendering`)

`getShaderFailures()`, `clearShaderFailures()`, `setShaderFailureMode(mode)`, `formatShaderFailure(record)`, `parseShaderLog(log)` and the record types are exported for tools and tests.

## Verified

Unit tests with an injected failing device (`tests/unit/parity/shader-failures.test.ts`) cover compile, link and WGSL-missing failures, once-only logging, no recompile per frame, skip, magenta and throw, the diagnostics merge and the log parser. A remote WebGL2 spec (`tests/browser/shader-failures.spec.ts`, lab at `examples/shader-failure-lab/`) mounts a deliberate duplicate-variable shader next to a valid mesh on software WebGL2 only; it has not been run on a real GPU or on WebGPU hardware.
