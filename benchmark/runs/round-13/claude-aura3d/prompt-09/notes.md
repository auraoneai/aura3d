status: prepared
prompt file: benchmark/prompts/09-animated-primitive-humanoid.md
agent: Claude Code
library: Aura3D
context bundle path: benchmark/context/aura3d/files
scaffold command: runner-generated fixed Vite TypeScript scaffold from benchmark/runs/round-13/_tools/setup-round.mjs
scaffold policy: same index.html, package scripts, tsconfig strict settings, and src/main.ts placeholder for Aura3D and Three.js; only dependency set differs by library side
install command: npm install
build command: npm run build
run command: npm run dev -- --port <assigned-port>
repair turns: 0

agent version: 2.1.158 (Claude Code)
agent started at: 2026-05-31T19:33:46.001Z
agent finished at: 2026-05-31T19:42:48.185Z
agent exit code: 0
agent timed out: false
execution hygiene violations: agent attempted screenshot/manual visual capture; agent ran npm run dev; agent ran or invoked Playwright
agent assumptions/questions:
- - **Build command:** `npm run build`
- - **Run command:** `npm run dev -- --port <assigned-port>`

capture timestamp: 2026-05-31T20:10:06.353Z
status: captured
failure stage: none
agent exit code: 0
install status: 0
compile status: pass
browser status: pass
route URL: http://127.0.0.1:6309/
run command used: npm run dev -- --port 6309
route health: pass
screenshot timestamp: 2026-05-31T20:10:06.357Z
runtime failure: none
