# Asset attribution

None of these assets come from the original game.

The characters (`hero`, `sage`, `soldier`, `brute`, `caster`, `scout`), town houses, teahouses, watchtowers, market stalls, lanterns, pines, maples, the evening set-pieces and the katana / kanabo in `Shadowstep Gauntlet` (`ninja-runner-port`) are Idol GLBs generated through fal from our own reference images (`assets/idol/*.glb`, per-asset provenance in `assets/idol/*.idol.json`). Gates, fences, bushes, rocks, cliffs and ridges, and every actor and prop under `?idol=0`, are authored procedurally in TypeScript on `@aura3d/engine` (`art/proceduralActors.ts`, `art/proceduralModels.ts`, and `world.ts`).
