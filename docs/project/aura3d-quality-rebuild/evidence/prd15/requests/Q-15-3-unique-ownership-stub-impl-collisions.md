# Q-15-3 — unique-ownership collisions surfaced at the Phase-8 gate pass

Requester: lane 15 (Phase-8 arch-gate pass, 2026-10-07).
Kind: §12.4 cross-lane request — records name collisions the `unique-ownership`
gate enforces, why each exists, and the owner expected to converge it.

## Contract-stub vs real-implementation pairs (custodian: lane 15 → lane 09)

`aura.exports.json` "." resolves through `packages/engine/src/public/index.ts`,
which publishes the CONTRACTS flag-off stubs. `packages/game` exports the real
PRD-09 implementations. Both package indexes therefore export the same names
with different declarations:

| Name | Engine decl | Game decl | Intent |
|---|---|---|---|
| `createGame` | `contracts/stubs/game.ts` (C-24 stub, flag-off) | `src/index.ts` (real `Prd09Game`) | `.` keeps the stub for surface parity until flag-off retires; consumers use `@aura3d/engine/game` or `@aura3d/game` for the real impl. |
| `captureFromUrl` | `contracts/game.ts` (contract helper) | `src/capture/captureFromUrl.ts` | Same name, contract-shaped decl vs runtime impl. |
| `GameFxKind` | `contracts/game.ts` (contract union) | `src/juice/Juice.ts` | Contract kind union vs juice-fx impl union. |
| `TouchPreset` | `contracts/game.ts` | `src/touch/TouchControls.ts` | Contract preset vs impl preset. |

Convergence path: when the flag-off stubs retire (post-4.0.0 contract
sunset), `.` should re-export the game package's declarations directly —
collapsing each pair to one declaration and clearing the finding. Lane 09
owns the game surface; lane 15 owns the stub sunset.

## Foreign-owned collisions (recorded so the gate stays honest)

| Name | Packages | Owner |
|---|---|---|
| `AudioBus` | `audio` + `game` (`shell/screens/Settings.ts`) | lane 09 — Settings.ts re-declares a bus type instead of re-exporting `@aura3d/audio`'s |
| `slerpQuat` | `animation` + `scene` | lanes 01/06 — duplicate quaternion helper |

## Allowlist

Six entries in `tools/arch-gates/allowlist.json`, `expires: 2026-11-15`,
`request: Q-15-3`.
