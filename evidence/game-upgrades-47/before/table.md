# WP-38 before captures: steady-state luma of every luma target on the base build

All numbers are software WebGL2 (SwiftShader, headless Chromium on the serverless ACR runner), 1280x720, base commit 232570e41 (main 4.6.1 + 4.6.2 IC-12 + swarm docs); never real-GPU evidence. Shots are taken 25 s and 60 s after the page's ready signal (`GL_SETTLE`, `tests/browser/game-luma-capture.spec.ts`); the 60 s shot starts at the time in the `60 s at` column because each software-GL screenshot takes tens of seconds to minutes. Luma is Rec. 709 (0.2126 R + 0.7152 G + 0.0722 B) over the canvas only; dark = share of pixels at luma <= 8, clip = share at >= 250; grid = mean luma of the 3x3 cells, rows top to bottom (left/centre/right). How the runs were made: `README.md` in this folder.

Captured: 67 of 68 targets (both shots, no black shot). Not captured: 1.

## Per target

| Target | Run (ACR id) | Ready s | 25 s mean | p5 | p50 | p95 | dark | clip | grid 25 s | path | draws | 60 s at | 60 s mean | p5 | p50 | p95 | dark | clip | grid 60 s | path | draws |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: |
| top-tennis--default | gu47-before-top-tennis (ch5t8) | 16 | 57.35 | 16 | 59 | 133 | 2.5% | 0.0% | 47.7/74.5/42.4 · 48.9/85/46.3 · 53.8/65.7/51.7 | hdr-msaa | 117 | 150 s | 57.34 | 16 | 59 | 133 | 2.5% | 0.0% | 47.7/74.5/42.4 · 48.9/85/46.3 · 53.8/65.7/51.7 | hdr-msaa | 117 |
| roadster-rush--default | gu47-before-roadster-rush (ch5ut) | 75 | 81.95 | 25 | 74 | 173 | 1.0% | 0.0% | 109.7/144.7/113.4 · 66.2/108.1/44.8 · 32.7/81.3/36.6 | hdr-msaa | 150 | 244 s | 82.22 | 21 | 77 | 159 | 1.3% | 0.0% | 105.1/132.3/103.1 · 96.8/84/48 · 52.9/81.1/36.4 | hdr-msaa | 149 |
| heatsink--default | gu47-before-heatsink (ch5uv) | 23 | 36.96 | 1 | 22 | 117 | 26.2% | 0.0% | 29.3/20.2/42.5 · 44.3/69.1/53 · 17.4/34.5/22.4 | hdr-msaa | 915 | 137 s | 36.97 | 1 | 22 | 117 | 26.1% | 0.0% | 29.3/20.2/42.5 · 44.3/69.1/53 · 17.4/34.5/22.4 | hdr-msaa | 915 |
| teleoperator--noon | gu47-before-teleoperator-1 (ch5ta) | 87 | 100.05 | 33 | 87 | 193 | 0.1% | 0.0% | 133.5/170.8/67.7 · 101.7/135.3/85.1 · 53.6/97.9/54.6 | hdr-msaa | 411 | 357 s | 103.62 | 39 | 94 | 192 | 0.1% | 0.0% | 127.8/167.8/102.4 · 89.9/135.1/92 · 58.1/98.2/61.2 | hdr-msaa | 403 |
| teleoperator--golden | gu47-before-teleoperator-1 (ch5ta) | 158 | 87.36 | 29 | 93 | 162 | 0.0% | 0.0% | 107/123.2/91.8 · 92.8/125.6/88.7 · 39.1/74.5/43.5 | hdr-msaa | 409 | 484 s | 86.05 | 26 | 95 | 161 | 0.0% | 0.0% | 102.5/123.3/101.3 · 84.3/121.7/84.8 · 38.7/71.7/46.1 | hdr-msaa | 392 |
| teleoperator--fog | gu47-before-teleoperator-2 (ch5u3) | 154 | 110.40 | 69 | 109 | 157 | 0.0% | 0.0% | 104.3/127.7/105.7 · 111.3/150.3/111.2 · 78.1/118.6/86.2 | hdr-msaa | 411 | 395 s | 111.21 | 70 | 110 | 158 | 0.0% | 0.0% | 104.2/127.9/105.8 · 113.5/150.5/111.4 · 81.8/118.7/87 | hdr-msaa | 404 |
| teleoperator--night | gu47-before-teleoperator-2 (ch5u3) | 152 | 27.98 | 0 | 14 | 165 | 47.2% | 0.0% | 0.1/0.1/8.9 · 11.6/62.3/17.6 · 39.9/77.7/33.6 | hdr-msaa | 401 | 348 s | 27.97 | 0 | 10 | 167 | 49.0% | 0.0% | 0.7/0.3/2 · 8.5/62.4/16.4 · 39.9/77.9/43.6 | hdr-msaa | 396 |
| iron-crown--crown-arena | gu47-before-iron-crown-1 (ch5u4) | 44 | 55.20 | 3 | 45 | 141 | 11.6% | 0.0% | 28.6/23.3/31 · 60.6/73.2/43.5 · 92/85.7/58.8 | hdr-msaa | 221 | 483 s | 56.41 | 3 | 47 | 144 | 11.4% | 0.0% | 28.6/23.2/31 · 60.5/73.3/43.6 · 95.4/89.6/62.3 | hdr-msaa | 221 |
| iron-crown--neo-tokyo-rooftop | gu47-before-iron-crown-1 (ch5u4) | 62 | 30.38 | 0 | 26 | 90 | 31.4% | 0.0% | 29.3/1.4/15.3 · 33.8/18.3/28.6 · 36.3/64.8/45.7 | hdr-msaa | 1924 | 513 s | 30.38 | 0 | 26 | 90 | 31.4% | 0.0% | 29.3/1.4/15.2 · 33.8/18.3/28.6 · 36.3/64.8/45.7 | hdr-msaa | 1924 |
| iron-crown--bangkok-dock | gu47-before-iron-crown-2 (ch5tc) | 61 | 102.07 | 47 | 97 | 169 | 0.0% | 0.0% | 121.7/152.9/113 · 98.4/132.5/83 · 68.6/83.6/64.8 | hdr-msaa | 3503 | 433 s | 102.09 | 47 | 97 | 169 | 0.0% | 0.0% | 121.7/152.9/113.1 · 98.4/132.5/83.1 · 68.6/83.6/64.8 | hdr-msaa | 3503 |
| iron-crown--colosseum-ruins | gu47-before-iron-crown-2 (ch5tc) | 60 | 114.99 | 57 | 113 | 179 | 0.0% | 0.0% | 125.5/155.6/115.1 · 115.7/149.6/95.7 · 87.1/106/84.5 | hdr-msaa | 207 | 571 s | 114.97 | 57 | 113 | 179 | 0.0% | 0.0% | 125.5/155.6/115.1 · 115.5/149.6/95.7 · 87.1/106/84.4 | hdr-msaa | 207 |
| iron-crown--desert-airbase | gu47-before-iron-crown-3 (ch5tb) | 61 | 104.41 | 55 | 107 | 163 | 0.0% | 0.0% | 126.3/149.6/122.7 · 107.6/123.2/93.5 · 68.3/81.7/66.8 | hdr-msaa | 182 | 285 s | 104.44 | 55 | 107 | 163 | 0.0% | 0.0% | 126.3/149.6/122.7 · 107.6/123.2/93.6 · 68.3/81.7/66.9 | hdr-msaa | 182 |
| iron-crown--himalayan-monastery | gu47-before-iron-crown-3 (ch5tb) | 59 | 115.30 | 66 | 116 | 171 | 0.0% | 0.0% | 130.3/148/124.3 · 119.9/148.2/107.5 · 81/98.2/80.2 | hdr-msaa | 3731 | 637 s | 115.31 | 66 | 116 | 171 | 0.0% | 0.0% | 130.3/148/124.2 · 120.2/148.2/107.4 · 81/98.2/80.2 | hdr-msaa | 3731 |
| pips-big-leap--academy | gu47-before-pips-big-leap-1 (ch5uh) | 24 | 165.23 | 33 | 170 | 215 | 0.0% | 0.0% | 192.8/182.6/158.7 · 177.1/163.5/132.7 · 163.8/166.9/148.9 | hdr-msaa | 782 | 185 s | 165.18 | 33 | 170 | 215 | 0.0% | 0.0% | 192.8/182.7/158.7 · 177.1/163.2/132.8 · 163.8/166.4/148.9 | hdr-msaa | 782 |
| pips-big-leap--w1 | gu47-before-pips-big-leap-1 (ch5uh) | 51 | 165.22 | 33 | 170 | 215 | 0.0% | 0.0% | 192.8/182.6/158.7 · 177.1/163.3/132.9 · 163.8/166.8/148.9 | hdr-msaa | 782 | 166 s | 165.32 | 33 | 170 | 215 | 0.0% | 0.0% | 192.8/182.6/158.7 · 177.1/164/132.7 · 163.8/167.1/148.9 | hdr-msaa | 782 |
| pips-big-leap--w2 | gu47-before-pips-big-leap-2 (ch5uj) | 32 | 177.43 | 122 | 201 | 243 | 0.0% | 0.0% | 235.3/215.7/217.7 · 204.4/151.9/187 · 128/128/128.8 | hdr-msaa | 461 | 139 s | 177.31 | 122 | 201 | 243 | 0.0% | 0.0% | 235.3/215.7/217.7 · 204.5/151.7/186.1 · 128/128/128.8 | hdr-msaa | 461 |
| pips-big-leap--w3 | gu47-before-pips-big-leap-2 (ch5uj) | 34 | 207.59 | 152 | 212 | 235 | 0.0% | 0.0% | 208.9/192.7/197.6 · 193.1/199.1/182.5 · 230.5/233.4/230.4 | hdr-msaa | 458 | 118 s | 207.63 | 152 | 212 | 235 | 0.0% | 0.0% | 208.9/192.6/197.6 · 193.1/199.4/182.6 · 230.5/233.5/230.4 | hdr-msaa | 458 |
| pips-big-leap--w4 | gu47-before-pips-big-leap-3 (ch5ug) | 54 | 146.50 | 46 | 118 | 237 | 0.3% | 0.0% | 157.9/201.7/173.2 · 141.4/140.5/150.2 · 117.6/116.3/119.7 | hdr-msaa | 620 | 307 s | 146.51 | 46 | 118 | 237 | 0.3% | 0.0% | 157.9/201.8/173.2 · 141.4/140.7/149.7 · 117.6/116.6/119.7 | hdr-msaa | 620 |
| pips-big-leap--w5 | gu47-before-pips-big-leap-3 (ch5ug) | 55 | 181.52 | 48 | 213 | 233 | 0.1% | 0.0% | 155/192.2/169.4 · 140.8/205.5/149.7 · 203.8/212/205.1 | hdr-msaa | 652 | 272 s | 181.62 | 48 | 213 | 233 | 0.1% | 0.0% | 155/192.1/169.4 · 140.8/206.3/149.7 · 203.9/212.1/205.2 | hdr-msaa | 652 |
| pips-big-leap--w6 | gu47-before-pips-big-leap-4 (ch5v0) | 44 | 109.04 | 23 | 131 | 188 | 0.0% | 0.0% | 41.7/36.8/24.3 · 136.1/104.4/95.3 · 176.1/185.9/180.7 | hdr-msaa | 484 | 153 s | 109.21 | 23 | 134 | 188 | 0.0% | 0.0% | 41.7/36.9/24.3 · 136.1/105.9/95.3 · 176/185.9/180.7 | hdr-msaa | 484 |
| aura-hoops-3d--rucker | gu47-before-aura-hoops-3d-1 (ch5up) | 29 | 75.75 | 27 | 45 | 177 | 0.0% | 0.0% | 118.7/134/107.5 · 39.6/83.7/68.6 · 36.7/55.6/37.2 | hdr-msaa | 344 | 264 s | 87.07 | 24 | 60 | 180 | 0.0% | 0.0% | 139.6/165.1/140.4 · 53.4/78.1/78.7 · 36.4/51.6/40.4 | hdr-msaa | 344 |
| aura-hoops-3d--venice | gu47-before-aura-hoops-3d-1 (ch5up) | 28 | 116.49 | 64 | 115 | 181 | 0.0% | 0.0% | 127.2/162/129.2 · 95.2/133/120.6 · 93.1/109.2/78.9 | hdr-msaa | 347 | 219 s | 122.29 | 66 | 124 | 180 | 0.0% | 0.0% | 133.6/170.3/139 · 102.7/131.2/129.7 · 107.7/104.3/82.2 | hdr-msaa | 347 |
| aura-hoops-3d--athens | gu47-before-aura-hoops-3d-2 (ch5ur) | 28 | 104.39 | 54 | 89 | 170 | 0.0% | 0.0% | 117.6/141.1/117.7 · 74.4/126.2/103.9 · 77/98.2/83.5 | hdr-msaa | 328 | 198 s | 110.31 | 53 | 96 | 178 | 0.0% | 0.0% | 133.9/162.5/138.8 · 82/116.4/107.4 · 72.7/94.1/85.1 | hdr-msaa | 328 |
| aura-hoops-3d--manila | gu47-before-aura-hoops-3d-2 (ch5ur) | 33 | 86.02 | 39 | 65 | 172 | 0.0% | 0.0% | 112.2/130.9/116.7 · 58.5/94.5/72.1 · 60.7/69.8/58.7 | hdr-msaa | 331 | 246 s | 93.10 | 37 | 71 | 173 | 0.0% | 0.0% | 125.2/153.1/137.2 · 67.1/89.2/78.2 · 57.2/69.8/60.9 | hdr-msaa | 331 |
| aura-hoops-3d--shanghai | gu47-before-aura-hoops-3d-3 (ch5uq) | 28 | 56.12 | 1 | 46 | 151 | 15.3% | 0.0% | 34.4/53.3/46.3 · 57.7/88.9/79.1 · 46.3/60.5/38.6 | hdr-msaa | 341 | 201 s | 54.42 | 1 | 49 | 147 | 21.9% | 0.0% | 17.4/47.4/30.4 · 66.3/90/86.7 · 50.4/56.4/44.7 | hdr-msaa | 341 |
| aura-hoops-3d--orbit | gu47-before-aura-hoops-3d-3 (ch5uq) | 29 | 113.80 | 65 | 114 | 163 | 0.3% | 0.0% | 94.7/116.5/110.8 · 102.1/139.7/128 · 99.1/106.5/126.9 | hdr-msaa | 327 | 243 s | 113.27 | 63 | 115 | 158 | 1.1% | 0.0% | 84.1/115/105.7 · 97.9/130.9/131.3 · 93/131.4/130.3 | hdr-msaa | 327 |
| aura-diamond-3d--sandlot | gu47-before-aura-diamond-3d-1 (ch5u9) | 35 | 83.55 | 49 | 81 | 152 | 0.2% | 0.0% | 89.1/105.8/92.7 · 73.4/98.8/75 · 59.6/95/62.6 | hdr-msaa | 496 | 244 s | 85.97 | 50 | 82 | 156 | 0.1% | 0.0% | 94.1/111.7/96.9 · 74.9/99.1/76.3 · 60.1/96.9/63.7 | hdr-msaa | 496 |
| aura-diamond-3d--skyline | gu47-before-aura-diamond-3d-1 (ch5u9) | 39 | 73.59 | 1 | 79 | 108 | 7.2% | 0.0% | 55.5/73.7/49.5 · 81.7/99.2/77.7 · 64.7/96.4/64.1 | hdr-msaa | 338 | 344 s | 73.73 | 1 | 79 | 109 | 8.1% | 0.0% | 52.2/73.4/47.3 · 82.9/99.6/78.6 · 65.3/98.9/65.3 | hdr-msaa | 338 |
| aura-diamond-3d--canyon | gu47-before-aura-diamond-3d-2 (ch5u8) | 36 | 108.26 | 48 | 113 | 153 | 0.4% | 0.0% | 102.5/108.2/89.2 · 104.3/143.4/110.2 · 86.9/135.9/93.7 | hdr-msaa | 330 | 213 s | 109.57 | 47 | 116 | 153 | 0.4% | 0.0% | 105.1/109.3/90.6 · 105.8/143.1/111.6 · 88/136.7/95.9 | hdr-msaa | 330 |
| aura-diamond-3d--ivy | gu47-before-aura-diamond-3d-2 (ch5u8) | 57 | 118.98 | 71 | 124 | 164 | 0.2% | 0.0% | 116.3/126.4/107.4 · 114.7/157.7/120.7 · 89.4/141.8/96.3 | hdr-msaa | 362 | 332 s | 121.53 | 71 | 127 | 165 | 0.2% | 0.0% | 119.4/129.2/109.5 · 117/157.4/122.6 · 92.7/144.5/101.4 | hdr-msaa | 362 |
| aura-diamond-3d--dome | gu47-before-aura-diamond-3d-3 (ch5u7) | 60 | 64.63 | 16 | 53 | 158 | 0.2% | 0.0% | 91.5/96.6/95.8 · 51.6/68.6/60.4 · 27.4/52.3/37.5 | hdr-msaa | 339 | 366 s | 67.25 | 15 | 55 | 162 | 0.2% | 0.0% | 97.1/104.1/101.6 · 50.8/69.9/61.2 · 27.4/55.9/37.3 | hdr-msaa | 339 |
| aura-diamond-3d--lunar | gu47-before-aura-diamond-3d-3 (ch5u7) | 37 | 84.61 | 3 | 95 | 130 | 13.7% | 0.0% | 59.9/64.3/57.6 · 94.9/122/92.9 · 75.4/117.4/77 | hdr-msaa | 347 | 285 s | 84.15 | 2 | 95 | 131 | 14.9% | 0.0% | 56.8/61.3/54.5 · 95.9/122.1/93.7 · 76.1/118.6/78.5 | hdr-msaa | 347 |
| aura-fc-3d--favela | gu47-before-aura-fc-3d-1 (ch5um) | 25 | 135.87 | 92 | 123 | 234 | 0.0% | 0.0% | 159.4/153.7/167.5 · 124.9/124.4/123.9 · 122.6/124.6/121.8 | hdr-msaa | 310 | 132 s | 135.86 | 92 | 123 | 234 | 0.0% | 0.0% | 159.4/153.7/167.5 · 124.9/124.4/123.9 · 122.6/124.6/121.8 | hdr-msaa | 310 |
| aura-fc-3d--munich | gu47-before-aura-fc-3d-1 (ch5um) | 25 | 104.72 | 45 | 94 | 229 | 0.0% | 0.0% | 118.5/115.4/128.3 · 94.3/98.4/99.1 · 93.1/99.3/96.1 | hdr-msaa | 351 | 202 s | 104.73 | 45 | 94 | 229 | 0.0% | 0.0% | 118.5/115.4/128.2 · 94.4/98.4/99.1 · 93.1/99.3/96.1 | hdr-msaa | 351 |
| aura-fc-3d--lagos | gu47-before-aura-fc-3d-2 (ch5un) | 29 | 171.99 | 110 | 175 | 210 | 0.0% | 0.0% | 170.9/160.1/163.9 · 173/173.7/171.2 · 177.2/180.1/177.7 | hdr-msaa | 444 | 183 s | 172.00 | 110 | 176 | 210 | 0.0% | 0.0% | 170.9/160.2/163.9 · 173/173.7/171.3 · 177.2/180.1/177.7 | hdr-msaa | 444 |
| aura-fc-3d--kyoto | gu47-before-aura-fc-3d-2 (ch5un) | 28 | 69.42 | 40 | 44 | 231 | 0.0% | 0.0% | 116.2/107.3/125.2 · 49.9/48/49.2 · 43.1/44.4/41.4 | hdr-msaa | 344 | 222 s | 69.42 | 40 | 44 | 231 | 0.0% | 0.0% | 116.4/107.1/125.2 · 49.9/48/49.2 · 43.1/44.4/41.4 | hdr-msaa | 344 |
| aura-fc-3d--uyuni | gu47-before-aura-fc-3d-3 (ch5uk) | 28 | 227.68 | 170 | 239 | 243 | 0.0% | 0.0% | 205.9/203.1/201.3 · 238.3/238.1/236.8 · 241.9/241.7/241.9 | hdr-msaa | 312 | 200 s | 227.68 | 170 | 239 | 243 | 0.0% | 0.0% | 205.9/203.1/201.3 · 238.3/238.2/236.8 · 241.9/241.7/241.9 | hdr-msaa | 312 |
| aura-fc-3d--glacier | gu47-before-aura-fc-3d-3 (ch5uk) | 36 | 95.40 | 47 | 68 | 228 | 0.0% | 0.0% | 140.6/134.5/151.4 · 76.7/73.3/77.3 · 68.4/69.8/66.7 | hdr-msaa | 384 | 321 s | 95.42 | 47 | 68 | 228 | 0.0% | 0.0% | 140.6/134.6/151.5 · 76.7/73.3/77.3 · 68.4/69.8/66.7 | hdr-msaa | 384 |
| aura-links-3d--stAuroras | gu47-before-aura-links-3d-1 (ch5ub) | 26 | 131.98 | 62 | 133 | 187 | 0.1% | 0.0% | 146.1/176.7/132.2 · 116.7/140.2/114.9 · 118.5/134.4/108 | hdr-msaa | 138 | 238 s | 132.27 | 62 | 134 | 187 | 0.1% | 0.0% | 146.3/176.1/132.3 · 115.5/141.5/114.9 · 119.9/134.9/109 | hdr-msaa | 138 |
| aura-links-3d--mapleHollow | gu47-before-aura-links-3d-3 (ch5uc) | 22 | 140.01 | 49 | 147 | 185 | 0.1% | 0.0% | 135.6/172.9/121.5 · 128/163.1/134 · 127.8/150.3/126.7 | hdr-msaa | 139 | 127 s | 140.11 | 49 | 147 | 185 | 0.1% | 0.0% | 135.7/172.7/122 · 126.7/163.3/133.9 · 128.7/150.8/127 | hdr-msaa | 139 |
| aura-links-3d--cinderRim | gu47-before-aura-links-3d-2 (ch5ua) | 18 | 117.27 | 57 | 105 | 195 | 0.0% | 0.0% | 160.6/189.8/143.6 · 107.4/115.7/80.8 · 95.3/97.9/64.2 | hdr-msaa | 106 | 144 s | 117.57 | 57 | 105 | 195 | 0.0% | 0.0% | 160.6/189.9/144 · 107.9/116.4/81.2 · 95.5/98.3/64.2 | hdr-msaa | 106 |
| aura-links-3d--cloudTerrace | gu47-before-aura-links-3d-2 (ch5ua) | 48 | 151.70 | 93 | 158 | 188 | 0.0% | 0.0% | 158.5/176.5/134.8 · 133/177.1/132.9 · 146/168.6/137.7 | hdr-msaa | 218 | 449 s | 151.80 | 91 | 158 | 188 | 0.0% | 0.0% | 158.7/176.2/134.2 · 132.4/177.9/133.1 · 146.8/168.6/138.1 | hdr-msaa | 218 |
| aura-links-3d--neonBay | gu47-before-aura-links-3d-1 (ch5ub) | 41 | 32.44 | 0 | 40 | 59 | 32.6% | 0.0% | 6.3/1/11.9 · 40.6/52.4/37.6 · 49.9/53.4/38.8 | hdr-msaa | 122 | 244 s | 32.31 | 0 | 40 | 59 | 32.9% | 0.0% | 6.1/0.9/11.7 · 40/52/37.5 · 50.3/53.4/38.8 | hdr-msaa | 122 |
| aura-links-3d--mareCourse | gu47-before-aura-links-3d-3 (ch5uc) | 22 | 58.85 | 0 | 74 | 122 | 38.3% | 0.0% | 0.1/0.1/0.1 · 75.5/98.1/71.8 · 94.9/111/78.1 | hdr-msaa | 110 | 114 s | 58.72 | 0 | 74 | 122 | 38.6% | 0.0% | 0.1/0.1/0.1 · 74.7/97.8/71.3 · 95.2/111/78.1 | hdr-msaa | 110 |
| bunker-zero--default | gu47-before-bunker-zero (ch5uw) | 12 | 74.59 | 31 | 73 | 105 | 2.2% | 0.0% | 67.9/91.6/68.5 · 68.2/68.7/54.4 · 67.1/97.5/87.4 | hdr-msaa | 163 | 208 s | 74.59 | 31 | 73 | 105 | 2.2% | 0.0% | 67.9/91.6/68.5 · 68.2/68.7/54.4 · 67.1/97.5/87.4 | hdr-msaa | 163 |
| slingshot-siege--default | gu47-before-slingshot-siege (ch5us) | 39 | 109.76 | 13 | 121 | 183 | 2.8% | 0.0% | 129.2/145.5/93.1 · 96.5/127/57.8 · 105.5/125.7/107.5 | hdr-msaa | 412 | 539 s | 106.46 | 10 | 115 | 183 | 4.1% | 0.0% | 121.7/146.1/80.2 · 94.9/129.1/52.9 · 114.4/121.9/96.7 | hdr-msaa | 412 |
| dot-dash-3d--default | gu47-before-dot-dash-3d (ch5v6) | 30 | 25.49 | 0 | 19 | 100 | 15.2% | 0.0% | 15.1/24.7/12.5 · 28/45.4/21 · 25.2/36/21.6 | hdr-msaa | 49 | 99 s | 25.49 | 0 | 19 | 100 | 15.1% | 0.0% | 15.1/24.5/12.6 · 27.8/45.5/20.9 · 25.2/35.9/21.6 | hdr-msaa | 49 |
| cross-hop--theme0 | gu47-before-cross-hop-1 (ch5tp) | 49 | 110.88 | 43 | 117 | 153 | 0.2% | 0.0% | 116.8/138/116.4 · 94.6/125.1/93 · 98.9/116.3/98.8 | hdr-msaa | 169 | 358 s | 111.23 | 46 | 117 | 152 | 0.1% | 0.0% | 117.5/138.6/116.6 · 93.7/125/96.6 · 98.5/116.1/98.4 | hdr-msaa | 175 |
| cross-hop--theme1 | gu47-before-cross-hop-1 (ch5tp) | 87 | 101.51 | 33 | 109 | 143 | 0.4% | 0.0% | 101.8/126.5/93.4 · 88/111/89 · 95.7/112.5/95.6 | hdr-msaa | 166 | 709 s | 102.99 | 36 | 109 | 150 | 0.2% | 0.0% | 101.9/126.4/93.7 · 91.4/123.1/92.2 · 93.9/110.5/93.8 | hdr-msaa | 168 |
| cross-hop--theme2 | gu47-before-cross-hop-2 (ch5u5) | 72 | 106.25 | 54 | 111 | 147 | 0.2% | 0.0% | 109.2/134.1/111.9 · 92.9/118.7/91.6 · 93.8/110.3/93.7 | hdr-msaa | 163 | 339 s | 104.79 | 45 | 111 | 147 | 0.5% | 0.0% | 113.9/134.3/107.8 · 92.7/118.3/79.3 · 93.4/110/93.3 | hdr-msaa | 165 |
| cross-hop--theme3 | gu47-before-cross-hop-2 (ch5u5) | 80 | 61.67 | 13 | 59 | 122 | 1.7% | 0.0% | 65.9/82.3/61.7 · 55.1/71.2/53.1 · 51.3/63.2/51.2 | hdr-msaa | 170 | 542 s | 62.58 | 13 | 62 | 121 | 1.8% | 0.0% | 68.5/82.4/63.6 · 55.7/71.6/52.1 · 52.6/64/52.5 | hdr-msaa | 170 |
| cross-hop--theme4 | gu47-before-cross-hop-3 (ch5u6) | 69 | 59.17 | 23 | 56 | 119 | 2.2% | 0.0% | 67.1/69.4/59.6 · 51/67.1/51 · 52/63.5/51.9 | hdr-msaa | 140 | 343 s | 59.31 | 24 | 56 | 118 | 2.3% | 0.0% | 66.9/71.6/59.7 · 49.3/66.2/50.6 · 52.6/64.3/52.5 | hdr-msaa | 145 |
| cross-hop--theme5 | gu47-before-cross-hop-3 (ch5u6) | 81 | 125.99 | 62 | 132 | 177 | 0.1% | 0.0% | 119.1/143.7/120 · 119.4/153.4/117.6 · 114.1/132.7/114 | hdr-msaa | 168 | 350 s | 125.77 | 61 | 132 | 175 | 0.1% | 0.0% | 122.1/142.5/119.7 · 119.6/149.8/117.3 · 114.2/132.6/114.1 | hdr-msaa | 175 |
| strange-orbit-port--default | gu47-before-strange-orbit-port (ch5v1) | 58 | 86.20 | 37 | 88 | 132 | 0.0% | 0.0% | 70.3/92.3/45.2 · 89.1/112.7/69.9 · 90.1/114.3/91.7 | hdr-msaa | 122 | 155 s | 86.26 | 37 | 88 | 132 | 0.0% | 0.0% | 70.3/92.2/45.3 · 89.3/113/70 · 90.1/114.3/91.7 | hdr-msaa | 122 |
| splat-rush-port--default | gu47-before-splat-rush-port (ch5v7) | 26 | 185.68 | 155 | 186 | 249 | 0.0% | 4.2% | 166.6/159.6/171.9 · 189.6/193.3/200.4 · 196.2/189.4/204.2 | hdr-msaa | 20 | 66 s | 183.99 | 155 | 186 | 248 | 0.0% | 3.7% | 168/162.6/173.1 · 186.9/200.2/196.3 · 193.7/185.4/189.7 | hdr-msaa | 20 |
| serpentine-sky-run-port--default | gu47-before-serpentine-sky-run-port (ch5v5) | 21 | 191.70 | 137 | 203 | 232 | 0.0% | 0.1% | 168.8/158.9/167 · 208.3/205.3/208.6 · 192.1/211/205.2 | hdr-msaa | 39 | 95 s | 191.66 | 137 | 203 | 232 | 0.0% | 0.0% | 168.8/158.9/166.8 · 208.1/205.2/208.7 · 192.2/211/205.2 | hdr-msaa | 39 |
| drift-and-deliver-port--default | gu47-before-drift-and-deliver-port (ch5ue) | 139 | 110.90 | 59 | 107 | 169 | 0.0% | 0.0% | 103.6/144.1/114.5 · 103.7/137.3/113.3 · 89.1/107.1/85.3 | hdr-msaa | 84 | 319 s | 110.74 | 58 | 107 | 170 | 0.0% | 0.0% | 104/144.3/114.6 · 103.2/137.2/112.5 · 88.6/107.2/85.1 | hdr-msaa | 84 |
| drift-and-deliver-port--noenv | gu47-before-drift-and-deliver-port (ch5ue) | 125 | 131.48 | 66 | 132 | 192 | 0.0% | 0.0% | 119.4/158.1/118.2 · 126.4/174.5/127.1 · 115.9/136/107.5 | hdr-msaa | 84 | 310 s | 131.35 | 66 | 132 | 192 | 0.0% | 0.0% | 119.6/158.2/118.3 · 126.2/174.3/126.6 · 115.6/135.8/107.4 | hdr-msaa | 84 |
| heatsink-port--default | gu47-before-heatsink-port (ch5uu) | 47 | 47.48 | 3 | 29 | 153 | 9.4% | 0.0% | 34.7/96.8/56.3 · 47.6/75.5/45 · 22.8/28.1/20.3 | hdr-msaa | 72 | 324 s | 49.21 | 10 | 30 | 158 | 4.3% | 0.0% | 38.1/104/59.4 · 48.1/76.4/45.4 · 22.9/28.1/20.4 | hdr-msaa | 72 |
| ninja-runner-port--default | gu47-before-ninja-runner-port (ch5uf) | 90 | 121.49 | 52 | 124 | 174 | 0.0% | 0.0% | 109.3/143.4/115.3 · 89.9/159/107.4 · 113.9/139.4/115.8 | hdr-msaa | 93 | 1149 s | 121.59 | 52 | 124 | 174 | 0.0% | 0.0% | 109.3/143.4/115.3 · 89.9/158.9/107.4 · 113.9/140.3/115.8 | hdr-msaa | 93 |
| last-train-port--default | gu47-before-last-train-port (ch5uy) | 52 | 84.15 | 38 | 78 | 143 | 0.0% | 0.0% | 111.8/118.4/80.8 · 71.2/92.3/83.3 · 58.5/74.6/66.5 | hdr-msaa | 170 | 322 s | 86.26 | 38 | 81 | 147 | 0.0% | 0.0% | 107.2/130.4/85.7 · 71.9/93.2/79.1 · 57.9/74.3/76.6 | hdr-msaa | 152 |
| roadster-hours-port--sunbreak | gu47-before-roadster-hours-port-1 (ch5ud) | 86 | 77.85 | 12 | 81 | 157 | 1.2% | 0.0% | 120.9/138/100.8 · 102.4/113.5/49.7 · 23.5/32.1/19.7 | hdr-msaa | 105 | 221 s | 77.24 | 12 | 81 | 161 | 1.2% | 0.0% | 116.8/138.9/99.1 · 102.3/113/49.8 · 23.4/32/19.7 | hdr-msaa | 105 |
| roadster-hours-port--redline | gu47-before-roadster-hours-port-1 (ch5ud) | 60 | 31.65 | 3 | 15 | 123 | 24.3% | 0.0% | 11.4/87.6/6.3 · 27/67.6/21.5 · 22.3/25.7/15.3 | hdr-msaa | 94 | 146 s | 30.70 | 3 | 15 | 116 | 24.3% | 0.0% | 11.2/80.5/5.5 · 27.2/66.9/21.4 · 22.5/25.7/15.2 | hdr-msaa | 94 |
| roadster-hours-port--halo | gu47-before-roadster-hours-port-2 (ch5ux) | 49 | 12.68 | 0 | 7 | 50 | 55.5% | 0.0% | 5.7/13.8/10.8 · 16.6/36.4/17 · 1.8/10.2/1.8 | hdr-msaa | 86 | 119 s | 12.69 | 0 | 7 | 50 | 55.5% | 0.0% | 5.7/13.8/10.8 · 16.6/36.4/17 · 1.8/10.2/1.8 | hdr-msaa | 86 |
| where-the-wind-wanders-port--default | gu47-before-where-the-wind-wanders-port (ch5v2) | 33 | 164.79 | 82 | 175 | 211 | 0.1% | 0.0% | 151/181.3/161 · 159.9/181.2/152 · 156.7/177.1/162.9 | hdr-msaa | 17 | 226 s | 164.94 | 84 | 175 | 211 | 0.1% | 0.0% | 150.7/181.5/163.4 · 159.9/181.1/152.2 · 156.3/176.6/162.7 | hdr-msaa | 17 |
| silt-and-signal-port--default | gu47-before-silt-and-signal-port (ch5v3) | 31 | 171.72 | 47 | 204 | 206 | 0.2% | 0.0% | 154.2/108.9/135.7 · 169.9/195/166.9 · 204.9/205/205 | hdr-msaa | 139 | 289 s | 115.25 | 46 | 104 | 206 | 0.3% | 0.0% | 158.2/126.2/101.4 · 136.3/110.3/118.7 · 102.1/92.6/91.4 | hdr-msaa | 138 |
| cloud-runner-port--default | gu47-before-cloud-runner-port (ch5v4) | 56 | 123.57 | 48 | 128 | 190 | 0.0% | 0.0% | 115.7/148.7/121.9 · 95.8/167/135.1 · 118.7/90.2/119 | hdr-msaa | 46 | 192 s | 115.01 | 30 | 119 | 207 | 0.0% | 0.0% | 106.7/151/111.9 · 103.5/191.9/124.9 · 93.9/57.1/94.2 | hdr-msaa | 49 |

