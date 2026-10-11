# Q-13-15 — look-floor subject-bounds + color-bucket checks fail on software GL (measured)

**Requester:** Lane 15 (PRD-15, Phase 8 `check:templates` bring-up)
**Owner:** Lane 13 (template specs + look presets) / Lane 02 (env-IBL renderer path)
**Status:** open — measured evidence attached; needs an owner decision, not blindly recalibrated constants

## Symptom

After the boot/timing fixes in Q-13-14, `check:templates` still fails the §T3.12
subject-bounds check on templates whose subject is a PBR-lit model under an
HDRI look preset. The lit-pixel bbox (`luma > 48`, central region, stride 4)
lands ~0.15–0.25 below the authored constants on software GL:

| Template | Authored `{x,y,w,h}` | Measured (software GL, settle(45)) |
|---|---|---|
| three-compat-premium-product-viewer | 0.25, 0.30, 0.50, 0.50 | 0.325, 0.522, 0.350, 0.156 |
| three-compat-character-viewer | 0.35, 0.20, 0.30, 0.60 | 0.372, 0.356, 0.256, 0.511 |
| three-compat-architecture-interior | 0.15, 0.20, 0.70, 0.65 | fails (same signature) |
| three-compat-material-authoring | 0.20, 0.35, 0.60, 0.40 | fails (same signature) |
| episode-builder | 0.15, 0.30, 0.70, 0.55 | fails (same signature) |
| animation-studio | — | `uniqueBuckets` 2 ≤ required >8 (near-monochrome frame) |

## Measured render evidence

three-compat-premium-product-viewer (served from live source aliases, settled,
1280×720): the plinth lights correctly; the Khronos ToyCar (clearcoat/
transmission/sheen materials) renders nearly black — only the floor-lit plinth
crosses the `luma > 48` threshold, so the measured bbox describes the plinth,
not the car. `studio_small_08_1k.hdr` is fetched (200), the app registers in
`__AURA3D_LIVE_APPS__`, `settle(45)` applies, `evidence({})` reports zero
errors/warnings/asset-failures, `renderer.assetFailures: []`.

Hypothesis (not verified): the env-IBL path (HDR decode → PMREM prefilter)
produces a black or near-black irradiance/specular on swiftshader, so
metalness-heavy PBR models lose their dominant light source while
diffuse/key-lit surfaces still read. If true, the authored constants describe
GPU-renderer output and this gate is environment-sensitive in a way the
constants cannot express — recalibrating to software-GL values would assert
"the floor is the subject", which inverts the check's intent.

## Arena-shooter post-boot framing

After the Q-13-14 TDZ fix the app boots and the wave spawner runs, but the
settled frame shows a single large unlit sphere-ish object bottom-center
instead of the expected 60° top-down arena (subject `{x:0.1,y:0.2,w:0.8,h:0.7}`
can never match). Possible instanced-star transform issue or camera-pose
semantic drift — same "needs owner eyes" bucket; this template's visuals were
never exercised in CI because it never booted before.

## Asks

1. Lane 02/renderer owner: confirm whether env-IBL (PMREM) is expected to work
   on software GL; if it degrades, decide whether `looks.preset` should pick a
   fallback look on `degradations` or the renderer should surface one.
2. Lane 13: once lighting intent is confirmed, recalibrate subject constants to
   measured values **on the environment the gate runs on** (or mark the check
   GPU-only), and give animation-studio's `uniqueBuckets > 8` and
   arena-shooter's subject box a second look.
3. If the right answer is "constants must differ per renderer", the check needs
   an environment-conditional expected set — please advise on the preferred
   mechanism before anyone hardcodes two tables.
