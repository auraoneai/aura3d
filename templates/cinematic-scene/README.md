# Aura3D Cinematic Scene

Prompt-plan cinematic starter on the public `@aura3d/engine` API: a
`definePromptPlan` compiled through `compilePromptPlanV2` in strict mode
(`{ unsupported: "reject" }`), so every plan field resolves to a real system
or the build fails — no echo-only effects, no decorative stand-ins.

```bash
npm install
npm run dev
npx @aura3d/cli@latest assets add ./assets/hero.glb --name hero
npm run test
```

Edit `src/main.ts` to change the plan (subject, style, environment, camera,
lighting, effects, interaction). The environment text resolves the look
(`night-city`); style resolves a post grade; `fog` and `bloom` apply through
the look's pipeline. Unmapped fields reject at compile time — check
`window.__AURA3D_CINEMATIC_SCENE__` (or `tests/reports/route-health.json`) for
the report's `visualSystems` census and `rejected` list.
