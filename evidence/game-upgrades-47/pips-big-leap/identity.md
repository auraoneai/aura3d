# Pip's Big Leap: identity sheet (GU47 WP-16, G06)

**Fantasy:** a hand-made felt-and-clay woodland diorama seen through a macro lens, with an acorn-sized Pip leaping between toadstools. Every world is a closed miniature set with its own hour; never an open sky or a wide vista (Cumulus Dash, Serpentine and Bellkeeper's Walk own those).

**Signature effect:** the shallow-focus miniature lens. An f/2, 50 mm thin-lens depth of field (maxBlur 4) holds Pip sharp at about 4.6 m (5.7 m in a 390x844 portrait); the focus follows the real lens distance every frame (`app.post.setEffect("depthOfField", { focusDistance })`), and each felt-and-clay set melts into bokeh over a fogged diorama base. Below High (the engine drops DOF): the corner vignette and the base height fog carry the miniature read. Unique among live games (`art/direction.ts` `signatureEffect`; G12 owns "miniature DOF over a real sea horizon", G13 "macro DOF + lit traces", G14 "tilt-shift blur bands + moving sun").

## Palette

| Role | Hex | Swatch use |
|---|---|---|
| Moss (primary) | `#4f7a3a` | felt platform tops, flora, mounds, HUD mode tag |
| Toadstool red (primary) | `#c8432f` | clearcoat mushroom caps, HUD values and hearts |
| Birch cream (primary) | `#efe3c8` | HUD parchment chips, banner titles |
| Sun-seed gold (accent, reserved objective) | `#ffc23d` | sun-seeds, seed sparkle, Sun-Gate ring and gate burst only |

Supporting materials: matte clay bodies (`#6b4c35`, `#5c3f28`), darker mushroom stems `#b8a58a`, plum bramble hazard `#5b3a7a` (hue about 271, outside 290-330), practical lava `#ff5a26`.

## Worlds (one look-table row each, `src/game/looks.ts`)

| World | Hour | HDRI (IBL only; `rotationDeg`, intensity) | Sky | Key (elevation / azimuth, intensity) | Background | Post preset | Ambient | Practicals |
|---|---|---|---|---|---|---|---|---|
| academy | garden mid-morning | `spruit_sunrise` (120, 0.85) | none (closed backdrop) | 42 / 120, 2.5 | `#8fa673` | daylight-outdoor | petals | none |
| w1 | canopy dawn shafts | `spruit_sunrise` (80, 0.7) | none | 18 / 80, 2.3 | `#2f4a3a` | daylight-outdoor + S4 sun shafts | spores | none |
| w2 | millpond golden hour | `belfast_sunset_puresky` (250, 0.8) | Preetham (turbidity 6) | 10 / 250, 2.4 | `#b9784a` | daylight-outdoor + S4 sun shafts | motes | lens flare on the low sun |
| w3 | dandelion-fluff dawn | `spruit_sunrise` (150, 0.95) | peach-lilac gradient | 24 / 150, 2.8 | `#d4b6c6` | daylight-outdoor | fluff | none |
| w4 | lava-lit basalt cellar | `hangar_interior` (30, 0.2) | none | 55 / 20, 0.15 | `#1a0e0b` | arena-fight | embers | 4 flickering lava points |
| w5 | amber hollow-tree palace | `warm_bar` (200, 0.45) | none | 50 / 25, 0.25 | `#33200f` | cinematic-film + S4 sun shafts | dust | 2 lantern points + throne spot |
| w6 | firefly night garden | `rooftop_night` (300, 0.3) | night gradient + 900 stars | 30 / 300 (moon), 0.65 | `#0b1230` | space | fireflies | 3 cyan crystal points |

Every world: one PCSS 3-cascade shadowed key, a cool rim opposite the key, a hemisphere bounce, height fog pooled at the diorama base top (3-6 m below the course), a felt-topped clay plinth with felt mounds, and a per-world grade (contrast, saturation, white balance through the E-C grade writer) with a corner vignette.

**HDRI use:** `lighting.environment.background` is `"enclosed"`: no catalogue HDRI is this game's primary visible sky (the backdrop is a per-world colour or an authored sky node), so the HDRIs are secondary IBL-only uses. The three `spruit_sunrise` worlds differ in rotation and intensity (120/0.85, 80/0.7, 150/0.95), as PRD 6.1 requires for shared files; `look-identity` hashes only `background: "hdri"` environments.

## Variants and reversibility

- Variants: the seven worlds, reached through the atlas cards (`tests/browser/game-luma-targets.ts` `pipsWorld`) or `?world=<id>` (capture convenience).
- `?look=original` restores the pre-GU47 scene and HUD exactly (unit-tested scene shape; collision world identical in both looks).

## Phase 2 (not in this phase)

Before/after card frames, the 25 s / 60 s steady-state luma table against `luma-bands.json`, the budget row (`budget.json` `after`), and the distinctness results (sibling judge within the platformer and runner group: G06, G14, G16, G17, G20, G25).
