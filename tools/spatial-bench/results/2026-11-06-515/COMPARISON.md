# Typed path vs baseline (lane 515)

Baseline: `2026-11-06` (Aura3D legacy path = `geometry.dynamic` + `updateAttribute` / `points()` with color strings; three.js r185). This run: `2026-11-06-515` (Aura3D typed path only: `points.stream` + `handle.write`, typed `points()`). The two runs are on the same machine at different times with other agent lanes loading it; the load columns are the median 1-minute load average at run start.

| config | metric | Aura3D legacy (baseline) | three.js (baseline) | Aura3D typed (this run) |
|---|---|---|---|---|
| pts-100K-10hz-30fps | frame p50 ms | 100.0 | 33.3 | 33.3 |
| pts-100K-10hz-30fps | frame p95 ms | 116.7 | 33.3 | 33.3 |
| pts-100K-10hz-30fps | effective fps | 10.4 | 30.0 | 30.0 |
| pts-100K-10hz-30fps | dropped frames | 156.0 | 0.0 | 0.0 |
| pts-100K-10hz-30fps | cpu ms/frame (mean) | 95.3 | 0.2 | 2.2 |
| pts-100K-10hz-30fps | tick ms (mean) | 30.3 | 0.1 | 0.8 |
| pts-100K-10hz-30fps | upload bytes/frame | 3.67M | 535K | 535K |
| pts-100K-10hz-30fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-100K-10hz-30fps | gpu p50 ms | 1.5 | 0.5 | 0.9 |
| pts-100K-10hz-30fps | heap max MB | 173.0 | 11.8 | 80.3 |
| pts-100K-10hz-30fps | build ms | 285.4 | 18.5 | 92.1 |
| pts-100K-10hz-30fps | load avg at start | 8.6 | 9.4 | 15.2 |
| pts-100K-10hz-60fps | frame p50 ms | 83.3 | 16.7 | 16.7 |
| pts-100K-10hz-60fps | frame p95 ms | 100.0 | 16.7 | 16.7 |
| pts-100K-10hz-60fps | effective fps | 15.4 | 60.0 | 60.0 |
| pts-100K-10hz-60fps | dropped frames | 201.0 | 0.0 | 0.0 |
| pts-100K-10hz-60fps | cpu ms/frame (mean) | 64.4 | 0.1 | 2.0 |
| pts-100K-10hz-60fps | tick ms (mean) | 26.4 | 0.1 | 0.9 |
| pts-100K-10hz-60fps | upload bytes/frame | 2.60M | 268K | 268K |
| pts-100K-10hz-60fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-100K-10hz-60fps | gpu p50 ms | 1.5 | 0.5 | 0.9 |
| pts-100K-10hz-60fps | heap max MB | 179.9 | 12.0 | 81.5 |
| pts-100K-10hz-60fps | build ms | 230.0 | 20.2 | 81.7 |
| pts-100K-10hz-60fps | load avg at start | 12.3 | 11.1 | 13.7 |
| pts-100K-20hz-30fps | frame p50 ms | 83.3 | 33.3 | 33.3 |
| pts-100K-20hz-30fps | frame p95 ms | 100.0 | 33.3 | 33.3 |
| pts-100K-20hz-30fps | effective fps | 11.4 | 30.0 | 30.0 |
| pts-100K-20hz-30fps | dropped frames | 175.0 | 0.0 | 0.0 |
| pts-100K-20hz-30fps | cpu ms/frame (mean) | 87.5 | 0.2 | 3.1 |
| pts-100K-20hz-30fps | tick ms (mean) | 26.0 | 0.1 | 1.0 |
| pts-100K-20hz-30fps | upload bytes/frame | 4.00M | 1.07M | 1.07M |
| pts-100K-20hz-30fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-100K-20hz-30fps | gpu p50 ms | 1.5 | 0.5 | 0.9 |
| pts-100K-20hz-30fps | heap max MB | 181.9 | 11.8 | 95.6 |
| pts-100K-20hz-30fps | build ms | 209.5 | 18.3 | 113.6 |
| pts-100K-20hz-30fps | load avg at start | 10.7 | 10.2 | 18.6 |
| pts-100K-20hz-60fps | frame p50 ms | 83.3 | 16.7 | 16.7 |
| pts-100K-20hz-60fps | frame p95 ms | 100.0 | 16.7 | 16.7 |
| pts-100K-20hz-60fps | effective fps | 11.6 | 60.0 | 60.0 |
| pts-100K-20hz-60fps | dropped frames | 232.0 | 0.0 | 0.0 |
| pts-100K-20hz-60fps | cpu ms/frame (mean) | 85.6 | 0.1 | 2.1 |
| pts-100K-20hz-60fps | tick ms (mean) | 25.5 | 0.1 | 0.8 |
| pts-100K-20hz-60fps | upload bytes/frame | 4.00M | 534K | 535K |
| pts-100K-20hz-60fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-100K-20hz-60fps | gpu p50 ms | 1.4 | 0.5 | 0.9 |
| pts-100K-20hz-60fps | heap max MB | 186.2 | 12.0 | 94.6 |
| pts-100K-20hz-60fps | build ms | 211.4 | 18.3 | 108.2 |
| pts-100K-20hz-60fps | load avg at start | 9.4 | 8.8 | 20.9 |
| pts-250K-10hz-30fps | frame p50 ms | 200.0 | 33.3 | 33.3 |
| pts-250K-10hz-30fps | frame p95 ms | 233.3 | 33.3 | 33.3 |
| pts-250K-10hz-30fps | effective fps | 4.9 | 30.0 | 30.0 |
| pts-250K-10hz-30fps | dropped frames | 98.0 | 0.0 | 0.0 |
| pts-250K-10hz-30fps | cpu ms/frame (mean) | 202.3 | 0.2 | 3.2 |
| pts-250K-10hz-30fps | tick ms (mean) | 62.2 | 0.1 | 2.4 |
| pts-250K-10hz-30fps | upload bytes/frame | 10.00M | 1.34M | 1.34M |
| pts-250K-10hz-30fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-250K-10hz-30fps | gpu p50 ms | 3.3 | 0.9 | 1.5 |
| pts-250K-10hz-30fps | heap max MB | 215.6 | 25.3 | 104.2 |
| pts-250K-10hz-30fps | build ms | 417.7 | 21.2 | 113.0 |
| pts-250K-10hz-30fps | load avg at start | 8.6 | 8.6 | 21.0 |
| pts-250K-10hz-60fps | frame p50 ms | 266.7 | 16.7 | 16.7 |
| pts-250K-10hz-60fps | frame p95 ms | 316.7 | 16.7 | 16.7 |
| pts-250K-10hz-60fps | effective fps | 4.0 | 60.0 | 60.0 |
| pts-250K-10hz-60fps | dropped frames | 80.0 | 0.0 | 0.0 |
| pts-250K-10hz-60fps | cpu ms/frame (mean) | 249.6 | 0.1 | 2.7 |
| pts-250K-10hz-60fps | tick ms (mean) | 76.1 | 0.1 | 2.5 |
| pts-250K-10hz-60fps | upload bytes/frame | 10.00M | 669K | 670K |
| pts-250K-10hz-60fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-250K-10hz-60fps | gpu p50 ms | 3.4 | 1.0 | 1.4 |
| pts-250K-10hz-60fps | heap max MB | 187.7 | 25.2 | 113.7 |
| pts-250K-10hz-60fps | build ms | 583.1 | 21.0 | 123.3 |
| pts-250K-10hz-60fps | load avg at start | 9.0 | 15.9 | 18.5 |
| pts-250K-20hz-30fps | frame p50 ms | 250.0 | 33.3 | 33.3 |
| pts-250K-20hz-30fps | frame p95 ms | 316.7 | 33.3 | 33.3 |
| pts-250K-20hz-30fps | effective fps | 3.7 | 30.0 | 30.0 |
| pts-250K-20hz-30fps | dropped frames | 73.0 | 0.0 | 0.0 |
| pts-250K-20hz-30fps | cpu ms/frame (mean) | 269.6 | 0.2 | 4.6 |
| pts-250K-20hz-30fps | tick ms (mean) | 82.1 | 0.1 | 2.5 |
| pts-250K-20hz-30fps | upload bytes/frame | 10.00M | 2.67M | 2.67M |
| pts-250K-20hz-30fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-250K-20hz-30fps | gpu p50 ms | 3.4 | 1.0 | 1.4 |
| pts-250K-20hz-30fps | heap max MB | 222.3 | 24.9 | 138.3 |
| pts-250K-20hz-30fps | build ms | 504.4 | 19.2 | 119.3 |
| pts-250K-20hz-30fps | load avg at start | 13.6 | 17.4 | 34.9 |
| pts-250K-20hz-60fps | frame p50 ms | 233.3 | 16.7 | 16.7 |
| pts-250K-20hz-60fps | frame p95 ms | 250.0 | 16.7 | 16.7 |
| pts-250K-20hz-60fps | effective fps | 4.3 | 60.0 | 60.0 |
| pts-250K-20hz-60fps | dropped frames | 86.0 | 0.0 | 0.0 |
| pts-250K-20hz-60fps | cpu ms/frame (mean) | 231.2 | 0.1 | 3.3 |
| pts-250K-20hz-60fps | tick ms (mean) | 70.5 | 0.1 | 2.6 |
| pts-250K-20hz-60fps | upload bytes/frame | 10.00M | 1.34M | 1.34M |
| pts-250K-20hz-60fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-250K-20hz-60fps | gpu p50 ms | 3.4 | 1.0 | 0.9 |
| pts-250K-20hz-60fps | heap max MB | 203.5 | 25.2 | 139.9 |
| pts-250K-20hz-60fps | build ms | 405.5 | 22.3 | 113.1 |
| pts-250K-20hz-60fps | load avg at start | 14.9 | 13.1 | 34.1 |
| pts-1M-10hz-30fps | frame p50 ms | 733.3 | 33.3 | 33.3 |
| pts-1M-10hz-30fps | frame p95 ms | 850.0 | 33.3 | 33.3 |
| pts-1M-10hz-30fps | effective fps | 1.3 | 30.0 | 30.0 |
| pts-1M-10hz-30fps | dropped frames | 26.0 | 0.0 | 0.0 |
| pts-1M-10hz-30fps | cpu ms/frame (mean) | 744.8 | 0.4 | 6.0 |
| pts-1M-10hz-30fps | tick ms (mean) | 227.7 | 0.5 | 10.1 |
| pts-1M-10hz-30fps | upload bytes/frame | 40.00M | 5.35M | 5.35M |
| pts-1M-10hz-30fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-1M-10hz-30fps | gpu p50 ms | 15.0 | 3.2 | 2.4 |
| pts-1M-10hz-30fps | heap max MB | 374.2 | 79.8 | 140.2 |
| pts-1M-10hz-30fps | build ms | 983.6 | 32.0 | 135.6 |
| pts-1M-10hz-30fps | load avg at start | 11.0 | 10.1 | 32.1 |
| pts-1M-10hz-60fps | frame p50 ms | 916.6 | 16.7 | 16.7 |
| pts-1M-10hz-60fps | frame p95 ms | 1033.3 | 16.7 | 16.7 |
| pts-1M-10hz-60fps | effective fps | 1.1 | 60.0 | 60.0 |
| pts-1M-10hz-60fps | dropped frames | 21.0 | 0.0 | 0.0 |
| pts-1M-10hz-60fps | cpu ms/frame (mean) | 925.5 | 0.2 | 3.9 |
| pts-1M-10hz-60fps | tick ms (mean) | 282.3 | 0.4 | 10.2 |
| pts-1M-10hz-60fps | upload bytes/frame | 40.00M | 2.68M | 2.68M |
| pts-1M-10hz-60fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-1M-10hz-60fps | gpu p50 ms | 11.8 | 3.4 | 2.5 |
| pts-1M-10hz-60fps | heap max MB | 416.6 | 79.8 | 148.4 |
| pts-1M-10hz-60fps | build ms | 1486.7 | 30.3 | 126.2 |
| pts-1M-10hz-60fps | load avg at start | 9.6 | 9.3 | 31.7 |
| pts-1M-20hz-30fps | frame p50 ms | 733.3 | 33.3 | 33.3 |
| pts-1M-20hz-30fps | frame p95 ms | 800.0 | 33.3 | 33.3 |
| pts-1M-20hz-30fps | effective fps | 1.5 | 30.0 | 30.0 |
| pts-1M-20hz-30fps | dropped frames | 29.0 | 0.0 | 0.0 |
| pts-1M-20hz-30fps | cpu ms/frame (mean) | 678.8 | 0.6 | 9.0 |
| pts-1M-20hz-30fps | tick ms (mean) | 209.5 | 0.3 | 9.5 |
| pts-1M-20hz-30fps | upload bytes/frame | 40.00M | 10.68M | 10.68M |
| pts-1M-20hz-30fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-1M-20hz-30fps | gpu p50 ms | 15.9 | 3.2 | 2.5 |
| pts-1M-20hz-30fps | heap max MB | 374.2 | 79.8 | 140.5 |
| pts-1M-20hz-30fps | build ms | 1219.5 | 24.6 | 141.0 |
| pts-1M-20hz-30fps | load avg at start | 8.5 | 15.5 | 47.7 |
| pts-1M-20hz-60fps | frame p50 ms | 616.6 | 16.7 | 16.7 |
| pts-1M-20hz-60fps | frame p95 ms | 633.3 | 16.7 | 16.7 |
| pts-1M-20hz-60fps | effective fps | 1.6 | 60.0 | 60.0 |
| pts-1M-20hz-60fps | dropped frames | 32.0 | 0.0 | 0.0 |
| pts-1M-20hz-60fps | cpu ms/frame (mean) | 607.9 | 0.4 | 5.7 |
| pts-1M-20hz-60fps | tick ms (mean) | 185.8 | 0.4 | 10.1 |
| pts-1M-20hz-60fps | upload bytes/frame | 40.00M | 5.33M | 5.34M |
| pts-1M-20hz-60fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| pts-1M-20hz-60fps | gpu p50 ms | 11.9 | 3.2 | 2.4 |
| pts-1M-20hz-60fps | heap max MB | 375.3 | 79.8 | 147.8 |
| pts-1M-20hz-60fps | build ms | 902.5 | 25.5 | 130.4 |
| pts-1M-20hz-60fps | load avg at start | 12.4 | 9.6 | 42.9 |
| ctl-static-pts-100K | frame p50 ms | 16.7 | 16.7 | 16.7 |
| ctl-static-pts-100K | frame p95 ms | 16.7 | 16.7 | 16.7 |
| ctl-static-pts-100K | effective fps | 60.0 | 60.0 | 60.0 |
| ctl-static-pts-100K | dropped frames | 0.0 | 0.0 | 0.0 |
| ctl-static-pts-100K | cpu ms/frame (mean) | 1.4 | 0.1 | 2.0 |
| ctl-static-pts-100K | tick ms (mean) | n/a | n/a | n/a |
| ctl-static-pts-100K | upload bytes/frame | 304.0 | 0.0 | 304.0 |
| ctl-static-pts-100K | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| ctl-static-pts-100K | gpu p50 ms | 1.0 | 0.5 | 0.9 |
| ctl-static-pts-100K | heap max MB | 91.5 | 7.4 | 80.1 |
| ctl-static-pts-100K | build ms | 133.6 | 14.8 | 132.5 |
| ctl-static-pts-100K | load avg at start | 7.1 | 6.9 | 51.1 |
| ctl-static-pts-250K | frame p50 ms | 16.7 | 16.7 | 16.7 |
| ctl-static-pts-250K | frame p95 ms | 16.7 | 16.7 | 16.7 |
| ctl-static-pts-250K | effective fps | 60.0 | 60.0 | 60.0 |
| ctl-static-pts-250K | dropped frames | 0.0 | 0.0 | 0.0 |
| ctl-static-pts-250K | cpu ms/frame (mean) | 1.5 | 0.1 | 2.0 |
| ctl-static-pts-250K | tick ms (mean) | n/a | n/a | n/a |
| ctl-static-pts-250K | upload bytes/frame | 304.0 | 0.0 | 304.0 |
| ctl-static-pts-250K | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| ctl-static-pts-250K | gpu p50 ms | 1.5 | 1.0 | 1.4 |
| ctl-static-pts-250K | heap max MB | 102.7 | 13.7 | 87.4 |
| ctl-static-pts-250K | build ms | 216.7 | 16.1 | 116.6 |
| ctl-static-pts-250K | load avg at start | 6.8 | 7.1 | 42.9 |
| ctl-static-pts-1M | frame p50 ms | 16.7 | 16.7 | 16.7 |
| ctl-static-pts-1M | frame p95 ms | 16.7 | 16.7 | 16.7 |
| ctl-static-pts-1M | effective fps | 60.1 | 60.0 | 60.0 |
| ctl-static-pts-1M | dropped frames | 0.0 | 0.0 | 0.0 |
| ctl-static-pts-1M | cpu ms/frame (mean) | 1.7 | 0.1 | 2.1 |
| ctl-static-pts-1M | tick ms (mean) | n/a | n/a | n/a |
| ctl-static-pts-1M | upload bytes/frame | 304.0 | 0.0 | 304.0 |
| ctl-static-pts-1M | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| ctl-static-pts-1M | gpu p50 ms | 4.3 | 3.2 | 2.5 |
| ctl-static-pts-1M | heap max MB | 196.3 | 45.2 | 116.7 |
| ctl-static-pts-1M | build ms | 842.7 | 42.6 | 152.7 |
| ctl-static-pts-1M | load avg at start | 6.5 | 7.3 | 37.8 |
| mixed-10hz-30fps | frame p50 ms | 166.7 | 33.3 | 33.3 |
| mixed-10hz-30fps | frame p95 ms | 166.7 | 33.3 | 33.3 |
| mixed-10hz-30fps | effective fps | 6.1 | 30.0 | 30.0 |
| mixed-10hz-30fps | dropped frames | 121.0 | 0.0 | 0.0 |
| mixed-10hz-30fps | cpu ms/frame (mean) | 164.2 | 0.2 | 15.2 |
| mixed-10hz-30fps | tick ms (mean) | 46.5 | 0.1 | 6.1 |
| mixed-10hz-30fps | upload bytes/frame | 11.18M | 1.52M | 1.74M |
| mixed-10hz-30fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| mixed-10hz-30fps | gpu p50 ms | 3.0 | 1.0 | 1.6 |
| mixed-10hz-30fps | heap max MB | 312.0 | 28.7 | 151.8 |
| mixed-10hz-30fps | build ms | 315.3 | 24.6 | 214.8 |
| mixed-10hz-30fps | load avg at start | 13.1 | 15.0 | 35.4 |
| mixed-10hz-60fps | frame p50 ms | 166.7 | 16.7 | 16.7 |
| mixed-10hz-60fps | frame p95 ms | 166.7 | 16.7 | 33.3 |
| mixed-10hz-60fps | effective fps | 6.1 | 60.0 | 50.0 |
| mixed-10hz-60fps | dropped frames | 122.0 | 0.0 | 76.0 |
| mixed-10hz-60fps | cpu ms/frame (mean) | 162.5 | 0.1 | 10.1 |
| mixed-10hz-60fps | tick ms (mean) | 46.2 | 0.1 | 6.0 |
| mixed-10hz-60fps | upload bytes/frame | 11.18M | 760K | 1.04M |
| mixed-10hz-60fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| mixed-10hz-60fps | gpu p50 ms | 3.2 | 1.0 | 1.6 |
| mixed-10hz-60fps | heap max MB | 340.2 | 28.8 | 138.2 |
| mixed-10hz-60fps | build ms | 314.6 | 24.6 | 164.7 |
| mixed-10hz-60fps | load avg at start | 11.5 | 9.4 | 30.7 |
| mixed-20hz-30fps | frame p50 ms | 166.7 | 33.3 | 33.3 |
| mixed-20hz-30fps | frame p95 ms | 183.3 | 33.3 | 50.0 |
| mixed-20hz-30fps | effective fps | 6.0 | 30.0 | 28.3 |
| mixed-20hz-30fps | dropped frames | 119.0 | 0.0 | 0.0 |
| mixed-20hz-30fps | cpu ms/frame (mean) | 167.2 | 0.2 | 27.0 |
| mixed-20hz-30fps | tick ms (mean) | 47.5 | 0.1 | 5.8 |
| mixed-20hz-30fps | upload bytes/frame | 11.18M | 3.03M | 3.66M |
| mixed-20hz-30fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| mixed-20hz-30fps | gpu p50 ms | 4.1 | 1.0 | 1.6 |
| mixed-20hz-30fps | heap max MB | 312.2 | 28.7 | 166.2 |
| mixed-20hz-30fps | build ms | 316.6 | 25.6 | 197.9 |
| mixed-20hz-30fps | load avg at start | 8.3 | 7.8 | 24.3 |
| mixed-20hz-60fps | frame p50 ms | 200.0 | 16.7 | 16.7 |
| mixed-20hz-60fps | frame p95 ms | 200.0 | 16.7 | 33.3 |
| mixed-20hz-60fps | effective fps | 5.2 | 60.0 | 42.2 |
| mixed-20hz-60fps | dropped frames | 103.0 | 0.0 | 154.0 |
| mixed-20hz-60fps | cpu ms/frame (mean) | 192.7 | 0.2 | 18.5 |
| mixed-20hz-60fps | tick ms (mean) | 54.7 | 0.1 | 5.6 |
| mixed-20hz-60fps | upload bytes/frame | 11.18M | 1.52M | 2.46M |
| mixed-20hz-60fps | bufferData bytes/frame | 0.0 | 0.0 | 0.0 |
| mixed-20hz-60fps | gpu p50 ms | 3.2 | 1.0 | 1.6 |
| mixed-20hz-60fps | heap max MB | 312.1 | 28.8 | 226.0 |
| mixed-20hz-60fps | build ms | 347.1 | 29.3 | 214.0 |
| mixed-20hz-60fps | load avg at start | 9.7 | 8.5 | 21.9 |
