# Q-01-1 — lean-device diff audit: no bugfix lines to port

**Lane:** 01 (owns `packages/rendering/src/WebGL2Device.ts`)
**Requested by:** lane 15 (PRD-15 T2.3)
**Status:** OPEN — sign-off requested, no code change asked
**Filed:** 2026-10-06

## What

PRD-15 T2.3 required a whitespace-normalized
`diff WebGL2Device.ts LeanWebGL2Device.ts`, each differing line classified
`feature-removal` | `bugfix` | `identical-after-rename`, and a patch + test
for every `bugfix` line.

**Result: zero bugfix lines.** The full audit is in
`docs/architecture/lean-device-diff.md` with the machine-readable diff at
`docs/architecture/lean-device.diff` (129 hunks, 4,321 changed lines —
the PRD's 346-line estimate predates the PR-0b-2 carve-out).

## Findings

- The lean device is a **pre-carve-out snapshot**: every same-member delta
  traces to an identical implementation in `webgl2/` modules
  (`MultiDraw.ts:57` vertex-format errors, `MultiDraw.ts:418` stencilCompare,
  `TextureUpload.ts:235` completeUploadLevels, `LegacyPost.ts` post programs,
  `ContextLifecycle.ts` context-lost wiring).
- Nothing lean-side fixes anything main lacks; conversely lean lacks
  main-side additions itemized in the doc (C-28 `programCompileCount` /
  `readPixelsCalls` counters, `nativeTemporal*` counters, `csm` shadow-label
  counting, `DeviceProbe`).

## Requested action

None — no `WebGL2Device.ts` edit is proposed (per T2.3). Please confirm or
contest the zero-bugfix verdict; lane 15 proceeds to delete the lean device
in the consolidation phase on that basis.
