# Asset Selection

Use this when choosing GLB/glTF assets for public Aura3D examples, templates, or
showcase routes.

Read `llms.txt` and `docs/agents/claims-and-boundaries.md` first. Asset
selection is not a styling pass; it is a release gate. A route with a bad
primary asset stays `prototype` or `blocked` even if it compiles.

## Required Flow

1. Search or resolve through the Aura3D CLI when the prompt names a real object:

```bash
npx @aura3d/cli@latest assets search "animated runner character"
npx @aura3d/cli@latest assets resolve "animated runner character" --name runner
```

2. For approved local files, add the file through the CLI:

```bash
npx @aura3d/cli@latest assets add ./assets/runner.glb --name runner
```

3. Import the generated typed asset and render it with the public API:

```ts
import { model } from "@aura3d/engine";
import { assets } from "./aura-assets";

model(assets.runner);
```

Do not use raw model strings, guessed URLs, `GLTFLoader`, `three`, or route-local
loader code.

## Primary Asset Rules

Primary characters, vehicles, products, worlds, weapons, creatures, tracks, and
hero environments must be typed GLB/glTF assets unless the route is explicitly
abstract visualization.

Reject or demote a primary asset when it has any of these problems:

- missing durable source page, license, author/attribution, or download URL when
  available;
- temp provenance such as `/var/folders/.../T/aura3d-resolve-*`;
- no material or texture evidence where the role expects a textured asset;
- no usable animation for a character route that claims animation;
- extreme bounds, unreadable scale, bad pivot, or unknown orientation that the
  route cannot correct through public APIs;
- duplicate hash with no allowlist or explanation;
- generated thumbnail only, without a rendered probe or screenshot proving the
  asset is readable;
- placeholder-like shape used as the primary subject for a real object.

## Role Fit

Select assets by role, not only by keyword.

| Role | Required evidence |
| --- | --- |
| Character | Human-readable scale, animation inventory if movement is claimed, feet/contact area visible, license/provenance. |
| Vehicle | Readable length/width orientation, grounded wheels/body, visible material/texture, route camera proof. |
| Track/world | Usable footprint, authored scale or public transform diagnostics, clear route path, no hidden giant bounds. |
| Product | Texture/material inventory, clean camera framing, no primitive substitute as the hero object. |
| Abstract data/effects | May use primitives, but must be labeled abstract and cannot claim real-world asset backing. |

## Acceptance Evidence

Before a route can present a primary asset as public proof, attach:

- typed key in `src/aura-assets.ts`;
- manifest entry in `aura.assets.json`;
- source/license/provenance fields;
- bounds, material, texture, and animation metadata as relevant;
- rendered screenshot or probe showing the asset readable in context;
- route-health entry naming the same asset used in source;
- source scan proving no raw IDs, raw URLs, `three`, `GLTFLoader`, or
  primitive-primary substitution.

If any item is missing, keep the route or doc claim marked `prototype`,
`internal`, `diagnostic`, or `blocked`.
