# Real-GPU capture

Why: every earlier check ran on SwiftShader (software GL). Real GPUs (ANGLE/Metal on a Mac, NVIDIA on a VM) expose shader, depth-precision, half-float and frame-rate bugs that software GL hides. `capture.mjs` probes `UNMASKED_RENDERER_WEBGL` and **refuses to run on a software renderer** (use `--allow-software` only for smoke tests).

## Run it on a Mac (the owner's view: real GPU, retina)

```sh
cd platforms/aura3d
REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all          # all 7 games on production, DPR 2, 1440x900
REAL_GPU_HEADLESS=false tools/real-gpu/run.sh links,hoops  # a subset
```

Screenshots and `report.json` (renderer string, console errors, page errors, failed or 4xx requests per game) land in `evidence/real-gpu/<date>/`. Run it yourself: it opens a real Chrome window, so agents must not run it on the Mac (policy: no local Playwright).

## Run it on a GPU VM

Needs the NVIDIA driver (`nvidia-smi`), `google-chrome-stable` and `node` + the repo's `playwright`:

```sh
CHROME_PATH=/usr/bin/google-chrome-stable tools/real-gpu/run.sh all
```

Check `report.json` -> `renderer` shows NVIDIA/ANGLE (Vulkan), not SwiftShader. Delete the VM and its disks when done.

## Scenarios

`scenarios.json` holds the per-game steps (click text, hold keys, screenshot bursts, and `evaluate`: a page expression such as `__AURA_VFX_DEBUG__()` whose JSON result lands in `report.json` under the game's `evaluations`, after the step's shot). Add a game by adding an entry. `REAL_GPU_BASE=https://<preview>.vercel.app` targets a preview deployment instead of production.
