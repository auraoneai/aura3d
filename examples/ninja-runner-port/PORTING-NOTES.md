# Ninja Runner port - notes

Phase C exit for the three.js parity PRD (R-20). Reference: Crayon "Ninja Runner" (three r184 bundle).

## What is exact

- `course.ts` / `sim.ts` are line-for-line transcriptions of the original's seeded xorshift course (seed 17) and fixed-step simulation (`1/120`).
- Course digest `ce4c2fda` (entities + FNV-1a) matches the original.
- The recorded reference run (12,759 steps / 106.325 s / 102 kills / score 39,735 / win) replays event-for-event; max trace delta 0 against a 1e-9 tolerance floor. The idle run loses at 604.49 in both.
- Four independent capture sessions were bit-identical (`evidence/crayon-capture/ninja-runner-reference.json`).

## What is approximated

- Characters: one `cloneSkinned` call produces 12 actors from the repository soldier GLB (shared GPU textures, independent skeletons and mixers). Form and enemy type are expressed as tints and scale, not as the original's character models.
- Environment: procedural meshes (rooftops, river, valley falls, props) built with `geometry.custom`; not the original's geometry.
- Shaders: the original's seven ShaderMaterial factories (sky, river, falls, Rasengan ball, sparks, leaf-flame billboards, particles) are ported to `material.custom` GLSL 300 es; all ten programs link under glslang (`tests/unit/ninja-runner-port/shaders-compile.test.ts`). No pixel parity is claimed.
- Audio: not ported.

## Known gaps

- The original's enemy attack code path (`rS`) is dead for approaching enemies and was never fired in any capture; it is transcribed but unverified.
- `MODEL_YAW_OFFSET` (soldier facing) was chosen without a GPU run; check the frames in `evidence/ninja-runner-port/`.

## Running

- Unit: `pnpm exec vitest run tests/unit/ninja-runner-port tests/unit/tooling/crayon-capture-ninja-runner.test.ts`
- Browser (remote only): `SPECS=tests/browser/ninja-runner-port.spec.ts tools/remote-acr/run.sh`
- Re-capture the original: `tools/crayon-capture/ninja-runner.ts` (remote ACR recipe in `evidence/crayon-capture/README.md`), then `ninja-runner-assemble.ts`.
