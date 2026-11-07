# spatial-bench: E6-01 baseline (Aura3D vs three.js)

Measurement-only harness for high-frequency spatial-data workloads: streamed point clouds, re-posed instances, trajectory lines, orbit camera, a picking probe and 50 DOM labels. It is the U-01 baseline that gates the 5.1 runtime work (`docs/project/e6-00-spatial-runtime-assessment.md` section 5). It changes no engine or rendering source and asserts no thresholds.

## Layout

| path | purpose |
|---|---|
| `configs.mjs` | the matrix (one config = one page load = one measurement), warm-up/measure windows, seed |
| `src/common/` | seeded sensor generator (`data.ts`), WebGL2 counters + timer query (`hooks.ts`), shared frame loop, metrics, labels, probe (`harness.ts`) |
| `src/aura/main.ts`, `src/three/main.ts` | the two viewers. Aura3D uses only the public `@aura3d/engine` API, resolved to workspace source via `vite.aliases.generated.ts` |
| `run.mjs` | driver: static server for `dist/`, one headless Chrome (ANGLE/Metal) on a loopback CDP port, one fresh tab per run, appends `runs.jsonl` |
| `report.mjs` | aggregates `runs.jsonl` to `results.json` and `REPORT.md` |
| `results/<date>/` | `runs.jsonl` (raw), `results.json`, `REPORT.md`, `host.json`, `frames/` (rep-1 screenshots of the `shot` configs) |

three.js is a devDependency of this folder only (`package.json`, pinned `0.185.1`, own `package-lock.json`). The folder is not a pnpm workspace member, so the root `pnpm-lock.yaml` is untouched.

## Reproduce

```bash
git fetch origin && git worktree add /tmp/spatial-bench-wt <branch> && cd /tmp/spatial-bench-wt
pnpm install --frozen-lockfile                  # repo deps (vite, workspace packages)
npm install --prefix tools/spatial-bench        # three@0.185.1 from the local package-lock.json
cd tools/spatial-bench
node ../../node_modules/vite/bin/vite.js build --config vite.config.ts      # dist/aura.html, dist/three.html
node run.mjs --reps 3 --out results/$(date +%F)                             # full matrix, ~100 min
node report.mjs results/$(date +%F)                                         # results.json + REPORT.md
```

Useful driver flags: `--only <id-substring>`, `--viewers aura,three`, `--reps N`, `--quick` (1 s warm-up, 4 s window; smoke only), `--list`, `--port 9755`, `--chrome <path>`. The driver resumes: run ids already in `runs.jsonl` are skipped. Do not rebuild `dist/` while a run is in progress.

Rules observed: no Docker, no Playwright, no cloud. Every run takes the shared capture lock (`mkdir /tmp/a3d-rea.lock`, released after the run) so other lanes can interleave; the lock is never held while building. The Chrome profile is a temp dir that is deleted on exit.

## What each run measures

3 s warm-up, then 20 s: rAF-to-rAF interval between rendered frames (p50/p95/p99, plus raw rAF interval), dropped frames (interval above 2x the target period), JS CPU per frame split into tick apply / data conversion / camera / render / labels (`performance.now()`), JS heap (`performance.memory`, precise-memory flag, `gc()` before the window), `bufferData`/`bufferSubData` calls and bytes and draw calls per frame (WebGL2 prototype patch), GPU time (`EXT_disjoint_timer_query_webgl2` around `render()` for three.js; Aura3D's own renderer timing for Aura3D, because an external query nests with its own), a non-blank pixel check, then the picking probe. The host, Chrome version, ANGLE/GPU string, DPR, window size and 1-minute load average are recorded.

Display target: 60 FPS renders every rAF, 30 FPS renders every second rAF (the display stays at 60 Hz). Sensor ticks (10 or 20 Hz) apply the newest due frame just before a render; frames that fall behind are counted in `ticksSkipped`, never queued.

## Limits

Not type-checked by the repo tsconfig (vite/esbuild only). Single machine, shared with other agent lanes (load average recorded per run). WebGL2 only. No GC pause data. Numbers say nothing about other hardware, and no comparison claim may be published from `REPORT.md` without the labels in `docs/agents/claims-and-boundaries.md`.

## Typed-path variants (lane 515)

Configs ending in `-typed` (`pts-<n>-<hz>hz-<fps>fps-typed`, `ctl-static-pts-<n>-typed`, `mixed-<hz>hz-<fps>fps-typed`) are Aura3D-only and use the typed mutable-buffer path (`points.stream` + `handle.write` with packed u8 colors; typed static `points()`), see `docs/agents/streaming-buffers.md`. Run them with `node run.mjs --reps 3 --viewers aura --only typed --out results/<dir>`, aggregate with `node report.mjs results/<dir>`, and compare with a baseline directory using `node compare.mjs results/2026-11-06 results/<dir> > results/<dir>/COMPARISON.md`.