## Per game

| Game | Slug | Captured | 60 s mean range | 25 s mean range | 60 s dark range | 60 s clip max | render path | draw calls (60 s) | 25 s to 60 s change |
| --- | --- | ---: | --- | --- | --- | ---: | --- | --- | --- |
| Aura Slam 3D | top-tennis | 1/1 | 57.34 | 57.35 | 2.5% | 0.0% | hdr-msaa | 117 | -0.01 |
| Apex Overdrive | roadster-rush | 1/1 | 82.22 | 81.95 | 1.3% | 0.0% | hdr-msaa | 149 | +0.27 |
| Thermal Drift | heatsink | 1/1 | 36.97 | 36.96 | 26.1% | 0.0% | hdr-msaa | 915 | +0.01 |
| Grid Dispatch | teleoperator | 4/4 | 27.97 to 111.21 | 27.98 to 110.40 | 0.0% to 49.0% | 0.0% | hdr-msaa | 392 to 404 | -1.31 to +3.57 |
| Iron Crown | iron-crown | 6/6 | 30.38 to 115.31 | 30.38 to 115.30 | 0.0% to 31.4% | 0.0% | hdr-msaa | 182 to 3731 | -0.02 to +1.21 |
| Pip's Big Leap | pips-big-leap | 7/7 | 109.21 to 207.63 | 109.04 to 207.59 | 0.0% to 0.3% | 0.0% | hdr-msaa | 458 to 782 | -0.12 to +0.17 |
| Aura Hoops 3D | aura-hoops-3d | 6/6 | 54.42 to 122.29 | 56.12 to 116.49 | 0.0% to 21.9% | 0.0% | hdr-msaa | 327 to 347 | -1.70 to +11.32 |
| Aura Diamond 3D | aura-diamond-3d | 6/6 | 67.25 to 121.53 | 64.63 to 118.98 | 0.1% to 14.9% | 0.0% | hdr-msaa | 330 to 496 | -0.46 to +2.62 |
| Aura FC 3D | aura-fc-3d | 6/6 | 69.42 to 227.68 | 69.42 to 227.68 | 0.0% to 0.0% | 0.0% | hdr-msaa | 310 to 444 | -0.01 to +0.02 |
| Aura Links 3D | aura-links-3d | 6/6 | 32.31 to 151.80 | 32.44 to 151.70 | 0.0% to 38.6% | 0.0% | hdr-msaa | 106 to 218 | -0.13 to +0.30 |
| Bunker Zero | bunker-zero | 1/1 | 74.59 | 74.59 | 2.2% | 0.0% | hdr-msaa | 163 | +0.00 |
| Slingshot Siege | slingshot-siege | 1/1 | 106.46 | 109.76 | 4.1% | 0.0% | hdr-msaa | 412 | -3.30 |
| Glint Courier | dot-dash-3d | 1/1 | 25.49 | 25.49 | 15.1% | 0.0% | hdr-msaa | 49 | +0.00 |
| Cross Hop | cross-hop | 6/6 | 59.31 to 125.77 | 59.17 to 125.99 | 0.1% to 2.3% | 0.0% | hdr-msaa | 145 to 175 | -1.46 to +1.48 |
| Craterline GP | strange-orbit-port | 1/1 | 86.26 | 86.20 | 0.0% | 0.0% | hdr-msaa | 122 | +0.06 |
| Chroma Roll | splat-rush-port | 1/1 | 183.99 | 185.68 | 0.0% | 3.7% | hdr-msaa | 20 | -1.69 |
| Serpentine Sky Run | serpentine-sky-run-port | 1/1 | 191.66 | 191.70 | 0.0% | 0.0% | hdr-msaa | 39 | -0.04 |
| Gridlock Courier | drift-and-deliver-port | 2/2 | 110.74 to 131.35 | 110.90 to 131.48 | 0.0% to 0.0% | 0.0% | hdr-msaa | 84 to 84 | -0.16 to -0.13 |
| Ion Circuit | heatsink-port | 1/1 | 49.21 | 47.48 | 4.3% | 0.0% | hdr-msaa | 72 | +1.73 |
| Shadowstep Gauntlet | ninja-runner-port | 1/2 | 121.59 | 121.49 | 0.0% | 0.0% | hdr-msaa | 93 | +0.10 |
| Lamplight Line | last-train-port | 1/1 | 86.26 | 84.15 | 0.0% | 0.0% | hdr-msaa | 152 | +2.11 |
| Saltwind Highway | roadster-hours-port | 3/3 | 12.69 to 77.24 | 12.68 to 77.85 | 1.2% to 55.5% | 0.0% | hdr-msaa | 86 to 105 | -0.95 to +0.01 |
| The Bellkeeper's Walk | where-the-wind-wanders-port | 1/1 | 164.94 | 164.79 | 0.1% | 0.0% | hdr-msaa | 17 | +0.15 |
| Duneglide | silt-and-signal-port | 1/1 | 115.25 | 171.72 | 0.3% | 0.0% | hdr-msaa | 138 | -56.47 |
| Cumulus Dash | cloud-runner-port | 1/1 | 115.01 | 123.57 | 0.0% | 0.0% | hdr-msaa | 49 | -8.56 |

