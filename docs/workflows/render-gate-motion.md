# Render gate: multi-frame motion check

The single-frame render gate proves a scene drew once. It cannot see a scene that draws one correct frame and then freezes
(5.0.2: a custom shader whose only motion was `uTime`, `world.water` and sky clouds redrew nothing; real-GPU frame
difference 0.000). The motion check captures two frames N seconds apart and asserts they differ.

## Method

- Each frame is reduced to a **64x36 grid of luma** (`0.2126 R + 0.7152 G + 0.0722 B`, 0..255), box-averaged in pure JS.
- Difference = mean over the 2304 cells of `|lumaA - lumaB|`.
- **moving = difference > 0.2** (the agent-eval `animated` threshold, `tools/agent-eval/remote/score-all.mjs` `gridDiff`).
  Configurable: `--motion-threshold <n>`, a per-entry `threshold` in the config, `--motion-grid WxH`, `--interval-ms <n>`.
- The agent-eval downsamples with a browser canvas (`drawImage`, bilinear) and rounds cells to integers; this gate box-averages
  and keeps fractions. Identical frames give 0.000 in both. A moving region smaller than a few grid cells can fall under 0.2;
  lower the per-entry threshold for such entries.
- Frames: wait `settleMs` (default 4000) then screenshot A, wait `intervalMs` (default 1500) then screenshot B. REA also
  captures after the implicit navigation step; the gate uses the **last two** screenshots. Reduced motion is **off**.

## Config

`tools/release/render-gate/motion-config.json` lists the entries (recipes, templates, games). Only entries with
`animated: true` can fail; `animated: false` rows are measured and recorded. `verified: real-gpu-2026-11` means the diff was
measured on a real GPU in the 5.0.2 investigation; `source-read` means flagged from source and not yet measured by this gate
(measure once, then record). Only 5 of the 8 recipes animate; the other 3 are static by design.

## Run (real GPU through REA; no Docker, no Playwright)

```bash
# build the recipes (monorepo source) and serve them on loopback
pnpm exec vite build --config docs/agents/recipes-src/vite.config.ts
pnpm exec vite preview --config docs/agents/recipes-src/vite.config.ts --host 127.0.0.1 --port 4173 &

# serialise browser captures; never hold the lock while building
until mkdir /tmp/a3d-rea.lock 2>/dev/null; do sleep 5; done
node tools/release/render-gate/index.mjs --out /tmp/motion-out --motion \
  --recipe-base http://127.0.0.1:4173 --base http://127.0.0.1:8123 \
  --templates-source archives:<plan.json>          # omit to skip nothing: templates need a source
rmdir /tmp/a3d-rea.lock
```

Entries whose base is not supplied (`--recipe-base`, `--base`) are reported as skipped. `--only recipe:water-custom-shader`
narrows the run. The driver is `rea capture-browser-scenario <scenario.json> --format json --full-output`, the same engine as
the MCP tool `rea_call capture_browser_scenario`. The scenario is `buildMotionScenario()` in `motion.mjs`.

Offline analysis of envelopes captured through the MCP tool (save the full envelope as `<kind>-<id>.json`, e.g.
`recipe-water-custom-shader.json`, with the two step screenshots):

```bash
node tools/release/render-gate/index.mjs --out /tmp/motion-out --motion --driver saved --saved-dir <dir>
```

Outputs: `motion-summary.md`, `motion-results.json`, and `<id>-a.png` / `<id>-b.png` for live runs. Exit 0 only when every row passes.

## Probe: uTime-only motion

`tools/release/render-gate/probes/utime-static` is a static page (no `.runtime`, no `app.onFrame`) whose custom shader reads
`uTime`. Build with `pnpm exec vite build --config tools/release/render-gate/probes/vite.config.ts` (`PROBE_OUT=<dir>` to
choose the output). Before the frame-loop fix it must be frozen (diff 0); after it must move.
