#### Per-phase JS ms (mean per applied tick / per frame)

| run | load1 | fps | pack | updateAttribute(position) | updateAttribute(color) | tick total | render on tick frame | render on no-tick frame | gpu p50 | bufferSubData calls/frame | bufferData | createBuffer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ladder.pts-100K.fix0.rep1 | 8.8 | 34.3 | 0.22 | 8.64 | 10.25 | 19.11 | 46.2 | 13.4 | 1.45 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix0.rep2 | 19.8 | 20.1 | 0.29 | 10.97 | 12.99 | 24.25 | 58.0 | 16.5 | 1.41 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix1.rep1 | 7.8 | 40.0 | 0.21 | 4.00 | 4.11 | 8.32 | 42.7 | 13.0 | 1.44 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix15.rep1 | 11.2 | 55.2 | 0.23 | 0.26 | 0.28 | 0.77 | 31.5 | 0.7 | 1.46 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix15.rep2 | 9.3 | 49.0 | 0.27 | 0.33 | 0.34 | 0.95 | 39.5 | 0.8 | 1.51 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix3.rep1 | 11.1 | 33.8 | 0.28 | 0.32 | 0.37 | 0.98 | 56.4 | 17.1 | 1.42 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix3.rep2 | 13.1 | 34.5 | 0.28 | 0.30 | 0.35 | 0.93 | 55.8 | 17.0 | 1.46 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix31.rep1 | 11.0 | 58.7 | 0.34 | 0.38 | 0.44 | 1.16 | 23.7 | 1.0 | 1.44 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix47.rep1 | 24.9 | 59.9 | 0.27 | 0.32 | 0.33 | 0.93 | 24.5 | 0.9 | 1.45 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix47.rep2 | 49.2 | 49.7 | 0.44 | 0.54 | 0.56 | 1.55 | 39.5 | 1.3 | 0.81 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix55.rep1 | 40.3 | 60.0 | 0.27 | 0.31 | 0.36 | 0.95 | 4.3 | 2.2 | 1.48 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix55.rep2 | 27.0 | 60.0 | 0.46 | 0.48 | 0.59 | 1.54 | 6.8 | 3.4 | 1.41 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix59.rep1 | 93.2 | 39.0 | 0.45 | 0.50 | 0.54 | 1.50 | 27.1 | 23.6 | 1.42 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix59.rep2 | 10.3 | 57.4 | 0.28 | 0.32 | 0.36 | 0.96 | 17.4 | 15.0 | 1.44 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix61.rep1 | 85.9 | 60.0 | 0.45 | 8.57 | 8.74 | 17.77 | 5.4 | 1.3 | 1.45 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix61.rep2 | 12.1 | 60.0 | 0.24 | 4.57 | 4.70 | 9.52 | 3.0 | 0.8 | 1.70 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix62.rep1 | 8.9 | 60.0 | 0.25 | 4.90 | 6.60 | 11.76 | 2.6 | 0.8 | 1.50 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix63.rep1 | 10.4 | 60.0 | 0.22 | 0.26 | 0.30 | 0.79 | 2.4 | 0.8 | 1.43 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix63.rep2 | 14.9 | 60.0 | 0.32 | 0.37 | 0.43 | 1.12 | 3.4 | 1.0 | 1.47 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix7.rep1 | 9.0 | 36.1 | 0.41 | 0.45 | 0.52 | 1.38 | 59.0 | 2.9 | 1.77 | - | 0.00 | 0.00 |
| ladder.pts-100K.fix7.rep2 | 40.8 | 29.8 | 0.46 | 0.54 | 0.60 | 1.60 | 67.6 | 3.5 | 0.85 | - | 0.00 | 0.00 |
| pts-100K-10hz-60fps.aura.phases+glcount | 12.4 | 28.0 | 0.23 | 9.39 | 11.19 | 20.81 | 50.1 | 14.7 | 1.43 | 1.36 | 0.00 | 0.00 |
| pts-100K-2hz-60fps.aura.phases+glcount | 36.2 | 54.2 | 0.26 | 9.29 | 10.96 | 20.52 | 49.1 | 14.8 | 1.43 | 1.04 | 0.00 | 0.00 |
| pts-250K-10hz-60fps.aura.phases+glcount | 35.4 | 3.2 | 1.19 | 42.60 | 51.65 | 95.44 | 220.0 | - | 3.38 | 2.00 | 0.00 | 0.00 |

#### A/B probes (patched copies under experiments/, bitmask `fix`)

