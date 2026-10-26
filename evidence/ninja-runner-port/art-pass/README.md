# Shadowstep Gauntlet: 4.3.0 art pass (before / after)

Ten generated models replace the placeholder scenery (box houses, flat-faceted cliffs, cone tufts, low-poly rocks, smooth sphere hills, stone-slab fences, box stalls and box pagoda stacks). Meshy text-to-3D through Kiro Prism with own text prompts, remeshed to about 4,500 triangles, optimised to 512-640 px textures (ledger tag `ninja`, prompts and task ids in `examples/ninja-runner-port/assets/ATTRIBUTION.md`, provenance in `assets/provenance/*.json`).

Frames: `<biome>-before-after.jpg` (left: 4.2.0 scenery, right: art pass). Software WebGL2 on the remote runner (`tools/remote-acr/run.sh`, run ids `p1shstep-*`), 960x540, high quality, `tests/browser/ninja-runner-art-{a,b,c}.spec.ts` autopilot frames. Not real-GPU evidence. The valley and finish "after" frames come from an earlier iteration (valley outcrops sunk deeper, fence rails not yet in); the shipped look is in `evidence/ninja-runner-port/screens/final/`.

| Replaced | By | Where |
| --- | --- | --- |
| two house designs plus box houses | `houseC` stone cottage, `houseD` timber townhouse (four designs now) | village, alley, stairs, rooftops, descent, riverside |
| box market stalls | `marketStall` | village |
| box three-tier pagoda stacks | `teahouse` (also a plaza teahouse at 172 m and 1,436 m) | rooftops |
| flat-faceted cliff planes | `cliffA` granite slab, `cliffB` sandstone outcrop | valley |
| grey low-poly rocks | `boulder` | forest, riverbanks |
| cone grass tufts | `bush` (sparse) | verges, forest floor |
| smooth sphere hills and peaks | `ridge` (forested ridge, free stretch, fogged) | horizon |
| stone-slab fence boxes | `fenceRail` | alley, stairs, descent, riverside |

Budgets (software GL, same frames, before to after): draw calls village 56 to 55, rooftops 42 to 38, forest 34 to 31, valley end 46 to 44 (the replaced tuft, rock, cliff and hill layers each cost a draw). Generated model files: 17.5 MB to 28.3 MB lazily loaded (ten added props about 1.0 to 1.6 MB each; `tests/unit/ninja-runner-port/models.test.ts` budget raised from 20 to 32 MB with the reason). Triangles per prop stay under the 8,000 budget. Gameplay, course, colliders and replay are untouched (render-only; `tests/unit/ninja-runner-port` 102 tests pass, replay digest unchanged).

Still not good: the stone cottage (`houseC`) reads very dark against the bright grass; the bridge deck is still flat brown planks; foreground oaks and pines keep their faceted leaf cards; sun shadows stay off (engine receive defect, see `parity-closeout/README.md`).
