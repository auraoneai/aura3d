# T1.14 — `prd06-crossfade-filmstrip` (PRD-06:1212)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


Scene `prd06-crossfade-filmstrip` in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd06/`.
Both engines run Soldier `Idle → Walk` at t = 0.5 s and `Walk → Run` at t = 1.5 s with 0.25 s
fades; eight strip frames are captured at fixed wall-clock intervals (`strip: { frames: 8,
intervalMs: 300 }`, C-30). The three side uses `crossFadeTo(next, 0.25, true)` with
phase-matched `next.time`; the aura side drives `handle.play` on the `locomotion` syncGroup.
The aura adapter emits per-frame bone rotations for the §17.3 metrics, computed by
`packages/animation/src/pose/MotionMetrics.ts` (new — intentionally not built on
`MotionQuality.ts`, E42).

## Capture path (headless SwiftShader)

- Compositor `page.screenshot()` reads black under headless SwiftShader, and
  `app.screenshot()` reads the app's offscreen canvas (also black). Strip frames are captured
  **in-page** via `canvas.toDataURL("image/png")` on the presented canvas (the last
  `host.querySelectorAll("canvas")` item) and published on
  `window.__PRD06_CROSSFADE_{FILMSTRIP,THREE}_FRAMES__`; the spec decodes base64 → PNG.
- `--use-angle=metal` is a macOS-only ANGLE switch that kills GL on Linux — the lane config
  gates it behind `process.platform === "darwin"` (lane CI is macos-14 where it is required).
- Any throw inside the rAF loop now publishes `status: "error"` + message/stack into the
  report global instead of dying silently.
- The horizon loop keeps ticking until both `sim >= motion.horizonSeconds` **and** 8 strip
  frames exist (headless renders are slower than wall-clock; the last clip keeps looping so
  late frames still differ).

## §17.3 metrics (aura3d run, chromium)

| Metric | Bar | Measured | Result |
| --- | --- | --- | --- |
| Continuity C @ t = 0.5 (Idle→Walk) | ≤ 1.5 | 0.9296 | PASS |
| Continuity C @ t = 1.5 (Walk→Run) | ≤ 1.5 | 0.9226 | PASS |
| Foot slide (4 contact phases) | ≤ 2 cm walk / ≤ 3 cm run | 6.75e-6 m | PASS |
| Phase error (14 compared frames) | ≤ 1 % | 2.22e-16 | PASS |

- `frameCount`: 402; `simSeconds`: 6.70; `sampledBones`: 49.
- `firedTransitions`: `["Walk", "Run"]` on both engines.
- 8/8 distinct strip PNGs per engine (verified by content hashes; 146–236 KB each — real
  rendered frames, not black).

## Files

- Scene spec: `benchmarks/quality-rebuild/scenes/prd06/crossfade-filmstrip.ts`
- Aura adapter: `benchmarks/quality-rebuild/aura3d/scenes/prd06/crossfade-filmstrip.ts`
- Three adapter: `benchmarks/quality-rebuild/three/scenes/prd06/crossfade-filmstrip.ts`
- Browser spec + harness: `tests/qr/prd06/browser/crossfade-filmstrip.{spec,harness}.ts`
- Metrics impl + unit tests: `packages/animation/src/pose/MotionMetrics.ts`,
  `tests/unit/animation/motion-metrics.test.ts` (10/10 green)

## Gates

- `pnpm exec vitest run tests/unit/animation/motion-metrics.test.ts` — 10/10
- `pnpm exec playwright test tests/qr/prd06/browser/crossfade-filmstrip.spec.ts --project=chromium` — 2/2
- `tsc -p tsconfig.check.json --noEmit` — no errors in touched files
- `eslint` on touched files — clean
