# CLI asset tools

Capability label: CLI asset pipeline (local files only; nothing here calls Meshy or handles a credential).

Five additions to `@aura3d/cli` came out of porting eleven games with generated 3D assets. Each replaces a script the games had copied by hand. The step-by-step workflow that uses them (catalog, Meshy, optimise, isolated admission, rig and clips, production rules) is `docs/agents/asset-workflow.md`.

| Command | What it does |
| --- | --- |
| `aura3d assets optimize --file in.glb --out out.glb [--role hero\|vehicle\|character\|prop\|background]` | Dedup, weld, budgeted simplify, prune, texture downscale. Direct-file mode of the existing `assets optimize` verb (the id-based admission pipeline is unchanged). |
| `aura3d assets merge-clips --base rig --out file.glb name=clip ...` | Merge Meshy `animate` clips into one rigged GLB by node name; rejects a foreign skeleton. |
| `aura3d assets import-meshy <dir> --into <assets-dir> --prefix <game> --name <role>` | Isolated admission: a temporary project, then only the hashed GLB and evidence are copied into the game's folder. |
| `aura3d meshy ledger status\|reserve\|settle\|reconcile\|baseline\|config\|list` | Credit ledger: hard-stop per-game and global caps under a lock, dry run, Prism reconcile. |
| `aura3d evidence judge --a dir --b dir` | Blind A/B model judge over matched frames (section below). |

## `assets optimize --file`

Budgets (vertices, texture px): `hero` and `vehicle` 40,000 / 2048, `character` 30,000 / 2048, `background` 15,000 / 1024, `prop` 6,000 / 1024 (default). Overrides: `--max-verts N`, `--tex N` (16 to 4096), `--error 0.05`, `--no-simplify`, `--meshopt`, `--json`. Skinned meshes simplify with locked borders. The input is never overwritten (`--out` must differ). Geometry stays float32 unless `--meshopt`, because quantisation moves scale into a node transform and skews grounding and bounds checks. `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `meshoptimizer` and `sharp` resolve from your project or the CLI install; a missing one is reported with the install command.

## `assets merge-clips`

`--base` and each clip take a GLB or a Meshy download directory (`rigged_character_glb.glb`, `animation_glb.glb`). The command copies each source clip onto the base rig's nodes by name, shares samplers between channels, drops the rig task's rest-pose clips (keep them with `--keep-base-animations`), and writes one GLB with textures capped at `--tex` (default 1024). A clip with no matching node fails with `different skeleton`; partially matching clips report their unmatched channel count.

## `assets import-meshy --into`

A plain `import-meshy` writes `aura.assets.json`, `src/aura-assets.ts` (typegen can be a 100k-line diff), `public/aura-assets/*` and `aura-evidence/*` in the invoking project. Inside the Aura3D monorepo that is a shared-file race, so isolated mode is the default there; `--shared-manifest` opts out. Isolated mode requires `--into`, `--prefix` (a lowercase game tag) and `--name`; the typed key is `<prefix>_<name>` (`drift_lamp`), the model lands in `models/<key>.glb` and the evidence in `provenance/<key>.rights.json` and `.meta.json`. Validation runs in the temporary project with `--require-license` semantics; on failure nothing is copied and the command exits non-zero. A different model already at the target path is refused unless `--overwrite`. `--keep-temp` leaves the temporary project in place.

## `meshy ledger`

```bash
aura3d meshy ledger reserve --dry-run --game drift --op preview,refine     # cost, credits left, exit 3 if it would be refused; writes nothing
rid=$(aura3d meshy ledger reserve --game drift --op preview)
aura3d meshy ledger settle --rid "$rid" --exit-code 0 --task-id <id>
aura3d meshy ledger status                                                  # spent, left, byGame, overCap
aura3d meshy ledger reconcile                                               # ledger vs the Prism pool since the baseline
```

- The file is `--ledger <path>`, `$AURA3D_MESHY_LEDGER`, or `~/.aura3d/meshy-ledger.jsonl`. Caps resolve as flag, then env, then the value stored by `config`, then the default: global `--global-cap` / `$AURA3D_MESHY_GLOBAL_CAP` / 1000, per game `--cap` (per call) / `--game-cap` / `$AURA3D_MESHY_GAME_CAP` / 420. `config --global-cap N --game-cap N --note text` stores them in the ledger for every shell.
- `reserve` is a hard stop: when the game's spend plus the estimate would pass the per-game cap or the global cap it exits 3, writes nothing, and prints the credits left and the flag or env var that raises the cap. A tag already over its cap shows 0 left. Estimates: preview 20, refine 10, remesh 5, rigging 5, animate 3, retexture 10 (`--est` overrides). `--op preview,refine,rigging` is accepted with `--dry-run` to price a chain.
- A rate-limited (exit 6) or timed-out (exit 8) call settles as `unconfirmed` and keeps counting: the task usually finishes and is charged. Resume it with `meshy <resource> get <id>`, then `reconcile --rid <id> --status ok|failed`. Pass `--error-text "<meshy stderr>"` to `settle --exit-code`: a 429 on a poll (`/text-to-3d/<id>`) keeps that task id and counts; a 429 on a create counts 0. Only a confirmed no-charge outcome (exit 3, 4 or 9, a FAILED task, a create 429) counts 0.
- `baseline` snapshots the Prism pool (`GET /admin/meshy`, read-only) as the zero point; `reconcile` without `--rid` prints ledger spend, Prism spend since the baseline, the delta, keys added since and keys topped up. `--apply` books the delta once as an `unattributed` adjustment (global cap only). The key comes from `$AURA3D_PRISM_KEY` or `$AURA3D_PRISM_KEY_FILE` (URL `$AURA3D_PRISM_URL`, default `https://prism.auraone.ai`); it is only sent as a header and never printed. `--pool-json <saved response>` needs no credential. Prism reports a pool-wide balance, not spend per tag.
- Every record needs a game tag; name raw downloads with that prefix so two games cannot reuse each other's `rocks.raw.glb`.
- A lock directory next to the ledger serialises writers; a lock left by a dead process is taken over.

## `aura3d evidence judge`

Blind A/B **model** judge over two folders of matched frames (a vision model reached through Kiro Prism, not a human). Promoted from the per-game judge scripts in `tools/crayon-capture/`.

```sh
export PRISM_KEY_FILE=/path/to/prism-key.txt   # or PRISM_API_KEY; never printed or stored
aura3d evidence judge --a ref-frames/ --b candidate-frames/ --trials 48 --seed 20261023 --out evidence/judge
```

- Frames match by file name (`.jpg`, `.jpeg`, `.png`). For each trial the reference is shown as image A or B in a seeded, balanced order.
- Output `judge-results.json` holds the per-trial picks, the accuracy with a 95% Wilson interval, the exact binomial p-value against chance, the same-game rate, and (if `sharp` is installed) luma and colour JSD, palette distance and edge density per frame. More than 70% identification of the reference means the candidate is reported as distinguishable.
- `--no-judge` computes the pixel metrics only (no network); `--subject "a browser 3D racing game"` tunes the prompt; `--model`, `--concurrency` and `PRISM_BASE_URL` are honoured.
- Say "model judge" whenever you quote a result: it is not human perception evidence.
