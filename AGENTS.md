<!-- AURAONE-POLICY-POINTER:START -->
# AuraOne AI Coding Agent Policy (repository pointer)

Canonical machine-wide policy: `/Users/gurbakshchahal/.config/agent-policy/AI_AGENT_POLICY.md` (already loaded globally by Codex, Claude Code, Qwen, Kiro, Gemini, Grok, and OpenCode; any other agent **MUST** read `/Users/gurbakshchahal/.config/agent-policy/AI_AGENT_POLICY.md` before starting work).
Domain reference files in `/Users/gurbakshchahal/.config/agent-policy/reference/` (`remote-execution.md`, `ci-selection.md`, `parallelism.md`, `shared-service-access.md`, `cloud-contexts.md`, `cloudflare.md`, `vercel-neon.md`, `github-npm.md`, `gitlab-mirror.md`, `ui-typography-density.md`, `linkedin-outreach-research-gate.md`, `room-communication-playbook.md`) are mandatory on-demand reading when triggered by §2 of the canonical policy.
Precedence: Gurbaksh's live instructions → `/Users/gurbakshchahal/.config/agent-policy/AI_AGENT_POLICY.md` → repository instructions.
<!-- AURAONE-POLICY-POINTER:END -->

# Aura3D Repository Agent Instructions

## Fast path: a new agent should be productive in minutes

Aura3D is a TypeScript SDK for browser 3D apps and games. You write a typed, declarative scene with `@aura3d/engine` (`createAuraApp`, `scene`, `looks.preset`, `model(assets.x)`); the `@aura3d/cli` toolchain handles typed assets, checks and deploy gates.

```bash
npx create-aura3d@latest my-scene --template mini-game   # also writes llms.txt and the Aura3D skills
cd my-scene && npm install && npm run dev
npx @aura3d/cli@latest assets resolve "robot" --name robot   # model(assets.robot); never invent asset paths
npm run build && npx @aura3d/cli@latest check-deploy --dist dist
```

Read, in order: [`llms.txt`](llms.txt) (fast path, about 2.5k tokens; long form in [`llms-full.txt`](llms-full.txt)), [`docs/agents/agent-quickstart.md`](docs/agents/agent-quickstart.md), [`docs/agents/recipes.md`](docs/agents/recipes.md) (copy a working scene for your task, then adapt it; do not start by reading `dist/`), [`docs/agents/claims-and-boundaries.md`](docs/agents/claims-and-boundaries.md). Index of everything else: [`docs/agents/README.md`](docs/agents/README.md). Building or changing a game: [`docs/agents/new-game-checklist.md`](docs/agents/new-game-checklist.md) and [`docs/agents/lessons-learned.md`](docs/agents/lessons-learned.md) first (the mistakes already made, with the API or check that prevents each); run `node tools/game-checks/run.mjs <game-slug>` before calling a game done. Whether this path really is faster than starting from three.js is measured by the cold-start trial in `evidence/agent-eval/`; until it reports, do not claim it. Comparison numbers live only in `evidence/vs-threejs/RESULTS.md` (software WebGL2, one author, five small scenes).

Inside this monorepo, browsers, Playwright and heavy builds run on the remote runner (`tools/remote-acr/run.sh`); never local Docker or local Playwright.

## Repo rules

- **Aura3D Agent Manual & Boundaries:** Read [`llms.txt`](llms.txt), [`docs/agents/README.md`](docs/agents/README.md), and [`docs/agents/claims-and-boundaries.md`](docs/agents/claims-and-boundaries.md) before authoring scenes, templates, CLI commands, or public claims.
- **Skills:** Canonical Aura3D skills live in `packages/aura3d-cli/skills/` (`pnpm skills:sync` mirrors them to `.cursor/skills`, `.claude/skills`, `.agents/skills`, and the `create-aura3d` bundle; `pnpm check:skills` gates them).
- **Browser 3D Game & Crayon Reverse-Engineering Workflow:** When reverse engineering a browser 3D game, competitor web app, or sandboxed `<iframe srcdoc="...">` (`about:srcdoc`) runtime with REA (`rea_call` / `/opt/homebrew/bin/rea`) and Chrome DevTools Protocol (CDP), follow [`docs/workflows/crayon-game-reverse-engineering.md`](docs/workflows/crayon-game-reverse-engineering.md):
  - Call `rea_call(tool="__guide__")` or read `mcp-catalog/rea.md` in the agent-policy directory named by the policy block above for REA tool signatures and operational boundaries.
  - REA browser tools (`list_browser_targets`, `inspect_web_page`, `analyze_web_bundle`, `capture_browser_scenario`) target HTTP(S) pages only and are passive on `inspect_web_page`. To inspect a sandboxed `about:srcdoc` game iframe or evaluate live `window.__SCENE_STATE__` / `window.__GAME_CONFIG__` / `window.THREE` globals, attach directly via raw CDP WebSocket (`Target.getTargets` → `Target.attachToTarget({ targetId, flatten: true })` → `Runtime.evaluate` with `sessionId`).
  - For CLI bundle analysis on minified bundles `>= 1 MB`, set `NODE_OPTIONS="--max-old-space-size=8192"` (`mcp-on-demand-proxy` sets this automatically for `rea mcp`).
