# Aura3D procedural scene

Starter for scenes with no admitted model: a jointed robot built from primitives and `group` joints, lit by the
`character-showcase` look, with an idle animation driven from `onFrame` (`src/main.ts`).

```bash
npm install
npm run dev        # Vite on 127.0.0.1
npm run build      # typecheck + vite build
```

Read `docs/agents/threejs-to-aura3d.md` (if you would write X in three.js, write Y), then `docs/agents/recipes.md`
recipes 8 to 15 for terrain, props, PBR viewer, custom-shader water, sky and day/night, fire and a night street, all
without models. Signatures: `docs/agents/api-signatures.md`.

Browser specs (`npm run test:browser`) run on a remote runner, not on your machine. Label this route `procedural`
until a judged capture supports a stronger claim.
