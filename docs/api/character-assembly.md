# Aura3D character assembly

Character assembly converts typed asset manifest entries into a repeatable plan for a game or cartoon actor. It does not invent assets and it does not accept raw string URLs.

Register the body and parts first:

```bash
npx @aura3d/cli@latest assets add ./assets/body.glb --name heroBody
npx @aura3d/cli@latest assets add ./assets/hair.glb --name heroHair
npx @aura3d/cli@latest assets add ./assets/jacket.glb --name heroJacket
```

Then write an assembly plan:

```bash
npx @aura3d/cli@latest assets assemble-character \
  --name aura \
  --body heroBody \
  --part hair=heroHair \
  --part jacket=heroJacket
```

The command writes `src/aura-character-aura.assembly.json` by default.

## Plan contents

The plan includes:

- The typed body asset.
- Typed part assets.
- Attachment slots such as `head`, `rightHand`, `spine`, or `root`.
- Scale normalization rules.
- Facing/orientation rules.
- A preserve-typed-assets rule so generated app code still imports from `src/aura-assets.ts`.

Example:

```json
{
  "schema": "aura3d.character-assembly/1.0",
  "name": "aura",
  "body": {
    "slot": "body",
    "asset": "heroBody",
    "url": "/aura-assets/heroBody.abc12345.glb",
    "attachTo": "root"
  },
  "parts": [
    {
      "slot": "hair",
      "asset": "heroHair",
      "attachTo": "head"
    }
  ]
}
```

## Runtime usage

Agent-authored app code should still use the generated typed assets:

```ts
import { createAuraApp, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .add(model(assets.heroBody))
    .add(model(assets.heroHair))
});
```

## Production boundary

The assembly plan proves that assets exist and that attachment intent is explicit. It does not automatically solve skeletal retargeting, skinning, cloth simulation, facial animation, or visual polish. For a 10/10 game or cartoon route, pair the plan with:

- `assets validate-game` or `assets validate-cartoon`.
- Animation clip readiness evidence.
- First-frame screenshots.
- Runtime scene evidence.
- Manual or automated visual review.

