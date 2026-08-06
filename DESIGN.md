# Aura3D Showcase Design System

## 1. Atmosphere & Identity

Aura3D public showcases should feel like compact, credible product demos for a browser 3D SDK: focused 3D subjects, restrained command UI, and evidence presented as supporting context rather than the main visual. The signature is proof-grade staging: every route should make the typed primary asset readable first, then frame controls and diagnostics around it without visual clutter or overclaiming renderer capability.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Surface/primary | `--a3d-surface-primary` | `#F8FAF8` | `#070A0C` | Page and scene shell backgrounds |
| Surface/secondary | `--a3d-surface-secondary` | `#EEF2EF` | `#11171A` | Panels, HUD groups, sidebars |
| Surface/elevated | `--a3d-surface-elevated` | `#FFFFFF` | `#172024` | Active cards, meters, selected controls |
| Text/primary | `--a3d-text-primary` | `#101416` | `#F6F8F4` | Titles, metric values, route labels |
| Text/secondary | `--a3d-text-secondary` | `#4E5A60` | `#AEBCC0` | Supporting copy and diagnostics |
| Text/tertiary | `--a3d-text-tertiary` | `#728087` | `#718187` | Disabled and low-priority text |
| Border/default | `--a3d-border-default` | `#D9E0DD` | `#2A363A` | Panels and control outlines |
| Border/subtle | `--a3d-border-subtle` | `#E8EEEB` | `#1B2528` | Internal dividers |
| Accent/primary | `--a3d-accent-primary` | `#187C62` | `#7EE8C4` | Active controls and route emphasis |
| Accent/amber | `--a3d-accent-amber` | `#A86F18` | `#E6B85A` | Caution, cinematic warmth, progress |
| Accent/cyan | `--a3d-accent-cyan` | `#227C90` | `#65D8E8` | Technical telemetry and selection |
| Status/success | `--a3d-status-success` | `#1E7A4D` | `#86E391` | Passing route status |
| Status/warning | `--a3d-status-warning` | `#B36B00` | `#F2B15A` | Prototype or bounded claims |
| Status/error | `--a3d-status-error` | `#B43830` | `#F2715C` | Blocking issues |

### Rules

- Public demos use dark neutral scenes with one route-specific accent. Avoid one-note purple/blue palettes.
- Evidence UI uses muted surfaces; it must never overpower the 3D subject.
- Accents communicate state or route identity. They are not decoration.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | 40px | 760 | 1.05 | 0 | Route title where space allows |
| H1 | 28px | 760 | 1.12 | 0 | Compact app titles |
| H2 | 18px | 720 | 1.18 | 0 | Panel headings |
| Body | 14px | 500 | 1.5 | 0 | Standard UI copy |
| Body/sm | 12px | 520 | 1.45 | 0 | Logs, controls, evidence |
| Caption | 11px | 720 | 1.25 | 0 | Metric labels and overlines |
| Mono | 12px | 520 | 1.45 | 0 | Checksums and JSON snippets |

### Font Stack

- Primary: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Mono: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

### Rules

- Letter spacing is `0` except where legacy route labels already use small-caps; new public route UI should avoid extra tracking.
- Panel text must wrap or scroll inside its own surface. No overflow into neighboring panels.
- JSON or evidence text is secondary and should not read as the hero content.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a 4px base unit.

| Token | Value | Usage |
| --- | --- | --- |
| `--a3d-space-1` | `4px` | Icon-to-label spacing |
| `--a3d-space-2` | `8px` | Compact row gaps |
| `--a3d-space-3` | `12px` | Panel internal gaps |
| `--a3d-space-4` | `16px` | Standard panel padding |
| `--a3d-space-5` | `20px` | App chrome padding |
| `--a3d-space-6` | `24px` | Comfortable route sections |

### Grid

