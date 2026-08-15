# Turbo Drift Circuit

Status: materially rebuilt; independent exact-artifact review pending

Claim label: createAuraApp

Primary assets: `showcaseCc0FormulaRaceCar`,
`showcaseCcByFormulaOpponent`, and `showcaseTsukubaCircuit`

Turbo Drift Circuit is a four-lap arcade racing candidate with six ordered
gates, a typed red Formula-style player car, a distinct typed blue/black rival,
a chase camera aligned to forward travel, drift feedback, off-track recovery,
lap/finish progression, and circuit-derived per-wheel contact sampling. The
visual grey asphalt is wide enough for the player to pass the rival on tarmac.
Rapier owns solid vehicle contact. SAT clamps only the player's commanded
target. Opponent `onRoad` evidence uses the same body-on-asphalt test as the
player.

Controls:

- `W`/`ArrowUp`: throttle
- `S`/`ArrowDown`: brake
- `A`/`ArrowLeft`: steer left
- `D`/`ArrowRight`: steer right
- `Space` or left `Shift`: drift
- `R`: reset

The public claim is bounded to authored-unit arcade handling, certified track
topology, selected Rapier collision proof, and deterministic opponent driving.
It does not claim a physical tyre model, drivetrain, damage, suspension, or
motorsport simulation. Automated composition, route-primary, gameplay,
interaction, grounding, and deploy evidence must remain fresh. Public promotion
is blocked until an independent human approves the exact final source-bound
screenshots and the release gate is regenerated from those artifacts.
