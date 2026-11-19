# Glint Courier: final screenshots (arcade-readability pass)

Route: `/apps/showcase-dot-dash-3d/` (production marketing build, served snapshot on :8790).
Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build. Captured 2026-11-18. No console page errors.

| Viewport | State | Meaning |
|---|---|---|
| 1280x720, 390x844 | 01-title | `?autostart=0`: title menu over the top-down board |
| 1280x720, 390x844 | 02-early | `?autoplay=1`, ~5 s: computer player clearing pellets on board 1 (Relay) |
| 1280x720, 390x844 | 03-action | `?autoplay=1`, ~13 s: sentries converging on the courier |
| 1280x720, 390x844 | 04-surge | `?autoplay=1`, ~16-18 s: power cell taken, sentries dark blue, an eaten sentry's eyes returning home |
| 1280x720, 390x844 | 05-board4 | `?autoplay=1&maze=garden`, ~8 s: board 4 (Overgrowth) |
| 1280x720 | 06-caught | `?autoplay=1&maze=garden`, ~12 s: courier caught (red shock ring + INTERCEPTED) |
| 390x844 | 06-chase | `?autoplay=1&maze=garden`, ~12 s: red and cyan sentries right behind the courier |
| 1440x900 | card-2x | `?autoplay=1`, ~20 s: surge, courier eating a blue sentry; `card-1x.jpg` is the 720x450 LANCZOS downscale |

Checked in the frames:
- Readability: whole maze in frame at both sizes (portrait fits the width); the gold courier is the brightest thing on
  screen (~35 px at 1280, ~23 px body / ~46 px with glow at 390); sentries ~34 px / ~22 px with big white eyes looking
  where they move; pellets warm white on near-black; no off-maze props or PCB texture.
- Motion: sentry stars spin, courier faces travel with a short glow trail and a pickup pulse; frightened sentries blue,
  eaten sentries eyes only. Actors stay on corridor centre lines (no wall crossing).
- Known issue: portrait bodies are ~22-23 px (19 tiles across 390 px); their glow halos make them ~35-46 px.
