# Plain look (N3)

Classification: internal diagnostic

## Purpose
Rebuilds the two cause-A scenes from benchmark 505 (`animation-1` spider and `interactive-1` garden, aura-sheet r1)
to measure the N3 plain look path: a lit scene with no authored look, output or post effect renders its authored
colours through the PBR Neutral output, and `environments.neutral()` next to a hemisphere or ambient light yields
its diffuse fill to that light.

## Run Command
Run a TypeScript-aware dev server from the repository root (`vite`) and open `examples/plain-look/spider.html` or
`examples/plain-look/garden.html` (640x360 canvas, as in the benchmark).

- default: the scene's authored lights on the plain look path
- `?lighting=plain-preset`: the authored lights replaced by `looks.preset("plain")`
- `?a3d-plain-look=0`: the pre-N3 default (direct path ACES fit, stacked fill)

## Acceptance Target
Frame luma and the authored-colour regions land in the three.js band of the benchmark frames (spider: dark body with
a visible ground shadow instead of a pale grey spider on white; garden: the `#6a8a3c` ground reads green, not pale
mint).
