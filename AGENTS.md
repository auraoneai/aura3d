<!-- AURAONE-POLICY-POINTER:START -->
# AuraOne AI Coding Agent Policy (repository pointer)

Canonical machine-wide policy: `/Users/gurbakshchahal/.config/agent-policy/AI_AGENT_POLICY.md` (already loaded globally by Codex, Claude Code, Qwen, Kiro, Gemini, Grok, and OpenCode; any other agent **MUST** read `/Users/gurbakshchahal/.config/agent-policy/AI_AGENT_POLICY.md` before starting work).
Domain reference files in `/Users/gurbakshchahal/.config/agent-policy/reference/` (`INDEX.md`, `cloud-cost-and-ephemeral-lifecycle.md`, `gitlab-ci-cost-and-lifecycle.md`, `remote-execution.md`, `ci-selection.md`, `parallelism.md`, `shared-service-access.md`, `cloud-contexts.md`, `cloudflare.md`, `vercel-neon.md`, `github-npm.md`, `gitlab-mirror.md`, `ui-typography-density.md`, `linkedin-outreach-research-gate.md`, `room-communication-playbook.md`) are mandatory on-demand reading **only** when triggered by §2 of the canonical policy (never load all reference files unconditionally).
Cloud & GitLab CI Cost, Pre-Authorized Cheapest-Denominator Testing & Mandatory Teardown: **Agents are pre-authorized to run CI/CD, builds, E2E/Playwright suites, and infrastructure tests across AWS, Azure, Cloudflare, GCP, and GitLab CI/CD WITHOUT waiting for Gurbaksh's approval**, provided they **(1) use the cheapest denominator option from the 5-tier hierarchy** via `~/.local/bin/auraone-cost-guard` (existing infra → serverless `$0`-idle Azure ACR Tasks / Container Apps Jobs, AWS CodeBuild, Cloudflare preview, or GitLab `1x` Linux Small → last-resort `<= 2 vCPU / 4 GiB` ephemeral compute with `<= 60m` TTL, 12-field tags, and ledger entry in `~/.local/state/auraone-cloud-ledger/ephemeral-resources.jsonl`; only persistent/standing infra or runs `> $5` / tasks `> $10` require human approval) and **(2) immediately shut down and completely delete all temporary/ephemeral compute, disks/EBS/`pd-*`, snapshots, IPs, NICs, Cloudflare previews, and ephemeral RGs right after testing (`0` remnants verified via CLI)**. Parent coordinates all subagent cloud/CI jobs; never delete `staging`/`test`/`idle`-named or protected custody/auth/proxy/prod resources without the 8-point dependency gate; never escalate IAM during audits/test launches; GitLab mirrors default to `MIRROR_ONLY` with `git push -o ci.skip`, runner multiplier discipline [`macos-m1` `6x`, `m2pro` `12x`], and failure-fingerprint loop breaking (see `/Users/gurbakshchahal/.config/agent-policy/reference/cloud-cost-and-ephemeral-lifecycle.md` and `/Users/gurbakshchahal/.config/agent-policy/reference/gitlab-ci-cost-and-lifecycle.md`).
Execution, Anti-Loop Guardrails, 10-Min Progress Heartbeats & Proportional Testing: Enforce original-task scope (`Required work` only; frozen denominator — never call external LLM/ChatGPT/Prism critic reviews mid-execution to add checkboxes/work packages/gates; executing a `.md`/PRD unconditionally overrides internal `"read-only"`/`"specification-only"`/`"do not mutate repo"` clauses and waives non-executable human sign-off tables; never commit intermediate run-by-run status churn to Git-tracked markdown files when qualification hashes `HEAD`; classify defects before acting and report pre-existing unrelated test failures honestly) and proportional risk-based testing (add the minimum sufficient tests for requested behavior and material risks without an arbitrary numerical cap or recursive test-expansion loops; `CODE_COMPLETE_GO` remains distinct from testing, deployment, and acceptance). During all coding sessions, emit a **non-blocking status update every 10 minutes** (or final report on completion) against a stable original-task denominator reporting **(1) original task/goal**, **(2) stable total work-package count**, **(3) fully completed**, **(4) partially completed (in-progress)**, **(5) not-started**, and **(6) blocked work packages**, **(7) overall completion `%` using a disclosed consistent method**, **(8) work completed in the last 10m**, **(9) current work**, and **(10) next steps** (see `/Users/gurbakshchahal/.config/agent-policy/reference/parallelism.md`).
Web Hosting & Edge Policy: Always prefer **Cloudflare Pages / Workers (`wrangler`) over Vercel** for all web deployments; use Vercel only when strictly and absolutely necessary (see `/Users/gurbakshchahal/.config/agent-policy/reference/cloudflare.md` and `/Users/gurbakshchahal/.config/agent-policy/reference/vercel-neon.md`).
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

