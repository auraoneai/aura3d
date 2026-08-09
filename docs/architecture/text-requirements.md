# Text rendering — requirements before implementation (WS-2.7)

**Status:** historical requirement + decision record for WS-2.7. Its 1.6
decision about DOM annotations remains active; its deferral of lit geometry
text was superseded by the later WS-3.7 requirement and implementation. See
`docs/rendering/geometry-instancing-lod-text.md`.

The PRD's instruction is the reason this document exists:

> A naive `TextGeometry` could close a parity row while giving poor real-world text. Do not prescribe
> the implementation first.

The parity row today reads:

> `text rendering` — **gap** — *"No 3D text primitive. World labels are DOM, which is legible and
> accessible but cannot be occluded by geometry or lit by the scene."*

That note is accurate about the DOM layer and it understates one thing, found while writing this
document. See *"What we actually have"*.

## Step 1 — what do we owe a developer?

Five distinct capabilities get called "text". They are not interchangeable, and a single
implementation serves at most two of them well.

| # | Capability | What it means | Do we owe it? |
|---|---|---|---|
| 1 | **World-space annotations** | A label pinned to a 3D point, tracking it as the camera moves. Callouts, measurements, hotspots. | **Yes — the primary requirement.** It is what `labels.*` promises and what product-configurator, digital-twin and architecture routes use. |
| 2 | **Accessible DOM labels** | Real text in the accessibility tree, selectable, screen-reader legible, responsive to OS font settings. | **Yes — and we must not lose it.** Already delivered. |
| 3 | **Occlusion-aware annotations** | A label hidden or dimmed when the geometry it annotates is behind something else. | **Yes.** It is already a *declared option* that does nothing — see below. This is the real gap. |
| 4 | **High-quality scalable UI text** | Crisp text at any zoom for HUDs, axis ticks, in-scene UI. | **Yes, and DOM already does it better than any GPU approach.** |
| 5 | **Lit 3D geometry text** | Extruded glyph meshes, shaded by scene lights, self-shadowing. Title cards, embossed logos, signage. | **No — not a 1.6 requirement.** Genuinely valuable for cinematic and signage work, and nothing in the repository asks for it. Building it to close a parity row would be the exact mistake WS-2.7 was written to prevent. |

## What we actually have, measured

`packages/engine/src/agent-api/WorldLabelRenderer.ts` is a real screen-space layer: labels are
world-anchored, projected each frame with the scene's own view-projection matrix, drawn into a DOM
overlay with `pointer-events: none`, `role="note"`, and collision avoidance that genuinely runs.

So capabilities 1, 2 and 4 are **delivered**, and delivered well — DOM is the right medium for text,
and the placement is driven entirely by the 3D projection.

**Capability 3 is not, and it is worse than absent: it is declared.**

```ts
// agent-api/index.ts:3058, :3070, :3081 — every label factory
occlusionAware: options.occlusionAware ?? true,
```

Every `labels.billboard()`, `labels.anchor()` and `labels.axisTick()` defaults `occlusionAware` to
**true**. `AuraLabelOptions` accepts it (`:1375`). `FocusSelection.ts:266` sets it explicitly. And
`worldLabelsFromSnapshot` — the bridge from scene node to `WorldLabel` — **never reads it**. The
`WorldLabel` interface has no field for it. `depth` exists on `ProjectedLabel`, and it is used only for
draw *ordering* and collision priority.

A developer reading the API sees occlusion-aware labels on by default. A developer watching the screen
sees labels drawn through walls. That is the same defect shape as the three P1 fabrications and the
WS-2.5 gradient: a declared capability that quietly does nothing.

## Step 2 — the four ecosystem approaches, against those requirements

| Approach | 1 world anchor | 2 accessible | 3 occlusion | 4 crisp UI | 5 lit 3D | Cost |
|---|---|---|---|---|---|---|
| **DOM/CSS overlay** *(what we have)* | yes | **yes, natively** | **no — needs a depth signal** | **yes, natively** | no | already built |
| **SDF/MSDF atlas** | yes | no — pixels, not text | yes, depth-tested | yes, scales cleanly | partially | high: atlas generation, shader, font pipeline |
| **Geometry text** (`TextGeometry`) | yes | no | yes | poor — tessellation shows at small sizes | **yes** | medium: glyph outline parsing + extrusion |
| **Texture atlas** (pre-baked bitmap) | yes | no | yes | no — blurs when scaled | low |

Read against the requirement table, the answer is not what a parity row would suggest:

- **SDF/MSDF is the strategically stronger *engine* capability** — the PRD says so, and it is right in
  general. But adopting it for capabilities 1–4 would mean **replacing a working accessible DOM layer
  with pixels**, losing capability 2 outright and regressing 4. That is a downgrade dressed as parity.
- **Geometry text serves only capability 5, which we do not owe.** Implementing it would close the
  parity row and change nothing a developer can use today. Explicitly rejected.
- The only capability actually missing is **3**, and DOM's gap there is a *depth signal*, not a text
  rendering problem. Text is not the missing piece.

## Step 3 — decision

> **Implement occlusion for the existing DOM label layer. Do not build a text renderer in 1.6.**

Rationale, in the terms of the PRD's North Star: a developer can already ship legible, accessible,
world-anchored, crisply-scaled annotations. What they cannot do is have those annotations respect the
geometry in front of them — and that is a **50-line depth comparison**, not a font pipeline.

Concretely:

1. Carry `occlusionAware` from the scene node into `WorldLabel`, so the declared option reaches the
   renderer at all.
2. Occlude by comparing the label's projected depth against the depth of the scene at that pixel,
   using the renderer's existing depth information rather than a new pass.
3. When occluded, apply the declared policy — hide, or dim — rather than drawing at full strength.
4. A visual test proving a label behind geometry is occluded and the same label in front is not.

**Deferred with reasons recorded, not silently dropped:**

- **Lit 3D geometry text (capability 5).** No consumer, and building it to close a parity row is the
  mistake this document exists to prevent. Revisit when a route needs signage or a title card, and
  under R11 it needs an ADR first because it is a new subsystem.
- **SDF/MSDF.** The strategically interesting option, and adopting it *now* would regress accessibility
  and UI crispness to gain occlusion we can get for far less. It becomes correct when a requirement
  appears that DOM genuinely cannot serve — text on a curved surface, text in VR where there is no DOM
  plane, or thousands of labels where per-label DOM nodes stop scaling. None of those exist today.

## What the parity row may claim

At the WS-2.7 decision point, the row stayed **`gap` for "3D text"** because no
text renderer was shipped. WS-3.7 later added a bounded root-safe extruded
bitmap-glyph mesh surface after the final PRD explicitly made depth-bearing 3D
text a release obligation. That later work does not invalidate this document's
central decision: accessible world labels remain DOM UI and must not be
replaced or relabeled as mesh text. The new mesh surface is intentionally
limited to its documented uppercase alphanumeric glyph catalog and is not a
general font, shaping, or SDF/MSDF system.

Occlusion is tracked as its own claim with its own test, because it is the capability that changed.
