# Slingshot Siege rig fix (F12)

The hero gull (301.52x worst stretch before) and the raider boss (65.44x) shared the Bunker Zero defect and shipped allow-listed. Both are repaired with `assets repair-skin --refit-skeleton` and pass without an allow-list entry.

| Asset | Clips kept (the ones the game plays) | After: worst stretch, triangles past 1.6x |
| --- | --- | --- |
| gullsiegeHeroGullMeshy | Load, Ready, Idle_Loop, Jump_Loop | 2.26x, 3 of 7,995 (3 triangles cut), 0 flaps |
| gullsiegeRaiderBossMeshy | Idle_Loop, Contest | 2.01x, 4 of 7,999, 0 flaps |

Frames: `<asset>-0.jpg` and `-1.jpg` hold the clips front and side, five frames per row (remote runner, software WebGL2, `tests/browser/p2-rig-frames.spec.ts`). The birds and the boss are intact in every clip. The boss's surface looks speckled in these frames: that is the asset's baked texture, not skin tearing. Software GL only.