- Desktop public routes reserve a central evidence area for the 3D subject. Side UI should use fixed or clamped columns.
- On 1440px desktop screenshots, the primary subject should occupy a readable portion of the evidence area: vehicles and characters should generally exceed 160px on their longest visible axis, products and hero objects should exceed 300px when possible.
- HUD panels must stay outside the route-primary foreground region unless the route is intentionally a cockpit/dashboard and the subject remains readable.

## 5. Components

### Command Panel

- Structure: title or section label, grouped controls, optional evidence footer.
- Variants: left HUD, right inspector, bottom action rail.
- Spacing: `--a3d-space-3` gaps, `--a3d-space-4` padding.
- States: hover and active states use `--a3d-accent-primary` or route accent.
- Accessibility: controls are real buttons with readable labels and `aria-pressed` for toggles.

### Evidence Card

- Structure: label, value, optional source note.
- Variants: metric, asset metadata, event log row.
- Spacing: compact; values wrap with `overflow-wrap: anywhere`.
- Usage: supports public claims but must not dominate the demo.

### Route Stage

- Structure: full-viewport or split-stage canvas with stable side UI.
- Variants: product hero, game viewport, command center, inspector.
- Rules: the 3D asset is first-read content; set dressing is secondary and must not become primitive-primary evidence.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | 120ms | ease-out | Button hover and press |
| Standard | 180ms | ease-in-out | Panel state changes |
| Runtime | frame-based | route logic | Game and scene motion through Aura3D APIs |

### Rules

- Animate `transform`, `opacity`, or engine runtime state only. Do not animate layout properties.
- Game routes must keep keyboard proof intact while improving presentation.
- DOM effects are UI only and cannot stand in for particles, 3D labels, lighting, or renderer evidence.

## 7. Depth & Surface

### Strategy

Mixed tonal-shift and thin borders. Public routes use translucent panels only where they help controls sit above the canvas.

| Surface | Treatment | Usage |
| --- | --- | --- |
| Stage | Deep neutral background with route-specific grounding geometry | Canvas area |
| Panel | Semi-opaque dark surface, 1px border, restrained blur | Controls and evidence |
| Active control | Subtle accent fill and border | Selected route state |

### Rules

- Do not use heavy decorative shadows or gradient blobs.
- Avoid clipped primitives at viewport edges unless they are clearly background set dressing.
- Public screenshots should read as finished route compositions, not probe harnesses.

## 8. Package Architecture

The visual system above governs routes. This section governs the source tree those routes import.

Canonical record: [`docs/architecture/package-ownership.md`](docs/architecture/package-ownership.md).
It lists, per package, its owner responsibility, its tier, its public `exports` subpath, and the
union of its declared and imported `@aura3d/*` dependencies. That document is descriptive; the gate
`pnpm check:package-graph` (`tools/package-graph/index.ts`) is authoritative and writes
`tests/reports/package-graph.json` plus `docs/architecture/package-graph.dot`.

### Dependency direction

Packages are assigned to seven tiers. Dependencies point **down only**.

| Tier | Meaning |
| --- | --- |
| 0 | Foundation — no Aura3D dependencies |
| 1 | Core data model |
| 2 | Subsystems over the data model |
| 3 | Subsystems composing other subsystems |
| 4 | Product surfaces |
| 5 | Aggregate runtime (`engine`) |
| 6 | Consumers of the aggregate, and standalone tools |

### Rules

- A package may import only from a strictly lower tier. An edge from tier N to tier M where
  M > N fails `check:package-graph`.
- A package may import only through another package's `exports` subpath. Deep imports
  (`@aura3d/*/src/*`) are blocked by ESLint.
- A package may import only what its own `package.json` declares. An imported-but-undeclared
  `@aura3d/*` specifier resolves through workspace hoisting or a `tsconfig` path alias locally and
  breaks for a registry consumer; that count must stay at zero.
- Nothing may depend on tier 5 or 6 except tier 6.
- A declared dependency with no source import is an over-declaration. It is reported as install
  weight, not failed — removing it from a published manifest is a consumer-visible change.
