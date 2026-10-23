# Ninja Runner port - remote render frames

480x270 JPEGs logged by `tests/browser/ninja-runner-port.spec.ts` on a serverless ACR Playwright run (WebGL2, software GL, `quality=low`): intro, run-start, jump, clones, rasengan, sage, kurama, finish, lost.

Claim boundary: shows the Aura3D port boots, renders its world and 12 skinned actors (one `cloneSkinned` call, shared textures, independent skeletons) and plays movement, combat, clones, Sage, Kurama, a win, a restart and a loss. It does not claim pixel parity with the original: the characters are the repository soldier fixture tinted per form, and the environment is procedural. Simulation parity (course digest, 12,759-step run, 513 events, trace delta 0) is asserted in the same spec and recorded in `evidence/crayon-capture/ninja-runner-reference.json`.
