# Asset attribution

None of these assets come from the original game.

All 3D characters, landmarks, gates, hazards, floating islands, pagodas, lanterns, carts, and pickups in `Serpentine Sky Run` (`saiyan-snake-way-port`) are authored procedurally in TypeScript on `@aura3d/engine` (`skyRunnerRig.ts`, `art/proceduralModels.ts`, and `world.ts` using `geometry.define`, `geometry.multiMaterial`, `group`, and `material.*`). The runner and the most-seen props are drawn as Idol GLBs generated through fal from our own reference images (`apps/showcase-serpentine-sky-run-port/assets/idol/*.glb`, per-asset provenance in the matching `*.idol.json`); `?idol=0` keeps the procedural kit.
