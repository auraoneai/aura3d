# Verification

Release gate:

```bash
pnpm run check:agent-api
pnpm run check:assets-cli
pnpm run check:agent-docs
pnpm run check:templates
pnpm run check:examples
pnpm run check:devtools
pnpm run check:deployment
pnpm run check:docs-site
pnpm run check:bundle-size
pnpm run check:marketing-truth
```

Template-local gate:

```bash
npm run build
npm run test
npx @aura3d/cli@latest assets validate
npx @aura3d/cli@latest check-deploy
```
