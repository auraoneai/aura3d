# M-AI / swipe port generator

`examples/aura-slam/sim/{ai,swipe,aiTables}.ts` are mechanical transcriptions of closure functions in
`tests/fixtures/aura-slam-original/toptennis/match-engine.js`. This folder holds the generator so the port is reproducible and auditable:

```
node tools/aura-slam/ai-port/gen.cjs        # parse the source with the TypeScript API, classify free identifiers, rewrite closure refs to env.<name>
node tools/aura-slam/ai-port/assemble.cjs   # write sim/ai.ts, sim/swipe.ts, sim/aiTables.ts
```

Run both from the repo root (`typescript` must be resolvable). The only hand-maintained part is the `FIXES` list in `assemble.cjs`.
Parity is proven by `tests/unit/aura-slam/ai-*.test.ts` (the TS modules are injected into the original engine and must reproduce it bit for bit).