## Not captured

| Target | Reason |
| --- | --- |
| ninja-runner-port--gauntlet-run | gu47-before-ninja-runner-port: settle-25s |

## Flags on captured targets

| Target | HTTP >= 400 | Console / page errors | Note |
| --- | --- | --- | --- |
| heatsink--default | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| iron-crown--crown-arena | 404 /apps/showcase-iron-crown/fonts/whitney-regular.woff2; 404 /apps/showcase-iron-crown/fonts/fonts.css; 404 /apps/showcase-iron-crown/fonts/whitney-medium.woff2 | Failed to load resource: the server responded with a status of 404 (Not Found) (+1) |  |
| iron-crown--neo-tokyo-rooftop | 404 /apps/showcase-iron-crown/fonts/whitney-regular.woff2; 404 /apps/showcase-iron-crown/fonts/whitney-medium.woff2; 404 /apps/showcase-iron-crown/fonts/fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) (+1) |  |
| iron-crown--bangkok-dock | 404 /apps/showcase-iron-crown/fonts/whitney-regular.woff2; 404 /apps/showcase-iron-crown/fonts/whitney-medium.woff2; 404 /apps/showcase-iron-crown/fonts/fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) (+1) |  |
| iron-crown--colosseum-ruins | 404 /apps/showcase-iron-crown/fonts/whitney-regular.woff2; 404 /apps/showcase-iron-crown/fonts/fonts.css; 404 /apps/showcase-iron-crown/fonts/whitney-medium.woff2 | Failed to load resource: the server responded with a status of 404 (Not Found) (+1) |  |
| iron-crown--desert-airbase | 404 /apps/showcase-iron-crown/fonts/whitney-regular.woff2; 404 /apps/showcase-iron-crown/fonts/whitney-medium.woff2; 404 /apps/showcase-iron-crown/fonts/fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) (+1) |  |
| iron-crown--himalayan-monastery | 404 /apps/showcase-iron-crown/fonts/whitney-regular.woff2; 404 /apps/showcase-iron-crown/fonts/fonts.css; 404 /apps/showcase-iron-crown/fonts/whitney-medium.woff2 | Failed to load resource: the server responded with a status of 404 (Not Found) (+1) |  |
| aura-hoops-3d--rucker | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-hoops-3d--venice | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-hoops-3d--athens | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-hoops-3d--manila | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-hoops-3d--shanghai | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-hoops-3d--orbit | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-diamond-3d--sandlot | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-diamond-3d--skyline | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-diamond-3d--canyon | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-diamond-3d--ivy | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-diamond-3d--dome | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-diamond-3d--lunar | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-fc-3d--favela | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-fc-3d--munich | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-fc-3d--lagos | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-fc-3d--kyoto | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-fc-3d--uyuni | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-fc-3d--glacier | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-links-3d--stAuroras | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-links-3d--mapleHollow | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-links-3d--cinderRim | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-links-3d--cloudTerrace | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-links-3d--neonBay | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| aura-links-3d--mareCourse | 404 /fonts/aura-fonts.css | Failed to load resource: the server responded with a status of 404 (Not Found) |  |
| roadster-hours-port--halo |  |  | settle-25s dark 55.5%, settle-60s dark 55.5% |
