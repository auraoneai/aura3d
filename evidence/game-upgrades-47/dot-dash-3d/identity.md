# Glint Courier (`dot-dash-3d`): identity sheet (GU47 WP-23, lane g13)

**Fantasy:** night shift on the workbench. A tilt-shift macro view of a powered circuit board under one warm desk lamp late
at night: glossy solder mask, black epoxy chip walls with silver pins, copper traces that light up behind the courier,
edges dissolving into an out-of-focus walnut bench.

- Art direction: `apps/showcase-dot-dash-3d/src/art/direction.ts` (genre `maze-arcade`), audit record
  `apps/showcase-dot-dash-3d/src/art/direction.audit.json`.
- Look table (one row per board): `apps/showcase-dot-dash-3d/src/game/look.ts` (`BOARD_LOOKS`, `LAMP`, `BOUNCE`, `LENS`).
- VFX preset pack: `apps/showcase-dot-dash-3d/src/game/vfx.ts`.

## Signature effect

Shallow macro depth of field on a lamp-lit circuit board whose copper traces light up along the courier's path.

- Macro DOF: focus on the board centre (camera-to-target distance, about 22 world units times the aspect pull-back),
  fStop 2, 85 mm, max blur 6 px. High and Ultra only.
- Lit traces: every corridor the courier crosses lights in the board's trace-glow colour and fades over about two seconds;
  a surge sends a ring of light out through the traces. This part survives every tier (instanced emissive strips, no post).
- Low tier fallback: no DOF; the lit traces, the lamp pool and the palette stay (PRD §6.4).

## Palette (board 1, Relay Grid)

| Role | Hex |
|---|---|
| Solder mask (primary) | `#1f4a38` |
| Copper (primary) | `#c8743a` |
| Silver pins and pads (primary) | `#c9ced6` |
| LED cyan (accent, the shards) | `#5ff3ff` |
| Surge-cell amber (reserved objective) | `#ffb23e` |
| Black epoxy walls | `#141416` |
| Walnut bench | `#5a3a26` |
| Anti-static mat | `#2b3a44` |
| Room haze and clear colour | `#1a120c` |

## Variants (six boards, six PCB types, one time of day)

Every board is late night under the same desk lamp (a shadowed PCSS spot from the upper left, `LAMP.position` [-13, 19, 9]).
The environment is the E-A catalogue HDRI `indoor-workshop` (`/hdri/indoor-workshop_1k.hdr`) at 0.35, rotated 205°, used
for image-based fill and reflections only (`background: false`; the visible surround is the walnut bench). It is not this
game's primary visible sky, so it does not collide with Aura Hoops 3D's tungsten court, which uses the same file as a
visible environment (PRD §6.1: secondary IBL-only use with its own rotation and intensity).

| Board (`?maze=`) | PCB type | Mask | Copper | LED | Trace glow | Lamp colour / K / intensity | Grade (contrast, saturation, temperature, tint) |
|---|---|---|---|---|---|---|---|
| classic (Relay Grid) | green FR-4 relay board, bare copper | `#1f4a38` | `#c8743a` | `#5ff3ff` | `#ffb070` | `#ffc58a` / 3000 K / 3400 | 1.08, 1.06, +0.08, 0 |
| spiral (Coil Loop) | purple RF coil board, ENIG gold | `#3b2457` | `#d9a648` | `#ff9ee0` | `#ffd27a` | `#ffcf9c` / 3200 K / 3300 | 1.10, 1.04, +0.04, +0.06 |
| twin (Twin Pylons) | blue power board, HASL tin | `#1c3a6e` | `#c9ced6` | `#9ff7ff` | `#bfeaff` | `#ffe0bc` / 3600 K / 3300 | 1.07, 1.02, -0.04, -0.02 |
| garden (Overgrowth) | white-mask LED lighting board, ENIG gold | `#cfd5c4` | `#cfa24c` | `#8dff6a` | `#c4ff7a` | `#fff0d8` / 4000 K / 2900 | 1.06, 1.08, 0, -0.04 |
| foundry (Smelter Rows) | red heavy-copper power board | `#7a2018` | `#d4834a` | `#ffd27a` | `#ff9a5a` | `#ffbe80` / 2800 K / 3200 | 1.10, 1.02, +0.10, +0.02 |
| zerocore (Zero-Core) | matte black reactor board, ENIG gold | `#141418` | `#d7a74e` | `#ff5fdc` | `#ff9cf0` | `#ffd9b0` / 3400 K / 3600 | 1.12, 1.05, +0.02, +0.08 |

Fog: `#1a120c`, exp2 density 0.006 on every board. Lens stack (all boards): bloom 0.55 / threshold 0.92, vignette 0.32,
chromatic aberration 0.0012, grain 0.02, ACES tone mapping.

## Distinctness (PRD §6.1, arcade group: G12 Slingshot Siege, G13, G23 The Bellkeeper's Walk)

| Against | Their look | Why this differs |
|---|---|---|
| The Bellkeeper's Walk | pastel gouache meadow, afternoon to dusk, kloppenheim_06 IBL + sky dome | indoor night, one artificial lamp, no sky, electronics materials |
| Duneglide | sandstone dunes, seven hours of daylight, ink lines | indoor night macro, no sky, no ink |
| Slingshot Siege | seaside diorama through one day, real sea horizon | no daylight, no horizon; the bench ends the world |
| Neon cabinet games (Blockfall Reactor, Vault Breakers) | neon arcade rooms, emissive cabinets | warm practical lamp on a matte-and-gloss board; emissive only on LEDs and lit traces |
| Ion Circuit, Bunker Zero | alien blue-hour canyon; concrete bunker lit by its own fixtures | walnut-and-copper warmth, macro scale, PCB palette |

Phase 2 adds the sibling-judge results (`same_game` false at >= 0.8 against the six games in DD47-PR1) and the before and
after card frames.

## Budget row

| Tier | Draw budget | Lights | Notes |
|---|---|---|---|
| High / Ultra | <= 110 (today 39) | 1 shadowed spot + bounce + <= 5 points | macro DOF on |
| Medium | <= 90 | same | no DOF |
| Low | <= 70 | spot + bounce + courier point | no DOF, CA or grain |

`budget.json` carries the before row (39 draws, from `evidence/dot-dash-3d/audit-fix/wave3/final-metrics.jsonl`); the
after rows are measured in phase 2.
