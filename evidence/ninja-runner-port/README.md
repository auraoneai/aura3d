# Ninja Runner port - remote render frames

480x270 JPEGs logged by `tests/browser/ninja-runner-port.spec.ts` on a serverless ACR Playwright run (WebGL2, software GL, `quality=low`): intro, run-start, jump, clones, rasengan, sage, kurama, finish, lost.

Claim boundary: shows the Aura3D port boots, renders its world and 12 skinned actors (one `cloneSkinned` call, shared textures, independent skeletons) and plays movement, combat, clones, Sage, Kurama, a win, a restart and a loss. It does not claim pixel parity with the original: the characters are the repository soldier fixture tinted per form, and the environment is procedural. Simulation parity (course digest, 12,759-step run, 513 events, trace delta 0) is asserted in the same spec and recorded in `evidence/crayon-capture/ninja-runner-reference.json`.

## Generated-model pass (Meshy, 2026-10-23)

Four rigged characters (hero, foot soldier, brute, sage) and seven props (two houses, tower, gate, lamp post, pine, oak) were generated from own text prompts through Kiro Prism and wired in (`examples/ninja-runner-port/models.ts`, `assets/meshy/`, provenance in `assets/ATTRIBUTION.md`).

- Frames: `art-m2-*.jpg` (after) against `art-f-*.jpg` (before, the CC0 rig and procedural village); before | after sheets are `meshy-compare-<state>.jpg`. `art-m1-*` is the first wiring (props floated; kept to show the grounding fix).
- Draw calls at the village frame (`NINJA_RUNNER_BUDGET default`, 960x540, high): 133 -> 54 (houses, towers, lamps, gates and trees are one instanced draw per model instead of fifteen procedural layers); art frames report 32-59.
- Blind judge (model, not a human; Kiro Prism, seed 20261023, 48 trials on village-a/b): `judge-meshy.json` identifies the original 48/48 (before this pass 47/48), so the port is still distinguishable. Structural distance vs the original at the two village states (before -> after): luma JSD 0.126/0.116 -> 0.183/0.119, edge-density ratio 0.83/0.73 -> 0.86/0.83, luma mean delta 11.0/3.9 -> 22.9/11.8 (the new scene is brighter than the original). The pass improves the models, not the colour match.
