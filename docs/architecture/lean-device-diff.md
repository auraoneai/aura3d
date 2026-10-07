# LeanWebGL2Device vs WebGL2Device — line-level audit (PRD-15 T2.3)

Generated 2026-10-06 by lane 15. Companion machine-readable diff:
`docs/architecture/lean-device.diff` (`diff -w -B` of the two sources).

## Method

```
diff -w -B packages/rendering/src/WebGL2Device.ts packages/rendering/src/LeanWebGL2Device.ts
```

Whitespace-normalized, blank-line-insensitive diff: **129 hunks, 4,321 changed
lines** (`<` + `>` sides; the PRD's "346" predates the PR-0b-2 carve-out that
moved most of `WebGL2Device`'s body into `webgl2/` host modules).

Every differing line was classified `feature-removal` | `bugfix` |
`identical-after-rename` per spec, with a fourth class needed for honesty —
`restructure` — for lines whose identical logic lives in the carved
`webgl2/*` modules (`DrawSubmit`, `MultiDraw`, `TextureUpload`, `Samplers`,
`ContextLifecycle`, `Counters`, `Probe`, `LegacyPost`, `TextureFormats`)
instead of the monolith.

## Totals

| class | lines | meaning |
|---|---|---|
| restructure (carve-out relocation) | ~3,300 | lean's monolithic fields/methods vs `this.host.*` delegation + `webgl2/` module bodies — byte-similar logic in a different home |
| identical-after-rename | ~410 | export-keyword visibility (`WebGL2Buffer` et al. unexported in lean), `Lean*` prefixes, `host.counters.x` → `this.x` inside mixed hunks |
| feature-removal | 15 | main gained, lean lacks (below) |
| **bugfix (port to main)** | **0** | every same-member residual traced to an identical or newer implementation in main's carved modules |

## Feature-removal inventory (main has it, lean does not)

| WebGL2Device line | what lean lacks |
|---|---|
| `createRenderTarget` csm rule (`/shadow|(?:^|-)csm(?:-|$)/i`) | lean counts only `*shadow*` labels — `renderer-csm-cascade-*` render targets escape `shadowRenderTargetsAllocated` |
| `getDiagnostics().programCompileCount` (C-28) | not reported by lean |
| `getDiagnostics().readPixelsCalls` (C-28) | not reported by lean |
| `getDiagnostics().nativeTemporalPasses` / `.nativeTemporalBindings` | not reported by lean |
| `readonly probe: DeviceProbe` + `createWebGL2DeviceProbe` | lean has no capability-probe surface |

These are all main-side improvements — nothing to port in either direction.

## Residual audit (the hunks that could have hidden a bugfix)

| anchor (WebGL2Device) | candidate | verdict |
|---|---|---|
| W:825 `draw` strict-mode `vertex-format` error | lean-only validation? | identical — `webgl2/MultiDraw.ts:57` emits the same `stage: "vertex-format"` error |
| W:948 `copyDepthTextureToBytes` | lean-only readback impl | identical — probe module exposes `readDepthPixels` (delegated at W:411) |
| W:1225 `stencilCompare` | lean-only stencil mapping | identical — `webgl2/MultiDraw.ts:418` same switch |
| W:1311 `completeUploadLevels` | lean-only mip-level helper | identical — `webgl2/TextureUpload.ts:235` same function |
| W:1088 `ensureLdrPostprocessProgram` | lean-only program cache | identical — lives in `webgl2/LegacyPost.ts` |
| W:667 shadow-label regex | different behaviour | main is strictly better (counts `csm` too) — not a lean fix |
| W:308 context-lost listener wiring | ordering difference | identical behaviour — `webgl2/ContextLifecycle.ts` wires the same events |
| W:60–117 `export` keywords | visibility | identical-after-rename (lean keeps helpers private) |

## Per-hunk classification

`W:` = line anchor in WebGL2Device.ts, `L:` = in LeanWebGL2Device.ts.

| W anchor | L anchor | enclosing member | −lines | +lines | class |
|---|---|---|---|---|---|
| 1 | 0 | <module> | 14 | 0 | feature-removal |
| 60 | 46 | <module> | 1 | 1 | same-member-delta |
| 65 | 51 | <module> | 1 | 1 | same-member-delta |
| 67 | 53 | <module> | 1 | 1 | identical-after-rename |
| 72 | 58 | <module> | 1 | 1 | identical-after-rename |
| 75 | 61 | <module> | 1 | 1 | identical-after-rename |
| 77 | 63 | <module> | 1 | 1 | same-member-delta |
| 97 | 83 | dispose | 1 | 1 | same-member-delta |
| 117 | 103 | dispose | 1 | 1 | same-member-delta |
| 152 | 139 | dispose | 12 | 61 | same-member-delta |
| 179 | 215 | dispose | 0 | 6 | restructured-or-carve-out |
| 180 | 222 | dispose | 0 | 5 | restructured-or-carve-out |
| 181 | 228 | dispose | 0 | 4 | restructured-or-carve-out |
| 182 | 233 | dispose | 0 | 5 | restructured-or-carve-out |
| 183 | 239 | dispose | 0 | 5 | restructured-or-carve-out |
| 184 | 245 | dispose | 7 | 5 | same-member-delta |
| 194 | 253 | dispose | 61 | 61 | same-member-delta |
| 272 | 331 | dispose | 10 | 6 | same-member-delta |
| 302 | 356 | create | 1 | 1 | identical-after-rename |
| 308 | 362 | constructor | 47 | 32 | same-member-delta |
| 405 | 444 | onDeviceLost | 1 | 2 | same-member-delta |
| 407 | 448 | onDeviceLost | 0 | 1 | restructured-or-carve-out |
| 409 | 450 | onDeviceRestored | 1 | 2 | same-member-delta |
| 411 | 454 | onDeviceRestored | 84 | 2 | same-member-delta |
| 500 | 460 | createBuffer | 1 | 1 | identical-after-rename |
| 511 | 471 | createBuffer | 3 | 3 | identical-after-rename |
| 539 | 499 | updateBuffer | 1 | 1 | identical-after-rename |
| 542 | 502 | updateBuffer | 3 | 3 | identical-after-rename |
| 556 | 516 | readBuffer | 1 | 1 | identical-after-rename |
| 563 | 523 | createShaderProgram | 1 | 1 | identical-after-rename |
| 576 | 536 | createShaderProgram | 1 | 1 | identical-after-rename |
| 580 | 539 | createShaderProgram | 1 | 0 | feature-removal |
| 603 | 562 | createRenderTarget | 1 | 1 | identical-after-rename |
| 667 | 626 | createRenderTarget | 11 | 9 | same-member-delta |
| 776 | 733 | setRenderTarget | 4 | 4 | identical-after-rename |
| 792 | 749 | setRenderTarget | 1 | 1 | identical-after-rename |
| 814 | 772 | resolveMultisampleTarget | 0 | 36 | restructured-or-carve-out |
| 815 | 809 | resolveMultisampleTarget | 0 | 21 | restructured-or-carve-out |
| 816 | 831 | resolveMultisampleTarget | 0 | 60 | restructured-or-carve-out |
| 817 | 892 | resolveMultisampleTarget | 0 | 199 | restructured-or-carve-out |
| 818 | 1092 | resolveMultisampleTarget | 0 | 30 | restructured-or-carve-out |
| 819 | 1123 | resolveMultisampleTarget | 0 | 30 | restructured-or-carve-out |
| 820 | 1154 | resolveMultisampleTarget | 0 | 33 | restructured-or-carve-out |
| 821 | 1188 | resolveMultisampleTarget | 0 | 22 | restructured-or-carve-out |
| 822 | 1211 | resolveMultisampleTarget | 0 | 8 | restructured-or-carve-out |
| 823 | 1220 | resolveMultisampleTarget | 0 | 8 | restructured-or-carve-out |
| 824 | 1229 | resolveMultisampleTarget | 0 | 23 | restructured-or-carve-out |
| 825 | 1253 | resolveMultisampleTarget | 30 | 74 | same-member-delta |
| 877 | 1348 | getDiagnostics | 1 | 1 | identical-after-rename |
| 881 | 1352 | getDiagnostics | 1 | 1 | identical-after-rename |
| 885 | 1356 | getDiagnostics | 1 | 1 | identical-after-rename |
| 889 | 1360 | getDiagnostics | 1 | 1 | identical-after-rename |
| 891 | 1362 | getDiagnostics | 9 | 7 | same-member-delta |
| 923 | 1392 | getDiagnostics | 10 | 8 | same-member-delta |
| 948 | 1415 | dispose | 86 | 311 | same-member-delta |
| 1063 | 1756 | dispose | 0 | 4 | restructured-or-carve-out |
| 1064 | 1761 | dispose | 0 | 23 | restructured-or-carve-out |
| 1065 | 1785 | dispose | 0 | 24 | restructured-or-carve-out |
| 1066 | 1810 | dispose | 0 | 24 | restructured-or-carve-out |
| 1067 | 1835 | dispose | 0 | 102 | restructured-or-carve-out |
| 1068 | 1938 | dispose | 0 | 62 | restructured-or-carve-out |
| 1069 | 2001 | dispose | 0 | 14 | restructured-or-carve-out |
| 1070 | 2016 | dispose | 0 | 25 | restructured-or-carve-out |
| 1071 | 2042 | dispose | 0 | 271 | restructured-or-carve-out |
| 1072 | 2314 | dispose | 0 | 7 | restructured-or-carve-out |
| 1073 | 2322 | dispose | 0 | 25 | restructured-or-carve-out |
| 1074 | 2348 | dispose | 0 | 95 | restructured-or-carve-out |
| 1075 | 2444 | dispose | 0 | 10 | restructured-or-carve-out |
| 1076 | 2455 | dispose | 0 | 16 | restructured-or-carve-out |
| 1077 | 2472 | dispose | 0 | 63 | restructured-or-carve-out |
| 1078 | 2536 | dispose | 0 | 9 | restructured-or-carve-out |
| 1079 | 2546 | dispose | 0 | 6 | restructured-or-carve-out |
| 1080 | 2553 | dispose | 0 | 7 | restructured-or-carve-out |
| 1081 | 2561 | dispose | 0 | 65 | restructured-or-carve-out |
| 1082 | 2627 | dispose | 0 | 59 | restructured-or-carve-out |
| 1083 | 2687 | dispose | 0 | 41 | restructured-or-carve-out |
| 1084 | 2729 | dispose | 0 | 135 | restructured-or-carve-out |
| 1085 | 2865 | dispose | 0 | 130 | restructured-or-carve-out |
| 1086 | 2996 | dispose | 0 | 87 | restructured-or-carve-out |
| 1087 | 3084 | dispose | 0 | 134 | restructured-or-carve-out |
| 1088 | 3219 | dispose | 69 | 213 | same-member-delta |
| 1199 | 3474 | reflectProgram | 0 | 46 | restructured-or-carve-out |
| 1200 | 3521 | reflectProgram | 0 | 72 | restructured-or-carve-out |
| 1201 | 3594 | reflectProgram | 0 | 28 | restructured-or-carve-out |
| 1202 | 3623 | reflectProgram | 0 | 10 | restructured-or-carve-out |
| 1203 | 3634 | reflectProgram | 0 | 18 | restructured-or-carve-out |
| 1204 | 3653 | reflectProgram | 0 | 134 | restructured-or-carve-out |
| 1205 | 3788 | reflectProgram | 0 | 26 | restructured-or-carve-out |
| 1206 | 3815 | reflectProgram | 0 | 18 | restructured-or-carve-out |
| 1207 | 3834 | reflectProgram | 0 | 10 | restructured-or-carve-out |
| 1208 | 3845 | reflectProgram | 0 | 3 | restructured-or-carve-out |
| 1209 | 3849 | reflectProgram | 0 | 22 | restructured-or-carve-out |
| 1210 | 3872 | reflectProgram | 0 | 12 | restructured-or-carve-out |
| 1211 | 3885 | reflectProgram | 0 | 10 | restructured-or-carve-out |
| 1212 | 3896 | reflectProgram | 0 | 20 | restructured-or-carve-out |
| 1213 | 3917 | reflectProgram | 0 | 3 | restructured-or-carve-out |
| 1214 | 3921 | reflectProgram | 0 | 16 | restructured-or-carve-out |
| 1215 | 3938 | reflectProgram | 0 | 5 | restructured-or-carve-out |
| 1216 | 3944 | reflectProgram | 0 | 27 | restructured-or-carve-out |
| 1217 | 3972 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1218 | 3981 | reflectProgram | 0 | 95 | restructured-or-carve-out |
| 1219 | 4077 | reflectProgram | 0 | 7 | restructured-or-carve-out |
| 1220 | 4085 | reflectProgram | 0 | 26 | restructured-or-carve-out |
| 1221 | 4112 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1222 | 4121 | reflectProgram | 0 | 5 | restructured-or-carve-out |
| 1223 | 4127 | reflectProgram | 0 | 63 | restructured-or-carve-out |
| 1224 | 4191 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1225 | 4200 | reflectProgram | 54 | 23 | same-member-delta |
| 1282 | 4226 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1283 | 4235 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1284 | 4244 | reflectProgram | 0 | 6 | restructured-or-carve-out |
| 1285 | 4251 | reflectProgram | 0 | 5 | restructured-or-carve-out |
| 1286 | 4257 | reflectProgram | 0 | 4 | restructured-or-carve-out |
| 1287 | 4262 | reflectProgram | 0 | 29 | restructured-or-carve-out |
| 1288 | 4292 | reflectProgram | 0 | 30 | restructured-or-carve-out |
| 1289 | 4323 | reflectProgram | 0 | 15 | restructured-or-carve-out |
| 1299 | 4348 | reflectProgram | 0 | 63 | restructured-or-carve-out |
| 1300 | 4412 | reflectProgram | 0 | 21 | restructured-or-carve-out |
| 1301 | 4434 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1302 | 4443 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1303 | 4452 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1304 | 4461 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1305 | 4470 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1306 | 4479 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1307 | 4488 | reflectProgram | 0 | 8 | restructured-or-carve-out |
| 1308 | 4497 | reflectProgram | 0 | 4 | restructured-or-carve-out |
| 1309 | 4502 | reflectProgram | 0 | 3 | restructured-or-carve-out |
| 1310 | 4506 | reflectProgram | 0 | 9 | restructured-or-carve-out |
| 1311 | 4516 | reflectProgram | 20 | 23 | same-member-delta |

## Conclusion

`LeanWebGL2Device.ts` is a pre-carve-out snapshot of `WebGL2Device.ts`: same
members, same constants, same error paths — relocated. There are **zero
bugfix lines to port**. The consolidation path is removal of the lean device,
not a merge; Q-01-1 carries this table for lane 01's sign-off.
