# Runtime quality governor (`@aura3d/rendering`, 5.5.3)

`createAuraApp` runs a `RuntimeQualityGovernor` (5.5.3) by default. It moves quality up and down a five-rung ladder while
the scene runs, without remounting it. Source: `packages/rendering/src/quality/RuntimeQualityGovernor.ts`, wired in
`packages/engine/src/agent-api/app/frameLoop.ts`. The classes are exported from `@aura3d/rendering`; apps normally only
configure it through `createAuraApp` options.

## When it runs

The governor is on when all of these hold:

- the `A3D_QR_TIERS_GOVERNOR` flag is on (default on; `A3D_QR_TIERS` implies it);
- `renderer.quality` is unset or `"auto"` (a fixed tier such as `"high"`, or `{ tier: "high" }`, turns it off);
- the root `quality` option is unset or `"auto"`;
- adaptive quality is not disabled (`renderer.adaptive: false` or `?aura3d-adaptive=0` turns it off), and no fixed tier is
  requested through `?aura3d-quality=<tier>`.

`renderer.targetFrameRate` sets the budget (`1000 / targetFrameRate` ms); without it the budget is `16.67` ms.

```ts
import { createAuraApp, scene } from "@aura3d/engine";

// Governed: auto tier, 60 fps budget.
const app = createAuraApp("#app", { scene: scene(), renderer: { quality: "auto", targetFrameRate: 60 } });
void app.ready();
```

## Ladder (`RUNTIME_QUALITY_LADDER`)

| Rung | Pixel-ratio cap | Resolution scale | Render scale | Max post tier | Shadow cascades | Shadow map | Performance preset |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | mount tier cap | 1.0 | 1.0 | `ultra` | 4 | 4096 | `high` |
| 1 | 1.5 | 0.92 | 0.9 | `high` | 3 | 2048 | `high` |
| 2 | 1.25 | 0.85 | 0.85 | `medium` | 2 | 1024 | `balanced` |
| 3 | 1.0 | 0.75 | 0.75 | `low` | 1 | 1024 | `low` |
| 4 | 1.0 | 0.67 | 0.67 | `low` | 1 | 512 | `low` |

The post tier never rises above the mount tier. Unless the app locked its performance quality, a step also scales particles
(`1`, `0.9`, `0.75`, `0.6`, `0.5`) and LOD bias (`1`, `1.2`, `1.5`, `2`, `2.5`) by rung.

## Stepping rules

Millisecond thresholds below are for the default 16.67 ms budget; they scale with `targetFrameMs / 16.67`.

- Ignores the first 45 frames and the first second after mount, gaps over 100 ms (background tabs) plus 5 frames after
  resume, and frames where the shader program count went up.
- Steps down one rung when the 75th percentile of the last 30 frames is over 18.5 ms and at least 20 of those 30 are over
  budget, at most once per 1.5 s.
- Steps up one rung no sooner than 8 s after a step-down, when the last 180 frames have p75 under 12.5 ms and p90 under
  14.5 ms.
- If a step-down follows a step-up within 12 s, the ceiling is locked at the lower rung: for 60 s the first time, for the rest
  of the session the second time.
- Frames clustered at 33.33 ms with under 5 ms of CPU work and no GPU timing are read as a 30 Hz VSync lock (iOS Low Power
  Mode), and the rung is held instead of stepping down.

## `RuntimeQualityGovernor` API

| Member | Description |
| --- | --- |
| `new RuntimeQualityGovernor(options?)` | Options: `mountTier` (default `"high"`), `targetFrameMs` (default `16.67`), `warmupFrames` (`45`), `warmupMs` (`1000`), `maxValidDeltaMs` (`100`), `stepDownCooldownMs` (`1500`), `stepUpCooldownMs` (`8000`), `bounceWindowMs` (`12000`), `firstBounceLockMs` (`60000`). |
| `sample(input)` | Feeds one `RuntimeQualitySample` (`nowMs`, `rafDeltaMs`, `cpuBodyMs`, optional `gpuMs`, optional `compiledPrograms`) and returns a `RuntimeQualityStepResult` (`changed`, `direction`, `previousRung`, `rung`, `vsyncLocked30Hz`, `ceilingRung`, `allocation`, `effectivePostTier`). |
| `notifyVisibilityResume()` | Tells the governor the page became visible so the resume spike is ignored. |
| `rung`, `allocation`, `effectivePostTier`, `vsyncLocked30Hz` | Current state. |
| `effectiveCeilingRung(nowMs)` | The best rung allowed at `nowMs` under any bounce lock. |

Helpers `ensureRuntimeQualityState`, `runtimeQualityStateFor`, `bindRuntimeQualityDevice`, `runtimeQualityDeviceStateFor`
and `clearRuntimeQualityState` attach the current rung allocation to a canvas or device for the renderer to read.

## `QualityGovernor` (internal feature-step governor)

`QualityGovernor` in `packages/rendering/src/quality/QualityGovernor.ts` is a separate, internal governor used by the
`QualityController`; it is not exported from `@aura3d/rendering`. When render scale is pinned at its floor and frame time is
still over budget, it steps one feature down to the next-lower tier's value, in this order: `ssr`, `ambientOcclusion`,
`volumetricFog`, `shadow.cascades`, `shadow.mapSize`, `bloomMipLevels`, `particleBudget`, `msaaSamples`. It restores steps
last-in first-out after sustained headroom and never steps while locked.

## Boundaries

The governor trades resolution, post-processing, shadows, particles and LOD for frame time. It does not promise a frame rate
on any device. See [claims-and-boundaries](../agents/claims-and-boundaries.md).
