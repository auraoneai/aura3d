# Agent Quickstart

Aura3D Agent Quickstart: prompt to browser 3D with TypeScript, scene kits, typed GLB/glTF assets, Vite templates, diagnostics, screenshots, and static deploy checks.

Use this quickstart to build AI-generated browser 3D scenes, GLB product viewers, and Vite 3D apps with Codex, Claude Code, Cursor, Copilot-style agents, or any coding agent that writes TypeScript.

Aura3D is a scaffolded path from a 3D product prompt to an app a team can keep.

Read `llms.txt` first. Then read `docs/agents/claims-and-boundaries.md` for the
hard rules that prevent primitive slop, raw asset IDs, Three.js loader code, CSS
scene effects, and overclaimed root `createAuraApp` capabilities.

The workflow is intentionally simple:

1. Describe the 3D experience.
2. Resolve or add the real GLB/glTF asset.
3. Generate typed asset refs.
4. Compose the scene with the public Aura3D API.
5. Capture evidence and deploy.

## Golden path

1. Scaffold with `npx create-aura3d@latest my-scene --template product-viewer`.
2. Search/resolve a catalog asset or add a user-approved local asset:

   ```bash
   npx @aura3d/cli@latest assets search "studio robot"
   npx @aura3d/cli@latest assets resolve "studio robot" --name robot
   npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
   ```

3. Import `assets` from `src/aura-assets.ts`.
4. Compose a scene with `scene()`, `model(assets.robot)`, `camera`, `lights`,
   `material`, `effects`, `timeline`, and `interactions`.
5. Run `npm run build`, `npm run test`, screenshot evidence, route-health or
   equivalent diagnostics, and `npx @aura3d/cli@latest check-deploy`.

Do not start an object-focused app with boxes and cylinders. For a named
product, character, vehicle, weapon, creature, or world, the primary subject
must be a typed GLB/glTF asset. Primitives can support the scene as set
dressing, debug markers, collision guides, HUD anchors, or explicitly abstract
visualization.

## Prompt-to-code pattern

Use this when the user gives a product prompt rather than a hand-written scene
plan.

```ts
import {
  createAuraApp,
  definePromptPlan,
  promptPlanToScene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = definePromptPlan({
  sceneType: "product-viewer",
  subject: { asset: assets.robot },
  camera: { preset: "product-orbit" },
  lighting: { preset: "studio-softbox" },
  interaction: "orbit",
  acceptanceCriteria: ["asset is centered", "lighting and shadows are visible"]
} as const);

createAuraApp("#app", {
  scene: promptPlanToScene(plan),
  diagnostics: { overlay: true }
});
```

Full workflow details live in `docs/agents/prompt-to-3d-workflow.md`.

## Claim-safe checklist

Before presenting the result as public or release-ready:

- no `model("id")`, raw `.glb` or `.gltf` URLs, or `unsafeModelUrl(...)`;
- no `three`, `three/examples/...`, or `GLTFLoader` imports;
- no CSS/DOM particles, fake 3D labels, fake effects, or fake renderer proof;
- no primitive-only primary subject unless the route is explicitly abstract;
- all primary assets are in `aura.assets.json` and `src/aura-assets.ts`;
- screenshots show the primary subject readable at first load;
- game examples prove keyboard input, objective, reset, and scoring/fail or
  progression;
- claims are labeled as root safe API, production-runtime, rendering internals,
  CLI pipeline, template scaffold, prototype, or roadmap.

## Product rule

Do not make the scene feel generated. Use authored assets, typed refs, scene
kits, readable controls, and screenshot evidence. Aura3D is there to help an
agent ship browser 3D that feels intentional, not improvised. If the public root
API cannot prove the requested feature yet, say so and keep the route labeled as
prototype or blocked rather than compensating with fake visuals.
