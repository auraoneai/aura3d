<!-- AURAONE-POLICY-POINTER:START -->
# AuraOne AI Coding Agent Policy (repository pointer)

Canonical policy: `/Users/gurbakshchahal/.config/agent-policy/AI_AGENT_POLICY.md` (read first if not globally loaded); load `/Users/gurbakshchahal/.config/agent-policy/reference/INDEX.md` files (e.g., `gitlab-ci-cost-and-lifecycle.md`) **only on demand** per §2. Precedence: Gurbaksh's live instructions → canonical policy → repo instructions.
<!-- AURAONE-POLICY-POINTER:END -->

# Aura3D Repository Agent Instructions

TypeScript SDK for browser 3D apps and games (`@aura3d/engine`: `createAuraApp`, `scene`, `looks.preset`, `model(assets.x)`; `@aura3d/cli`). Run browsers/Playwright/builds remotely via `tools/remote-acr/run.sh`.

```bash
npx create-aura3d@latest my-scene --template mini-game && cd my-scene && npm install
npx @aura3d/cli@latest assets resolve "robot" --name robot   # model(assets.robot); never invent paths
npm run build && npx @aura3d/cli@latest check-deploy --dist dist
```

- **On-Demand Docs:**
  - *Scenes/CLI:* [llms.txt](llms.txt), [llms-full.txt](llms-full.txt), [agent-quickstart.md](docs/agents/agent-quickstart.md), [recipes.md](docs/agents/recipes.md), [README.md](docs/agents/README.md).
  - *Games:* [new-game-checklist.md](docs/agents/new-game-checklist.md), [lessons-learned.md](docs/agents/lessons-learned.md) (`node tools/game-checks/run.mjs <slug>`).
  - *Claims & shipping:* [claims-and-boundaries.md](docs/agents/claims-and-boundaries.md), [shipping-and-deploy.md](docs/agents/shipping-and-deploy.md).

## Shipping & Repo Rules ([shipping-and-deploy.md](docs/agents/shipping-and-deploy.md))
- **Site-only fast lane:** Games, `apps/`, `examples/`, `marketing/`, docs, and verified engine fixes ship directly to Cloudflare Pages (`aura3d.auraone.ai`, `veer.auraone.ai` — never Vercel) after real-GPU checks; no ACR pass or version bump.
- **ACR & release isolation:** Full ACR passes are only for batched npm releases; never edit `release/*`, prune locked `aura3d-cand*`/`aura3d-site*` worktrees, or bump versions without owner ask.
- **Derived outputs & skills:** Regenerate (`pnpm skills:sync`, `showcase-port-pages/sync.mjs`, `refresh-catalog-digests.mjs`, `seo-meta-pass.mjs --check`); skills in `packages/aura3d-cli/skills/` (`pnpm check:skills`).
- **Status format:** Short numbered list + one ETA; no essays.
- **Crayon / browser 3D RE (`about:srcdoc` + REA/CDP):** See [crayon-game-reverse-engineering.md](docs/workflows/crayon-game-reverse-engineering.md).
