# Lane G19 wave 3: HP-01..HP-19 before and after

Remote software WebGL2 (SwiftShader) on the ACR runner, `tests/browser/audit-fix/heatsink-port.spec.ts --grep=fixes`, page `/examples/heatsink-port/?manual=1` (the app route mounts the same module). Not real-GPU evidence. Frames are deterministic: the recorded reference script is replayed to fixed steps, so before and after render the same game state. Steady state is judged at steps 1200 and 2250; step 260 is 1.1 s after GO.

- `before/`: run `g19-w3-base`, base `audit-fix/integration` b2dba3713 with the spec copied in.
- `after/`: run `g19-w3-after2`, lane branch at 17aa44ccc plus later docs (desktop and phone fix checks, plus the circuit screenshot spec).
- `after-bounds/`: run `g19-w3-after3`, lane branch with the course bounds on the per-frame strips (desktop only).
- `fix.json` in each folder holds every `HP_FIX` record; `decode.mjs` rebuilds the folders from a run log.

| Check | Before | After |
|---|---|---|
| `#count` 1.1 s after GO (step 260) | "GO", visible | "", hidden |
| `#objective` at step 260 / 1200 / 2250 | hidden (under GO) | visible: "NEXT TARGET 307 m · BRONZE AT 16 KILLS" |
| Esc during the race | no panel (`#pause` absent) | `#pause` visible; blur also opens it |
| `stepFrames(240, { throttle: 1 })` | throws "Semantic position values must be finite", player.x NaN | no error, player.x -10.01 |
| forced runtime error | no error panel (hook absent) | `#error` visible with restart; restart clears `faulted` |
| bot race at 80 m/s | not possible (no hook) | finished in 291.7 s, 42 kills, 23 barrels, best chain 15, GOLD; card shows the medal rules |
| overheat bot | n/a | DNF card, notice "Overheated. Out of hull: DNF", hull □□□□ |
| first crash | `#notice` never written | "Overheated. 2 crashes left", hull ■■■□ |
| HUD | TARGETS, TAKEDOWNS, POSITION hidden, BEST LAP block | KILLS / RACE, HULL pips, best lap under TIME |
| phone 390x844 | no touch controls; quality high | 7 touch buttons 56-84 px, all inside the viewport; quality low (coarse pointer) |
| touch input (phone) | n/a | idle throttle 1 (auto); right+fire held: steer 0.18, fire true; pointercancel: fire false; brake: throttle 0, brake 1 |
| bloom post warnings | none surfaced by `diagnostics().warnings` on either build | none |
| whole-frame luma, step 1200 / 2250 | 52.62 / 51.16 | 55.01 / 52.23 (after-bounds) |
| drone region luma (x 560-720, y 340-460), 1200 / 2250 | 33.9 / 26.9 | 74.3 / 56.9 (lite models are not used on desktop; the gain is the LIGHT-01 environment) |
| contact shadow region (x 560-720, y 600-720) vs `after/` | n/a | -13 to -19 luma (blob drawn); 0.0 to 0.2 in `after/`, which is how the culled strips were found |
| draw calls, step 1200 / 2250 | 51 / 47 | 55 / 57 (the blob, streaks and exhaust now draw) |

Phase B spec (`tests/browser/heatsink-port.spec.ts`) times out at its 25-minute limit on both builds (runs `g19-w3-regress` and `g19-w3-base-phaseb2`, both after the 1170-step frame), so it is a runner speed limit, not a regression. `tests/browser/heatsink-strike.spec.ts` passes on the lane branch with the re-pinned strike outcome (score 6350, 9 barrels, best chain 7, hash 914c9b7d).
