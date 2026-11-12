<!-- AURAONE-POLICY-POINTER:START -->
# AuraOne AI Coding Agent Policy (repository pointer)

Canonical policy: `/Users/gurbakshchahal/.config/agent-policy/AI_AGENT_POLICY.md` (loaded globally by Codex, Claude Code, Qwen, Kiro, Gemini, Grok, and OpenCode; any other agent **MUST** read it first). Load `/Users/gurbakshchahal/.config/agent-policy/reference/INDEX.md` files (`cloud-cost-and-ephemeral-lifecycle.md`, `gitlab-ci-cost-and-lifecycle.md`, `release-qualification-and-live-rollout.md`, `parallelism.md`, etc.) **only on demand** per §2 — never unconditionally. Precedence: Gurbaksh's live instructions → `/Users/gurbakshchahal/.config/agent-policy/AI_AGENT_POLICY.md` → repo instructions.
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

## Shipping rules (owner directive, 2026-11-09 — these override any slower habit)

The owner lost most of 2026-11-08/09 to release-process overhead: full ACR passes rerun for changes that never needed them, release worktrees deleted mid-pass, outside commits pushed onto a candidate under test, and new version numbers for small changes. These rules exist so that never happens again.

1. **Live changes to games, the site and docs ship site-only.** Anything under `apps/`, `examples/`, `marketing/`, `public/`, game assets or docs goes: merge to `main` → real-GPU check of the touched games (headless Chrome over loopback CDP; all 30 if shared code moved) → `pnpm build && pnpm --dir marketing build` → Cloudflare Pages preview → prod (`--branch main`) → prod check → push `main`. About 30 minutes. **No ACR pass, no npm release, no new version number.**
2. **Engine fixes the owner wants live now also ship site-only.** The site builds the engine from the workspace, so a verified engine change (for example a game switching to WebGPU) goes live on the site the same way as rule 1, after a real-GPU check that the affected games render with 0 errors. The npm packages pick it up in the next batched release; do not cut a release just for it.
3. **The full ACR source pass is only for publishing npm packages.** Batch every package change into one candidate. Never restart a pass that is running because of a site, docs, SEO or game-content change; those go out through rule 1 instead.
4. **A release branch under test belongs to the release session.** No other agent or session pushes to `release/*` or edits a `release/*` worktree while a pass is running. Put site/SEO/content work on `main` (rule 1); the release session merges `main` into the site tree when it deploys.
5. **Never delete, prune or force-remove a locked worktree.** `aura3d-cand*`, `aura3d-site*` and lane worktrees are locked while in use; a locked worktree is in use. Cleanups skip locked worktrees.
6. **No new version numbers without an explicit owner ask.** Work that misses a release waits for the next one the owner asks for; it does not create a new version on its own. Record follow-ups in `docs/project/future-engine-work.md`.
7. **Generated copies are regenerated, never hand-edited.** After editing `llms.txt`, run `pnpm skills:sync`; after editing a showcase-port wrapper page, put the change in the example page and run `node tools/showcase-port-pages/sync.mjs`; after any app/example edit, run `node tools/agent-examples/refresh-catalog-digests.mjs`. Then `node tools/site/seo-meta-pass.mjs --check`.
8. **Status answers are a short numbered list with one ETA.** No essays.

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
