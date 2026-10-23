# Drift & Deliver reference capture (`drift-and-deliver-reference.json`)

Reference for the Aura3D port in `examples/drift-and-deliver-port/` (R-20 / R-25). Schema `a3d-crayon-capture/1`.
Produced **remotely only** by [`tools/crayon-capture/drift-and-deliver.ts`](../../tools/crayon-capture/drift-and-deliver.ts).

## What was recorded

The original game keeps its car physics in one function (`zr(dt)`) and exposes `window.__sim(steps, keys, dt)` and
`window.__tp(x, z, heading)`. While the game sits on its splash screen its real-time loop does not simulate, so only
`__sim` moves the car. The runner teleports to a spawn, steps `__sim(1, keys, 1/60)` one step at a time through a key
script and records `x, z, heading, speed, boost, drifting, boosting, shake` after **every** step, then hashes the full
vector sequence (32-bit FNV-1a over the little-endian doubles).

| scenario | steps | spawn | what it exercises |
| --- | --- | --- | --- |
| `street-z-weave-drift` | 672 | x=30, z=-300, heading 0 | launch, weave, two short drifts, boost, brake, reverse, coast |
| `street-x-weave-drift` | 480 | x=-300, z=30, heading pi/2 | same on the z=30 street; carries steering, lean and boost from scenario 1 |
| `street-z-drain-boost` | 440 | x=90, z=-300, heading 0 | hold boost until the tank is nearly empty |
| `street-x-low-boost` | 290 | x=-300, z=90, heading pi/2 | boosts again from the boost left over by scenario 3 |

Scenarios run in order in a fresh page. `__tp` resets position, heading, velocity and speed only, so the steering
smoothing, drift lean, stuck timer and boost **carry over** exactly as they do in the game; the port replays the whole
sequence the same way (a test shows scenario 4 differs if the carried state is dropped).

## Results (ACR run `cc1ds`, three independent browser sessions)

- All four scenario hashes are **identical across the three sessions** (`variance.allHashesEqual: true`, max delta 0).
- **Zero contacts** in every scenario: a probe at each of the car's four collision points is tested against the
  original's nearby solids every step. The scenarios stay on open streets, so no building or prop touches the car.
- World census from the same page (`world.diag`): 225 blocks, 30 parks, 174 pickups, 84 traffic cars, 456 pedestrians,
  8,644 collision solids, 11,144 placements from 520 prototypes. The car footprint is 0.9954 x 2.142 half-extents.
- Renderer: three r184, tone mapping 7 (Neutral), exposure 1.34, fov 56, near 0.4, far 2400, `postfx: "high"`.

## Why the port's hash can differ by one rounding step on a Mac

The original ran in Chromium on x64 Linux. `Math.exp`, `Math.sin` and `Math.cos` in V8 are C++ and can round one unit
in the last place differently on arm64 (fused multiply-add). Replaying on an Apple-silicon Node, three of the four
scenarios match the recorded hash exactly and one differs only after step 440, by 4e-16 growing to 3e-14. The unit
tests therefore assert a per-field tolerance (`tolerance.perField`, 1e-9) and **at least three exact hashes**, and the
remote browser spec asserts exact hash equality on the same architecture as the reference.

## What this reference does not cover

Only the driving model. Collectibles, traffic, police, missions, the story and building collisions are not in it:
`__sim` steps only the car, and the original's pickup, traffic and mission logic lives in its real-time loop, which
was not run. The port's pickup generator reproduces the original's census (150 coins, 14 stars, 10 hearts) from the
original's seeded formulas, but its placements were not compared against the original's.

## Running it again (remote only)

```bash
mkdir -p /tmp/drift-cap && cd /tmp/drift-cap
pnpm --dir <repo> exec esbuild tools/crayon-capture/drift-and-deliver.ts --bundle --platform=node \
  --format=esm --external:playwright --outfile=/tmp/drift-cap/drift-and-deliver.mjs
cp <repo>/tools/crayon-probe/games.json .
cat > acr-task.yaml <<'EOF'
version: v1.1.0
stepTimeout: 1800
steps:
  - cmd: mcr.microsoft.com/playwright:v1.59.1-noble bash -c "cd /workspace && npm init -y >/dev/null 2>&1 && npm i playwright@1.59.1 --no-audit --no-fund >/dev/null 2>&1 && CRAYON_PROBE_ROOT=/workspace node drift-and-deliver.mjs --manifest games.json --sessions 3 --emit-markers --out /tmp/out --wait-ms 300000 --launch-arg --enable-unsafe-swiftshader --launch-arg --use-angle=swiftshader --launch-arg --ignore-gpu-blocklist"
    timeout: 1800
EOF
az-auraone-gurbaksh acr run --registry crmmeprodacr --file acr-task.yaml . > run.log 2>&1
pnpm --dir <repo> exec tsx tools/crayon-capture/drift-and-deliver-assemble.ts --log run.log \
  --out evidence/crayon-capture/drift-and-deliver-reference.json
cp evidence/crayon-capture/drift-and-deliver-reference.json tests/browser/data/drift-and-deliver-reference.json
```

`drift-and-deliver-assemble.ts` exits non-zero and writes nothing unless the report validates (every scenario present
with its scripted step count, at least two sessions, all sessions bit-identical). The module capture used to read the
original's code (`tools/crayon-probe/capture-module.ts`, run `cc1de`) is documented in
`tests/fixtures/crayon/drift-and-deliver/PROVENANCE.md`.