| run | fix | load1 | fps | frame p50 ms | tick ms | render on tick frame ms | cpu/frame mean | updatePosition | updateColor | speedup of (tick+render) vs fix0 |
|---|---|---|---|---|---|---|---|---|---|---|
| ab.pts-100K-10hz-60fps.fix0 | 0 | 6.7 | 39.9 | 16.7 | 17.0 | 41.1 | 23.9 | 7.69 | 9.09 | 1.0x |
| ab.pts-100K-10hz-60fps.fix1 | 1 | 6.7 | 39.9 | 16.7 | 8.3 | 42.4 | 22.6 | 4.00 | 4.10 | 1.1x |
| ab.pts-100K-10hz-60fps.fix16 | 16 | 8.9 | 37.6 | 16.7 | 21.5 | 32.2 | 25.8 | 9.76 | 11.47 | 1.1x |
| ab.pts-100K-10hz-60fps.fix2 | 2 | 11.0 | 37.3 | 16.7 | 11.3 | 47.1 | 26.1 | 4.73 | 6.31 | 1.0x |
| ab.pts-100K-10hz-60fps.fix32 | 32 | 8.6 | 18.9 | 66.6 | 29.4 | 50.5 | 52.3 | 13.34 | 15.74 | 0.7x |
| ab.pts-100K-10hz-60fps.fix4 | 4 | 10.2 | 31.1 | 16.7 | 25.2 | 45.2 | 24.2 | 11.41 | 13.45 | 0.8x |
| ab.pts-100K-10hz-60fps.fix63 | 63 | 8.5 | 60.0 | 16.7 | 1.1 | 3.3 | 1.6 | 0.33 | 0.42 | 13.1x |
| ab.pts-100K-10hz-60fps.fix8 | 8 | 9.5 | 26.3 | 16.7 | 22.1 | 51.8 | 36.4 | 9.98 | 11.83 | 0.8x |
| ab.pts-1M-10hz-60fps.fix0 | 0 | 13.7 | 1.2 | 800.0 | 253.0 | 574.0 | 827.0 | 115.40 | 134.52 | 1.0x |
| ab.pts-1M-10hz-60fps.fix63 | 63 | 10.5 | 53.9 | 16.7 | 10.7 | 22.4 | 6.9 | 3.16 | 4.25 | 25.0x |
| ab.pts-250K-10hz-60fps.fix0 | 0 | 15.9 | 4.1 | 233.4 | 73.2 | 169.8 | 243.0 | 32.80 | 39.50 | 1.0x |
| ab.pts-250K-10hz-60fps.fix63 | 63 | 12.4 | 60.0 | 16.7 | 2.3 | 5.1 | 2.0 | 0.71 | 0.91 | 32.7x |

#### Ladder at 100K points, 10 Hz sensor, 60 fps target (median of 2 reps; JS ms per ticked frame = tick + render)

| fix mask | configuration | reps | load1 med | tick ms | render-on-tick ms | JS work per ticked frame ms | share of baseline removed | fps med |
|---|---|---|---|---|---|---|---|---|
| 0 | baseline (no fixes) | 2 | 19.8 | 24.2 | 58.0 | 82.3 | - | 34.3 |
| 1 | cumulative up to F1 | 1 | 7.8 | 8.3 | 42.7 | 51.0 | 38% | 40.0 |
| 3 | cumulative up to F1+F2 | 2 | 13.1 | 1.0 | 56.4 | 57.3 | 30% | 34.5 |
| 7 | cumulative up to F1+F2+F4 | 2 | 40.8 | 1.6 | 67.6 | 69.2 | 16% | 36.1 |
| 15 | cumulative up to F1+F2+F4+F8 | 2 | 11.2 | 0.9 | 39.5 | 40.4 | 51% | 55.2 |
| 31 | cumulative up to F1+F2+F4+F8+F16 | 1 | 11.0 | 1.2 | 23.7 | 24.9 | 70% | 58.7 |
| 63 | all six | 2 | 14.9 | 1.1 | 3.4 | 4.6 | 94% | 60.0 |
| 62 | all six except F1 typed finite check | 1 | 8.9 | 11.8 | 2.6 | 14.4 | 83% | 60.0 |
| 61 | all six except F2 skip eager query-geometry rebuild | 2 | 85.9 | 17.8 | 5.4 | 23.2 | 72% | 60.0 |
| 59 | all six except F4 alloc-free bounds loop | 2 | 93.2 | 1.5 | 27.1 | 28.6 | 65% | 57.4 |
| 55 | all six except F8 memoised snapshot bounds | 2 | 40.3 | 1.5 | 6.8 | 8.4 | 90% | 60.0 |
| 47 | all six except F16 bounds from incoming array | 2 | 49.2 | 1.5 | 39.5 | 41.0 | 50% | 59.9 |

#### Floor / isolated costs (ms per operation, mean of 40 iterations; ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version))

| operation | 100000 | 250000 | 1000000 |
|---|---|---|---|
| interleave40ms | 0.26 | 1.00 | 4.21 |
| rawSubData40ms | 0.19 | 0.33 | 1.22 |
| rawSubData40finMs | 0.07 | 0.33 | 1.21 |
| rawSubData16ms | 0.05 | 0.12 | 0.47 |
| rawSubData16finMs | 0.03 | 0.07 | 0.48 |
| deviceWriteBytesMs | 0.05 | 0.14 | 0.57 |
| deviceWriteUploadMs | 0.50 | 0.45 | 1.85 |
| deviceWriteUploadFinMs | 0.39 | 0.33 | 1.70 |
| deviceInterleaveWriteUploadMs | 0.72 | 1.49 | 5.98 |
| setAttributeLoopMs | 6.49 | 15.50 | 60.63 |
| computeBoundsMs | 16.31 | 40.43 | 173.17 |
| typedMinMaxMs | 0.07 | 0.28 | 1.11 |
| isFiniteArrayFromEveryMs | 4.41 | 10.80 | 48.47 |
| isFiniteTypedLoopMs | 0.17 | 0.29 | 1.82 |
| sliceCopyMs | 0.07 | 0.16 | 0.68 |
