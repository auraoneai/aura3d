# PR F — T2.7–T2.14 skill/doc rewrites + craft-target flip

## Scope

- T2.7 `aura3d-core/SKILL.md`: hello world is `scene().add(looks.preset("product-studio")).add(model(assets.robot))` + `...looks.appOptions("product-studio")`; routing table puts `aura3d-art-direction` first for any visual task; claim content reduced to one line linking boundaries.
- T2.8 `aura3d-browser-game/SKILL.md`: genre → recipe row → template → look-dev loop; genre gates kept as one table; evidence steps 7–10 replaced by the one-line evidence-review link; `lights.studio()`-only sample deleted.
- T2.9 `aura3d-scene-authoring/SKILL.md`: v2 report semantics (`visualSystems` = what the compiled scene contains; `rejected` = what the engine could not do; repair from `repairHints` + `look lint`); "Add only prompt-required customization" dropped; benchmark wording updated.
- T2.10 `aura3d-evidence-review/SKILL.md`: visual rounds ≤ 6 with highest-leverage fix (lint codes first); `structuralQA` marked "diagnostics, never acceptance"; claim labels live here only; "could not capture" keeps `prototype` and must name the failed loop step.
- T2.11 `aura3d-materials-environments`: leads with looks/biomes/env presets before HDRI admission; `material.visualQA` mention → `structuralQA.material` (diagnostics only). `manifest.json`: `aura3d-art-direction` in `coreSet` (order per §7.7); `aura3d-materials-environments` added to every game template. check.ts init smoke asserts `selectSkills(manifest,'core','mini-game')` includes both.
- T2.12 eight skills (game-art, meshy-cli, performance, threejs-migration, character-animation, retexture, assets, animation-studio): each gained a `## Look target` section + boundary one-liner kept; evidence restatements trimmed. No `<!-- C-40:F-NN-MM -->` markers added — every Appendix B row is still `proposed`, and the new check fails a citation of any non-`verified` row.
- T2.13 `llms.txt` rewritten per §6.6 (116 → 119 lines): look-first hello world, quality floor/never list, corrected three.js→Aura3D table, 13-row genre recipe table, 5-step look-dev loop, claims, `Release integrity rules:` block kept verbatim, benchmark-mode line. `public/llms.txt` resynced byte-for-byte; `pnpm skills:sync` ran (all mirrors byte-identical).
- T2.14 docs: `docs/agents/art-direction.md` created (supersedes `cinematic-scene-quality.md`, which is now a redirect stub); `no-hackjob-rules`, `build-playbook`, `benchmark-recipes`, `game-example-standards` (visual bar bullet), `README`, `agent-context` amended; `visual-quality-standard.md` links art-direction.md; `build-a-browser-game.md` gained a "Apply the Genre Look" section + look-prefixed samples; new look references: `look-by-family.md`, `genre-looks.md`, `stage-and-lighting.md`, `look-mapping.md`, `preview-under-look.md`, `shot-looks.md`, `sprite-palettes.md`, `framing-and-shots.md`.

## API change folded in

- `looks` is now exported from `@aura3d/engine` `index.ts` (was unreachable — T1.2 created the builder but never re-exported it; T2.7's documented hello world requires it).
- `looks.preset` overloads: no-options call returns `AuraNodeBuilder<AuraGroupNode>` (the flag-off documented shape — `scene().add(looks.preset(id))` compiles); calls passing `options` keep the `AuraNodeBuilder | AuraLookNode` union. Runtime behavior unchanged.
- `check.ts`: `ENABLE_CRAFT_TARGETS = true` — all §6.5 gates now enforce on the live corpus; `LEGACY_VISUAL_QA_FILES` emptied (T2.10/T2.11 rewrites landed); `SECTION_ORDER_SKILLS` = {art-direction, core, browser-game, scene-authoring, materials-environments}; new exported `parseC40RowStatus` + `checkFactRowCitations` implement the T2.12 verified-row gate against CONTRACTS.md Appendix B.

## Verification (local)

- `pnpm check:skills` → `"failures": []` with craft targets ENABLED:
  skills combined craft 370 ≥ evidence 369; game path craft 176 ≥ 2×88;
  art-direction craft 110 ≥ 3×15; llms.txt craft 27 ≥ 11.
- `tests/unit/tools/agent-skills-check.test.ts`: 25/25 pass (incl. new C-40 fixtures).
- `pnpm exec tsc -p tsconfig.build.json --noEmit`: clean.
- eslint on touched TS: clean.
- `pnpm check:agent-docs`: vite build of the simulated hello-world app PASSES; the
  playwright screenshot leg is NOT RUN locally (no local Playwright per lane rule;
  remote run owns it). Earlier failures fixed along the way: `looks` export added,
  `environments.preset` invented member removed, rig ids corrected to real camera
  vocabulary, post ids restricted to the 7 real `AuraPostPresetId`s, animation-studio
  body trimmed back under 150 lines.

## NOT RUN

- `llms-agent-simulation` playwright legs (browser capture — remote only).
- `check:agent-docs` end-to-end green — the last failure is the missing local
  Playwright binary only; see above.
