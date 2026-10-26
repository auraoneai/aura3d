# Hoops dribble on the library kit (`createHandBounce`)

Aura Hoops now runs its dribble on `createHandBounce` from `@aura3d/engine/game` (docs/api/motion-hand-bounce.md). Remote probe (`tests/browser/hoops-dribble-probe.spec.ts`, software WebGL2, run `libbounce-after2`) against the numbers before the refactor (`hoopsdrib-after8`):

| | before (game code) | after (library kit) |
|---|---|---|
| standing, palm to ball at the meet (max) | 0.068 m | 0.068 m |
| standing, palm height / palm to ball at the floor contact | 0.624 m / 0.484 m | 0.624 m / 0.484 m |
| standing, ball centre at the floor contact | 0.14 m | 0.14 m |
| running, palm to ball at the meet (max) | 0.09 m | 0.055 m |
| running, palm height / palm to ball at the floor contact | 0.60 m / 0.48 m | 0.596 m / 0.475 m |

Standing numbers are identical; running differs only by sampling (render-rate samples of a free-running game, 15 to 23 samples). Raw lines: `after-kit.txt`. The spec now also prints `HOOPSDRIB_MEASURE` (the library `measureHandBall`); floor error is informational there because render-rate samples rarely land on the exact floor frame, the dense unit test (`tests/unit/rework-kit/hand-bounce.test.ts`) asserts it. All numbers are software GL, not a real GPU.
