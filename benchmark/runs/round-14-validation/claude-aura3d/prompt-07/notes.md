status: prepared
prompt file: benchmark/prompts/07-material-lab.md
agent: Claude Code
library: Aura3D
context bundle path: benchmark/context/aura3d/files
scaffold command: runner-generated fixed Vite TypeScript scaffold from benchmark/runs/round-14-validation/_tools/setup-round.mjs
scaffold policy: same index.html, package scripts, tsconfig strict settings, and src/main.ts placeholder for Aura3D and Three.js; only dependency set differs by library side
install command: npm install
build command: npm run build
run command: npm run dev -- --port <assigned-port>
repair turns: 0

agent version: 2.1.159 (Claude Code)
agent started at: 2026-06-01T00:23:58.564Z
agent finished at: 2026-06-01T00:30:12.823Z
agent exit code: 0
agent timed out: false
execution hygiene violations: agent ran npm run dev
agent assumptions/questions:
- - **Build command:** `npm run build` (run inside `source/`)
- - **Run command:** `npm run dev -- --port <assigned-port>` (Vite dev server, host `127.0.0.1`)

capture timestamp: 2026-06-01T00:47:27.741Z
status: captured
failure stage: none
agent exit code: 0
install status: 0
compile status: pass
browser status: pass
route URL: http://127.0.0.1:6307/
run command used: npm run dev -- --port 6307
route health: pass
screenshot timestamp: 2026-06-01T00:47:27.741Z
runtime failure: none
