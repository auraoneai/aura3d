status: prepared
prompt file: benchmark/prompts/07-material-lab.md
agent: Claude Code
library: Aura3D
context bundle path: benchmark/context/aura3d/files
install command: npm install
build command: npm run build
run command: npm run dev -- --port <assigned-port>
repair turns: 0

status: failed
failure stage: agent generation timeout
failure timestamp: 2026-05-29T22:26:44Z
failure details: Claude Code process remained alive for more than 25 minutes and left source/src/main.ts as the untouched scaffold. No repair turn was issued.
