# Repainted athletes: frames from the remote run

Run `retex-1` (tools/remote-acr/run.sh, software WebGL2 via SwiftShader at 1280x720, so not GPU evidence): `tests/browser/retex-frames.spec.ts` serves a build of each game and records two frames about 12 seconds apart. 4 of 4 passed: the repainted GLB was requested and served (200) in every game and there were 0 console errors.

| Game | Frames | Model | What the frame shows |
|---|---|---|---|
| Aura FC 3D | `frames/aura-fc-3d-*.jpg` | `fcSoccerStrikerClean`, `fcGoalkeeperClean` | red and white kits through the kit-only tint, natural skin and hair, no chest marks |
| Red Zone 3D | `frames/red-zone-3d-*.jpg` | `rzQuarterbackClean` | navy and gold players, no lettering or badge |
| Aura Diamond 3D | `frames/aura-diamond-3d-*.jpg` | `diamondAthleteClean` | white kit and plain navy cap, bat in hand (Diamond rework lane) |
| Aura Links 3D | `frames/aura-links-3d-*.jpg` | `linksGolferAthleteClean` | flat polo, trousers and cap; ragged region edges |

The audit method, findings and the open items (Teleoperator vehicles, the rooftop face-scan files, brand marks on race textures) are in `docs/audit/likeness-brand-audit.md`.
