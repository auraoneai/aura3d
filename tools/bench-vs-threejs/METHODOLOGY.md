# Benchmark methodology v2

Applies to every results file from the 4.3.7 re-measure onward. The 4.1.2 run (`evidence/vs-threejs/RESULTS.md`, `results.json`) is history and is not edited; `gate.mjs` still reads it.

## What changed from v1

| Rule | v1 (4.1.2) | v2 |
| --- | --- | --- |
| Equal work | Aura3D rendered into 4x multisampled RGBA16F targets while the main three.js column had no antialiasing; an equalised table was added afterwards (section 7d/7e) | Every Aura3D arm is paired with the three.js arm that does the same antialiasing work (`shared/arms.mjs` `equalAaPair`): `aura-auto`, `aura-production` and the legacy `aura` all pair with `three-msaa`. A claim about speed or first frame is read from the equal-AA rows, never from the plain `three` column |
| Both sides tuned | Aura3D at its production profile, three.js at defaults | three.js gets what its docs recommend for the scene (`powerPreference: "high-performance"`, `preserveDrawingBuffer: false`, no composer pass the scene does not need); Aura3D is reported twice, at `quality: "auto"` (the default from 4.5.0) and `quality: "production"`, with nothing hand-disabled. The constants live in `EQUAL_WORK` in `shared/arms.mjs` and are copied into each results file |
| Authors | One author who knew three.js far better than Aura3D | Three independent fresh-agent authors per scene per library (`shared/authors/`), median reported. Each is a separate run with its own sandbox and Prism session, no shell and no network, the docs-only Aura3D arm of `tools/agent-eval` |
| Hardware | Software WebGL2 only | Software WebGL2 on the remote runner **and** a real-GPU column. The GPU column is filled only from a results file whose renderer string is not a software rasteriser (`classifyRenderer`); a software file passed as GPU is refused |
| Decision | A tally printed in prose | `gate.mjs` prints PASS / FAIL / NO-DATA for P1 to P7, Q1, Q2, D1 to D3, C1, M1 and T1 and exits non-zero when T1 fails or a claimed target is not PASS |

Unchanged: 640x360, device pixel ratio 1, ACES tone mapping, 10 warm-up frames, 60 measured frames, 3 cold loads (forest keeps its reduced plan), `window.__BENCH__` glue, the verdict rule (lower is better, within 5% is a tie, a missing side is unmeasurable) and the row set counted by the tally. Re-scoring the 4.1.2 file with `harness/tally.mjs` gives the published 18 / 76 / 10 / 20 over 124 rows, so a 4.3.7 tally is comparable.

## Arm keys in a results file

`scenes.<scene>.results.<arm>` where arm is `three`, `three-msaa`, `aura-auto`, `aura-production`, or the 4.1.2 key `aura`. The gate's "Aura3D number" is `aura-auto` when present, else `aura`, else `aura-production` (`pickAuraArm`). Whichever arm a release claims must be the one the default path produces.

## Claim rules the gate enforces

- A target counts as claimed only if it is listed in `--claim`; the exit code is 1 when a claimed target is not PASS (NO-DATA is not a pass).
- T1 (three.js better in at most 30 numeric rows) always gates: no "beats three.js" wording ships while it fails.
- P1 to P6 are labelled with the renderer they were taken on (`software WebGL2` for the remote runner). P7 is the only target that reads GPU numbers and it is NO-DATA until a real-GPU results file exists. Until then every speed statement keeps the software-GL qualifier.
- Q2 counts Aura3D warnings and errors on the five bench scenes. Chrome's own `GL Driver Message ... ReadPixels` notices come from the harness's `gl.readPixels` and are excluded; everything else counts.
- D3 comes from the option-coverage test (`--extra '{"silentNoOps": n}'`), C1 from the capability audit tables (a partial or experimental row is resolved only when marked "removed from public copy", or when its label becomes `shipped`), M1 from `mapping:` / `fidelity:` fields in the codemod table.

## Commands

```sh
# score a results file (software WebGL2 run), claim two targets
node tools/bench-vs-threejs/gate.mjs --results evidence/vs-threejs/results.json \
  --static evidence/vs-threejs/static-metrics.json --extra extra.json --claim P1,T1

# add real-GPU numbers once an owner run exists
node tools/bench-vs-threejs/gate.mjs ... --gpu-results evidence/real-gpu/<date>/results.json --claim P7

# three authors per scene per library (offline plan, then paid run)
node tools/bench-vs-threejs/shared/authors/run-authors.mjs --dry-run
node tools/bench-vs-threejs/shared/authors/run-authors.mjs --confirm-spend --batch authors-4.3.7
tools/agent-eval/score-remote.sh authors-4.3.7        # build + render probes on serverless ACR
node tools/bench-vs-threejs/shared/authors/run-authors.mjs --summarize evidence/vs-threejs/authors/authors-4.3.7

# tests
pnpm exec vitest run tests/unit/bench-vs-threejs
```

## What this does not cover

The author trial measures authoring cost (turns, tokens, first-try typecheck, source size). It says nothing about runtime speed. Real-GPU capture stays an owner step (`REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all`); the harness never produces a GPU number on the software runner.