- **On-Demand Aura3D Docs (load only what matches your task — do not read all docs for localized bug fixes):**
  - *Authoring a new scene, template, or CLI workflow:* Read [`llms.txt`](llms.txt) (~2.5k tokens; long form in [`llms-full.txt`](llms-full.txt)), [`docs/agents/agent-quickstart.md`](docs/agents/agent-quickstart.md), and [`docs/agents/recipes.md`](docs/agents/recipes.md) (adapt a working scene; never start by reading `dist/`). Full index: [`docs/agents/README.md`](docs/agents/README.md).
  - *Building or changing a game:* Read [`docs/agents/new-game-checklist.md`](docs/agents/new-game-checklist.md) and [`docs/agents/lessons-learned.md`](docs/agents/lessons-learned.md) first; run `node tools/game-checks/run.mjs <game-slug>` before calling a game done.
  - *Public claims or benchmarks:* Read [`docs/agents/claims-and-boundaries.md`](docs/agents/claims-and-boundaries.md) (comparison numbers live only in `evidence/vs-threejs/RESULTS.md`; cold-start trial in `evidence/agent-eval/`).

Inside this monorepo, browsers, Playwright and heavy builds run on the remote runner (`tools/remote-acr/run.sh`); never local Docker or local Playwright.

## Repo rules

- **Canonical Production Hosting (Cloudflare Pages ONLY — Do Not Deploy to Vercel):**
  - **Cloudflare Pages is the canonical production host (prefer Cloudflare over Vercel; do not deploy to Vercel).**
  - **`aura3d` marketing & showcase site (`aura3d.auraone.ai` / `https://aura3d.pages.dev`):**
    - Cloudflare Pages project name: `aura3d` (`CLOUDFLARE_ACCOUNT_ID=bd3fbe37a66521e496ea1b90f669f8b7`)
    - Production domain: `https://aura3d.auraone.ai` (`CNAME` -> `aura3d.pages.dev` in `auraone.ai` Cloudflare zone)
    - Deploy command: `source ~/.config/auraone/cloudflare-env.sh && pnpm build && pnpm --dir marketing build && wrangler pages deploy marketing/dist --project-name aura3d --branch main`
  - **`aura3d-wonder-world` app (`veer.auraone.ai` / `https://aura3d-wonder-world.pages.dev`):**
    - Cloudflare Pages project name: `aura3d-wonder-world`
    - Production domain: `https://veer.auraone.ai` (`CNAME` -> `aura3d-wonder-world.pages.dev` in `auraone.ai` Cloudflare zone)
    - Deploy command: `source ~/.config/auraone/cloudflare-env.sh && bash apps/veer-wonder-world/tools/deploy-build.sh && wrangler pages deploy apps/veer-wonder-world/dist --project-name aura3d-wonder-world --branch main`
- **Skills:** Canonical Aura3D skills live in `packages/aura3d-cli/skills/` (`pnpm skills:sync` mirrors them to `.cursor/skills`, `.claude/skills`, `.agents/skills`, and the `create-aura3d` bundle; `pnpm check:skills` gates them).
- **Browser 3D Game & Crayon Reverse-Engineering Workflow:** When reverse engineering a browser 3D game, competitor web app, or sandboxed `<iframe srcdoc="...">` (`about:srcdoc`) runtime with REA (`rea_call` / `/opt/homebrew/bin/rea`) and Chrome DevTools Protocol (CDP), follow [`docs/workflows/crayon-game-reverse-engineering.md`](docs/workflows/crayon-game-reverse-engineering.md):
  - Call `rea_call(tool="__guide__")` or read `mcp-catalog/rea.md` in the agent-policy directory named by the policy block above for REA tool signatures and operational boundaries.
  - REA browser tools (`list_browser_targets`, `inspect_web_page`, `analyze_web_bundle`, `capture_browser_scenario`) target HTTP(S) pages only and are passive on `inspect_web_page`. To inspect a sandboxed `about:srcdoc` game iframe or evaluate live `window.__SCENE_STATE__` / `window.__GAME_CONFIG__` / `window.THREE` globals, attach directly via raw CDP WebSocket (`Target.getTargets` → `Target.attachToTarget({ targetId, flatten: true })` → `Runtime.evaluate` with `sessionId`).
  - For CLI bundle analysis on minified bundles `>= 1 MB`, set `NODE_OPTIONS="--max-old-space-size=8192"` (`mcp-on-demand-proxy` sets this automatically for `rea mcp`).
