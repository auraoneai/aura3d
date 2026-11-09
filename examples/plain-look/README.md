# Plain look (N3)

Classification: internal diagnostic

## Purpose
Rebuilds the two cause-A scenes from benchmark 505 (`animation-1` spider and `interactive-1` garden, aura-sheet r1)
to measure the N3 plain look path: a lit scene with no authored look, output or post effect renders its authored
colours through the PBR Neutral output, and `environments.neutral()` next to a hemisphere or ambient light yields
its diffuse fill to that light.

## Run Command
Run a TypeScript-aware dev server from the repository root (`vite`) and open `examples/plain-look/spider.html`,
`examples/plain-look/garden.html` or `examples/plain-look/bare.html` (640x360 canvas, as in the benchmark). `bare.html` is
geometry only (a `#b5532f` crate, a blue ball, a steel ball): the cold-start hero stage over the structured room on the
plain output.

- default: the scene's authored lights on the plain look path
- `?lighting=plain-preset`: the authored lights replaced by `looks.preset("plain")`
- `?a3d-plain-look=0`: the pre-N3 default (direct path ACES fit, stacked fill)

## Acceptance Target
Frame luma and the authored-colour regions land in the three.js band of the benchmark frames (spider: dark body with
a visible ground shadow instead of a pale grey spider on white; garden: the `#6a8a3c` ground reads green, not pale
mint). The bare crate's lit front reads close to `#b5532f` (181,83,47).

## Output curve
The plain output is Khronos PBR Neutral at exposure 1 on every route. The fused WebGL2 LDR present used to run
`"neutral"` as a per-channel `x (1 + x / 7.5) / (1 + x)` curve (scene white at sRGB ~198), which made plain scenes darker
and greyer than authored; plain apps now select the Khronos curve there, and the background clear pre-inverts it so
`scene({ background })` presents as authored. Apps that author an output keep the curve they had.
