# Aura3D Shipping Rules & Cloudflare Pages Deployment Runbook

## Shipping Rules (Owner Directive, 2026-11-09 — Override Slower Habits)

The owner lost most of 2026-11-08/09 to release-process overhead: full ACR passes rerun for changes that never needed them, release worktrees deleted mid-pass, outside commits pushed onto a candidate under test, and new version numbers minted for small changes. Enforce these eight rules without exception:

1. **Live changes to games, the site, and docs ship site-only.** Anything under `apps/`, `examples/`, `marketing/`, `public/`, game assets, or docs goes: merge to `main` → real-GPU check of the touched games (headless Chrome over loopback CDP; all 30 if shared code moved) → `pnpm build && pnpm --dir marketing build` → Cloudflare Pages preview → prod (`--branch main`) → prod check → push `main` (~30 minutes). **No ACR pass, no npm release, no new version number.**
2. **Engine fixes the owner wants live now also ship site-only.** The site builds the engine from the workspace, so a verified engine change (e.g., a game switching to WebGPU) goes live on the site the same way as rule 1, after a real-GPU check that the affected games render with 0 errors. The npm packages pick it up in the next batched release; do not cut a release just for it.
3. **The full ACR source pass is only for publishing npm packages.** Batch every package change into one candidate. Never restart a pass that is running because of a site, docs, SEO, or game-content change; those go out through rule 1 instead.
4. **A release branch under test belongs to the release session.** No other agent or session pushes to `release/*` or edits a `release/*` worktree while a pass is running. Put site/SEO/content work on `main` (rule 1); the release session merges `main` into the site tree when it deploys.
5. **Never delete, prune, or force-remove a locked worktree.** `aura3d-cand*`, `aura3d-site*`, and lane worktrees are locked while in use; cleanups must skip locked worktrees.
6. **No new version numbers without an explicit owner ask.** Work that misses a release waits for the next one the owner asks for; it does not create a new version on its own. Record follow-ups in `docs/project/future-engine-work.md`.
7. **Generated copies are regenerated, never hand-edited:**
   - After editing `llms.txt`, run `pnpm skills:sync`.
   - After editing a showcase-port wrapper page, put the change in the example page and run `node tools/showcase-port-pages/sync.mjs`.
   - After any app/example edit, run `node tools/agent-examples/refresh-catalog-digests.mjs`.
   - Always follow with `node tools/site/seo-meta-pass.mjs --check`.
8. **Status answers are a short numbered list with one ETA.** No essays.

## Canonical Production Hosting (Cloudflare Pages ONLY — Never Vercel)

**Cloudflare Pages is the canonical production host (`CLOUDFLARE_ACCOUNT_ID=bd3fbe37a66521e496ea1b90f669f8b7`, VeerOne). Prefer Cloudflare over Vercel; do not deploy to Vercel.**

### 1. `aura3d` Marketing & Showcase Site (`aura3d.auraone.ai` / `https://aura3d.pages.dev`)

- **Cloudflare Pages Project:** `aura3d` (`CLOUDFLARE_ACCOUNT_ID=bd3fbe37a66521e496ea1b90f669f8b7`)
- **Production Domain:** `https://aura3d.auraone.ai` (`CNAME` → `aura3d.pages.dev` in `auraone.ai` Cloudflare zone)
- **Build & Deploy Command:**
  ```bash
  source ~/.config/auraone/cloudflare-env.sh && pnpm build && pnpm --dir marketing build && wrangler pages deploy marketing/dist --project-name aura3d --branch main
  ```

### 2. `aura3d-wonder-world` App (`veer.auraone.ai` / `https://aura3d-wonder-world.pages.dev`)

- **Cloudflare Pages Project:** `aura3d-wonder-world` (`CLOUDFLARE_ACCOUNT_ID=bd3fbe37a66521e496ea1b90f669f8b7`)
- **Production Domain:** `https://veer.auraone.ai` (`CNAME` → `aura3d-wonder-world.pages.dev` in `auraone.ai` Cloudflare zone)
- **Build & Deploy Command:**
  ```bash
  source ~/.config/auraone/cloudflare-env.sh && bash apps/veer-wonder-world/tools/deploy-build.sh && wrangler pages deploy apps/veer-wonder-world/dist --project-name aura3d-wonder-world --branch main
  ```
