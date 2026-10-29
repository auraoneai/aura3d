# Lane G14 evidence: Cross Hop before and after

Remote runs on the ACR runner (headless Chromium, SwiftShader WebGL2, about one frame every 2 to 4 s). Spec: `tests/browser/audit-fix/cross-hop.spec.ts`. Each folder holds the decoded canvas JPEGs (`<target>__<shot>.jpg`; `-hud` shots include the DOM HUD), `meta.jsonl` (luma stats of every shot, whole frame and top/middle/bottom thirds, plus the game beacon and engine diagnostics) and `states.log` (beacon at each scripted step, console warnings, HTTP errors).

| Folder | Build | Targets |
|---|---|---|
| `before/g14before-a` | `audit-fix/integration` b2dba3713 (4.5.0 base) | autoplay desk 1280x720 and phone 390x844 |
| `before/g14before-bd` | base | Train Dodges drill and 20 restarts; flow (Neon tour, Quick Play after it). The flow test timed out waiting for the hawk |
| `before/g14before-themes-r` | base | `?theme=3`, `?theme=4` |
| `v437/g14v437-themes` | v4.3.7 | `?theme=3`, `?theme=4` |
| `after/g14after-a` | `audit-fix/g14` | autoplay desk and phone; the theme shots here died on row 0 and are superseded by `g14after-themes` |
| `after/g14after-bd` | lane | drill and 20 restarts; flow with death card |
| `after/g14after-c` | lane | evidence screens 01 to 03 at 1280 and 390 |
| `after/g14after-themes` | lane | `?theme=3`, `?theme=4` |
| `after/g14after-prod-r` | lane | `?aura3d-render=production` on the autoplay seed |
| `after/g14after-card` | lane | 1440x900 card |
| `after/g14combo-themes2` | lane + `audit-fix/e1` + `audit-fix/e2` merged in a throwaway worktree | `?theme=3`, `?theme=4` |

Numbers are summarised in `docs/audits/lanes/g14.md`.
